/**
 * Tests for the two behaviours that were measured live but had no unit test: building rows out of a
 * reply, and reading a list's key names out of module text. Both run against a fake reader tree and
 * real module text, so neither needs the XML reader that another session is writing.
 */
import { test } from "bun:test";
import { expectBe, expectEqual, expectMatch, expectThrows } from "./helpers";
import { buildRows, rowForWriting, ROW_LIMITS } from "@/lib/db/providers/network/netconf/rows";
import { keyNamesOf, scanYangModule } from "@/lib/db/providers/network/netconf/yangkeys";
import { QueryError } from "@/lib/db/errors";
import type { XmlElement } from "@/lib/db/providers/network/netconf/reader-port";

/** A tree the way the reader port will answer one. */
function el(name: string, text?: string, children: XmlElement[] = []): XmlElement {
  const base = { name, attributes: new Map<string, string>(), children, bindings: new Map<string, string>() };
  return text === undefined ? base : { ...base, text };
}

const interfaces = el("interfaces", undefined, [
  el("interface", undefined, [
    el("name", "ge-0/0/0"),
    el("type", "ianaift:ethernetCsmacd"),
    el("in-octets", "18446744073709551615"),
    el("alias", "a"),
    el("alias", "b"),
    el("statistics", undefined, [el("discards", "0")]),
  ]),
  el("interface", undefined, [el("name", "ge-0/0/1"), el("type", "ianaift:other")]),
]);

test("key columns come first and every value stays text", () => {
  const rows = buildRows(interfaces, "interface", ["name"]);
  expectBe(rows.columns[0], "name");
  expectBe(rows.rows[0]?.["name"], "ge-0/0/0");
  // A uint64 at its maximum. A number would read 18446744073709552000 here.
  expectBe(rows.rows[0]?.["in-octets"], "18446744073709551615");
  expectBe(typeof rows.rows[0]?.["in-octets"], "string");
});

test("a leaf-list becomes an array cell and a container becomes a JSON cell", () => {
  const rows = buildRows(interfaces, "interface", ["name"]);
  expectBe(rows.rows[0]?.["alias"], '["a","b"]');
  expectBe(rows.rows[0]?.["statistics"], '{"discards":"0"}');
});

test("a cell absent from one entry is empty rather than missing, so the row shape holds", () => {
  const rows = buildRows(interfaces, "interface", ["name"]);
  expectBe(rows.rows[1]?.["in-octets"], "");
  expectEqual(Object.keys(rows.rows[1] ?? {}), rows.columns);
});

test("a keyless list is still shown, by position", () => {
  const rows = buildRows(interfaces, "interface", []);
  expectBe(rows.columns.includes("name"), true);
  expectBe(rows.rows.length, 2);
});

test("a list past the row cap is cut and the cut is stated, not silent", () => {
  const many = el(
    "table",
    undefined,
    Array.from({ length: 5 }, (_, i) => el("entry", undefined, [el("id", String(i))])),
  );
  const rows = buildRows(many, "entry", ["id"], { ...ROW_LIMITS, maxRows: 2 });
  expectBe(rows.rows.length, 2);
  expectMatch(rows.warning ?? "", /first 2 are shown/);
});

test("a row on its way out of the grid passes the secret guard", () => {
  const written = rowForWriting(["ietf-system", "user"], { name: "alice", "hashed-password": "$6$abc$def" });
  expectBe(written["name"], "alice");
  expectBe(written["hashed-password"], "[withheld by Studio]");
});

const moduleText = `
module example {
  namespace "urn:example";
  prefix ex;
  import ietf-inet-types { prefix inet; }
  grouping shared {
    list in-grouping {
      key "a b";
      leaf a { type string; }
      leaf b { type string; }
    }
  }
  container top {
    list keyed {
      key "name";
      leaf name { type string; }
    }
    list keyless {
      leaf x { type string; }
    }
    list commented {
      // key "x";
      leaf x { type string; }
    }
    uses inet:shared-thing;
    uses shared;
  }
  augment "/other:tree/other:node" {
    leaf added { type string; }
  }
}
`;

test("the key statement is read from module text, in order, without compiling the module", () => {
  const scan = scanYangModule(moduleText);
  expectEqual(keyNamesOf(scan, "keyed"), ["name"]);
  expectEqual(keyNamesOf(scan, "in-grouping"), ["a", "b"]);
});

test("a list with no key, and one whose key is only in a comment, both read as keyless", () => {
  const scan = scanYangModule(moduleText);
  expectEqual(keyNamesOf(scan, "keyless"), []);
  expectEqual(keyNamesOf(scan, "commented"), []);
});

test("a list inside a grouping is marked, because its data appears wherever uses pulls it", () => {
  const scan = scanYangModule(moduleText);
  expectBe(scan.lists.find((l) => l.name === "in-grouping")?.inGrouping, true);
  expectBe(scan.lists.find((l) => l.name === "keyed")?.inGrouping, false);
});

test("a prefixed uses and an augment are reported, because they move a list's data elsewhere", () => {
  const scan = scanYangModule(moduleText);
  expectEqual(scan.externalUses, ["inet:shared-thing"]);
  expectBe(scan.augments.length, 1);
  expectMatch(scan.augments[0] ?? "", /other:tree/);
});

/**
 * The data here is chosen so that the test fails when quoted text stops being neutralised, which is
 * the only thing it claims (decision K-125). An earlier version put a brace in a description AFTER
 * the key statement, where mis-parsing changed nothing and the test passed either way: a planted
 * bug survived it. The description below closes the list early and declares a second list inside
 * the string, so a scanner that reads quoted text as code loses the real key and gains a list that
 * does not exist.
 */
test("quoted text is neutralised, so a brace in a description neither ends a list nor starts one", () => {
  const scan = scanYangModule(`
module q {
  container c {
    list l {
      description "ends the list here } and starts list fake { key \\"zzz\\"; } and holds a ; too";
      key "k";
      leaf k { type string; }
    }
  }
}
`);
  expectEqual(keyNamesOf(scan, "l"), ["k"]);
  expectEqual(
    scan.lists.map((list) => list.name),
    ["l"],
  );
  expectBe(keyNamesOf(scan, "fake").length, 0);
});

test("module text past the byte cap is refused rather than scanned", () => {
  expectThrows(() => scanYangModule("x".repeat(100), { maxBytes: 10, maxDepth: 8 }), QueryError);
});
