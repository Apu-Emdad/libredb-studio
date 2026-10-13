/**
 * The assertions these tests use, in one place.
 *
 * They exist because the modules under test were written and run standalone first, with
 * `node:assert`, and the house runner is `bun:test`. Rather than rewrite 63 assertions by hand and
 * risk changing what one of them means, each `assert` call keeps its shape and is expressed here in
 * terms of `expect`. Every helper is one line, so the translation is readable rather than trusted.
 */
import { expect } from "bun:test";

/** The third argument is the message `node:assert` took, kept so no assertion loses its note. */
export const expectBe = (actual: unknown, expected: unknown, note?: string): void =>
  void expect(actual, note).toBe(expected as never);
export const expectNotBe = (actual: unknown, expected: unknown): void =>
  void expect(actual).not.toBe(expected as never);
export const expectEqual = (actual: unknown, expected: unknown): void => void expect(actual).toEqual(expected as never);
export const expectNotEqual = (actual: unknown, expected: unknown): void =>
  void expect(actual).not.toEqual(expected as never);
export const expectMatch = (actual: string, pattern: RegExp): void => void expect(actual).toMatch(pattern);
/**
 * An assertion function, not a plain call: `node:assert`'s `ok` narrows the type of what it is
 * given, and a test that read a field after it would stop compiling without the narrowing. The
 * house typecheck found exactly that, in six places, which is why this signature is written out.
 */
export function expectTruthy(actual: unknown, note?: string): asserts actual {
  expect(actual, note).toBeTruthy();
}
export const expectThrows = (fn: () => unknown, like?: unknown): void =>
  void (like === undefined ? expect(fn).toThrow() : expect(fn).toThrow(like as never));
export const expectRejects = async (promise: Promise<unknown>, like?: unknown): Promise<void> => {
  if (like === undefined) await expect(promise).rejects.toThrow();
  else await expect(promise).rejects.toThrow(like as never);
};
