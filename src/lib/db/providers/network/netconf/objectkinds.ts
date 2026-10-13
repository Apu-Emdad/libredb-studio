/**
 * Who enumerates what, for the `netconf` provider, phase 1 (issue #1724), requirement Y-S6.
 *
 * This provider lists two different things from two different surfaces, and the declaration is
 * what keeps them apart:
 *
 *   a top level container or list of the selected module   the object surface enumerates it, so
 *                                                          `enumeratedBy` is ABSENT and the tree
 *                                                          draws a folder for it
 *   anything BELOW such an object                          the Keys panel enumerates it, one level
 *                                                          per page, so the kind declares
 *                                                          `enumeratedBy: "key-browser"`
 *
 * The declaration is a requirement rather than a detail because getting it wrong compiles and
 * passes every unit test. SOURCE at `90881379`: `enumerableKinds()` in
 * `src/lib/db/object-kinds.ts:61` answers the declared kinds whose `enumeratedBy` is absent, and
 * those are the kinds the tree, the inventory and search routes and the agent's grounding walk all
 * read; `keyBrowserKind()` at line 168 answers the one kind that declares `"key-browser"`. A kind
 * the Keys panel lists while leaving the field absent is therefore walked by the object surface as
 * well, and a provider that leaves it out of `countObjects` and refuses it by name in `listObjects`
 * fails that walk after the connection opens.
 *
 * SOURCE: the two existing cases declare the same three fields together,
 * `providers/keyvalue/etcd/objects.ts:138-141` and `providers/document/firestore/objects.ts:138-141`.
 * etcd adds `acceptsSourceEdits: true`; this provider does not, because it writes nothing.
 * SOURCE: `tests/isolated/object-source-declarations.test.ts` refuses a second key-browser kind,
 * one without `hasSource`, and one on capabilities that carry no `keyScan`.
 *
 * This provider is the first in the repository to declare both container levels and Keys panel
 * levels, so no existing declaration can be copied whole: the three fields below come from etcd and
 * firestore, and the container levels come from this engine.
 *
 * The shapes here are declared locally and deliberately narrow, because this directory imports
 * nothing from the repository (see README). They mirror the fields of `ObjectKindSpec` and
 * `KeyScanCapability` that this provider sets, and no more.
 */

export interface ObjectKindDeclaration {
  readonly id: string;
  readonly label: string;
  /** Absent: the object surface enumerates this kind. `"key-browser"`: only the Keys panel does. */
  readonly enumeratedBy?: "key-browser";
  readonly hasSource?: true;
  readonly sourceLanguage?: "yang" | "xml" | "json";
}

export interface KeyScanDeclaration {
  readonly separator: string;
  readonly cursor: "opaque";
  readonly pattern: "prefix";
  readonly totalScope: "none";
  /**
   * `rootKind` is absent on purpose (decisions K-18 and K-35). It names the object kind whose rows
   * stand for the first segment of a key space, which only an engine with no container level has.
   * This engine addresses the key space through its container levels, the datastore and the module,
   * so no tree row stands for a folder of the walk.
   */
  readonly levels: Record<string, never>;
}

/** The module's YANG text opens in the Source tab, which is why the object kind declares a source. */
export const NETCONF_OBJECT_KINDS: readonly ObjectKindDeclaration[] = Object.freeze([
  Object.freeze({
    id: "node",
    label: "Top-level node",
    hasSource: true,
    sourceLanguage: "yang",
  }),
  Object.freeze({
    id: "key",
    label: "Key",
    enumeratedBy: "key-browser",
    hasSource: true,
    sourceLanguage: "xml",
  }),
] as const);

/**
 * The key scan declaration. The separator is one UTF-16 code unit, which the level contract
 * requires, and the cursor is opaque because it carries a key path rather than a number.
 */
export const NETCONF_KEY_SCAN: KeyScanDeclaration = Object.freeze({
  separator: "/",
  cursor: "opaque",
  pattern: "prefix",
  totalScope: "none",
  levels: Object.freeze({}) as Record<string, never>,
});

/** The kinds the object surface enumerates: the repository's `enumerableKinds()`, locally. */
export function enumerableKinds(
  kinds: readonly ObjectKindDeclaration[] = NETCONF_OBJECT_KINDS,
): readonly ObjectKindDeclaration[] {
  return kinds.filter((kind) => kind.enumeratedBy === undefined);
}

/** The one kind the Keys panel enumerates: the repository's `keyBrowserKind()`, locally. */
export function keyBrowserKind(
  kinds: readonly ObjectKindDeclaration[] = NETCONF_OBJECT_KINDS,
): ObjectKindDeclaration | undefined {
  return kinds.find((kind) => kind.enumeratedBy === "key-browser");
}

/**
 * The three rules the repository's own census enforces, asserted here as well so that a wrong
 * declaration fails in this directory rather than after a connection opens.
 */
export function assertDeclarationIsSound(kinds: readonly ObjectKindDeclaration[] = NETCONF_OBJECT_KINDS): void {
  const browsers = kinds.filter((kind) => kind.enumeratedBy === "key-browser");
  if (browsers.length !== 1) {
    throw new Error(`exactly one kind is enumerated by the Keys panel, found ${browsers.length}`);
  }
  const browser = browsers[0];
  if (browser?.hasSource !== true) {
    throw new Error("the Keys panel kind needs hasSource, because its Source tab is what resolves it");
  }
  if (NETCONF_KEY_SCAN.levels === undefined) {
    throw new Error("a key-browser kind needs a keyScan declaration with levels");
  }
  if ("rootKind" in NETCONF_KEY_SCAN.levels) {
    throw new Error("rootKind belongs to an engine with no container level, and this engine has two");
  }
  if (enumerableKinds(kinds).some((kind) => kind.id === browser?.id)) {
    throw new Error("the Keys panel kind must not also be enumerated by the object surface");
  }
}
