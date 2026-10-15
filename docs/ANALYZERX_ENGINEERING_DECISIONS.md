# AnalyzerX — Engineering Decisions

Each entry records the decision, the reason, and the alternative rejected. These are
deliberate choices, not omissions.

## D1 — Refused proxy rotation and User-Agent rotation (twice)

**Decision:** the app does not rotate proxies or User-Agent strings.

**Reason:** the supplied GME engine and one mandate both asked for "dynamic proxy
rotation, random User-Agent headers". That combination exists to avoid per-IP and
per-UA detection — i.e. to evade rate limits and access controls. The project's own
mandates forbid it ("Never use unlicensed scraping, bypass paywalls/CAPTCHAs/
authentication, evade rate limits, or ignore provider terms").

**Rejected alternative:** porting GME's `http.Fetcher` proxy/UA logic.

**Nuance:** a *single, stable* browser-like User-Agent is used for the Yahoo chart
endpoint, because that endpoint rejects default library agents outright. One fixed
string is not rotation and is not evasion; it is the endpoint's documented requirement.

## D2 — Known ≠ supported for markets

**Decision:** a country in the registry is reported as `Not Implemented` unless the
app has a real adapter for it.

**Reason:** marking a market supported because its name is known is exactly the
overclaim the mandates prohibit. `describeMarketCoverage()` therefore returns a
status and a reason, and a test asserts the registry and the app's own profiles agree.

## D3 — Coverage is declared per category, not per market

**Decision:** `lib/market-coverage.ts` declares available / partial / portal /
licensed per category, each with its backing source.

**Reason:** one word per market ("PLANNED") was wrong in both directions — it hid
that quotes, news and macro genuinely work for every listed market, and it hid that
filings are genuinely gated. A single label cannot express that.

## D4 — Refused hosted authentication

**Decision:** no Auth0/Firebase sign-up flow was added.

**Reason:** it requires a backend and provider credentials — a paid, networked
service. That conflicts with the project's zero-cost, fully-offline constraint.

**What was built instead:** the part that does not need a backend — per-user AND
per-market data scoping (`user:{id}:{namespace}:{market}`).

**Open question for the user:** accept a backend and provider credentials, or keep
auth local-only. This is a genuine product decision, not an engineering one.

## D5 — Market status computed in the exchange's timezone, via Intl

**Decision:** `lib/market-session.ts` resolves local time with `Intl.DateTimeFormat`
and an IANA timezone.

**Reason:** a fixed UTC offset would be wrong for half the year in New York, London,
Sydney and the EU. Intl handles DST correctly.

**Honest limit:** exchange holidays are NOT modelled. Guessing a holiday calendar
would be worse than the documented limitation, so a holiday shows as a normal day.

## D6 — Isolation is epoch-based, not just key-based

**Decision:** `createMarketSwitchController()` stamps every in-flight request with a
monotonic epoch and aborts the previous one.

**Reason:** namespacing keys alone does not stop a slow Indian response from landing
after a switch to the US. The epoch check makes a superseded switch unable to commit
its market, which is the actual race.

## D7 — Version identity has one source of truth

**Decision:** `package.json` is authoritative; everything else derives from it.

**Reason:** version drift across `package.json`, `app.config.ts`, `eas.json`,
`build.gradle`, `README.md`, `lib/pdf.ts` and `lib/open-data/link.ts` caused real
release confusion. `scripts/verify-release.mjs` fails the build if they disagree.

## D8 — Test-only constraints discovered the hard way

**Decision:** modules under test must not import `react-native`, and must use
relative imports.

**Reason:** vitest has no `@/` alias, and cannot load `react-native`. Two CI runs
were lost to this before it was encoded here.

## D9 — Adopt reference data, not code, from supplied projects

**Decision:** from the GME project only `countries.csv` and the identity model were
adopted; the Python engine was not.

**Reason:** GME is a Python server with a Parquet/DuckDB lake; AnalyzerX's pipeline
is on-device TypeScript. The two do not compose. The reference data transfers
cleanly; the code does not.
