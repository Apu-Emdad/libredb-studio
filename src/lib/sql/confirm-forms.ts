/**
 * Where a dialect's own confirmation forms (`SqlGrammar.confirmForms` and `confirmCodeForms`) are found in a
 * statement's code.
 *
 * The confirmation gate (`isDangerousQuery`) reads them, and so does an EXPLAIN strategy that must never send a
 * statement the gate would ask about: Snowflake's compiler evaluates a `SYSTEM$` function while it explains the
 * statement (SF-001), so its strategy declines whatever these forms find. One reading for both, so the gate and the
 * strategy cannot drift apart.
 */

import type { ConfirmCodeForm, ConfirmFormWhen, SqlGrammar } from "@/lib/sql/grammar";
import { readSqlSpan } from "@/lib/sql/spans";
import { findCodeWord, readSqlWord } from "@/lib/sql/words";

/** The code word after `from`, past whitespace and comments, or `null` when the next code is not a word. */
function nextCodeWord(text: string, from: number, grammar: SqlGrammar): { word: string; end: number } | null {
  let i = from;
  for (;;) {
    const span = readSqlSpan(text, i, grammar);
    if (
      span === null ||
      (span.kind !== "whitespace" && span.kind !== "line-comment" && span.kind !== "block-comment")
    ) {
      break;
    }
    i = span.end;
  }
  const found = readSqlWord(text, i);
  return found === null ? null : { word: found.text, end: found.end };
}

/** Whether the code words after `from` are `words`, in order. */
export function wordsFollow(text: string, from: number, words: readonly string[], grammar: SqlGrammar): boolean {
  let at = from;
  for (const expected of words) {
    const next = nextCodeWord(text, at, grammar);
    if (next === null || next.word !== expected.toUpperCase()) return false;
    at = next.end;
  }
  return true;
}

/** Whether the word sequence `form` appears anywhere in the code of `text`. */
export function sequenceInCode(text: string, form: readonly string[], grammar: SqlGrammar): boolean {
  let found = findCodeWord(text, form[0], 0, grammar);
  while (found !== null) {
    if (wordsFollow(text, found.end, form.slice(1), grammar)) return true;
    found = findCodeWord(text, form[0], found.end, grammar);
  }
  return false;
}

/** Whether the next code after `from`, past whitespace and comments, is `(`. */
function callFollows(text: string, from: number, grammar: SqlGrammar): boolean {
  let i = from;
  for (let span = readSqlSpan(text, i, grammar); span !== null; span = readSqlSpan(text, i, grammar)) {
    if (span.kind !== "whitespace" && span.kind !== "line-comment" && span.kind !== "block-comment") return false;
    i = span.end;
  }
  return text[i] === "(";
}

/**
 * Whether a code word of `text` starts with `prefix`, compared case-insensitively, or a quoted name called as a
 * function does, compared exactly: a quoted upper-case name resolves as the bare one, and a quoted name is
 * case-sensitive, so `"SYSTEM$WAIT"(10)` is the bare call and `"system$wait"(10)` is another function.
 */
function prefixInCode(text: string, prefix: string, grammar: SqlGrammar): boolean {
  const target = prefix.toUpperCase();
  let i = 0;
  while (i < text.length) {
    const span = readSqlSpan(text, i, grammar);
    if (span !== null) {
      if (
        span.kind === "quoted-identifier" &&
        span.terminated &&
        text.slice(i + 1, span.end - 1).startsWith(target) &&
        callFollows(text, span.end, grammar)
      ) {
        return true;
      }
      i = span.end;
      continue;
    }
    const found = readSqlWord(text, i);
    if (found === null) {
      i++;
      continue;
    }
    if (found.text.startsWith(target)) return true;
    i = found.end;
  }
  return false;
}

function codeFormInText(text: string, form: ConfirmCodeForm, grammar: SqlGrammar): boolean {
  return "prefix" in form ? prefixInCode(text, form.prefix, grammar) : sequenceInCode(text, form, grammar);
}

/** Whether any of `grammar`'s `confirmCodeForms` appears in the code of `text`; a grammar without them has none. */
export function hasConfirmCodeForm(text: string, grammar: SqlGrammar): boolean {
  return (grammar.confirmCodeForms ?? []).some((form) => codeFormInText(text, form, grammar));
}

/**
 * Whether a `confirmFormsWhen` form operates the statement whose operative keyword `keyword` ends at `end`: its words
 * follow there and its `when` word appears in the code after them.
 */
export function conditionalFormOperates(
  text: string,
  keyword: string,
  end: number,
  form: ConfirmFormWhen,
  grammar: SqlGrammar,
): boolean {
  return (
    form.form[0].toUpperCase() === keyword &&
    wordsFollow(text, end, form.form.slice(1), grammar) &&
    findCodeWord(text, form.when, end, grammar) !== null
  );
}

/** Whether a `confirmFormsWhen` form appears anywhere in the code of `text` with its `when` word after it. */
export function conditionalFormInCode(text: string, form: ConfirmFormWhen, grammar: SqlGrammar): boolean {
  let found = findCodeWord(text, form.form[0], 0, grammar);
  while (found !== null) {
    if (conditionalFormOperates(text, form.form[0].toUpperCase(), found.end, form, grammar)) return true;
    found = findCodeWord(text, form.form[0], found.end, grammar);
  }
  return false;
}
