/**
 * Inputs the provider refuses, and one it folds instead of refusing.
 *
 * Four refusals and a repeat, each reached through the exported function that owns it rather than
 * through a connection, because none of them depends on a device: a bad percent escape, a
 * message-id this provider counted wrongly, a declaration that contradicts itself, a YANG module
 * carrying a block comment, and an element whose children repeat a name.
 */
import { test } from "bun:test";
import { expectBe, expectEqual, expectThrows } from "./helpers";
import { QueryError } from "@/lib/db/errors";
import { decodeSegment } from "@/lib/db/providers/network/netconf/keypath";
import { assertDeclarationIsSound } from "@/lib/db/providers/network/netconf/objectkinds";
import type { XmlElement } from "@/lib/db/providers/network/netconf/reader-port";
import { buildRpc } from "@/lib/db/providers/network/netconf/requests";
import { buildRows } from "@/lib/db/providers/network/netconf/rows";
import { scanYangModule } from "@/lib/db/providers/network/netconf/yangkeys";

function el(name: string, text?: string, children: XmlElement[] = []): XmlElement {
  const base = { name, attributes: new Map<string, string>(), children, bindings: new Map<string, string>() };
  return text === undefined ? base : { ...base, text };
}

test("a percent escape that is not valid is a QueryError, because a user can type one", () => {
  // decodeURIComponent throws a URIError, which would reach the user as an internal failure. The
  // segment comes out of a key path the user can edit, so the refusal is theirs to see.
  expectThrows(() => decodeSegment("%zz"), QueryError);
  expectBe(decodeSegment("ge-0%2F0%2F1"), "ge-0/0/1");
});

test("a message-id below one is this provider's own fault, so it is not a QueryError", () => {
  // No user can reach this: the id is counted here. A QueryError would blame the person typing.
  expectThrows(() => buildRpc({ kind: "close-session" } as never, 0), {
    message: "a message-id is a positive integer",
  });
  expectThrows(() => buildRpc({ kind: "close-session" } as never, 1.5), {
    message: "a message-id is a positive integer",
  });
});

test("a kind the Keys panel lists must not also be enumerated by the object surface", () => {
  // Both halves would walk the same id, and the object surface would list what the Keys panel is
  // there to page through.
  expectThrows(
    () =>
      assertDeclarationIsSound([
        { id: "key", role: "config", label: "K", labelPlural: "Ks", enumeratedBy: "key-browser", hasSource: true },
        { id: "key", role: "config", label: "K again", labelPlural: "K agains" },
      ] as never),
    { message: "the Keys panel kind must not also be enumerated by the object surface" },
  );
});

test("a block comment in a YANG module is replaced by blanks, so the list after it is still read", () => {
  // Not stripped away: the comment becomes whitespace of its own shape, because the scanner reports
  // positions and a removed comment would shift every one of them.
  const scan = scanYangModule(`module m { /* a comment
that spans two lines */ list l { key "k"; leaf k { type string; } } }`);
  expectEqual([...scan.lists], [{ name: "l", keys: ["k"], inGrouping: false }]);
});

test("a comment holding what looks like a list does not become one", () => {
  const scan = scanYangModule(`module m { /* list ghost { key "g"; } */ list real { key "k"; } }`);
  expectEqual(
    scan.lists.map((list) => list.name),
    ["real"],
  );
});

test("children repeating a name become one array, however many there are", () => {
  // Two is the pair case and three is the push that follows it; a reader that handled only the
  // pair would drop the third.
  const parent = el("p", undefined, [
    el("interface", undefined, [
      el("name", "e0"),
      el("twice", undefined, [el("x", "1"), el("x", "2")]),
      el("thrice", undefined, [el("y", "1"), el("y", "2"), el("y", "3")]),
    ]),
  ]);
  const rows = buildRows(parent, "interface", ["name"]);
  expectEqual(rows.rows, [{ name: "e0", twice: '{"x":["1","2"]}', thrice: '{"y":["1","2","3"]}' }]);
});
