/**
 * The dial: what is checked, in what order, and what is never retried.
 *
 * Neither ssh2 nor a socket is involved. Both are ports, so the rules can be held without a
 * network: the pin is read before anything is dialled, the address is checked before it is
 * connected, the host key is checked before any credential leaves, and none of the three has a
 * second path.
 */
import { test } from "bun:test";
import { expectBe, expectEqual, expectMatch, expectRejects, expectTruthy } from "./helpers";
import {
  DialError,
  dialNetconf,
  NETCONF_PORT,
  NETCONF_SUBSYSTEM,
  type DialConfig,
  type SocketPort,
  type SshConnectOptions,
  type SshPort,
} from "@/lib/db/providers/network/netconf/dial";
import { fingerprintOf } from "@/lib/db/providers/network/netconf/hostkey";
import type { Transport } from "@/lib/db/providers/network/netconf/session";

const DEVICE_KEY = Buffer.from("the device's host key");
const PIN = fingerprintOf(DEVICE_KEY);

const transport: Transport = {
  write: () => {},
  onData: () => {},
  onClose: () => {},
  close: () => {},
};

interface Recorder {
  readonly dialled: { host: string; port: number; noDelay: true; lookup?: unknown }[];
  readonly connects: SshConnectOptions[];
  readonly subsystems: string[];
}

function ports(over: { hostKey?: Buffer; subsystemError?: unknown; connectError?: unknown } = {}): {
  ssh: SshPort;
  socket: SocketPort;
  seen: Recorder;
} {
  const seen: Recorder = { dialled: [], connects: [], subsystems: [] };
  const socket: SocketPort = {
    connect: async (options) => {
      seen.dialled.push(options);
      return { socket: true };
    },
  };
  const ssh: SshPort = {
    connect: (options) => {
      seen.connects.push(options);
      let ready: (() => void) | null = null;
      let failed: ((error: unknown) => void) | null = null;
      queueMicrotask(() => {
        if (over.connectError !== undefined) {
          failed?.(over.connectError);
          return;
        }
        // The library offers the host key before it authenticates, which is the order the rule
        // depends on: a refusal here means nothing was sent.
        const accepted = options.hostVerifier(over.hostKey ?? DEVICE_KEY);
        if (accepted) ready?.();
      });
      return {
        onReady: (handler) => {
          ready = handler;
        },
        onError: (handler) => {
          failed = handler;
        },
        subsystem: (name, handler) => {
          seen.subsystems.push(name);
          if (over.subsystemError !== undefined) handler(over.subsystemError, null);
          else handler(null, transport);
        },
        end: () => {},
      };
    },
  };
  return { ssh, socket, seen };
}

const config = (over: Partial<DialConfig> = {}): DialConfig => ({
  host: "192.0.2.10",
  username: "ro-key",
  hostKeyFingerprint: PIN,
  privateKey: "a key",
  readyMs: 5000,
  ...over,
});

/**
 * The number is written out rather than compared against the constant it came from. A mutation
 * replacing `NETCONF_PORT` with a bare 830 survived the earlier version of this test, because the
 * test asserted that the constant equalled itself: it would have passed just as happily if the
 * constant had been 22. IANA registers 830/tcp as `netconf-ssh` and RFC 6242 section 3 names it,
 * so 830 is the fact and the constant is only its name.
 */
test("the default port is 830, the number the standard names, and a connection can override it", async () => {
  const { ssh, socket, seen } = ports();
  await dialNetconf(config(), ssh, socket);
  expectBe(seen.dialled[0]?.port, 830);
  expectBe(NETCONF_PORT, 830);
  expectBe(seen.dialled[0]?.noDelay, true);
  await dialNetconf(config({ port: 2830 }), ssh, socket);
  expectBe(seen.dialled[1]?.port, 2830);
});

test("the subsystem asked for is netconf and nothing else", async () => {
  const { ssh, socket, seen } = ports();
  await dialNetconf(config(), ssh, socket);
  expectEqual(seen.subsystems, [NETCONF_SUBSYSTEM]);
});

test("an empty pin is refused before anything is dialled", async () => {
  const { ssh, socket, seen } = ports();
  await expectRejects(dialNetconf(config({ hostKeyFingerprint: "" }), ssh, socket), DialError);
  expectBe(seen.dialled.length, 0);
  expectBe(seen.connects.length, 0);
});

test("a link-local literal is refused before anything is dialled", async () => {
  const { ssh, socket, seen } = ports();
  await expectRejects(dialNetconf(config({ host: "169.254.169.254" }), ssh, socket));
  expectBe(seen.dialled.length, 0);
});

/**
 * The address that was checked has to be the address that is dialled, which is the whole reason
 * this provider opens the socket instead of letting the library do it. The lookup the egress
 * policy answers carries that guarantee, so the socket has to receive it.
 *
 * Without this assertion a planted mutation that dropped the lookup failed no test.
 */
test("the egress lookup is handed to the socket, so the checked address is the dialled one", async () => {
  const { ssh, socket, seen } = ports();
  await dialNetconf(config({ host: "device.example.com" }), ssh, socket);
  expectTruthy(seen.dialled[0]?.lookup !== undefined);
  expectBe(typeof seen.dialled[0]?.lookup, "function");
});

test("a host key that does not match the pin ends the handshake, and the message names both", async () => {
  const { ssh, socket } = ports({ hostKey: Buffer.from("another host's key") });
  let caught: unknown;
  try {
    await dialNetconf(config(), ssh, socket);
  } catch (error) {
    caught = error;
  }
  expectTruthy(caught instanceof DialError);
  const failure = (caught as DialError).failure;
  expectBe(failure.kind, "host-key");
  expectMatch(failure.message, /reinstalled/);
  expectMatch(failure.message, /another host/);
});

test("a refused host key has no second path: the session is never reached", async () => {
  const { ssh, socket, seen } = ports({ hostKey: Buffer.from("another host's key") });
  await expectRejects(dialNetconf(config(), ssh, socket));
  // The socket was dialled, the key was offered, and the subsystem was never asked for.
  expectBe(seen.dialled.length, 1);
  expectEqual(seen.subsystems, []);
});

test("a refused login carries one sentence and no detail", async () => {
  const { ssh, socket } = ports({ connectError: new Error("All configured authentication methods failed") });
  let caught: unknown;
  try {
    await dialNetconf(config(), ssh, socket);
  } catch (error) {
    caught = error;
  }
  expectBe((caught as DialError).failure.kind, "refused");
  expectBe((caught as DialError).failure.message, "authentication failed");
});

test("a key that cannot be opened is a configuration error, not an authentication failure", async () => {
  const { ssh, socket } = ports({
    connectError: new Error("Cannot parse privateKey: OpenSSH key integrity check failed -- bad passphrase?"),
  });
  let caught: unknown;
  try {
    await dialNetconf(config(), ssh, socket);
  } catch (error) {
    caught = error;
  }
  expectBe((caught as DialError).failure.kind, "configuration");
});

test("a device with no netconf subsystem is refused with a sentence that says so", async () => {
  const { ssh, socket } = ports({ subsystemError: null });
  await expectRejects(dialNetconf(config(), ssh, socket), /offers no netconf subsystem/);
});

test("the credential reaches ssh2 only as the connection supplied it", async () => {
  const { ssh, socket, seen } = ports();
  await dialNetconf(config({ privateKey: "a key", passphrase: "secret" }), ssh, socket);
  expectBe(seen.connects[0]?.privateKey, "a key");
  expectBe(seen.connects[0]?.passphrase, "secret");
  expectBe(seen.connects[0]?.password, undefined);
});
