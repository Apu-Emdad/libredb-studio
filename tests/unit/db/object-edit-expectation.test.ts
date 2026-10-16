import { describe, expect, test } from "bun:test";
import {
  EDIT_CENSUS_TYPES,
  EXPECTED_EDITABLE_KINDS,
  EXPECTED_EDIT_ABSTAINERS,
} from "../../helpers/object-edit-expectation";

describe("the Phase 3 census expectation", () => {
  test("the two populations partition the fleet exactly once", () => {
    const declaring = new Set(EXPECTED_EDITABLE_KINDS.map(([type]) => String(type)));
    const abstaining = new Set(EXPECTED_EDIT_ABSTAINERS.map(String));
    // No type-id may be in both, and every type-id must be in one. A fleet that grew an engine
    // with neither row fails HERE, before the census ever runs.
    expect([...declaring].filter((type) => abstaining.has(type))).toEqual([]);
    expect([...declaring, ...abstaining].sort()).toEqual([...EDIT_CENSUS_TYPES].map(String).sort());
  });

  test("the set is five pairs on four engines, etcd's key the fifth (#1089)", () => {
    expect(EXPECTED_EDITABLE_KINDS.length).toBe(5);
    expect(new Set(EXPECTED_EDITABLE_KINDS.map(([type]) => type)).size).toBe(4);
    // The fleet is EXTERNAL_DATABASE_TYPES.length plus the embedded store, so 41 type-ids, and all
    // but four of them abstain from editing an object: the abstainers are listed by name in
    // `tests/helpers/object-edit-expectation.ts`, which is where a new engine is written down, and
    // the two numerals here only say how many that list holds. Sparkplug B abstains with the rest:
    // a metric's shape is the birth certificate's, and this provider writes no PUBLISH (#1720).
    expect(EXPECTED_EDIT_ABSTAINERS.length).toBe(37);
    expect(EDIT_CENSUS_TYPES.length).toBe(41);
  });

  test("no pair is written twice", () => {
    const keys = EXPECTED_EDITABLE_KINDS.map(([type, kind]) => `${type}/${kind}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
