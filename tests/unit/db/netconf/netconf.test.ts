/**
 * Tests for the pure parts of the `netconf` provider, phase 1 (issue #1724).
 *
 * Each test names the measurement it holds in place, so a later reader can tell a rule that came
 * from a device from a rule that came from taste.
 */
import { test } from "bun:test";
import { QueryError } from "@/lib/db/errors";
import { READER_LIMITS } from "@/lib/db/providers/network/netconf/reader-port";
import { expectBe, expectEqual, expectMatch, expectNotBe, expectNotEqual, expectThrows, expectTruthy } from "./helpers";
import { readFile } from "node:fs/promises";
import { EOM, FrameReader, frame, MAX_CHUNK_SIZE } from "@/lib/db/providers/network/netconf/framing";
import {
  buildKeyPath,
  compareUtf8,
  decodeSegment,
  encodeSegment,
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

/**
 * The split is between characters, which is the only split the reader can be given.
 *
 * `feed` takes text, and the text comes from the transport, which decodes with a StringDecoder and
 * holds an incomplete sequence back until its bytes arrive. So half a character never reaches here;
 * that case belongs to the transport and is held in `ports.test.ts`. An earlier version of this
 * test cut the written frame at half its string length, which can fall between the two halves of a
 * surrogate pair: a split the transport cannot produce.
 */
test("a four byte character arriving in two reads decodes correctly", () => {
  const reader = new FrameReader("chunked", limits);
  const payload = "a\u{1F600}b";
  const written = frame(payload, "chunked");
  // After the character, so neither piece holds a lone surrogate.
  const at = written.indexOf("b");
  reader.feed(written.slice(0, at));
  const step = reader.feed(written.slice(at));
  expectEqual(step.messages, [payload]);
});

/**
 * Frames `payload` the way a server does: in chunks of `chunkBytes`, not as one chunk.
 *
 * `frame()` writes one chunk, which is why the test above could split a message in half and still
 * pass while the reader was losing data: with one chunk, a split that lands inside it completes
 * nothing, so nothing is consumed and nothing can be dropped.
 */
function framedInChunks(payload: string, chunkBytes: number): string {
  const buffer = Buffer.from(payload, "utf8");
  let out = "";
  for (let at = 0; at < buffer.length; at += chunkBytes) {
    const piece = buffer.subarray(at, Math.min(at + chunkBytes, buffer.length));
    out += `\n#${piece.length}\n${piece.toString("utf8")}`;
  }
  return `${out}\n##\n`;
}

function fedInPieces(text: string, size: number): string[] {
  const reader = new FrameReader("chunked", limits);
  const messages: string[] = [];
  for (let at = 0; at < text.length; at += size) messages.push(...reader.feed(text.slice(at, at + size)).messages);
  return messages;
}

/**
 * MEASURED 2026-10-13, against Netopeer2 over SSH: a `get-schema` reply of 39,348 bytes arrived as
 * four chunks of 10,240, 10,240, 10,240 and 8,593 bytes, in nine TCP pieces. The reader kept the
 * assembled part of a message in a local variable, so a feed that completed a chunk without
 * completing the message returned and discarded it, while those bytes were already gone from the
 * buffer. It still answered exactly one message: the tail of the reply, with its opening tag and
 * its `message-id` missing. The session then refused it for carrying no `message-id`, a true
 * sentence that pointed nowhere near the loss.
 */
test("a message framed in several chunks arrives whole when the pieces do not align with the chunks", () => {
  const payload = `<rpc-reply message-id="7">${"x".repeat(26_000)}</rpc-reply>`;
  const written = framedInChunks(payload, 10_240);
  expectBe((written.match(/\n#\d+\n/g) ?? []).length, 3, "the payload has to span more than one chunk");
  for (const size of [1_024, 4_096, 8_192, 10_240, 10_241]) {
    expectEqual(fedInPieces(written, size), [payload]);
  }
});

test("feeding a multi-chunk message at once and in pieces answer the same message", () => {
  const payload = `<rpc-reply message-id="8">${"\u00e7".repeat(9_000)}</rpc-reply>`;
  const written = framedInChunks(payload, 4_096);
  const whole = new FrameReader("chunked", limits).feed(written).messages;
  expectEqual(whole, [payload]);
  expectEqual(fedInPieces(written, 777), whole);
});

/**
 * The part held between feeds is bounded as it grows, not only where the message ends. A peer that
 * keeps sending chunks and never sends the terminator holds its bytes there rather than in the
 * buffer, so a cap checked at the terminator alone would never run.
 */
test("chunks that never terminate are refused once they pass the message cap", () => {
  const reader = new FrameReader("chunked", { maxMessageBytes: 64, maxBufferBytes: 1_048_576 });
  let fault: unknown;
  for (let sent = 0; sent < 10 && fault === undefined; sent += 1) {
    fault = reader.feed(`\n#32\n${"y".repeat(32)}`).fault;
  }
  expectBe((fault as { kind?: string } | undefined)?.kind, "message-too-large");
});

/**
 * The sizes a device actually answered, fed in pieces that align with nothing.
 *
 * MEASURED 2026-10-13 on the fixture, over SSH: the largest module text answered 118,641 bytes, a
 * depth-2 NMDA read of 5,000 entries 234,120, and the unfiltered read of the same list 987,956.
 *
 * MEASURED in the same run, and it settled a question rather than confirming a guess: with a four
 * byte character every 160 bytes in the data, the server's chunks came back 10,240, 10,236, 10,240,
 * 10,208, 10,240, 10,240, 10,233, 10,195, 10,240, 10,236 and 2,648 bytes. The sizes are not a fixed
 * 10,240: Netopeer2 SHORTENS a chunk rather than cutting a character, and every one of the eleven
 * chunks decoded on its own. So a chunk boundary inside a character is not reachable on this
 * server, and the test does not pretend otherwise. What that case would need is written in the
 * reader, beside the limit of the contract it runs into.
 */
test("the sizes a device answered arrive whole, in pieces that align with nothing", () => {
  for (const [bytes, feeds] of [
    [118_641, [1_024, 3_000, 10_239]],
    [234_120, [4_096, 10_241]],
    [987_956, [3_000, 65_537]],
  ] as const) {
    const payload = `<rpc-reply message-id="9">${"\u00e7".repeat(1_000)}${"x".repeat(bytes - 26 - 2_000 - 12)}</rpc-reply>`;
    const written = framedInChunks(payload, 10_240);
    for (const size of feeds) {
      const messages = fedInPieces(written, size);
      expectBe(messages.length, 1, `pieces of ${size} did not answer one message for ${bytes} bytes`);
      expectBe(messages[0], payload);
    }
  }
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
  expectThrows(() => encodeSegment("\uD800"));
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

/**
 * The two read operations carry a subtree filter in different elements, and taking them to be the
 * same cost both NMDA reads their whole result.
 *
 * MEASURED 2026-10-13 against Netopeer2: `<get-data>` carrying `<filter type="subtree">` is
 * refused with `operation-failed` and the device's own sentence, `Node "filter" not found as a
 * child of "get-data" node.`, on `operational` and on `running` alike, while `<get-config>` with
 * the identical filter answered 987,956 bytes. With `<subtree-filter>` the same `<get-data>` on
 * running answered 234,120 bytes, every one of the 5,000 entries at depth 2.
 * STANDARD: RFC 8526 section 3.1.1 names the child `subtree-filter`.
 *
 * No test caught this, and the reason is worth keeping: every request test compared our text with
 * our own expectation of our text. A device was the only thing that could tell us.
 */
test("get-data carries subtree-filter and the older reads carry filter type=subtree", () => {
  const filter = { nodes: [{ name: "interfaces" }] };
  const data = buildRpc({ operation: "get-data", datastore: "running", filter, maxDepth: 2 }, 1);
  expectMatch(data, /<subtree-filter><interfaces><\/interfaces><\/subtree-filter>/);
  expectBe(data.includes('<filter type="subtree">'), false, "get-data must not carry the older element");
  for (const older of [
    buildRpc({ operation: "get", filter }, 2),
    buildRpc({ operation: "get-config", source: "running", filter }, 3),
  ]) {
    expectMatch(older, /<filter type="subtree"><interfaces><\/interfaces><\/filter>/);
    expectBe(older.includes("<subtree-filter>"), false, "get and get-config keep the RFC 6241 element");
  }
});

test("the filter element is the only difference: the node chain inside it is the same text", () => {
  const filter = { nodes: [{ name: "interfaces" }, { name: "interface", keys: ["ge-0/0/0"] }] };
  const inner = /<interfaces>.*<\/interfaces>/;
  const fromData = inner.exec(buildRpc({ operation: "get-data", datastore: "running", filter }, 1))?.[0];
  const fromGet = inner.exec(buildRpc({ operation: "get", filter }, 2))?.[0];
  expectTruthy(fromData !== undefined && fromData.includes("ge-0/0/0"));
  expectBe(fromGet, fromData);
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

/**
 * The declared limits, asserted against what was measured rather than against themselves.
 *
 * A mutation replacing `defaultCount` with 1 and `maxDepth` with 1 survived the earlier tests,
 * because nothing held either number to anything. Asserting that a constant equals itself is not a
 * test, so these assert the floors the measurements imply: with 5,000 interfaces on the fixture, a
 * page of a handful would need a thousand round trips, and a tree that nests deeper than a couple
 * of levels cannot be read at a depth cap of 1.
 */
test("the key scan page sizes are usable on the size of list that was measured", () => {
  const scan = NETCONF_KEY_SCAN;
  // A default of a handful turns an ordinary level into a hundred round trips: MEASURED, the
  // fixture's one list held 5,000 entries, so the default has to page that in tens of requests
  // rather than thousands. A mutation setting it to 1 survived an assertion of ">= 1", which is
  // the shape this rule is about: a floor has to come from the measurement, not from the type.
  expectTruthy((scan.defaultCount ?? 0) >= 50);
  expectTruthy((scan.maxCount ?? 0) >= (scan.defaultCount ?? 0));
  // MEASURED: the fixture served 5,000 interfaces under one list. A maximum page of a few entries
  // turns one level into a thousand requests, so the cap has to be in the hundreds at least.
  expectTruthy((scan.maxCount ?? 0) >= 100);
});

test("the reader limits are above what the measured replies actually need", () => {
  // MEASURED on the fixture: 5,000 interfaces of four leaves each, so a reply holds about 25,000
  // elements. A cap below that refuses the device's ordinary answer.
  expectTruthy(READER_LIMITS.maxElements >= 25_000);
  // MEASURED: a key path of module, list, entry, container and leaf is five levels before any
  // nesting inside the entry, and real modules nest deeper. A cap of a handful refuses everything.
  expectTruthy(READER_LIMITS.maxDepth >= 16);
  // The byte cap has to clear the largest module text measured through get-schema, 118,482 bytes.
  expectTruthy(READER_LIMITS.maxTextBytes >= 118_482);
});

/**
 * The framing caps, at the value they allow and the first they refuse.
 *
 * The chunk size range is the standard's, not ours: RFC 6242 section 4.2 gives the chunk size as 1
 * to 4294967295, so both ends are held against those figures rather than against the constant.
 */
test("a chunk size of 1 is read and 4294967296 is refused, which are the standard's two ends", () => {
  const one = new FrameReader("chunked", limits).feed("\n#1\nx\n##\n");
  expectEqual(one.messages, ["x"]);
  expectBe(new FrameReader("chunked", limits).feed(`\n#${MAX_CHUNK_SIZE}\n`).fault, undefined);
  expectBe(
    new FrameReader("chunked", limits).feed(`\n#${MAX_CHUNK_SIZE + 1}\n`).fault?.kind,
    "chunk-size-out-of-range",
  );
  expectBe(MAX_CHUNK_SIZE, 4_294_967_295);
});

test("a message exactly at the cap is read and one byte more is refused, in both framings", () => {
  const cap = 256;
  const tight = { maxMessageBytes: cap, maxBufferBytes: 1_048_576 };
  const atCap = "m".repeat(cap);
  expectEqual(new FrameReader("eom", tight).feed(frame(atCap, "eom")).messages, [atCap]);
  expectBe(new FrameReader("eom", tight).feed(frame(`${atCap}m`, "eom")).fault?.kind, "message-too-large");
  expectEqual(new FrameReader("chunked", tight).feed(frame(atCap, "chunked")).messages, [atCap]);
  expectBe(new FrameReader("chunked", tight).feed(frame(`${atCap}m`, "chunked")).fault?.kind, "message-too-large");
});

test("the buffer cap allows its exact size and refuses one byte past it", () => {
  const cap = 128;
  const tight = { maxMessageBytes: 1_048_576, maxBufferBytes: cap };
  expectBe(new FrameReader("eom", tight).feed("b".repeat(cap)).fault, undefined);
  expectBe(new FrameReader("eom", tight).feed("b".repeat(cap + 1)).fault?.kind, "buffer-too-large");
});
