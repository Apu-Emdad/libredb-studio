# `netconf` provider, phase 1: the modules whose rules are measured

Written by session 1724 for issue #1724. **Not in the repository on purpose**, see "Where this
lives" below. No commit was made.

Six modules and one test file. Every rule in them carries the measurement that produced it, in the
comment above it, with the date. `bun run test` is not used here because these files are not in the
repository yet; they are type checked and run standalone, see "Checking it".

| File | What it is | The measurement behind it |
|---|---|---|
| `framing.ts` | RFC 6242 framing, both forms, incremental and bounded | Netopeer2 accepts a chunk size with a leading zero, which RFC 6242 4.2 forbids, so the client refuses it; a four byte character split across two reads decodes only after reassembly |
| `keypath.ts` | RFC 8040 api-path key paths, UTF-8 ordering, level pages | 16 measured key values round trip and none keeps the separator; the default sort is not UTF-8 byte order; the escaped text sorts in a third order again; Netopeer2 keeps list keys at a max-depth cut |
| `auth.ts` | Login failures and which the user is told apart | the two passphrase failures are raised inside `connect()` before any packet, with different text; a wrong password, an unknown user and a password to a key only account all end in one sentence |
| `hostkey.ts` | The pin, its parser and its mismatch message | a wrong pin stops the handshake before any user authentication packet, and does so through an SSH tunnel as well, where the key is the device's and not the bastion's |
| `secrets.ts` | The guard that keeps device values out of logs and exports | the read only account that refuses ten operations still reads a `$6$` hash and the keystore entries |
| `requests.ts` | The five allowed operations, built from typed arguments | ten non read operations answered `access-denied` with the rule list applied; max-depth 0 is refused and 1 is empty; `yin` is listed and refused |
| `objectkinds.ts` | Who enumerates what: the object surface or the Keys panel | `enumerableKinds()` and `keyBrowserKind()` read `enumeratedBy`, so a Keys panel kind that leaves it absent is walked by the object surface as well, which compiles and passes every unit test |
| `reader-port.ts` | The XML reader as an interface, not an implementation | the repository's S3 reader refuses a DOCTYPE and entities, which NETCONF needs, but drops attributes and namespace prefixes, which NETCONF values depend on |
| `session.ts` | One session: hello, framing, request to reply matching | a probe that matched replies by arrival order blamed the wrong operation once a server began sending notifications, reporting 17 replies to 12 requests |
| `provider-types.ts` | The repository shapes this provider answers with, declared locally | `base-provider.ts` declares 17 abstract members on `fb354594` |
| `provider.ts` | The class: reads, empty answers, stated refusals | the nearest read only precedent returns empty for the metric surfaces and throws for `runMaintenance` |
| `yangkeys.ts` | A list's key names, read lexically from module text | all 37 lists of nine real modules carry a `key` statement in the module that declares the list, 26 of them inside a `grouping` |
| `rows.ts` | Rows out of a reply, every value as text | `netconf-client` 2.0.8 answered 18446744073709552000 for a `uint64` of 18446744073709551615, because it parsed it as a number |
| `netconf.test.ts`, `session.test.ts`, `provider.test.ts`, `rows.test.ts` | 63 tests | see "Checking it" |

## What is deliberately not here

**The XML reader.** It is written once for the repository and inherited (decision K-10), so nothing
here parses XML. `framing.ts` hands a message out as bytes.

**The provider class, the capability declaration and anything shared.** The type union, the
compatibility records, the dialect registries, the connection form, `docs/SECURITY.md` and
`database-compose.yml` are shared surfaces whose edit order is set elsewhere (K-53, K-114, K-32).
The level declaration will set `rootKind` absent and declare `levels`, which is measured and
decided (K-18, K-35), but the declaration itself lands with the provider class.

**Phase 2, `gnmi`.** Not started (K-04).

## Where this lives, and what still has to change

`src/lib/db/providers/network/netconf/`, the provider's real home. The `network/` family was opened
by this session with the go-ahead decision K-02 reserved for it, and nothing was put in the family
root: only this subdirectory. The SNMP provider enters the same family after this one and takes the
shape left here, so the shape is this session's to set and the next session's to follow.

One thing still has to change before this is repository code rather than repository-shaped code:
`provider-types.ts` declares local aliases for shapes the repository already owns, to be deleted in
favour of importing them once the shared surfaces are unblocked. Nothing here imports from the
repository, which is what keeps that change mechanical.

Nothing is committed (decision K-94).

## Checking it

The repository's own chain, from the worktree root, with the main checkout's `node_modules` linked
read only so that nothing is installed:

```sh
node_modules/.bin/tsc --noEmit
node_modules/.bin/biome format src/lib/db/providers/network/netconf tests/unit/db/netconf
node_modules/.bin/eslint src/lib/db/providers/network/netconf tests/unit/db/netconf
node scripts/only-check.mjs
bun test tests/unit/db/netconf
```

