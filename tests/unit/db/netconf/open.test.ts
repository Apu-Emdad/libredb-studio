/**
 * The composition root: a connection becomes a reader, or fails without leaving anything open.
 *
 * Every port is a fake, including the parser, so the join is held without a device: that the dial
 * is given what the connection and the credential say, that the session is opened on the dial's
 * transport, that the reader is opened on that session, and that a failure after the session exists
 * closes it.
 */
import { test } from "bun:test";
import { expectBe, expectEqual, expectRejects, expectTruthy } from "./helpers";
import { NETCONF_SESSION_LIMITS, openNetconfReader, type NetconfCredential } from "@/lib/db/providers/network/netconf/open";
import type { SocketPort, SshPort, SshConnectOptions } from "@/lib/db/providers/network/netconf/dial";
import type { Transport } from "@/lib/db/providers/network/netconf/session";
import type { XmlElement, XmlReaderPort } from "@/lib/db/providers/network/netconf/reader-port";
import type { DatabaseConnection } from "@/lib/db/types";
import { fingerprintOf } from "@/lib/db/providers/network/netconf/hostkey";
import { DatabaseConfigError } from "@/lib/db/errors";

const DEVICE_KEY = Buffer.from("the device's host key");
const PIN = fingerprintOf(DEVICE_KEY);

const connection = { id: "c", name: "lab switch", type: "netconf", host: "198.51.100.7", createdAt: new Date() } as unknown as DatabaseConnection;
const credential: NetconfCredential = { username: "ro-key", hostKeyFingerprint: PIN, privateKey: "a key" };

function el(name: string, text?: string, children: XmlElement[] = []): XmlElement {
  const base = { name, attributes: new Map<string, string>(), children, bindings: new Map<string, string>() };
  return text === undefined ? base : { ...base, text };
}

const LIBRARY = el("rpc-reply", undefined, [
  el("data", undefined, [
    el("modules-state", undefined, [
      el("module", undefined, [el("name", "ietf-interfaces"), el("namespace", "urn:x:if"), el("conformance-type", "implement")]),
    ]),
  ]),
]);

interface Seen {
  readonly dialled: { host: string; port: number }[];
  readonly connects: SshConnectOptions[];
  readonly written: string[];
  readonly closed: { count: number };
}

function ports(over: { library?: XmlElement; parseThrows?: boolean } = {}): { ports: { xml: XmlReaderPort; ssh: SshPort; socket: SocketPort }; seen: Seen } {
  const seen: Seen = { dialled: [], connects: [], written: [], closed: { count: 0 } };
  let onData: ((chunk: string) => void) | null = null;
  const SERVER_HELLO =
    '<hello xmlns="urn:ietf:params:xml:ns:netconf:base:1.0"><capabilities><capability>urn:ietf:params:netconf:base:1.0</capability></capabilities><session-id>4</session-id></hello>';
  let requests = 0;
  const transport: Transport = {
    write: (text) => {
      seen.written.push(text);
      // The client's hello is not answered: it is the second hello, not a request. Only a request
      // gets a reply, and its message-id has to be the one that was asked, because the session
      // matches on it.
      if (text.includes("<hello")) return;
      requests += 1;
      queueMicrotask(() => onData?.(`<rpc-reply message-id="${requests}"><data/></rpc-reply>]]>]]>`));
    },
    onData: (handler) => {
      onData = handler;
      // The device speaks first. Netopeer2 sends its hello as soon as the channel opens, without
      // waiting to be asked, and the session is written to expect that: it reads the server's hello
      // and only then sends its own. A fake that answered the client's hello instead timed out, and
      // the timeout was the fake's fault, not the session's.
      queueMicrotask(() => onData?.(`${SERVER_HELLO}]]>]]>`));
    },
    onClose: () => {},
    close: () => void (seen.closed.count += 1),
  };
  return {
    seen,
    ports: {
      xml: {
        parse: () => {
          if (over.parseThrows) throw new Error("the parser refused this message");
          return over.library ?? LIBRARY;
        },
      },
      socket: {
        connect: async (options) => {
          seen.dialled.push({ host: options.host, port: options.port });
          return { socket: true };
        },
      },
      ssh: {
        connect: (options) => {
          seen.connects.push(options);
          let ready: (() => void) | null = null;
          queueMicrotask(() => {
            if (options.hostVerifier(DEVICE_KEY)) ready?.();
          });
          return {
            onReady: (handler) => {
              ready = handler;
            },
            onError: () => {},
            subsystem: (_name, handler) => handler(null, transport),
            end: () => {},
          };
        },
      },
    },
  };
}

test("a connection and a credential become a reader, and the device's facts come back", async () => {
  const { ports: p, seen } = ports();
  const reader = await openNetconfReader(connection, credential, p);
  expectEqual(seen.dialled, [{ host: "198.51.100.7", port: 830 }]);
  expectBe(seen.connects[0]?.username, "ro-key");
  expectBe(seen.connects[0]?.privateKey, "a key");
  expectBe(reader.facts.sessionId, "4");
  expectEqual(reader.facts.modules, ["ietf-interfaces"]);
});

test("the port the connection names is the port dialled", async () => {
  const { ports: p, seen } = ports();
  await openNetconfReader({ ...connection, port: 2830 } as DatabaseConnection, credential, p);
  expectBe(seen.dialled[0]?.port, 2830);
});

test("the published session limits are what the dial and the session run under", async () => {
  const { ports: p, seen } = ports();
  await openNetconfReader(connection, credential, p);
  expectBe(seen.connects[0]?.readyTimeout, NETCONF_SESSION_LIMITS.helloMs);
  expectBe(NETCONF_SESSION_LIMITS.helloMs, 15_000);
  expectBe(NETCONF_SESSION_LIMITS.requestMs, 120_000);
  expectBe(NETCONF_SESSION_LIMITS.maxMessageBytes, 16_777_216);
  expectBe(NETCONF_SESSION_LIMITS.maxBufferBytes, 33_554_432);
});

/**
 * MEASURED 2026-10-13: a dial with no credential is refused by the device with the same sentence a
 * wrong password gets, so sending one teaches nothing and leaves a line in the device's auth log.
 */
test("a connection with neither a key nor a password is refused before anything is dialled", async () => {
  const { ports: p, seen } = ports();
  await expectRejects(
    openNetconfReader(connection, { username: "ro-key", hostKeyFingerprint: PIN }, p),
    DatabaseConfigError,
  );
  expectBe(seen.dialled.length, 0);
});

test("an address or an account the connection does not carry is refused by name", async () => {
  const { ports: p, seen } = ports();
  await expectRejects(openNetconfReader({ ...connection, host: "" } as DatabaseConnection, credential, p), /needs the device's address/);
  await expectRejects(openNetconfReader(connection, { ...credential, username: "" }, p), /account name/);
  expectBe(seen.dialled.length, 0);
});

/**
 * A device's session table is a shared resource and a failure here is the moment it leaks: the
 * session exists, so nothing else will close it, and the device holds the channel until its own
 * idle timer runs. One leaked entry per failed open is what exhausts it.
 */
test("a failure after the session is open closes the session", async () => {
  const { ports: p, seen } = ports({ parseThrows: true });
  await expectRejects(openNetconfReader(connection, credential, p));
  expectTruthy(seen.closed.count >= 1, "the session was left open after the reader failed");
});
