/**
 * The composition root: a connection becomes a reader.
 *
 * Four things are joined here and nothing is decided: the egress rule and the host key check are
 * the dial's, the framing and the message matching are the session's, and which request answers
 * which question is the reader's. This function exists so that the join itself is testable, and so
 * that the one part that does not exist yet is a parameter rather than a gap.
 *
 * The parser is that part (K-10). It is passed in, so this path is complete today with a test
 * double and complete tomorrow with the real reader, and nothing here changes when it lands.
 */
import { DatabaseConfigError } from "@/lib/db/errors";
import type { DatabaseConnection } from "@/lib/db/types";
import { dialNetconf, NETCONF_PORT, type SocketPort, type SshPort } from "./dial";
import { nodeSocketPort, nodeSshPort } from "./node-ports";
import type { XmlReaderPort } from "./reader-port";
import { DeviceReaderImpl, type SessionPort } from "./reader";
import { NetconfSession, type SessionLimits } from "./session";

/**
 * The deadlines and sizes one session runs under.
 *
 * MEASURED 2026-10-13 against the fixture over SSH on loopback: the dial, host key check and
 * subsystem open together took 44 ms cold and 212 ms on a later run, a hello was always answered
 * well inside a second, and the five request sequence took 350 ms in all, the largest single reply
 * being 987,956 bytes.
 *
 * STILL A DEFAULT, and loopback is why: a device reached across a management network is the
 * measurement that decides a deadline, and it is UNMEASURED. These are generous against everything
 * seen so far rather than tuned to it, and the sizes come from the read caps rather than from a
 * guess: a reply larger than the parser would accept is refused by the framing first, with a
 * sentence, instead of being parsed and then refused.
 */
export const NETCONF_SESSION_LIMITS: SessionLimits = Object.freeze({
  helloMs: 15_000,
  requestMs: 120_000,
  maxMessageBytes: 16 * 1024 * 1024,
  maxBufferBytes: 32 * 1024 * 1024,
});

export interface OpenPorts {
  readonly xml: XmlReaderPort;
  readonly ssh?: SshPort;
  readonly socket?: SocketPort;
  readonly limits?: SessionLimits;
}

/**
 * The credential this provider dials with.
 *
 * Declared here rather than read off `DatabaseConnection`, and that is a measured constraint rather
 * than a preference. The house carries an engine's own settings as optional fields on that type
 * (`serviceName` for Oracle, `instanceName` for MSSQL, `securityMode` for OPC UA), so a key, its
 * passphrase and a host key fingerprint would be three new fields there, and that file is shared.
 * They belong to the registration commit, with every other shared surface, so until then this
 * function takes them and invents nothing.
 *
 * `sshTunnel` already holds fields of exactly these names and is NOT reused: it describes a bastion
 * to reach a target THROUGH, its docblock says so, and a device behind a bastion is a real case
 * that would then have nowhere left to put the bastion.
 *
 * A key and a password are both allowed, because a device may be configured for either, and both
 * reach ssh2 as the caller supplied them. Neither is refused here. MEASURED 2026-10-13 against the
 * fixture: with no credential, with an empty password and with a wrong password, all three were
 * refused by the device with the same single sentence and the same kind, so dialling with nothing
 * spends an attempt on the device's auth log to learn what is already known here.
 */
export interface NetconfCredential {
  readonly username: string;
  readonly hostKeyFingerprint: string;
  readonly privateKey?: string;
  readonly passphrase?: string;
  readonly password?: string;
}

function checked(credential: NetconfCredential): NetconfCredential {
  if (credential.username === "") {
    throw new DatabaseConfigError("this connection needs the device's account name");
  }
  if (credential.privateKey === undefined && credential.password === undefined) {
    throw new DatabaseConfigError("this connection needs the device's key or its password");
  }
  return credential;
}

export async function openNetconfReader(
  config: DatabaseConnection,
  credential: NetconfCredential,
  ports: OpenPorts,
): Promise<DeviceReaderImpl> {
  const host = config.host;
  if (typeof host !== "string" || host === "") {
    throw new DatabaseConfigError("this connection needs the device's address");
  }
  const { username, hostKeyFingerprint, privateKey, passphrase, password } = checked(credential);
  const limits = ports.limits ?? NETCONF_SESSION_LIMITS;
  const transport = await dialNetconf(
    {
      host,
      ...(typeof config.port === "number" && config.port > 0 ? { port: config.port } : {}),
      username,
      hostKeyFingerprint,
      ...(privateKey === undefined ? {} : { privateKey }),
      ...(passphrase === undefined ? {} : { passphrase }),
      ...(password === undefined ? {} : { password }),
      readyMs: limits.helloMs,
    },
    ports.ssh ?? nodeSshPort,
    ports.socket ?? nodeSocketPort,
  );
  // From here a session exists, so a failure has to close it rather than leave the device holding a
  // channel open until its own idle timer runs. The device's session table is a shared resource,
  // and a provider that leaks one entry per failed open is the provider that exhausts it.
  const { session, hello } = await NetconfSession.open(transport, limits);
  try {
    return await DeviceReaderImpl.open(session as SessionPort, ports.xml, hello);
  } catch (failure) {
    await session.close().catch(() => {});
    throw failure;
  }
}

export { NETCONF_PORT };
