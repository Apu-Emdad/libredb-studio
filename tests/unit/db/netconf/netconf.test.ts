/**
 * Tests for the pure parts of the `netconf` provider, phase 1 (issue #1724).
 *
 * Each test names the measurement it holds in place, so a later reader can tell a rule that came
 * from a device from a rule that came from taste.
 */
import { test } from "bun:test";
import { expectBe, expectEqual, expectMatch, expectNotBe, expectNotEqual, expectThrows, expectTruthy } from "./helpers";
import { readFile } from "node:fs/promises";
import { EOM, FrameReader, frame } from "@/lib/db/providers/network/netconf/framing";
import {
  buildKeyPath,
  compareUtf8,
  decodeSegment,
  encodeSegment,
  KeyPathError,
  levelPage,
  parseKeyPath,
} from "@/lib/db/providers/network/netconf/keypath";
import { classifyLoginFailure, mayShowDetail, REFUSED_SENTENCE } from "@/lib/db/providers/network/netconf/auth";
import { checkHostKey, fingerprintOf, readPin } from "@/lib/db/providers/network/netconf/hostkey";
import {
  assertWritable,
  isSensitiveLeaf,
  looksLikeSecret,
  safeForWriting,
} from "@/lib/db/providers/network/netconf/secrets";
import {
  ALLOWED_OPERATIONS,
  buildRpc,
  escapeXml,
  rememberNamespace,
} from "@/lib/db/providers/network/netconf/requests";
import {
  assertDeclarationIsSound,
  enumerableKinds,
  keyBrowserKind,
  NETCONF_KEY_SCAN,
} from "@/lib/db/providers/network/netconf/objectkinds";

const limits = { maxMessageBytes: 1024 * 1024, maxBufferBytes: 4 * 1024 * 1024 };

test("end-of-message framing reads two messages out of one read", () => {
  const reader = new FrameReader("eom", limits);
  const step = reader.feed(`<hello/>${EOM}<rpc-reply/>${EOM}`);
  expectEqual(step.messages, ["<hello/>", "<rpc-reply/>"]);
  expectBe(step.fault, undefined);
});

test("chunked framing round trips what frame() writes", () => {
  const reader = new FrameReader("chunked", limits);
  const step = reader.feed(frame("<rpc-reply/>", "chunked"));
  expectEqual(step.messages, ["<rpc-reply/>"]);
});

test("a chunk size with a leading zero ends the session, which RFC 6242 4.2 requires and Netopeer2 does not do", () => {
  const reader = new FrameReader("chunked", limits);
  const step = reader.feed("\n#0172\n" + "x".repeat(172) + "\n##\n");
  expectBe(step.fault?.kind, "chunk-size-leading-zero");
  expectEqual(step.messages, []);
});

test("a chunk size of zero and one past the maximum are both refused", () => {
  expectBe(new FrameReader("chunked", limits).feed("\n#0\n").fault?.kind, "chunk-size-out-of-range");
  expectBe(new FrameReader("chunked", limits).feed("\n#4294967296\n").fault?.kind, "chunk-size-out-of-range");
});

test("a peer that never terminates a message is stopped by the buffer cap, not by memory", () => {
  const reader = new FrameReader("eom", { maxMessageBytes: 64, maxBufferBytes: 128 });
  const step = reader.feed("x".repeat(200));
  expectBe(step.fault?.kind, "buffer-too-large");
});

test("a message past the message cap ends the read", () => {
  const reader = new FrameReader("eom", { maxMessageBytes: 8, maxBufferBytes: 4096 });
  const step = reader.feed("x".repeat(20) + EOM);
  expectBe(step.fault?.kind, "message-too-large");
});

test("a four byte character split across two reads decodes correctly", () => {
  const reader = new FrameReader("chunked", limits);
  const payload = "a\u{1F600}b";
  const written = frame(payload, "chunked");
  const half = Math.floor(written.length / 2);
  reader.feed(written.slice(0, half));
  const step = reader.feed(written.slice(half));
  expectEqual(step.messages, [payload]);
});

