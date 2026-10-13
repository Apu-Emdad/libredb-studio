/**
 * One NETCONF session: the hello exchange, the framing it settles on, and request to reply
 * matching (issue #1724, requirements NC-S1, NC-S5, NC-S6, NC-S8).
 *
 * The transport is injected rather than opened here, for two reasons. The provider dials the socket
 * itself and hands it to ssh2 through the `sock` option, so the socket is already somebody else's
 * object by the time a session exists (requirement NC-S3). And a session's rules are the part worth
 * testing without a network: every rule below is a case in `netconf.test.ts` driven by a fake
 * transport.
 *
 * Rules the client enforces because a server may not, each measured on 2026-10-13:
 *   a hello must arrive within a deadline, and it must carry a `<session-id>`;
 *   a common base version must exist, or the session ends rather than guessing a framing;
 *   a reply's `message-id` must equal its request's, and a reply carrying none is not a reply;
 *   a framing fault ends the session, which RFC 6242 4.2 requires of the peer and Netopeer2 does
 *   not always do;
 *   every read is bounded by bytes before it is bounded by anything else.
 *
 * The message-id rule is here because of a measured bug rather than a reading. A probe written for
 * these measurements matched replies by arrival order. When a server accepted
 * `create-subscription` it began sending notifications, which carry no `message-id`, the probe
 * counted them as replies, and it then blamed the wrong operation for a failure: it reported 17
 * replies to 12 requests. A notification is not a reply, and only the `message-id` says so.
 */

import { EOM, FrameReader, frame, type Framing, type FrameLimits, type FrameFault } from "./framing";
import { buildRpc, type NetconfRequest } from "./requests";

/** What a session needs from whatever carries its bytes. */
export interface Transport {
  write(text: string): void;
  onData(handler: (chunk: string) => void): void;
  onClose(handler: () => void): void;
  close(): void;
}

export interface SessionLimits extends FrameLimits {
  /** Milliseconds a hello may take. Measured 18 to 36 ms on loopback, so this is generous. */
  readonly helloMs: number;
  /** Milliseconds one request may take. */
  readonly requestMs: number;
}

export type SessionEnd =
  | { readonly reason: "closed-by-us" }
  | { readonly reason: "closed-by-peer" }
  | { readonly reason: "framing"; readonly fault: FrameFault }
  | { readonly reason: "protocol"; readonly detail: string };

export class NetconfSessionError extends Error {
  readonly end: SessionEnd;
  constructor(end: SessionEnd) {
    super(describeEnd(end));
    this.end = end;
  }
}

function describeEnd(end: SessionEnd): string {
  switch (end.reason) {
    case "closed-by-us":
      return "this session was closed";
    case "closed-by-peer":
      return "the device closed this session";
    case "framing":
      return `the device broke the NETCONF framing rules (${end.fault.kind}), so the session was ended`;
    case "protocol":
      return end.detail;
  }
}

export interface Hello {
  readonly sessionId: string;
  readonly capabilities: readonly string[];
  readonly bases: readonly string[];
}

const CLIENT_BASES = ["urn:ietf:params:netconf:base:1.0", "urn:ietf:params:netconf:base:1.1"] as const;

