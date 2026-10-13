/**
 * The reader's composition: which request answers which question, what is read once, and what is
 * derived rather than believed.
 *
 * Both ports are fakes. The session records the requests it was given and answers prepared text,
 * and the XML port answers a prepared tree, because this provider parses no XML (K-10) and the
 * parser is another hand's. So what is held here is the composition and nothing else.
 */
import { test } from "bun:test";
import { expectBe, expectEqual, expectMatch, expectRejects, expectTruthy } from "./helpers";
import { DeviceReaderImpl, type SessionPort } from "@/lib/db/providers/network/netconf/reader";
import { READER_LIMITS, type XmlElement, type XmlReaderPort } from "@/lib/db/providers/network/netconf/reader-port";
import type { NetconfRequest } from "@/lib/db/providers/network/netconf/requests";

function el(name: string, text?: string, children: XmlElement[] = []): XmlElement {
  const base = { name, attributes: new Map<string, string>(), children, bindings: new Map<string, string>() };
  return text === undefined ? base : { ...base, text };
}

const reply = (children: XmlElement[]): XmlElement => el("rpc-reply", undefined, children);
const data = (children: XmlElement[]): XmlElement => el("data", undefined, children);

function moduleEntry(name: string, conformance: "implement" | "import", namespace = `urn:x:${name}`): XmlElement {
  return el("module", undefined, [
    el("name", name),
    el("namespace", namespace),
    el("conformance-type", conformance),
  ]);
}

/** The fixture's own library, cut to what the facts are derived from. */
const LIBRARY = reply([
  data([
    el("modules-state", undefined, [
      moduleEntry("ietf-interfaces", "implement"),
      moduleEntry("ietf-netconf-nmda", "implement"),
      moduleEntry("ietf-yang-types", "import"),
      moduleEntry("iana-if-type", "implement"),
    ]),
  ]),
]);

const DEFAULT_REPLY = '<rpc-reply xmlns="urn:ietf:params:xml:ns:netconf:base:1.0" message-id="1"><data/></rpc-reply>';
const CANDIDATE = "urn:ietf:params:netconf:capability:candidate:1.0";
const STARTUP = "urn:ietf:params:netconf:capability:startup:1.0";

interface Harness {
  readonly session: SessionPort;
  readonly xml: XmlReaderPort;
  readonly asked: NetconfRequest[];
  readonly closed: { count: number };
  answer(tree: XmlElement, text?: string): void;
}

function harness(trees: XmlElement[] = []): Harness {
  const asked: NetconfRequest[] = [];
  const queue: { tree: XmlElement; text: string }[] = trees.map((tree) => ({ tree, text: DEFAULT_REPLY }));
  const closed = { count: 0 };
  let next: XmlElement | undefined;
  return {
    asked,
    closed,
    answer: (tree, text) => void queue.push({ tree, text: text ?? DEFAULT_REPLY }),
    session: {
      request: async (request) => {
        asked.push(request);
        const entry = queue.shift();
        next = entry?.tree;
        // The TEXT matters as well as the tree: `sourceXml` slices the reply rather than printing
        // the tree, so a fake that answered a placeholder could not exercise that path at all.
        return entry?.text ?? DEFAULT_REPLY;
      },
      close: async () => void (closed.count += 1),
    },
    xml: {
      parse: () => {
        if (next === undefined) throw new Error("the test queued no tree for this request");
        return next;
      },
    },
  };
}

const open = async (h: Harness, capabilities: readonly string[] = [CANDIDATE, STARTUP]): Promise<DeviceReaderImpl> =>
  await DeviceReaderImpl.open(h.session, h.xml, { sessionId: "6", capabilities });

/**
 * MEASURED 2026-10-13 on the fixture: the hello advertises NMDA in ZERO of its 29 capabilities, the
 * library lists `ietf-netconf-nmda`, and `<get-data>` is served and answers without an error. A
 * provider that read the hello would refuse an operation the device serves, so the library decides.
 */
test("NMDA is decided by the library and not by the hello", async () => {
  const h = harness([LIBRARY]);
  const reader = await open(h, [CANDIDATE]);
  expectBe(reader.facts.nmda, true);
  expectBe(
    reader.facts.capabilities.some((capability) => capability.includes("nmda")),
    false,
    "the hello that produced this says nothing about NMDA",
  );
});

test("a library without the NMDA module leaves its datastores out", async () => {
  const h = harness([
    reply([data([el("modules-state", undefined, [moduleEntry("ietf-interfaces", "implement")])])]),
  ]);
  const reader = await open(h, []);
  expectBe(reader.facts.nmda, false);
  expectEqual(reader.facts.datastores, ["running"]);
  await expectRejects(reader.rows("operational", [{ name: "interfaces", module: "ietf-interfaces" }], 10), /does not serve/);
});

test("the datastores are running plus the ones the hello and the library allow", async () => {
  const reader = await open(harness([LIBRARY]));
  expectEqual(reader.facts.datastores, ["running", "candidate", "startup", "operational", "intended"]);
});