test("every measured key value round trips and none keeps the separator", () => {
  const values = [
    "ge-0/0/0",
    "Ethernet1/0",
    "a/b",
    "a]b",
    "a[b",
    "a=b",
    "a'b",
    'a"b',
    "a\\b",
    "a b",
    "]]>]]>",
    "a,b",
    "çik",
    "\u{1F600}",
    "",
    "%2F",
    // encodeURIComponent leaves these five alone and RFC 3986 calls them reserved, so the encoder
    // escapes them itself. Without a value holding them that escaping was untested: removing it was
    // a planted mutation that no test caught until these five values were added.
    "a!b",
    "a'b",
    "a(b",
    "a)b",
    "a*b",
  ];
  for (const value of values) {
    const encoded = encodeSegment(value);
    expectBe(decodeSegment(encoded), value, `round trip of ${JSON.stringify(value)}`);
    expectBe(encoded.includes("/"), false, `separator leaked for ${JSON.stringify(value)}`);
    for (const reserved of ["!", "'", "(", ")", "*"]) {
      expectBe(encoded.includes(reserved), false, `${reserved} left unescaped in ${JSON.stringify(value)}`);
    }
  }
});

test("an unpaired surrogate is refused rather than encoded", () => {
  expectThrows(() => encodeSegment("\uD800"), KeyPathError);
});

test("the built path matches the one issue #1724 section 3 writes", () => {
  const path = buildKeyPath([
    { module: "ietf-interfaces", name: "interfaces" },
    { name: "interface", keys: ["ge-0/0/0"], keyNames: ["name"] },
    { name: "statistics" },
    { name: "in-octets" },
  ]);
  expectBe(path, "ietf-interfaces:interfaces/interface=ge-0%2F0%2F0/statistics/in-octets");
  expectEqual(parseKeyPath(path)[1], { name: "interface", keys: ["ge-0/0/0"] });
});

