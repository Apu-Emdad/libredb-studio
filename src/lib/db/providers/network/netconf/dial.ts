/**
 * The socket this provider hands to ssh2, and the checks it passes on the way out
 * (issue #1724, requirements NC-S2, NC-S3, Y-S5).
 *
 * Studio dials the socket itself and gives ssh2 the connected socket through its `sock` option,
 * rather than letting the library resolve and connect. That is what puts a NETCONF connection
 * inside `DB_HTTP_BLOCK_PRIVATE_HOSTS` from the first release, where the gRPC providers are
 * outside it because grpc-js resolves names itself (`docs/BACKLOG.md` D212).
 *
 * The same pattern is already in the tree: `providers/stream/rabbitmq/amqp/dial.ts` dials through
 * `socketEgress(host, { refusesLinkLocal: true })` with `noDelay: true`, and this follows it.
 *
 * MEASURED 2026-10-13 against the pinned fixture, and each measurement is a rule below:
 *   ssh2 accepts a socket it did not open, and a NETCONF session over it behaves identically;
 *   `noDelay` matters: without it a small request took 44.4 ms against 3.1 ms with it, on Node;
 *   a wrong host key stops the handshake with `Host denied (verification failed)` before any user
 *   authentication packet, and it does so through an SSH tunnel as well, where the key seen inside
 *   the forward is the device's own and not the bastion's.
 */

import { socketEgress } from "@/lib/db/http/egress-policy";
import { checkHostKey, readPin } from "./hostkey";
import { classifyLoginFailure, type LoginFailure } from "./auth";
import type { Transport } from "./session";

/** The default port of the NETCONF SSH subsystem, RFC 6242 section 3. */
export const NETCONF_PORT = 830;

/** The subsystem name. A device that offers no such subsystem is not a NETCONF server. */
export const NETCONF_SUBSYSTEM = "netconf";

export interface DialConfig {
  readonly host: string;
  readonly port?: number;
  readonly username: string;
  /** The device's host key fingerprint. Required: this provider never trusts on first sight. */
  readonly hostKeyFingerprint: string;
  readonly password?: string;
  readonly privateKey?: string;
  readonly passphrase?: string;
  /** Milliseconds the handshake may take. */
  readonly readyMs: number;
}

/**
 * The two library calls this file makes, as an interface, so that every rule can be tested without
 * a network and without ssh2.
 */
export interface SshPort {
  connect(options: SshConnectOptions): SshSession;
}

export interface SshConnectOptions {
  readonly sock: unknown;
  readonly username: string;
  readonly readyTimeout: number;
  readonly password?: string;
  readonly privateKey?: string;
  readonly passphrase?: string;
  hostVerifier(hostKey: Buffer): boolean;
}

export interface SshSession {
  onReady(handler: () => void): void;
  onError(handler: (error: unknown) => void): void;
  subsystem(name: string, handler: (error: unknown, transport: Transport | null) => void): void;
  end(): void;
}

export interface SocketPort {
  /**
   * Opens a TCP socket to an address that has already been checked, with Nagle off.
   *
   * The lookup the egress policy answers is handed to the socket rather than used here, so the
   * address the socket dials is the address that was checked: the policy's own rule.
   */
  connect(options: { host: string; port: number; noDelay: true; lookup?: unknown }): Promise<unknown>;
}

export class DialError extends Error {
  readonly failure: LoginFailure;
  constructor(failure: LoginFailure) {
    super(failure.message);
    this.failure = failure;
  }
}

/**
 * Opens one NETCONF session's transport.
 *
 * The order is the rule: the pin is read before anything is dialled, the address is checked before
 * it is connected, the host key is checked before any credential leaves, and a failure at any of
 * those three is final. Y-S5: a security failure is never retried another way, so there is no
 * fallback path in this function, by construction rather than by discipline.
 */
export async function dialNetconf(config: DialConfig, ssh: SshPort, socket: SocketPort): Promise<Transport> {
  const pin = readPin(config.hostKeyFingerprint);
  if (!pin.ok) throw new DialError({ kind: "configuration", reason: "key-unreadable", message: pin.message });

  // `socketEgress` refuses a link-local literal itself when `refusesLinkLocal` is set
  // (`egress-policy.ts:220`), and it answers the lookup the socket dials through, so the address
  // that was checked is the address connected. An earlier version of this function called
  // `assertNotLinkLocalLiteral` here as well; a planted mutation removing that call failed no
  // test, because the refusal still came from inside `socketEgress`. The call was dead and is
  // gone rather than kept as a comfort.
  const lookup = socketEgress(config.host, { refusesLinkLocal: true });
  const port = config.port ?? NETCONF_PORT;
  const connected = await socket.connect(
    lookup === undefined
      ? { host: config.host, port, noDelay: true }
      : { host: config.host, port, noDelay: true, lookup },
  );

  return await new Promise<Transport>((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(new DialError(classifyLoginFailure(error)));
    };
    const session = ssh.connect({
      sock: connected,
      username: config.username,
      readyTimeout: config.readyMs,
      ...(config.password === undefined ? {} : { password: config.password }),
      ...(config.privateKey === undefined ? {} : { privateKey: config.privateKey }),
      ...(config.passphrase === undefined ? {} : { passphrase: config.passphrase }),
      hostVerifier: (hostKey: Buffer): boolean => {
        const mismatch = checkHostKey(hostKey, pin.pin);
        if (mismatch === null) return true;
        // Refusing here stops the handshake before any user authentication packet, which is what
        // RFC 6242 section 6 asks for: the identity is verified before anything is sent.
        fail(new Error(`Host denied (verification failed). ${mismatch.message}`));
        return false;
      },
    });
    session.onError(fail);
    session.onReady(() => {
      session.subsystem(NETCONF_SUBSYSTEM, (error, transport) => {
        if (error || transport === null) {
          fail(error ?? new Error(`this device offers no ${NETCONF_SUBSYSTEM} subsystem on this port`));
          return;
        }
        if (settled) return;
        settled = true;
        resolve(transport);
      });
    });
  });
}