/**
 * A module the device only imports contributes types and groupings to others and holds no data, so
 * listing it would draw a folder that is always empty.
 */
test("only implemented modules are listed, and they are sorted", async () => {
  const reader = await open(harness([LIBRARY]));
  expectEqual(reader.facts.modules, ["iana-if-type", "ietf-interfaces", "ietf-netconf-nmda"]);
});

test("a device that answers no library is refused with a sentence", async () => {
  await expectRejects(open(harness([reply([data([])])])), /no YANG library/);
});

/**
 * The configuration datastores are read with the older operation, which both measured servers
 * serve, and `<get-data>` is used only where it is the only way: `operational` and `intended`. One
 * of the two measured servers refuses `<get-data>` with `operation-not-supported`.
 */
test("a configuration datastore is read with get-config and an NMDA one with get-data", async () => {
  const h = harness([LIBRARY]);
  const reader = await open(h);
  const path = [{ name: "interfaces", module: "ietf-interfaces" }];
  h.answer(reply([data([])]));
  await reader.children("running", path);
  h.answer(reply([data([])]));
  await reader.children("operational", path);
  const operations = h.asked.map((request) => request.operation);
  expectEqual(operations, ["get", "get-config", "get-data"]);
});

test("an unknown datastore is refused by name, before anything is asked of the device", async () => {
  const h = harness([LIBRARY]);
  const reader = await open(h);
  const asked = h.asked.length;
  await expectRejects(reader.children("archive", [{ name: "interfaces", module: "ietf-interfaces" }]), /no datastore named archive/);
  expectBe(h.asked.length, asked, "a refusal by name sends nothing");
});

test("the device's own refusal becomes the sentence, with its words kept", async () => {
  const h = harness([LIBRARY]);
  const reader = await open(h);
  h.answer(
    reply([
      el("rpc-error", undefined, [
        el("error-tag", "access-denied"),
        el("error-message", "Access to the requested protocol operation or data model is denied."),
      ]),
    ]),
  );
  await expectRejects(
    reader.children("running", [{ name: "interfaces", module: "ietf-interfaces" }]),
    /Access to the requested protocol operation/,
  );
});

test("a level says which entries can be descended and which are terminals", async () => {
  const h = harness([LIBRARY]);
  const reader = await open(h);
  h.answer(
    reply([
      data([
        el("interfaces", undefined, [
          el("interface", undefined, [el("name", "ge-0/0/0")]),
          el("description", "port 0"),
        ]),
      ]),
    ]),
  );
  const level = await reader.children("running", [{ name: "interfaces", module: "ietf-interfaces" }]);
  expectEqual(level, [
    { name: "interface", kind: "folder" },
    { name: "description", kind: "key" },
  ]);
});

test("module text is fetched once per connection and kept", async () => {
  const h = harness([LIBRARY]);
  const reader = await open(h);
  // For get-schema the text is the data element's own text, so the tree is shaped that way.
  h.answer(reply([el("data", "module ietf-interfaces { list interface { key name; } }")]));
  expectMatch(await reader.moduleText("ietf-interfaces"), /list interface/);
  const afterFirst = h.asked.length;
  expectMatch(await reader.moduleText("ietf-interfaces"), /list interface/);
  expectBe(h.asked.length, afterFirst, "the second call asked the device nothing");
});

test("a module the device answers empty is refused, not cached as empty", async () => {
  const h = harness([LIBRARY]);
  const reader = await open(h);
  h.answer(reply([el("data", "")]));
  await expectRejects(reader.moduleText("ietf-interfaces"), /no text for the module/);
});

test("rows carry the list's key columns first and the row count is what was returned", async () => {
  const h = harness([LIBRARY]);
  const reader = await open(h);
  h.answer(reply([el("data", "module ietf-interfaces { list interface { key name; } }")]));
  await reader.moduleText("ietf-interfaces");
  h.answer(
    reply([
      data([
        el("interfaces", undefined, [
          el("interface", undefined, [el("name", "ge-0/0/0"), el("description", "port 0")]),
          el("interface", undefined, [el("name", "ge-0/0/1"), el("description", "port 1")]),
        ]),
      ]),
    ]),
  );
  const result = await reader.rows(
    "running",
    [
      { name: "interfaces", module: "ietf-interfaces" },
      { name: "interface" },
    ],
    10,
  );
  expectEqual(result.fields, ["name", "description"]);
  expectBe(result.rowCount, 2);
  expectBe(result.rows[0]?.["name"], "ge-0/0/0");
});