test("compareUtf8 is UTF-8 byte order where the default sort is not", () => {
  const sample = ["�", "\u{10000}", "", "\u{1F600}", "z"];
  const byUtf8 = [...sample].sort(compareUtf8);
  const byBuffer = [...sample].sort((a, b) => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8")));
  const byDefault = [...sample].sort();
  expectEqual(byUtf8, byBuffer);
  expectNotEqual(byDefault, byBuffer);
});

test("a level page sorts on the decoded value, so the escaped order does not leak in", () => {
  const entries = [
    { name: "z", kind: "key" as const },
    { name: "�", kind: "key" as const },
    { name: "\u{10000}", kind: "key" as const },
  ];
  const page = levelPage(entries, null, 3);
  expectEqual(
    page.entries.map((e) => e.name),
    ["z", "�", "\u{10000}"],
  );
});

test("a level page neither skips nor repeats across a cursor, and removes repeats", () => {
  const all = ["a", "b", "b", "c", "d", "e"].map((name) => ({ name, kind: "key" as const }));
  const first = levelPage(all, null, 2);
  expectEqual(
    first.entries.map((e) => e.name),
    ["a", "b"],
  );
  const second = levelPage(all, first.cursor, 2);
  expectEqual(
    second.entries.map((e) => e.name),
    ["c", "d"],
  );
  const third = levelPage(all, second.cursor, 2);
  expectEqual(
    third.entries.map((e) => e.name),
    ["e"],
  );
  expectBe(third.cursor, "e");
});

test("the two passphrase failures are configuration errors and are told apart", () => {
  const missing = classifyLoginFailure(
    new Error("Cannot parse privateKey: Encrypted private OpenSSH key detected, but no passphrase given"),
  );
  const wrong = classifyLoginFailure(
    new Error("Cannot parse privateKey: OpenSSH key integrity check failed -- bad passphrase?"),
  );
  expectBe(missing.kind, "configuration");
  expectBe(wrong.kind, "configuration");
  // The reason, not only the message: with only the messages asserted, removing either branch still
  // produced two different sentences and the test passed. A planted mutation proved it.
  expectBe(missing.kind === "configuration" ? missing.reason : "", "passphrase-missing");
  expectBe(wrong.kind === "configuration" ? wrong.reason : "", "passphrase-wrong");
  expectNotBe(missing.message, wrong.message);
  expectBe(mayShowDetail(missing), true);
});

test("every server side refusal reads the same sentence and carries no detail", () => {
  const refused = classifyLoginFailure(new Error("All configured authentication methods failed"));
  expectBe(refused.kind, "refused");
  expectBe(refused.message, REFUSED_SENTENCE);
  expectBe(mayShowDetail(refused), false);
});

test("a host key refusal is its own kind, so it is never retried another way", () => {
  expectBe(classifyLoginFailure(new Error("Host denied (verification failed)")).kind, "host-key");
});

test("a pasted fingerprint is read, and the three wrong shapes each say what to paste", () => {
  expectBe(readPin("  ").ok, false);
  const md5 = readPin("MD5:aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99");
  expectBe(md5.ok, false);
  expectMatch(md5.ok ? "" : md5.message, /SHA256:/);
  expectBe(readPin("SHA256:short").ok, false);
  const good = fingerprintOf(Buffer.from("a host key"));
  expectBe(readPin(good).ok, true);
});

test("a mismatch names both fingerprints and both causes, and says nothing was sent", () => {
  const pin = fingerprintOf(Buffer.from("the pinned key"));
  const mismatch = checkHostKey(Buffer.from("another key"), pin);
  expectTruthy(mismatch);
  expectMatch(mismatch.message, /reinstalled/);
  expectMatch(mismatch.message, /another host/);
  expectMatch(mismatch.message, /Nothing was sent/);
  expectTruthy(mismatch.message.includes(pin) && mismatch.message.includes(mismatch.seen));
  expectBe(checkHostKey(Buffer.from("the pinned key"), pin), null);
});

test("the leaves measured as readable by a read only account never reach a writer", () => {
  expectBe(isSensitiveLeaf("hashed-password").sensitive, true);
  expectBe(isSensitiveLeaf("ks:cleartext-private-key").sensitive, true);
  expectBe(isSensitiveLeaf("name").sensitive, false);
  expectBe(safeForWriting(["keystore", "asymmetric-key", "public-key"], "AAAAB3Nz").withheld, true);
  expectBe(safeForWriting(["interfaces", "interface", "name"], "ge-0/0/0").text, "ge-0/0/0");
});

test("a crypt hash and a PEM block are caught even where no path said so", () => {
  expectBe(looksLikeSecret("$6$3YBmnHaul54TEa/k$abcdefghij"), true);
  expectBe(looksLikeSecret("-----BEGIN OPENSSH PRIVATE KEY-----"), true);
  expectBe(looksLikeSecret("ge-0/0/0"), false);
  expectThrows(() => assertWritable("user alice $6$3YBmnHaul54TEa/k$abcdefghij"));
});

test("the operation set is five, and each of the five builds", () => {
  expectEqual([...ALLOWED_OPERATIONS].sort(), ["close-session", "get", "get-config", "get-data", "get-schema"]);
  rememberNamespace("ietf-interfaces", "urn:ietf:params:xml:ns:yang:ietf-interfaces");
  expectMatch(
    buildRpc({ operation: "close-session" }, 1),
    /^<rpc message-id="1" xmlns="[^"]+"><close-session\/><\/rpc>$/,
  );
  expectMatch(
    buildRpc({ operation: "get-config", source: "running" }, 2),
    /<get-config><source><running\/><\/source><\/get-config>/,
  );
  expectMatch(buildRpc({ operation: "get" }, 3), /<get><\/get>/);
  expectMatch(buildRpc({ operation: "get-data", datastore: "operational" }, 4), /<get-data /);
  expectMatch(buildRpc({ operation: "get-schema", identifier: "ietf-system" }, 5), /<get-schema /);
});

/**
 * The seam guard. The test above asserts that the five build; it does not assert that a sixth
 * cannot, and the name it used to carry claimed that it did (decision K-125: a test asserts the
 * preconditions of what it tests, and a name is a claim).
 *
 * The closed set is enforced by the type union at compile time, and nothing at run time can reflect
 * a type. So this reads the module's own source and holds the operation elements it is able to emit
 * to exactly the five, the way `tests/unit/db/kafka/seam-guard.test.ts` parses a provider's sources
 * from disk rather than watching its behaviour.
 */
