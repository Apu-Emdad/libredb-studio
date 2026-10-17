# Contributors

Every change in this repository lands with its tests in the same pull request, under a hard 100% line-coverage gate and every check `main` requires. That is an unusual bar for a project this size, and it means a merged pull request here is evidence about the person who wrote it, not only about the project.

So this is not a thank-you wall. Each entry links to the change itself, so a reader who does not know us can check the claim. If your name is here, the link is yours to use — a CV, a profile README, anywhere the question "what have you actually shipped" comes up.

Nothing here is counted. Not merged pull requests, not changed lines, not closed issues. A count sees how often somebody showed up and misses everything that matters about it: the care taken, the bug nobody else found, the answer written out for a stranger. So the rungs below are judgements rather than totals, and where one is not obvious the reason is written beside the name — [CONTRIBUTING.md](CONTRIBUTING.md#the-contributor-ladder) says what each rung means.

Everyone whose work is in `main` is here, maintainers included. Bots and coding agents are not — `dependabot`, `Copilot` and `claude` all appear in the repository's commit history and none of them is a person, so listing them beside people would blur the only thing this page is for. `git shortlog -sn` shows the whole history including theirs. Accounts the organisation has blocked are not listed either.

Within each rung, people are in the order they first landed a change.

## Maintainer

The people who carry the project: the releases, the review, and the decisions nobody else can make. Their work is most of the history and is not itemised here; the links are a sample.

### @cevheri

Organisation member. Wrote most of what is here.

- [Brought libSQL in over the Hrana protocol](https://github.com/libredb/libredb-studio/pull/511)
- [Added DuckDB as an embedded file engine](https://github.com/libredb/libredb-studio/pull/516)

### @yusuf-gundogdu

Organisation member. The agent model record, and the distribution inventory.

- [Ran ten models across every agent surface, 300 for 300](https://github.com/libredb/libredb-studio/pull/465)
- [Found two cloud marketplaces the inventory did not know about](https://github.com/libredb/libredb-studio/pull/577)

### @kaya-abdullah

Organisation member. The wire-compatible engines, and the first localized READMEs.

- [Caught Trino handing back every bigint past 2^53 rounded](https://github.com/libredb/libredb-studio/pull/460)
- [Added the Simplified Chinese and Japanese READMEs](https://github.com/libredb/libredb-studio/pull/317)

## Trusted contributor

### @harish18092002

The first person outside the core team to send anything at all, on 2025-12-25, when there was no contributing guide, no labeled issue and no reason to believe anyone would answer. Being first is a different act from being second.

- [Improved the query preview in the Save Query modal](https://github.com/libredb/libredb-studio/commit/ff22a5dd4f5b5a3fcd0c01339820ffa6035ae51f)

### @omerfarukbolat

The light theme rests on the shared token layer he built, and the export path escapes every field because of the pass he did over it. Both were the kind of change that moves the floor under everything else rather than fixing one thing.

- [Fixed the auth flow, middleware redirects and hooks cleanup](https://github.com/libredb/libredb-studio/pull/10)
- [Enforced the ESLint and TypeScript checks in CI, and fixed the component bugs they found](https://github.com/libredb/libredb-studio/pull/18)
- [Built a light theme through a shared token layer, and fixed four silent query-execution defects](https://github.com/libredb/libredb-studio/pull/384)
- [Escaped every field an export writes, and stopped a plan outliving its run](https://github.com/libredb/libredb-studio/pull/422)

### @suleymansurucu

Came the same day as the first, hours behind it, into the same empty repository. Two people decided this was worth their evening before there was anything here to promise them it would be.

- [Handled SQL queries in the demo connection, with a mock fallback](https://github.com/libredb/libredb-studio/commit/c6d3e10c5d5076f674af12f58d2244e0208e6c5b)

### @hbasria

Brought a fifth identity provider into the OIDC layer, and the branch he added is still what runs — `src/lib/oidc.ts` handles Zitadel's RP-initiated logout because of him. He arrived with the doc and the test in the same change, months before this repository wrote that down as a rule.

- [Added Zitadel OIDC integration support](https://github.com/libredb/libredb-studio/commit/d8227cbc)
- [Covered `OIDC_ROLE_CLAIM` in the Zitadel logout URL test](https://github.com/libredb/libredb-studio/commit/09d36a4d)
- [Added Alpine image variants, full and slim](https://github.com/libredb/libredb-studio/pull/959)

### @ugurpektas

Built out the admin section: the routes, the interactive UI around them, and the tests that hold it. He did it in one careful pass rather than leaving it half-finished for someone else.

- [Added the admin section routes and polished the interactive UI](https://github.com/libredb/libredb-studio/pull/231)

### @koraysrn

First into the agent layer, which nobody outside the core team had opened, and he has stayed in it since: its drive ownership, its PostgreSQL grounding and the history of finished runs are all partly his. He started in the part nobody volunteers for, a run behaving correctly when something goes wrong.

- [Enforced single-drive ownership in the agent, and refused post-close appends](https://github.com/libredb/libredb-studio/pull/419)
- [Aggregated the PostgreSQL grounding column read per table](https://github.com/libredb/libredb-studio/pull/537)
- [Kept the engine's own and extension-owned objects out of PostgreSQL agent grounding](https://github.com/libredb/libredb-studio/pull/625)
- [Added a History list of finished agent conversations, reopened from each run's own ledger](https://github.com/libredb/libredb-studio/pull/830)
- [Resolved `bun` through the shell on Windows in the security check](https://github.com/libredb/libredb-studio/pull/997)
- [Made the agent's drive claim durable in the run ledger](https://github.com/libredb/libredb-studio/pull/998)
- [Derived per-drive ceilings, and capped the artifacts of each run](https://github.com/libredb/libredb-studio/pull/999)
- [Swept and resumed the agent runs a dead process left running](https://github.com/libredb/libredb-studio/pull/1000)
- [Let a run be paused and resumed from the rail](https://github.com/libredb/libredb-studio/pull/1001)
- [Memoized the shell's children, and lazy-loaded the ERD, the modals and the schema explorer](https://github.com/libredb/libredb-studio/pull/1127)
- [Handed the shell's children only what they show](https://github.com/libredb/libredb-studio/pull/1190)
- [Extracted the shared modal surface into `StudioModals`](https://github.com/libredb/libredb-studio/pull/1217)
- [Added Markdown and HTML as result export formats](https://github.com/libredb/libredb-studio/pull/1567)
- [Ran on-disk SQLite statements in a child process Studio can kill, so Cancel stops a long one](https://github.com/libredb/libredb-studio/pull/1623)
- [Defanged fence markers in the model's own messages before they enter the agent transcript](https://github.com/libredb/libredb-studio/pull/1740)

### @hasnaintypes

Went wherever the work was: the login page, the admin fleet view, a license notice nobody had stated, and the provider docs whose citations had quietly rotted. Each one arrived finished, with the reasoning written down.

- [Closed the login hero's overflow at 1280x800](https://github.com/libredb/libredb-studio/pull/550)
- [Stated elkjs's EPL-2.0 license alongside the MIT license](https://github.com/libredb/libredb-studio/pull/552)
- [Summed the fleet's own byte figure instead of re-parsing display strings](https://github.com/libredb/libredb-studio/pull/551)
- [Replaced the stale line-number citations in `oracle.md` with named citations](https://github.com/libredb/libredb-studio/pull/563)
- [Did the same for `mongodb.md`](https://github.com/libredb/libredb-studio/pull/581)
- [Detected `tlsCAFile` and ambiguous credentials in a pasted MongoDB connection string](https://github.com/libredb/libredb-studio/pull/1210)
- [Read the object inventory once per connection, scoped to the pinned catalog](https://github.com/libredb/libredb-studio/pull/1592)
- [Gave the object source view a refresh control, and re-read it on reactivation](https://github.com/libredb/libredb-studio/pull/1594)

## Contributor

### @ucmazmehmet

- [Updated the Windows native support documentation](https://github.com/libredb/libredb-studio/pull/209)

### @sifaaraldevop

- [Made Oracle Thick mode optional and mapped NJS-138 to an honest error](https://github.com/libredb/libredb-studio/pull/229)

### @yangchuansheng

- [Added the Sealos deployment option](https://github.com/libredb/libredb-studio/pull/296)

### @ducminhle

- [Added an HTTPRoute to the Helm chart](https://github.com/libredb/libredb-studio/pull/362)

### @wjiec

- [Used OIDC discovery for generic logout URLs](https://github.com/libredb/libredb-studio/pull/431)

### @Matthew-Selvam

- [Capped chart series and pie slices at the palette size instead of repeating colours](https://github.com/libredb/libredb-studio/pull/501)
- [Stopped schema-diff wrapping non-transactional dialects in `BEGIN;`/`COMMIT;`](https://github.com/libredb/libredb-studio/pull/521)
- [Stopped two concurrent first requests building and initializing two storage providers](https://github.com/libredb/libredb-studio/pull/724)
- [Stopped an LLM stream consuming its source after the consumer cancels](https://github.com/libredb/libredb-studio/pull/726)

### @mfatihdayan

- [Updated the provider tri-sync rule to the shipped provider set](https://github.com/libredb/libredb-studio/pull/504)

### @HasselNot7

- [Normalized all text files to LF on checkout](https://github.com/libredb/libredb-studio/pull/555)
- [Matched the `.gitattributes` rules as whole lines in the drift guard](https://github.com/libredb/libredb-studio/pull/562)

### @v01dst

- [Used `@theme inline` so the Geist font variables resolve](https://github.com/libredb/libredb-studio/pull/561)

### @Akimbo92i

- [Made libSQL omit an unknown overview size rather than reporting zero](https://github.com/libredb/libredb-studio/pull/569)

### @cnYui

- [Made MSSQL and Oracle do the same](https://github.com/libredb/libredb-studio/pull/579)

### @dchaudhari7177

- [Re-anchored `mysql.md`'s thirteen code citations to declaration names, and put the file under the guard](https://github.com/libredb/libredb-studio/pull/582)
- [Documented `LOG_LEVEL` with both defaults, and guarded `.env.example` against undocumented `process.env` names](https://github.com/libredb/libredb-studio/pull/583)
- [Documented the bundled Node.js version, artefacts and origin in `SECURITY.md`, and guarded it against drift](https://github.com/libredb/libredb-studio/pull/584)

### @sonalisrisivani

- [Added the undocumented `DatabaseConnection` and `QueryResult` fields to `docs/API_DOCS.md`, and guarded four type blocks](https://github.com/libredb/libredb-studio/pull/580)

### @be-student

- [Replaced the `.ts:N` citations in `AGENT.md`, `FEATURES.md`, `ADDING_A_PROVIDER.md` and `SECURITY.md` with names](https://github.com/libredb/libredb-studio/pull/606)
- [Did the same for `redis.md`, and brought it under the citation guard](https://github.com/libredb/libredb-studio/pull/604)
- [Told an absent MSSQL or Oracle overview size apart from a measured zero](https://github.com/libredb/libredb-studio/pull/601)

### @NormanSMA

- [Added the Spanish README, and registered it with the localized README drift guard](https://github.com/libredb/libredb-studio/pull/605)
- [Added the `libredb-studio-bin` AUR package](https://github.com/libredb/libredb-studio/pull/1218)

### @7487

- [Named `createDatabaseProvider()` in seven provider docs, and stopped the guard passing on nothing](https://github.com/libredb/libredb-studio/pull/629)
- [Replaced `postgres.md`'s stale line-number citations with the names they meant](https://github.com/libredb/libredb-studio/pull/636)
- [Did the same for `clickhouse.md`, where two citations had drifted onto a closing brace](https://github.com/libredb/libredb-studio/pull/639)
- [Did the same for `druid.md`, and credited `quoteUnsafeIntegers()` to the file that declares it](https://github.com/libredb/libredb-studio/pull/645)
- [Did the same for `couchbase.md`, and widened the guard to `.tsx` coordinates too](https://github.com/libredb/libredb-studio/pull/644)
- [Made the create-table form emit each engine's own DDL rather than PostgreSQL's](https://github.com/libredb/libredb-studio/pull/651)
- [Held the duplicated CI-gate paragraph in sync, and dropped `.devcontainer` from the Docker context](https://github.com/libredb/libredb-studio/pull/663)

### @XiaoZ-0218

- [Dropped five docs' references to a `getPlaceholder()` the base class no longer has](https://github.com/libredb/libredb-studio/pull/642)
- [Stopped four docs crediting `SQLBaseProvider` with placeholders that live in `values.ts`](https://github.com/libredb/libredb-studio/pull/650)

### @dvd233

- [Linked `measuredNullableAggregate()` to `measured-aggregate.ts` from the MSSQL and Oracle docs](https://github.com/libredb/libredb-studio/pull/643)

### @SatvikMishra08

- [Added the Helm and subchart-build steps a fresh clone needs before `bun run test`](https://github.com/libredb/libredb-studio/pull/571)

### @saad-works

- [Resolved two static `process.env[...]` bracket shapes so the env docs guard sees them](https://github.com/libredb/libredb-studio/pull/649)
- [Gave the same guard's negative test a control, and matched its comment to the regex](https://github.com/libredb/libredb-studio/pull/652)
- [Dropped a stale provider count from a Druid comment](https://github.com/libredb/libredb-studio/pull/1533)
- [Did the same in DuckDB's seam-guard comments](https://github.com/libredb/libredb-studio/pull/1534)
- [Counted MySQL indexes per table, not by name alone, in Monitoring Overview](https://github.com/libredb/libredb-studio/pull/1537)
- [Made `inspect_schema` answer a profile refusal in Studio's own words](https://github.com/libredb/libredb-studio/pull/1560)

### @voidofrgestudio

- [Made MySQL and PostgreSQL omit an unmeasured database size instead of reporting zero bytes](https://github.com/libredb/libredb-studio/pull/627)

### @SyedMuhamadYasir

- [Replaced `sqlite.md`'s stale line-number citations with named ones, and guarded them against returning](https://github.com/libredb/libredb-studio/pull/657)
- [Added a devcontainer with Bun, Helm and 7-Zip, and named CI as the merge gate](https://github.com/libredb/libredb-studio/pull/658)
- [Emitted SQL Server and Oracle migration DDL in their own grammar, not PostgreSQL's](https://github.com/libredb/libredb-studio/pull/659)
- [Made a build mountable under a URL subpath through `BASE_PATH`, cookies and probes included](https://github.com/libredb/libredb-studio/pull/662)

### @macjayz

- [Added the npm package's description, engine keywords, homepage and issue tracker URL](https://github.com/libredb/libredb-studio/pull/697)

### @slsgzs-cloud

- [Added a Create Table action to the empty schema explorer, gated by the engine's capability](https://github.com/libredb/libredb-studio/pull/655)

### @stgomoyaa

- [Required a confirmation before a connection is deleted, on desktop and mobile alike](https://github.com/libredb/libredb-studio/pull/698)

### @mikevillari

- [Stopped short queries in serialized database errors ending in a false ellipsis](https://github.com/libredb/libredb-studio/pull/706)
- [Did the same for the saved-query previews in the command palette](https://github.com/libredb/libredb-studio/pull/707)
- [Ran a component suite the runner never named, and guarded against future omissions](https://github.com/libredb/libredb-studio/pull/711)
- [Removed the desktop header's settings cog, which had hover styling but no action](https://github.com/libredb/libredb-studio/pull/714)
- [Gave six icon-only controls accessible names, including session termination and column removal](https://github.com/libredb/libredb-studio/pull/713)
- [Stopped a qualified table completion inserting the schema twice, and matched the typed qualifier](https://github.com/libredb/libredb-studio/pull/715)
- [Made the launcher print a reachable startup link for wildcard and IPv6 binds](https://github.com/libredb/libredb-studio/pull/709)
- [Quoted PostgreSQL table completions only where `quote_ident` requires it, leaving other dialects unchanged](https://github.com/libredb/libredb-studio/pull/791)

### @CunjieLee

- [Added a Trino session schema field, sent as `X-Trino-Schema` so bare names resolve](https://github.com/libredb/libredb-studio/pull/721)
- [Capped every job in ten workflows with a sized `timeout-minutes`, pinned by a test](https://github.com/libredb/libredb-studio/pull/736)
- [Added a `site.webmanifest` and a 180x180 Apple touch icon so Studio installs to a home screen](https://github.com/libredb/libredb-studio/pull/781)

### @nktnet1

- [Sent `field_multi_value_leniency` so Elasticsearch selects multi-valued fields instead of erroring](https://github.com/libredb/libredb-studio/pull/723)

### @Vetri1706

- [Gave each connection an optional query timeout, and dropped its cached provider on a change](https://github.com/libredb/libredb-studio/pull/752)

### @TonMtt

- [Documented how to rebase a fork branch onto `upstream/main` with `--force-with-lease`](https://github.com/libredb/libredb-studio/pull/735)

### @na12334

- [Added CSV and JSON export to the Data Profiler, masking what the screen masks](https://github.com/libredb/libredb-studio/pull/759)

### @Hashir-Ashraf-Awan

- [Added an optional TOTP second factor to local login, and refused a replayed code](https://github.com/libredb/libredb-studio/pull/779)

### @jabrailkhalil

- [Bound `Cmd/Ctrl+Shift+X` to a new query tab, working while the editor holds focus](https://github.com/libredb/libredb-studio/pull/782)
- [Moved the four keyboard shortcuts into one registry that also generates the docs line](https://github.com/libredb/libredb-studio/pull/803)

### @nightcityblade

- [Repointed two agent comments from a git-ignored design file to a reachable citation](https://github.com/libredb/libredb-studio/pull/793)

### @Abdu11ahBilal

- [Added `README_ur.md` and brought it under the localized README drift guard](https://github.com/libredb/libredb-studio/pull/783)

### @Dharshni-gth

- [Pointed the social preview at `libredb.org` and dropped the engine list from the meta description](https://github.com/libredb/libredb-studio/pull/798)
- [Made inline edits on a default `Query N` tab target the `FROM` clause table](https://github.com/libredb/libredb-studio/pull/924)

### @Swarnabha753

- [Added CSV and JSON export to the pivot table through the shared escaping helpers](https://github.com/libredb/libredb-studio/pull/796)

### @Dharshini-RS03

- [Added a results-grid wrap toggle that re-measures virtualized rows as they grow](https://github.com/libredb/libredb-studio/pull/810)
- [Kept the Run Sel button's blue fill on hover instead of the ghost hover colour](https://github.com/libredb/libredb-studio/pull/838)
- [Built the object reads with `jsonb` on every engine, so a RisingWave table shows its columns](https://github.com/libredb/libredb-studio/pull/1096)

### @nycjay

- [Stopped the editor overwriting live keystrokes with its own stale text and moving the caret](https://github.com/libredb/libredb-studio/pull/809)

### @Asgabani

- [Gave a closed query tab an Undo toast that restores it in place](https://github.com/libredb/libredb-studio/pull/818)
- [Added a star toggle that lifts favourite connections into their own sidebar group](https://github.com/libredb/libredb-studio/pull/812)
- [Made sidebar connections reorderable by drag, persisting the order in `connection_order`](https://github.com/libredb/libredb-studio/pull/817)
- [Repinned the CapRover template, cut AI claims the app dropped, and warned about `JWT_SECRET` rotation](https://github.com/libredb/libredb-studio/pull/849)
- [Added a `?` dialog listing every keyboard shortcut from a single registry](https://github.com/libredb/libredb-studio/pull/821)
- [Stopped a connection switch issuing one object-tree read shaped for the previous engine](https://github.com/libredb/libredb-studio/pull/848)
- [Reported an unreadable SQLite or LibreDB database size as absent instead of 0](https://github.com/libredb/libredb-studio/pull/1050)

### @InnoxCodes

- [Replaced the flat agent budget figures with the real per-workflow ranges in three READMEs](https://github.com/libredb/libredb-studio/pull/891)
- [Documented that Agent mode's Start needs `STORAGE_PROVIDER` set to `sqlite` or `postgres`](https://github.com/libredb/libredb-studio/pull/890)
- [Added `autoComplete` hints so password managers fill the login email and password](https://github.com/libredb/libredb-studio/pull/896)
- [Pluralized the admin fleet status badge so two failures no longer read `2 error`](https://github.com/libredb/libredb-studio/pull/893)
- [Stopped a long column type squeezing out the column name, with the full type on hover](https://github.com/libredb/libredb-studio/pull/885)
- [Replaced the hardcoded seven engines in the admin empty state with the real catalog count](https://github.com/libredb/libredb-studio/pull/894)
- [Changed the Security tab's all-caps `ENABLED` badges to sentence case](https://github.com/libredb/libredb-studio/pull/929)
- [Made the login submit button read `Sign in`, and pinned it by role in tests](https://github.com/libredb/libredb-studio/pull/932)

### @niukanen1

- [Printed the startup banner URL from the real `HOSTNAME` bind rather than `localhost`](https://github.com/libredb/libredb-studio/pull/847)
- [Read a MongoDB collection in another database when the statement names it](https://github.com/libredb/libredb-studio/pull/1106)
- [Fixed a `font-mediumr` typo that left 35 labels at the wrong weight, and guarded it](https://github.com/libredb/libredb-studio/pull/1140)
- [Stopped asking for confirmation before Redis blocking commands the provider refuses anyway](https://github.com/libredb/libredb-studio/pull/1174)
- [Ran the provider tests in five provider docs through the isolated runner](https://github.com/libredb/libredb-studio/pull/1219)
- [Refused an inline connection with no id before it reaches the cache key](https://github.com/libredb/libredb-studio/pull/1572)
- [Bounded the MongoDB connect by the request's query timeout](https://github.com/libredb/libredb-studio/pull/1591)
- [Dropped a stale aliases and data streams limitation from the search docs](https://github.com/libredb/libredb-studio/pull/1619)
- [Replaced the stale engine counts in `sqlite.md` with wording that needs none](https://github.com/libredb/libredb-studio/pull/1687)
- [Fixed the driver version, the scan constant and the sort order in `redis.md`](https://github.com/libredb/libredb-studio/pull/1775)

### @costajohnt

- [Separated an OIDC misconfiguration from an unreachable issuer, on screen and in the audit log](https://github.com/libredb/libredb-studio/pull/871)

### @iAmAdheil

- [Added `README_hi.md`, linked it from every other README and the drift guard](https://github.com/libredb/libredb-studio/pull/845)
- [Reported a MySQL column's declared type rather than its type family](https://github.com/libredb/libredb-studio/pull/1073)
- [Kept a trailing `s` in column names in the code generator](https://github.com/libredb/libredb-studio/pull/1177)
- [Reported an Oracle column's declared type rather than `DATA_TYPE` alone](https://github.com/libredb/libredb-studio/pull/1187)
- [Read Oracle `UROWID(n)` and `VECTOR(n, format)` back with their size](https://github.com/libredb/libredb-studio/pull/1237)
- [Wrote Oracle's `MODIFY` nullability clause only when the nullability changes](https://github.com/libredb/libredb-studio/pull/1617)

### @0utsights

- [Corrected the Keycloak role mapping: realm roles reach the ID token only when mapped](https://github.com/libredb/libredb-studio/pull/904)

### @YaoSong808

- [Closed the Code Generator on an unhandled Escape, and recorded the new global listener](https://github.com/libredb/libredb-studio/pull/892)

### @Mehmetalpertugtekin

- [Pointed the Fly guide's README link at the Environment Variables heading that exists](https://github.com/libredb/libredb-studio/pull/914)

### @DevvoLazza

- [Made the DigitalOcean pin read the published listing version instead of skipping the channel](https://github.com/libredb/libredb-studio/pull/927)
- [Retried the agent ledger's transient Windows chunk probe, keeping each stream's writes ordered](https://github.com/libredb/libredb-studio/pull/925)
- [Asserted the admin preview's category spread by type-id instead of renameable display labels](https://github.com/libredb/libredb-studio/pull/934)
- [Compacted the table counts, and added count query actions](https://github.com/libredb/libredb-studio/pull/926)
- [Guarded the destinations of HTTP database connections](https://github.com/libredb/libredb-studio/pull/1114)

### @xiechimon

- [Wrote the DigitalOcean Droplet env file under `umask 077` and installed it atomically](https://github.com/libredb/libredb-studio/pull/921)

### @Lingikaushikreddy

- [Documented how `TRUST_PROXY_HEADERS` and `TRUSTED_PROXY_HOPS` decide the rate-limit bucket key](https://github.com/libredb/libredb-studio/pull/938)
- [Tabulated the `RATE_LIMIT_*` variables and defaults behind each rate-limit bucket](https://github.com/libredb/libredb-studio/pull/939)
- [Documented `HSTS_INCLUDE_SUBDOMAINS` and how far `includeSubDomains` reaches](https://github.com/libredb/libredb-studio/pull/940)
- [Added a one-command Keycloak OIDC demo stack](https://github.com/libredb/libredb-studio/pull/947)
- [Corrected the OIDC demo's logout claim, and bound its proxy to loopback](https://github.com/libredb/libredb-studio/pull/960)
- [Published the Vault demo's Vault and Studio on loopback only](https://github.com/libredb/libredb-studio/pull/1004)
- [Read MySQL column defaults from `SHOW CREATE TABLE` for Schema Diff](https://github.com/libredb/libredb-studio/pull/1119)
- [Removed an obsolete logout note from the OIDC doc](https://github.com/libredb/libredb-studio/pull/1657)

### @Anikesh348

- [Gave the schema explorer's icon-only table actions button a table-specific accessible name](https://github.com/libredb/libredb-studio/pull/886)

### @tunglambk

- [Resolved seed connection credentials from HashiCorp Vault, so a rotated secret needs no restart](https://github.com/libredb/libredb-studio/pull/944)
- [Documented the one-command Vault demo stack in the README](https://github.com/libredb/libredb-studio/pull/956)
- [Moved the owned deployment pins to the release of the day](https://github.com/libredb/libredb-studio/pull/1049)
- [Bounded MongoDB server selection above the failover window, so a closed port fails in half a minute](https://github.com/libredb/libredb-studio/pull/1518)
- [Shaped Redis `WITHSCORES`, `XRANGE` and `SCAN` replies, and read stream and JSON keys](https://github.com/libredb/libredb-studio/pull/1552)
- [Counted index bytes in the MongoDB size, and one bucket's size on Couchbase](https://github.com/libredb/libredb-studio/pull/1553)

### @nawazish2

- [Disclosed in the Admin Audit tab that denials recorded by the proxy do not appear there](https://github.com/libredb/libredb-studio/pull/989)
- [Added Elasticsearch API key authentication, preferred over Basic auth when both halves are set](https://github.com/libredb/libredb-studio/pull/994)
- [Let local auth store more than two accounts](https://github.com/libredb/libredb-studio/pull/1122)
- [Kept rotated chart x-axis labels out of the legend](https://github.com/libredb/libredb-studio/pull/1175)
- [Grouped sidebar connections in collapsible sections the user defines](https://github.com/libredb/libredb-studio/pull/1229)

### @JavierparraDev

- [Printed the schema beside each table on the admin Operations page, so same-named tables are told apart](https://github.com/libredb/libredb-studio/pull/984)

### @linropx

- [Refused a committed `.only` before the test run, instead of letting the skipped tests pass green](https://github.com/libredb/libredb-studio/pull/987)
- [Stopped the launcher binding the machine name or container id that arrives as `HOSTNAME`](https://github.com/libredb/libredb-studio/pull/1053)
- [Documented the seed catalog scan and the Db2 auth options](https://github.com/libredb/libredb-studio/pull/1580)
- [Kept Milvus dynamic fields in query projections](https://github.com/libredb/libredb-studio/pull/1621)

### @sloemo01

- [Read the SQLite object kinds from the provider in the agent guard, instead of scraping source text](https://github.com/libredb/libredb-studio/pull/986)
- [Added the Civo Kubernetes Marketplace to the distribution channel inventory](https://github.com/libredb/libredb-studio/pull/996)
- [Read the backlog citation scan from the index, not the working tree](https://github.com/libredb/libredb-studio/pull/995)
- [Regenerated the channel matrix, which the Civo merge had left stale on `main`](https://github.com/libredb/libredb-studio/pull/1009)
- [Hoisted the last three object-path shape checks into the shared export](https://github.com/libredb/libredb-studio/pull/1023)
- [Re-derived `SECURITY.md` note 1.4 from the code, and gave its residual a real backlog entry](https://github.com/libredb/libredb-studio/pull/1024)
- [Sent the table's container with a maintenance target](https://github.com/libredb/libredb-studio/pull/1091)
- [Rendered the container-path sentence from one place](https://github.com/libredb/libredb-studio/pull/1092)
- [Made a failed Oracle connect close the pool it created](https://github.com/libredb/libredb-studio/pull/1105)
- [Bounded the RabbitMQ R-S10 checks by measurements from the runners where they failed](https://github.com/libredb/libredb-studio/pull/1737)

### @KodYazicam

- [Hoisted the copies of `assertObjectPathShape` into one export in `object-kinds.ts`](https://github.com/libredb/libredb-studio/pull/985)
- [Added the embedded LibreDB provider to the architecture diagrams](https://github.com/libredb/libredb-studio/pull/1117)
- [Pointed `postgres.md`'s schema section at the object surface](https://github.com/libredb/libredb-studio/pull/1115)
- [Listed the components the login form actually renders](https://github.com/libredb/libredb-studio/pull/1116)
- [Reset every connection-scoped field after a save that leaves the dialog open](https://github.com/libredb/libredb-studio/pull/1167)
- [Documented and pinned the Kafka error for a partition the topic does not have](https://github.com/libredb/libredb-studio/pull/1168)
- [Gave the `inspect_schema` fixture hook time for DuckDB on Windows](https://github.com/libredb/libredb-studio/pull/1304)
- [Recounted the provider schema reads in the agent doc, and named SQL Server's statistics](https://github.com/libredb/libredb-studio/pull/1306)
- [Classified the declared type once in the code generator, and quoted or sanitised field names](https://github.com/libredb/libredb-studio/pull/1497)
- [Placed the row bound before a dialect's trailing clauses](https://github.com/libredb/libredb-studio/pull/1501)
- [Held `db2.md`, `etcd.md` and `neo4j.md` to named citations](https://github.com/libredb/libredb-studio/pull/1584)
- [Counted Neo4j's gate row and named Db2's appended bound in the editor docs](https://github.com/libredb/libredb-studio/pull/1585)
- [Made agent mode execute on MySQL and MariaDB, behind a privilege check and a read-only transaction](https://github.com/libredb/libredb-studio/pull/1629)
- [Made agent mode execute on MongoDB, refusing any user that holds more than read privileges](https://github.com/libredb/libredb-studio/pull/1790)

### @t957095

- [Added the missing PostgreSQL Clients link to the Japanese, Spanish, Urdu and Hindi READMEs](https://github.com/libredb/libredb-studio/pull/1012)
- [Proofread `README_zh.md` as a native speaker, and rewrote its stale transport-security note](https://github.com/libredb/libredb-studio/pull/1005)

### @NotAFlightRisk

- [Repointed the Kubero guide's dead install link at a page that exists](https://github.com/libredb/libredb-studio/pull/1021)

### @chiliec

- [Stopped schema diff writing `DEFAULT` before ClickHouse `MATERIALIZED`, `ALIAS` and `EPHEMERAL` columns](https://github.com/libredb/libredb-studio/pull/1035)
- [Held Trino `nextUri` links to the connection's own origin, so its credentials are never sent elsewhere](https://github.com/libredb/libredb-studio/pull/1090)
- [Reported a malformed Kafka read request as a query error](https://github.com/libredb/libredb-studio/pull/1137)
- [Stated `objectKinds` in the capabilities section of five provider docs](https://github.com/libredb/libredb-studio/pull/1153)
- [Reset the connection-scoped fields before applying a new edit target](https://github.com/libredb/libredb-studio/pull/1157)
- [Pointed backlog entries D39 and D44 at symbols, and brought their counts up to date](https://github.com/libredb/libredb-studio/pull/1166)

### @rahimahisah17

- [Published the Postgres compose containers on loopback only](https://github.com/libredb/libredb-studio/pull/1039)
- [Mounted the `postgres:18` data volume at `/var/lib/postgresql`, ending a restart loop](https://github.com/libredb/libredb-studio/pull/1041)
- [Moved Next.js to the release that fixes a critical security vulnerability](https://github.com/libredb/libredb-studio/pull/1288)

### @bernalalexis-try

- [Showed an empty-string default in the ER diagram's column tooltip instead of hiding it](https://github.com/libredb/libredb-studio/pull/1036)
- [Read SQLite, libSQL and DuckDB column defaults as values rather than quoted catalog text](https://github.com/libredb/libredb-studio/pull/1048)

### @saitakarcesme

- [Corrected the local and hosted model counts in the LLM setup guide](https://github.com/libredb/libredb-studio/pull/1060)

### @BladeRunner-KD6-37

- [Corrected the agent API path and handler counts in `API_DOCS.md`](https://github.com/libredb/libredb-studio/pull/1063)

### @lg114

- [Expanded the Chinese README with the install channels, the feature set and the agent](https://github.com/libredb/libredb-studio/pull/1052)

### @Ehtasham-Yasin

- [Added Copy Cell and Copy Row as JSON to the results grid context menu, keeping masked values masked](https://github.com/libredb/libredb-studio/pull/1068)

### @Aditya-XR

- [Anchored the Schema Diff migration copy button outside the scrolling SQL](https://github.com/libredb/libredb-studio/pull/1082)
- [Refused Redis commands such as `SELECT` and `AUTH` that would move the connection every request shares](https://github.com/libredb/libredb-studio/pull/1121)
- [Read Oracle `DATE` and `TIMESTAMP` as the stored wall clock, not a local `Date`](https://github.com/libredb/libredb-studio/pull/1225)
- [Closed the driver of a graph connect still in flight when a disconnect arrives](https://github.com/libredb/libredb-studio/pull/1308)
- [Exported a zoned Oracle timestamp that arrived over HTTP as its UTC instant](https://github.com/libredb/libredb-studio/pull/1500)
- [Read SQL Server `DATETIME` and `SMALLDATETIME` as the engine's own text, and exported them so they replay](https://github.com/libredb/libredb-studio/pull/1639)

### @NikharAsthana

- [Pinned the Schema Diff migration copy button with a clipboard test](https://github.com/libredb/libredb-studio/pull/1076)

### @igorwfaoro

- [Made the admin Overview's Recent Activity state what it covers, with a path to the Audit tab](https://github.com/libredb/libredb-studio/pull/1079)
- [Sized each result grid column from its header instead of one fixed width](https://github.com/libredb/libredb-studio/pull/1113)

### @Xavees

- [Added the capabilities, error-handling and usage sections `duckdb.md` was missing](https://github.com/libredb/libredb-studio/pull/1103)

### @yizhixiaokong

- [Added a resumable walk of an engine's own key space, and the sidebar key browser that drives it](https://github.com/libredb/libredb-studio/pull/1095)
- [Guarded the sidebar's deferred catalog against a deferred walk](https://github.com/libredb/libredb-studio/pull/1616)

### @MohamedIdhries

- [Covered a long-form IPv6 Trino host against a short `nextUri` in the transport tests](https://github.com/libredb/libredb-studio/pull/1093)

### @TehmeenaAkhtar

- [Made the Urdu README read more naturally, and kept the link to its renamed install heading working](https://github.com/libredb/libredb-studio/pull/1118)

### @Roberton003

- [Started the read-only MCP server at `/api/mcp`, which the maintainers then rebuilt on the official SDK](https://github.com/libredb/libredb-studio/pull/1070)

### @Reitzzz

- [Reported a PostgreSQL `statement_timeout` as a timeout instead of a user cancel](https://github.com/libredb/libredb-studio/pull/1149)

### @fatihcvs

- [Replaced line-number citations in source comments with the declaration names they meant](https://github.com/libredb/libredb-studio/pull/1141)
- [Stopped a short result page showing a `limited` badge when nothing was cut](https://github.com/libredb/libredb-studio/pull/1142)

### @MFA-G

- [Reset TLS, SSH, environment and Advanced fields when a new connection's dialog closes](https://github.com/libredb/libredb-studio/pull/1150)

### @muskanbandta23

- [Added ZopDay to the README's one-click deploy options](https://github.com/libredb/libredb-studio/pull/1183)

### @Retsumdk

- [Derived the provider docs' named citations inside the guard test instead of trusting a hand-kept list](https://github.com/libredb/libredb-studio/pull/1194)

### @shivamcoderrrr

- [Moved the query safety dialog onto the Radix alert dialog, for focus trapping and keyboard use](https://github.com/libredb/libredb-studio/pull/1191)

### @paulocoutinhox

- [Added the Portuguese README, linked it from the others and registered it with the drift guard](https://github.com/libredb/libredb-studio/pull/1017)

### @Fristail27

- [Added the Russian README, linked it from the others and registered it with the drift guard](https://github.com/libredb/libredb-studio/pull/1188)

### @switchcasestudio

- [Kept the confirmation dialogs' Cancel button on the studio theme's colour when the OS is dark](https://github.com/libredb/libredb-studio/pull/1202)
- [Returned focus to where it was after closing confirmation dialogs opened from app state](https://github.com/libredb/libredb-studio/pull/1204)
- [Counted ER diagram relations by kind, so a view is not called a table](https://github.com/libredb/libredb-studio/pull/1508)
- [Explained an agent run the loop ended on a model timeout, instead of calling it unclassified](https://github.com/libredb/libredb-studio/pull/1509)

### @ArthurRamonSouza

- [Reworded the Apache Kafka row of the Portuguese README](https://github.com/libredb/libredb-studio/pull/1206)

### @abkucuk

- [Dropped the `tcp:` prefix from a pasted ADO.NET `Server`, so an Azure connection string connects](https://github.com/libredb/libredb-studio/pull/1212)

### @Maaz2212

- [Dropped a stale engine count from `libsql.md`](https://github.com/libredb/libredb-studio/pull/1220)
- [Stated in `login-page.md` that `NEXT_PUBLIC_APP_VERSION` comes from `package.json` at build time](https://github.com/libredb/libredb-studio/pull/1221)
- [Added a link from `/settings/mcp` back to the editor](https://github.com/libredb/libredb-studio/pull/1564)
- [Bounded the schema context sent to the AI, and handled a context overflow error](https://github.com/libredb/libredb-studio/pull/1579)
- [Left fields the SQL engine cannot project out of generated Elasticsearch and OpenSearch queries](https://github.com/libredb/libredb-studio/pull/1671)

### @JaredAung

- [Recorded the Scoop Extras listing in the channel inventory and the install docs](https://github.com/libredb/libredb-studio/pull/1226)
- [Parsed Redis `INFO` into metrics shown on the Operations tab, instead of a line count](https://github.com/libredb/libredb-studio/pull/1608)

### @gurkanceylan41

- [Fixed the in-page links in `mssql.md` and `redis.md` that missed their headings](https://github.com/libredb/libredb-studio/pull/1234)

### @rivolity

- [Made the Vault Kubernetes auth mount configurable through `VAULT_K8S_AUTH_PATH`](https://github.com/libredb/libredb-studio/pull/1282)
- [Added `extraVolumes`, `extraVolumeMounts` and `extraObjects` to the Helm chart](https://github.com/libredb/libredb-studio/pull/1605)

### @berkay-byte

- [Corrected the `vacuumAction` provider count, and dropped a stale `reindex` reference](https://github.com/libredb/libredb-studio/pull/1280)

### @lb1192176991-lab

- [Documented the `*_PATH`, `*_DIR` and `*_FILE` env classification rule in `CONTRIBUTING.md`](https://github.com/libredb/libredb-studio/pull/1298)
- [Trimmed whitespace from `VAULT_K8S_TOKEN_PATH` and `VAULT_K8S_AUTH_PATH`](https://github.com/libredb/libredb-studio/pull/1297)

### @lui01212

- [Corrected the X5 backlog entry's rendering notes after the modal extraction](https://github.com/libredb/libredb-studio/pull/1300)

### @cestercian

- [Added the second Neo4j integration test command, and linked the references in `neo4j.md`](https://github.com/libredb/libredb-studio/pull/1307)
- [Hid engine-owned schemas on wire-compatible engines](https://github.com/libredb/libredb-studio/pull/1598)
- [Accepted ScyllaDB's view type as a materialized view source](https://github.com/libredb/libredb-studio/pull/1618)

### @rnihesh

- [Fixed the Db2 doc's statement terminator row, and filled the gaps it had against the code](https://github.com/libredb/libredb-studio/pull/1314)
- [Named every capability in the etcd doc, and linked its references](https://github.com/libredb/libredb-studio/pull/1315)
- [Cleared the previous run's error when a new run starts](https://github.com/libredb/libredb-studio/pull/1316)

### @mgr-punith

- [Corrected the non-SQL query formats intro in `DATABASE_PROVIDERS.md`, and added LibreDB to it](https://github.com/libredb/libredb-studio/pull/1319)
- [Removed stale engine counts from the login page test comments](https://github.com/libredb/libredb-studio/pull/1465)

### @DevKhizerer

- [Replaced a stale type-id count in a schema statistics comment with the rule behind it](https://github.com/libredb/libredb-studio/pull/1360)

### @hridhinvarkeyjoseph

- [Retried MongoDB `listDatabases` without `authorizedDatabases` on FerretDB, which refuses the field](https://github.com/libredb/libredb-studio/pull/1302)
- [Refused every unicode escape in a quoted Cypher name](https://github.com/libredb/libredb-studio/pull/1545)

### @stroexd

- [Read PostgreSQL `interval`, `point` and a JSON null as the engine's own text](https://github.com/libredb/libredb-studio/pull/1503)
- [Sized PostgreSQL table statistics by relid, and dropped a refused size on its own](https://github.com/libredb/libredb-studio/pull/1507)
- [Accepted either code the resolver can give for an etcd name that does not resolve](https://github.com/libredb/libredb-studio/pull/1541)
- [Read table rows from `pg_class` where `pg_stat_user_tables` is empty, so CockroachDB shows its tables](https://github.com/libredb/libredb-studio/pull/1548)
- [Cited code by name in `elasticsearch.md` and `opensearch.md`](https://github.com/libredb/libredb-studio/pull/1601)

### @brown-sussy

- [Resolved the Couchbase bucket from the connection string's path](https://github.com/libredb/libredb-studio/pull/1517)
- [Kept connection names visible beside the read-only badge](https://github.com/libredb/libredb-studio/pull/1544)

### @Jeevan2410

- [Skipped views and reported failures in MongoDB's whole-database validate and compact](https://github.com/libredb/libredb-studio/pull/1522)
- [Counted absent MongoDB fields as nullable in inference and as null in the profiler](https://github.com/libredb/libredb-studio/pull/1554)
- [Labelled a Percona Server from `@@version_comment` in Monitoring](https://github.com/libredb/libredb-studio/pull/1556)
- [Dropped a selected statement's trailing terminator on engines that take none](https://github.com/libredb/libredb-studio/pull/1561)
- [Refused `:memory:` for LibreDB, and named a missing directory instead of its `.lock` file](https://github.com/libredb/libredb-studio/pull/1562)
- [Named the refusal and the address when ClickHouse, Druid, libSQL or Couchbase cannot be reached](https://github.com/libredb/libredb-studio/pull/1571)
- [Offered PostgreSQL routine edits only where the apply's guard runs](https://github.com/libredb/libredb-studio/pull/1595)
- [Measured the MySQL EXPLAIN grammar against a table when `SELECT 1` is refused](https://github.com/libredb/libredb-studio/pull/1609)
- [Sent a statement MySQL refused to prepare as text](https://github.com/libredb/libredb-studio/pull/1620)

### @abinash2553J

- [Kept nested paths in MongoDB generated test data](https://github.com/libredb/libredb-studio/pull/1555)

### @irfanfaraaz

- [Hid routines and relations an extension put in a user schema](https://github.com/libredb/libredb-studio/pull/1597)
- [Left triggers and Overview counts on extension-owned tables out](https://github.com/libredb/libredb-studio/pull/1600)
- [Offered Terminate in Monitoring only where the server accepts a kill](https://github.com/libredb/libredb-studio/pull/1625)

### @SrikanthBonkuri

- [Kept column types as written in the ER diagram, and told relation kinds apart](https://github.com/libredb/libredb-studio/pull/1559)

### @itz-puneet

- [Withheld per-row maintenance controls on a read-only connection](https://github.com/libredb/libredb-studio/pull/1611)
- [Turned on RisingWave's implicit flush, so an edit is read back](https://github.com/libredb/libredb-studio/pull/1626)

### @bizimarda

- [Counted only base tables in the PostgreSQL Overview, matching the tree](https://github.com/libredb/libredb-studio/pull/1615)

### @jihyunK0617

- [Added the Korean README, and registered it with the localized README drift guard](https://github.com/libredb/libredb-studio/pull/1524)

### @siddxwar04

- [Left foreign keys out of generated test data, and kept unique values distinct](https://github.com/libredb/libredb-studio/pull/1610)
- [Wrote Oracle test data dates through `TO_DATE`/`TO_TIMESTAMP`, and `NUMBER` unquoted](https://github.com/libredb/libredb-studio/pull/1627)
- [Wrote a BC date in an Oracle INSERT export with its sign](https://github.com/libredb/libredb-studio/pull/1674)
- [Added Db2 LUW to the inline row editing engines in the Rancher catalog listing](https://github.com/libredb/libredb-studio/pull/1738)
- [Made the documented secret scan work from a git worktree](https://github.com/libredb/libredb-studio/pull/1777)

### @HannaSalinas

- [Dropped two stale provider counts from `postgres.md`](https://github.com/libredb/libredb-studio/pull/1622)
- [Brought the Spanish README's transport security paragraph and Db2 LUW row up to date](https://github.com/libredb/libredb-studio/pull/1662)

### @junaidaliruk

- [Dropped two engine counts that no longer held from Druid comments](https://github.com/libredb/libredb-studio/pull/1647)
- [Did the same in the sidebar's comments](https://github.com/libredb/libredb-studio/pull/1638)
- [Did the same in the database type comments](https://github.com/libredb/libredb-studio/pull/1640)
- [Did the same in a login end-to-end test comment](https://github.com/libredb/libredb-studio/pull/1641)
- [Did the same in two SQLite comments](https://github.com/libredb/libredb-studio/pull/1642)
- [Did the same in libSQL's `listObjectContainers` comment](https://github.com/libredb/libredb-studio/pull/1643)
- [Reworded a MongoDB comment that claimed the only per-object read](https://github.com/libredb/libredb-studio/pull/1644)
- [Replaced a stale engine count in a SQLite test comment](https://github.com/libredb/libredb-studio/pull/1645)
- [Replaced two MySQL sentences that counted the other providers](https://github.com/libredb/libredb-studio/pull/1646)

### @navpreet-dev

- [Pointed `ARCHITECTURE.md` at `ADDING_A_PROVIDER.md` and `.env.example`](https://github.com/libredb/libredb-studio/pull/1655)

### @Furox-Art

- [Added the missing libSQL row to the local test database table](https://github.com/libredb/libredb-studio/pull/1637)

### @ShahabAhmed01

- [Made Test Connection refuse a missing Couchbase bucket and warn about a missing Trino catalog](https://github.com/libredb/libredb-studio/pull/1628)

### @Dariusch

- [Let a LAN host load the dev server through `DEV_ALLOWED_ORIGINS`](https://github.com/libredb/libredb-studio/pull/1670)
- [Added the Google BigQuery provider over the REST API, with no Google SDK](https://github.com/libredb/libredb-studio/pull/1672)
- [Made SQL completion read the clause and the scope it is in](https://github.com/libredb/libredb-studio/pull/1700)
- [Gave BigQuery an emulator credential and a replay recorded from a live project](https://github.com/libredb/libredb-studio/pull/1705)

### @Totopo27

- [Stopped SQL Server table stats multiplying row counts by indexes and allocation units](https://github.com/libredb/libredb-studio/pull/1682)

### @samusagbt

- [Replaced two stale provider counts in the object route's comments](https://github.com/libredb/libredb-studio/pull/1716)

### @CodeByPeace

- [Replaced stale provider counts in `mongodb.md` with wording that needs no number](https://github.com/libredb/libredb-studio/pull/1675)

### @notlakshitha

- [Fixed the README's BrowserStack open-source link](https://github.com/libredb/libredb-studio/pull/1739)

### @Vardhan2006

- [Named which engines `libsql.md`'s zero-container section compares with](https://github.com/libredb/libredb-studio/pull/1742)
- [Added a live PostgreSQL check of the agent's read-only profile to the functional smoke test](https://github.com/libredb/libredb-studio/pull/1648)
- [Added Db2 LUW to the Rancher inline editing list](https://github.com/libredb/libredb-studio/pull/1741)

### @kkj-buildstr

- [Let one PostgreSQL connection browse every database the role can connect to](https://github.com/libredb/libredb-studio/pull/1649)

### @Jah-yee

- [Listed passkey sign-in among the routes that need no session in `SECURITY.md`](https://github.com/libredb/libredb-studio/pull/1757)

### @0x0000x

- [Stopped the README listing the integration-tested providers by name](https://github.com/libredb/libredb-studio/pull/1760)

### @sadhana-s-codez

- [Corrected the image tags table in `DOCKERHUB.md` to match the publishing workflow](https://github.com/libredb/libredb-studio/pull/1765)

### @SwatiManjari

- [Documented the query language values and three missing `ProviderLabels` fields](https://github.com/libredb/libredb-studio/pull/1763)

### @daemon-tech

- [Dropped stale `getSchema()` references from the Redis provider comments](https://github.com/libredb/libredb-studio/pull/1758)

### @evgessshkin

- [Counted the WAL in the SQLite and DuckDB database size](https://github.com/libredb/libredb-studio/pull/1673)

### @Fineturkey

- [Corrected the README drift guard's comments on the files and invariants it checks](https://github.com/libredb/libredb-studio/pull/1776)

### @KrishanKumarAwasthi

- [Stopped a drive token comment counting the proxy's public paths](https://github.com/libredb/libredb-studio/pull/1767)

### @sadfun

- [Added Pethost to the README's one-click deploy options](https://github.com/libredb/libredb-studio/pull/1780)

### @T-Zaid

- [Refused a Kafka classic group with a member the client cannot decode, instead of showing it partial](https://github.com/libredb/libredb-studio/pull/1788)

### @yash8233

- [Fixed the provider count in the toolchain guide](https://github.com/libredb/libredb-studio/pull/1782)

## Getting on this page

Take an issue labelled [good first issue](https://github.com/libredb/libredb-studio/labels/good%20first%20issue) — each one states what "done" looks like as a command you can run yourself, so you never have to ask whether you are finished. [CONTRIBUTING.md](CONTRIBUTING.md) has the setup and the gates.

Reports count too. If you opened an issue that led to a fix, say so on the pull request that fixed it and we will list the report beside the change.
