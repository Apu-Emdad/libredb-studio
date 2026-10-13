/**
 * The guard that keeps what a device returns out of logs, exports and measurement notes
 * (issue #1724, decision K-88).
 *
 * The rule exists because of a measurement rather than a worry. MEASURED 2026-10-13 with the read
 * only account of the fixture, the one that cannot run any of lock, unlock, edit-config,
 * copy-config, delete-config, commit, validate, discard-changes, kill-session or
 * create-subscription: the same account reads, through `<get-config>` on running, the `$6$` hashed
 * password of a configured user, the keystore entries and the public keys. The `/nacm` subtree and
 * the `cleartext-private-key` leaf were not in that reply.
 *
 * So read only is not the same as blind, and the two have to be handled separately: NACM decides
 * what the account may read, and this file decides what Studio may repeat.
 *
 * It is a guard rather than a convention on purpose. A comment asking the next author not to log a
 * value does not survive the next author.
 */

/**
 * Node names whose value never leaves the read path, measured on the fixture rather than guessed.
 *
 * The list is matched on the local name, so a namespace prefix does not get a value past it.
 */
const SENSITIVE_LEAVES: readonly string[] = [
  "hashed-password",
  "password",
  "cleartext-private-key",
  "encrypted-private-key",
  "cleartext-symmetric-key",
  "encrypted-symmetric-key",
  "private-key",
  "secret",
  "passphrase",
  "pre-shared-key",
];

/** Container names whose whole subtree is treated as secret bearing. */
const SENSITIVE_SUBTREES: readonly string[] = ["keystore", "truststore", "local-users"];

const REPLACEMENT = "[withheld by Studio]";

export interface SensitiveCheck {
  readonly sensitive: boolean;
  /** The name that matched, for a message that says why without repeating the value. */
  readonly matched?: string;
}

function localName(node: string): string {
  const colon = node.indexOf(":");
  return (colon === -1 ? node : node.slice(colon + 1)).toLowerCase();
}

/** True when a leaf's value must not be repeated anywhere outside the result grid. */
export function isSensitiveLeaf(node: string): SensitiveCheck {
  const name = localName(node);
  const hit = SENSITIVE_LEAVES.find((leaf) => leaf === name);
  return hit ? { sensitive: true, matched: hit } : { sensitive: false };
}

/** True when a path runs through a container whose whole subtree is secret bearing. */
export function isSensitivePath(path: readonly string[]): SensitiveCheck {
  for (const node of path) {
    const name = localName(node);
    const hit = SENSITIVE_SUBTREES.find((subtree) => subtree === name);
    if (hit) return { sensitive: true, matched: hit };
  }
  for (const node of path) {
    const leaf = isSensitiveLeaf(node);
    if (leaf.sensitive) return leaf;
  }
  return { sensitive: false };
}

/**
 * The one way out for anything that is going to be written down: a log line, an export, an agent
 * context, an error detail, a measurement note.
 *
 * It takes the path and the value and answers what may be written. A caller cannot forget to ask,
 * because it has no other way to turn a value into text: the provider's logging and export paths
 * take `SafeValue`, which only this function produces.
 */
export interface SafeValue {
  readonly text: string;
  readonly withheld: boolean;
}

export function safeForWriting(path: readonly string[], value: string): SafeValue {
  const check = isSensitivePath(path);
  if (check.sensitive) return { text: REPLACEMENT, withheld: true };
  return { text: value, withheld: false };
}

/**
 * Checks a line that is about to be written for a value that looks like a secret even though its
 * path did not say so.
 *
 * This is the second layer and it is deliberately crude: it recognises the shapes the fixture
 * actually produced, a `$6$` crypt hash and a PEM block. It exists because the first layer is a
 * list of names, and a device may hold a secret under a name nobody listed.
 */
export function looksLikeSecret(text: string): boolean {
  if (/\$[1256][aby]?\$[./A-Za-z0-9]{8,}/.test(text)) return true;
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) return true;
  return false;
}

/**
 * The assertion the provider's own logging path runs in development and in tests: a line that
 * holds a secret shape never reaches a writer.
 */
export function assertWritable(text: string): void {
  if (looksLikeSecret(text)) {
    throw new Error("a line about to be written holds something shaped like a secret, so it was not written");
  }
}