test("a limit smaller than the answer cuts the rows and the count follows the rows", async () => {
  const h = harness([LIBRARY]);
  const reader = await open(h);
  h.answer(reply([el("data", "module ietf-interfaces { list interface { key name; } }")]));
  await reader.moduleText("ietf-interfaces");
  h.answer(
    reply([
      data([
        el(
          "interfaces",
          undefined,
          Array.from({ length: 50 }, (_, i) => el("interface", undefined, [el("name", `ge-0/0/${i}`)])),
        ),
      ]),
    ]),
  );
  const result = await reader.rows(
    "running",
    [
      { name: "interfaces", module: "ietf-interfaces" },
      { name: "interface" },
    ],
    7,
  );
  expectBe(result.rows.length, 7);
  expectBe(result.rowCount, 7);
});

test("closing the reader closes the session once", async () => {
  const h = harness([LIBRARY]);
  const reader = await open(h);
  await reader.close();
  expectBe(h.closed.count, 1);
  expectTruthy(reader.facts.sessionId === "6");
});

/**
 * The published limits have to REACH the parser, not merely exist.
 *
 * A reader that invented its own numbers would pass every test above, because none of them look at
 * what the port was handed. The declaration and the call are two different facts, and this is the
 * second one.
 */
test("the reader hands the published limits to the parser, not numbers of its own", async () => {
  const seen: unknown[] = [];
  const h = harness([LIBRARY]);
  const recording: XmlReaderPort = {
    parse: (message, limits) => {
      seen.push(limits);
      return h.xml.parse(message, limits);
    },
  };
  await DeviceReaderImpl.open(h.session, recording, { sessionId: "6", capabilities: [] });
  expectBe(seen.length, 1);
  expectBe(seen[0], READER_LIMITS);
  // And the record itself is the one published, with the figures it publishes.
  expectBe(READER_LIMITS.maxDepth, 64);
  expectBe(READER_LIMITS.maxElements, 500_000);
  expectBe(READER_LIMITS.maxTextBytes, 4_194_304);
});

/**
 * The Source tab's text is sliced from the reply, so the validation has to run FIRST.
 *
 * Without it an `rpc-error` reply has no `<data>` to slice and, worse, a reply that carried both
 * would put the device's refusal into an editor buffer as though it were the object's text. The
 * part type exists to stop exactly that: its refusal arm declares no `text`, and its docblock names
 * a product that gets it wrong. A planted mutation removing the validation survived until this
 * case existed.
 */
test("a refused source read is the device's sentence, never text sliced out of the refusal", async () => {
  const h = harness([LIBRARY]);
  const reader = await open(h);
  h.answer(
    el("rpc-reply", undefined, [
      el("rpc-error", undefined, [
        el("error-tag", "access-denied"),
        el("error-message", "Access to the requested data model is denied."),
      ]),
    ]),
  );
  await expectRejects(
    reader.sourceXml("running", [{ name: "interfaces", module: "ietf-interfaces" }]),
    /Access to the requested data model/,
  );
});

/**
 * The slicing arithmetic, which has three cases a device really produces: a filled `<data>`, a
 * self-closing `<data/>` for an empty answer, and a `<data>` carrying attributes.
 */
test("the source text is the bytes between the data element's tags, and an empty answer is empty", async () => {
  const h = harness([LIBRARY]);
  const reader = await open(h);
  const path = [{ name: "interfaces", module: "ietf-interfaces" }];
  const body = "<interfaces><interface><name>ge-0/0/1</name></interface></interfaces>";

  h.answer(el("rpc-reply", undefined, [el("data", undefined, [])]), `<rpc-reply message-id="1"><data>${body}</data></rpc-reply>`);
  expectBe(await reader.sourceXml("running", path), body);

  h.answer(el("rpc-reply", undefined, [el("data", undefined, [])]), '<rpc-reply message-id="2"><data/></rpc-reply>');
  expectBe(await reader.sourceXml("running", path), "", "a self-closing data element is an empty answer, not a fault");

  h.answer(
    el("rpc-reply", undefined, [el("data", undefined, [])]),
    `<rpc-reply message-id="3"><data xmlns="urn:ietf:params:xml:ns:netconf:base:1.0">${body}</data></rpc-reply>`,
  );
  expectBe(await reader.sourceXml("running", path), body, "a data element with attributes is sliced at its tags");
});

/**
 * The closing tag taken is the LAST one, and a YANG model is what makes the difference reachable:
 * nothing stops a module from naming a container or a leaf `data`, and then the reply carries a
 * `</data>` inside the payload as well as at the end of it. Taking the first would cut the text
 * mid-tree and the result would still look like XML, which is the quiet kind of wrong.
 *
 * A mutation changing `lastIndexOf` to `indexOf` survived until this case existed.
 */
test("a payload holding its own data element is sliced at the reply's closing tag, not the first", async () => {
  const h = harness([LIBRARY]);
  const reader = await open(h);
  const body = "<sensors><sensor><name>s1</name><data>41.2</data></sensor></sensors>";
  h.answer(
    el("rpc-reply", undefined, [el("data", undefined, [])]),
    `<rpc-reply message-id="1"><data>${body}</data></rpc-reply>`,
  );
  expectBe(await reader.sourceXml("running", [{ name: "sensors", module: "example-sensors" }]), body);
});