Running that chain is the point rather than a formality: a green test run says nothing about
whether the code compiles under the repository's own settings (decision K-149). It found three
classes of problem that the standalone run could not see.

**Import extensions.** The standalone runner needs `.ts` on a relative import and the repository
forbids it, 24 errors. The imports are now extensionless, the house style.

**Where tests live.** The repository keeps no `*.test.ts` under `src/`, and its runner is
`bun:test` rather than `node:test`. The tests moved to `tests/unit/db/netconf/` and were translated
through one helpers file, so each assertion keeps its original shape instead of being rewritten by
hand. The house typecheck then found two things the translation had lost: `node:assert`'s `ok`
narrows the type of what it is given, which six assertions relied on, and its third argument is a
message. Both are back, and the helper that narrows says why in its own comment.

**A lint rule nobody would guess.** Next refuses a variable named `module`, which this code used
for a YANG module name in four places. Renamed.

Type check: 0 errors. Format: no fixes. Lint: clean. Focused-test check: OK.
Tests: 63 pass, 0 fail, 183 assertions.

Measured against `origin/main` at `90881379`, which is the base after the OPC UA provider merged
and 218 files changed. The figures this directory's comments cite were re-measured there: the shared
record count is unchanged at 28 declarations in 18 files with 2 more files spread filled, the level
contract is still lines 717 to 724, and the base class still declares 17 abstract members. The two
citations that moved are corrected in the comments: `enumerableKinds` is line 61 and
`keyBrowserKind` line 168 of `object-kinds.ts`, and the `enumeratedBy` field is line 2796 of
`types.ts`.

One shape remains from the standalone period and is deliberate: the two error classes assign their
fields in the constructor body rather than through parameter properties, because Node's type
stripping does not accept those. The repository bundles its code and has no such limit, so this is
a free choice rather than a forced one, and it costs two lines.

A green suite is a reassuring output, so it was tested against planted failures (decision K-110).
Four bugs were introduced one at a time and each produced exactly one failing test:

| Planted bug | Result |
|---|---|
| the leading zero check removed from the chunk header | 24 pass, 1 fail |
| `compareUtf8` replaced by the default comparison | 24 pass, 1 fail |
| the secret guard switched off | 24 pass, 1 fail |
| max-depth 1 allowed through | 24 pass, 1 fail |
| `enumeratedBy: "key-browser"` removed from the key kind | 26 pass, 2 fail |
| the notification check removed from the session | 49 pass, 1 fail |
| the message-id match removed from the session | 49 pass, 1 fail |
| the base:1.1 detection removed from the session | 47 pass, 3 fail |
| a refused count turned into a zero | 49 pass, 1 fail |
| a refusing metric surface turned into a silent empty answer | 49 pass, 1 fail |
| the empty path check removed from the read request | 49 pass, 1 fail |
| the array cell removed from the row builder | 62 pass, 1 fail |
| key columns no longer placed first | 62 pass, 1 fail |
| the secret guard removed from the row writer | 62 pass, 1 fail |
| list tracking switched off in the YANG scanner | 60 pass, 3 fail |
| the grouping mark removed from the YANG scanner | 62 pass, 1 fail |
| quoted text no longer neutralised in the YANG scanner | **63 pass, 0 fail**, and what that cost is below |

After the four were reverted the files were byte identical to before, checked by hashing all of
them together, and the suite was green again.

## What is covered, and what is not

Nine of the eleven files carry tests of their own. The two that do not:

`reader-port.ts` has no implementation to test. It is an interface, a limits constant and an error
class, and it is exercised through a fake reader in `session.test.ts`, which holds the provider to
the shape it will be given. The real reader lands with another session (K-10).

`provider-types.ts` is shapes plus one error class. It runs indirectly, through every provider test
that catches a `RefusedError`, and has no behaviour of its own to pin.

Three behaviours are measured against live servers but are not unit tested here, because each needs
the layer that is not written yet. They are named so that the gap is not mistaken for coverage:
building rows out of a reply, which needs the XML reader; extracting a list's key names from module
text, which needs the same reader; and the SSH dial itself, which is ssh2 plus the egress check. All
three were measured against the pinned fixtures on 2026-10-13, and the measurements are in the
specification rather than in a test.

## One planted bug survived, and what it showed

The sixth mutation in the table above, removing the neutralisation of quoted text in the YANG
scanner, was not caught: the suite stayed green. The test that should have caught it was called
"a brace inside a quoted description does not end a statement", and its data put the brace AFTER
the key statement, where mis-parsing changed nothing that the test asserted. The name claimed the
behaviour and the data did not prove it.

The test now puts the brace BEFORE the key statement and declares a second list inside the string,
so a scanner that reads quoted text as code loses the real key and gains a list that does not
exist. With that data the same planted bug fails the suite, which was checked by planting it again.

This is the reason the mutation pass is worth running even when every test is green: a test that
passes for the wrong reason looks exactly like a test that passes.