test("no sixth operation element can be emitted, read from the source rather than from behaviour", async () => {
  const source = await readFile("src/lib/db/providers/network/netconf/requests.ts", "utf8");
  const body = source.slice(source.indexOf("function buildOperation"));
  const emitted = new Set(
    [...body.matchAll(/`?<([a-z][a-z-]*)[ />]/g)].map((match) => match[1] ?? "").filter((name) => name !== ""),
  );
  // The elements a request body may open, besides the five operation names, are the arguments the
  // five take. Anything outside this list is a new element reaching the wire.
  const arguments_ = new Set([
    "source",
    "datastore",
    "max-depth",
    "with-defaults",
    "identifier",
    "version",
    "format",
    "filter",
    "rpc",
  ]);
  const operations = [...emitted].filter((name) => !arguments_.has(name));
  expectEqual(operations.sort(), ["close-session", "get", "get-config", "get-data", "get-schema"]);
});

test("max-depth 0 and 1 are never sent, because the server refuses one and empties the other", () => {
  expectThrows(() => buildRpc({ operation: "get-data", datastore: "running", maxDepth: 0 }, 1));
  expectThrows(() => buildRpc({ operation: "get-data", datastore: "running", maxDepth: 1 }, 1));
  expectMatch(buildRpc({ operation: "get-data", datastore: "running", maxDepth: 2 }, 1), /<max-depth>2<\/max-depth>/);
});

test("get-schema asks for yang and never for yin, which is listed and refused", () => {
  const rpc = buildRpc({ operation: "get-schema", identifier: "ietf-interfaces" }, 3);
  expectMatch(rpc, /<format>yang<\/format>/);
  expectBe(rpc.includes("yin"), false);
});

test("a module the YANG library did not name is a configuration error, not a guess", () => {
  expectThrows(() => buildRpc({ operation: "get", filter: { nodes: [{ module: "no-such-module", name: "x" }] } }, 4));
});

test("request text cannot break the framing or the filter", () => {
  expectBe(escapeXml(`]]>]]> & <x> "q"`), "]]&gt;]]&gt; &amp; &lt;x&gt; &quot;q&quot;");
});

test("the Keys panel kind says who enumerates it, and the object kind says the object surface does", () => {
  expectEqual(
    enumerableKinds().map((kind) => kind.id),
    ["node"],
  );
  expectBe(keyBrowserKind()?.id, "key");
  expectBe(keyBrowserKind()?.enumeratedBy, "key-browser");
});

test("the declaration meets the three rules the repository's own census enforces", () => {
  assertDeclarationIsSound();
  // A kind the Keys panel lists while leaving the field absent is walked by the object surface too,
  // which compiles and passes every other test, so it is asserted here.
  expectThrows(() =>
    assertDeclarationIsSound([{ id: "key", role: "config", label: "Key", labelPlural: "Keys", hasSource: true }]),
  );
  expectThrows(() =>
    assertDeclarationIsSound([
      { id: "a", role: "config", label: "A", labelPlural: "As", enumeratedBy: "key-browser", hasSource: true },
      { id: "b", role: "config", label: "B", labelPlural: "Bs", enumeratedBy: "key-browser", hasSource: true },
    ]),
  );
  expectThrows(() =>
    assertDeclarationIsSound([
      { id: "key", role: "config", label: "Key", labelPlural: "Keys", enumeratedBy: "key-browser" },
    ]),
  );
});

test("rootKind is absent, because this engine addresses its key space through container levels", () => {
  expectBe(NETCONF_KEY_SCAN.levels?.rootKind, undefined);
  expectBe(NETCONF_KEY_SCAN.separator?.length, 1);
  expectBe(NETCONF_KEY_SCAN.pattern, "prefix");
  expectBe(NETCONF_KEY_SCAN.totalScope, "none");
});