/** The client hello. Both base versions are offered, so the server picks the framing. */
export function clientHello(): string {
  const caps = CLIENT_BASES.map((base) => `<capability>${base}</capability>`).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<hello xmlns="urn:ietf:params:xml:ns:netconf:base:1.0"><capabilities>${caps}</capabilities></hello>`
  );
}

/**
 * Reads the server hello out of its raw text.
 *
 * It is read with a narrow scan rather than the XML reader, because the framing of the rest of the
 * session depends on it and the reader is not bound yet. The scan takes two things and nothing
 * else: the session id and the capability URIs.
 */
export function readHello(message: string): Hello {
  const id = /<session-id>\s*(\d+)\s*<\/session-id>/.exec(message);
  if (!id?.[1]) {
    throw new NetconfSessionError({
      reason: "protocol",
      detail: "the device's hello carried no session-id, which RFC 6241 8.1 requires",
    });
  }
  const capabilities = [...message.matchAll(/<capability>\s*([^<\s]+)\s*<\/capability>/g)].map((m) => m[1] ?? "");
  const bases = capabilities.filter((cap) => cap.startsWith("urn:ietf:params:netconf:base:"));
  return { sessionId: id[1], capabilities, bases };
}

/**
 * The framing both sides can speak.
 *
 * Chunked framing when the server offered base:1.1, end-of-message when it offered only base:1.0,
 * and an ended session when it offered neither: a session with no common base version has no
 * defined framing, and guessing one produces a stream the peer cannot read.
 */
export function framingFor(hello: Hello): Framing {
  if (hello.bases.includes("urn:ietf:params:netconf:base:1.1")) return "chunked";
  if (hello.bases.includes("urn:ietf:params:netconf:base:1.0")) return "eom";
  throw new NetconfSessionError({
    reason: "protocol",
    detail: "this device offered no NETCONF base version this client speaks",
  });
}

interface Pending {
  readonly messageId: number;
  resolve(message: string): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export class NetconfSession {
  private readonly reader: FrameReader;
  private framing: Framing = "eom";
  private nextId = 1;
  private pending: Pending | null = null;
  private ended: SessionEnd | null = null;
  private helloWaiter: ((message: string) => void) | null = null;
  /** Notifications arrive when a subscription exists. This provider never subscribes, so one is a fault. */
  private notifications = 0;

  private readonly transport: Transport;
  private readonly limits: SessionLimits;

  private constructor(transport: Transport, limits: SessionLimits) {
    this.transport = transport;
    this.limits = limits;
    this.reader = new FrameReader("eom", limits);
    transport.onData((chunk) => this.onData(chunk));
    transport.onClose(() => this.end({ reason: "closed-by-peer" }));
  }

  /** Opens a session: sends the client hello, reads the server's, and settles the framing. */
  static async open(transport: Transport, limits: SessionLimits): Promise<{ session: NetconfSession; hello: Hello }> {
    const session = new NetconfSession(transport, limits);
    const helloText = await session.awaitHello();
    const hello = readHello(helloText);
    session.framing = framingFor(hello);
    if (session.framing === "chunked") session.reader.useChunked();
    transport.write(frame(clientHello(), "eom"));
    return { session, hello };
  }

  private awaitHello(): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.end({ reason: "protocol", detail: "the device sent no hello within the deadline" });
        reject(new NetconfSessionError({ reason: "protocol", detail: "the device sent no hello within the deadline" }));
      }, this.limits.helloMs);
      this.helloWaiter = (message) => {
        clearTimeout(timer);
        this.helloWaiter = null;
        resolve(message);
      };
    });
  }

  /** Sends one of the five allowed operations and answers its reply, matched by message-id. */
  request(request: NetconfRequest): Promise<string> {
    if (this.ended) return Promise.reject(new NetconfSessionError(this.ended));
    if (this.pending) {
      // One request at a time. Netopeer2 answers pipelined requests in order, measured, but a
      // single outstanding request is what makes the message-id rule enforceable rather than
      // advisory.
      return Promise.reject(new NetconfSessionError({ reason: "protocol", detail: "a request is already in flight" }));
    }
    const messageId = this.nextId++;
    const text = buildRpc(request, messageId);
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(
          new NetconfSessionError({ reason: "protocol", detail: "the device did not answer within the deadline" }),
        );
      }, this.limits.requestMs);
      this.pending = { messageId, resolve, reject, timer };
      this.transport.write(frame(text, this.framing));
    });
  }

  /** `<close-session>`, then the transport. Never `<kill-session>`, requirement NC-S8. */
  async close(): Promise<void> {
    if (this.ended) return;
    try {
      await this.request({ operation: "close-session" });
    } catch {
      // A device that drops the channel on close is not an error worth reporting: the session is
      // over either way, which is the only thing this method promises.
    }
    this.end({ reason: "closed-by-us" });
    this.transport.close();
  }

  get notificationCount(): number {
    return this.notifications;
  }

  private onData(chunk: string): void {
    if (this.ended) return;
    const step = this.reader.feed(chunk);
    if (step.fault) {
      this.end({ reason: "framing", fault: step.fault });
      this.end({
        reason: "protocol",
        detail: "the device sent a reply with no message-id, so no reply can be matched to its request",
      });
      return;
    }
    for (const message of step.messages) {
      this.onMessage(message);
      if (this.ended) return;
    }
  }

  private onMessage(message: string): void {
    if (this.helloWaiter) {
      this.helloWaiter(message);
      return;
    }
    const id = /message-id="(\d+)"/.exec(message);
    if (!id?.[1]) {
      if (message.includes("<notification")) {
        // This provider sends no create-subscription, so a notification means the session is
        // carrying somebody else's subscription or the device sent one unasked. Either way it is
        // not a reply and it must not be counted as one.
        this.notifications += 1;
        return;
      }
      this.end({
        reason: "protocol",
        detail: "the device sent a reply with no message-id, so no reply can be matched to its request",
      });
      return;
    }
    const pending = this.pending;
    if (!pending) return;
    if (Number(id[1]) !== pending.messageId) {
      clearTimeout(pending.timer);
      this.pending = null;
      const end: SessionEnd = {
        reason: "protocol",
        detail: `the device answered message-id ${id[1]} to request ${pending.messageId}`,
      };
      this.end(end);
      pending.reject(new NetconfSessionError(end));
      return;
    }
    clearTimeout(pending.timer);
    this.pending = null;
    pending.resolve(message);
  }

  private end(end: SessionEnd): void {
    if (this.ended) return;
    this.ended = end;
    const pending = this.pending;
    if (pending) {
      clearTimeout(pending.timer);
      this.pending = null;
      pending.reject(new NetconfSessionError(end));
    }
  }
}

export { EOM };
