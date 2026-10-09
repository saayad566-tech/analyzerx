# AnalyzerX UI/UX Design Brief

## Design mood

AnalyzerX should feel like a premium institutional research terminal translated into a calm, approachable mobile product. The visual language is **warm metallic gold over deep navy**, with restrained glow, dense but readable information, editorial news hierarchy, and clear evidence states. It must feel analytical rather than casino-like: no neon backgrounds, no decorative gradients behind dense data, and no visual treatment that suggests certainty where evidence is weak.

## Color palette

| Token | Hex | Use |
| --- | --- | --- |
| Brand gold | `#FDB913` | Primary action, active tab, score emphasis, selected chips |
| Solar highlight | `#FFD700` | Small highlight or pressed-state sheen only |
| Amber shadow | `#F5A623` | Secondary gold accent and score ranges |
| Deep navy | `#09111F` | App background and dark navigation |
| Navy surface | `#111C2D` | Cards, sheets, input backgrounds |
| Navy elevated | `#17253A` | Nested cards and provider panels |
| Charcoal | `#111111` | High-contrast text on gold and dense emphasis |
| Foreground | `#F4F7FB` | Primary text on navy |
| Muted | `#91A2B8` | Secondary labels and metadata |
| Border | `#26364D` | Dividers, card outlines, inactive controls |
| Success teal | `#4FD1C5` | Fresh, positive, verified, improving |
| Warning amber | `#F5A623` | Stale, estimated, cooldown |
| Error coral | `#FB7185` | Provider failure, negative impact, blocked action |
| Inference violet | `#A78BFA` | Model-derived context and scenario distinction |

Gold must never use white or pale-yellow text. On a gold surface, text and icons use deep navy or charcoal. Contrast is checked for primary text, status text, disabled text, and iconography.

## Typography

The primary typeface is the platform system sans-serif: San Francisco on Apple platforms, Roboto on Android, and system sans-serif on web. Use a compact hierarchy:

| Style | Size | Weight | Line height | Use |
| --- | ---: | ---: | ---: | --- |
| Display title | 32 | 800 | 38 | Screen title |
| Section title | 20 | 800 | 26 | Card and section heading |
| Card title | 16 | 800 | 21 | Entity, news, flow, strategy card |
| Body | 14 | 500 | 20 | Explanations and summaries |
| Metadata | 11 | 700 | 15 | Source, time, status, category |
| Micro label | 9–10 | 800 | 13 | Eyebrow, score label, evidence badge |
| Numeric metric | 24–30 | 800 | 30–34 | Quote, score, aggregate flow |

Numbers use tabular alignment where possible. Headlines use sentence case with a maximum of four lines in cards. Long evidence text is collapsed behind a “Show evidence” action.

## Spacing system

Use a 4-point base grid: `4, 8, 12, 16, 20, 24, 32, 40`. Screen side padding is 20 on phones and 24 on wider layouts. Card padding is 16–18. Card radius is 16–18; small pills use 8–10. Touch targets are at least 44×44 points. Separate dense sections with 16–24 points rather than extra borders.

## Component style

| Component | Style | Interaction |
| --- | --- | --- |
| Primary button | Gold fill, navy text, 12–14 radius, subtle pressed scale | Haptic light impact; disabled state preserves readable contrast |
| Secondary button | Navy surface, gold outline or muted border | Opacity feedback |
| Card | Navy surface, 1px border, 16–18 radius | Tappable cards have clear chevron or arrow affordance |
| Evidence badge | Small bordered pill with Fresh/Stale/Derived/Estimated/Unavailable | Tapping opens source and methodology |
| Score ring | Gold/teal/coral segmented ring with numeric center | Tapping opens weighted breakdown |
| Filter chip | Navy surface, muted text; selected gold fill with navy text | Horizontal scroll, single-line labels |
| News rail | Newspaper card with kicker, headline, summary, source, time, impact | Horizontal swipe; headline opens detail |
| Data table | Strong row labels, tabular metrics, visible source column on detail | Horizontal scroll only when necessary |
| Bottom sheet | Navy elevated surface, rounded top corners, drag handle | Backdrop dismissal plus explicit close |
| Chart | Minimal grid, gold primary series, teal comparison, violet estimate | Tap points for period/source details |
| Chat bubble | User card right-aligned; assistant card left-aligned with evidence footer | Suggested follow-ups are pill buttons |

## Information hierarchy

Every screen begins with a short title and one-sentence purpose. The primary action is visually singular. Data cards lead with the value, then status, source, and timestamp. Explanations follow the value rather than preceding it. A screen should never use a large unavailable message when usable adjacent sections exist.

## Motion and feedback

Use 80–300ms timing animations. Pressable cards may scale to 0.97 and reduce opacity. Avoid bounce and continuous shimmer. Loading skeletons stop once the first usable response arrives. Refresh buttons show a spinner and a result message. Network retries are not hidden; the UI shows cooldown or next retry time.

## Accessibility

All interactive elements expose labels and roles. Color is never the only status signal; pair it with text and icon. Dynamic text must not clip important values. Charts provide accessible summaries and tappable data points. Web keyboard navigation reaches search, filters, cards, and primary actions in logical order. Screen readers receive the symbol, metric, freshness, and action context.

## Responsive behavior

Portrait phone is the primary layout. Tablet and web layouts widen cards into two-column research sections while preserving the same reading order. Bottom tabs remain available on narrow screens; account and admin actions are reachable from a top-right menu or dedicated route. Horizontal rails are used only for editorial news and compact filters, never for primary research content.

## Content style

Use direct language: “Fresh NSE report,” “Stale by 2 days,” “Derived from operating cash flow and capex,” and “Unavailable from configured providers.” Avoid vague language such as “AI says” or “verified” without specifying what was verified. Recommendations must be framed as research signals, not promises.

## Design QA checklist

A design pass is complete when all high-value screens pass contrast review, no gold surface contains light text, every button has feedback, cards have clear tap targets, charts are legible at 375px width, and stale/unavailable/estimated states are understandable without opening a secondary screen.


## Dynamic theme system

The current platform theme registry adds Premium Dark, AI Futuristic, Fintech, Minimal Modern, Apple-Inspired, Luxury, Neon AI, and Custom themes. Theme changes apply instantly through semantic tokens for backgrounds, cards, inputs, navigation, buttons, icons, charts, notifications, loading states, dialogs, AI content, and premium elements. Users can select Light, Dark, or System mode where supported. Custom colors are stored locally and must preserve readable foreground/background contrast.

The theme preview is an interactive sample surface rather than a static swatch list. It shows a primary button, verified badge, icon, evidence card, typography hierarchy, and chart bars using the currently selected palette. Gold remains selective and meaningful, especially for active states, premium features, AI highlights, and important information.

## Institutional intelligence surfaces

Flows, options, news, and screener results use the same compact table language: selected range and sort basis are visible in the header; participant, sector, sub-sector, stock, net value, activity, freshness, and source are separated into readable columns or stacked rows; high-to-low sorting is explicit; and stale or aggregate-only data is labelled. A row remains tappable to the relevant company, options, timeline, or source detail.

## Assistant interface

The Assistant is presented as a research co-pilot rather than a generic chatbot. The engine selector shows Auto, Local, and Connected modes. Responses include an evidence footer, freshness, limitations, and model/engine disclosure. Local-model actions are surfaced in the Local AI management dashboard, while plain-English questions about current facts continue to pass through grounded context before generation.


## Release design-system addendum

The existing visual direction remains authoritative. This addendum turns it into a complete semantic contract for release screens and generated reports.

### Semantic tokens

| Semantic token | Default dark value | Light-mode guidance | Meaning |
| --- | --- | --- | --- |
| background | `#09111F` | `#F7F9FC` | Page background |
| surface | `#111C2D` | `#FFFFFF` | Primary card |
| elevated | `#17253A` | `#EEF2F7` | Nested card and sheet |
| foreground | `#F4F7FB` | `#111827` | Primary text |
| muted | `#91A2B8` | `#526173` | Secondary text |
| border | `#26364D` | `#D7DEE8` | Dividers and outlines |
| primary | `#FDB913` | `#B77900` | Main action and selected state |
| verified | `#4FD1C5` | `#087F78` | Fresh, verified, healthy |
| warning | `#F5A623` | `#9A5A00` | Stale, estimated, cooldown |
| error | `#FB7185` | `#B4233C` | Failed, blocked, negative |
| inference | `#A78BFA` | `#6941C6` | Model-derived or scenario |

Screens consume semantic tokens through the centralized theme provider. Raw color literals are permitted only in the theme registry and chart palette definitions. Switching theme is immediate, preserves contrast, and does not require restart.

### Status language and visual treatment

`Fresh` uses teal plus a checkmark and displays source plus retrieval time. `Delayed` uses amber plus a clock and displays provider delay. `Stale` uses amber plus age. `Unavailable` uses muted/coral plus an information icon and states the missing capability. `Estimated` uses violet plus a methodology link. `Derived` uses violet plus the formula or input evidence. `Blocked` uses coral plus a retry or requirements action. Status cannot rely on color alone.

### Market context treatment

The selected market is a compact, persistent header chip with country/market name and exchange scope. It must appear before search results, news feeds, charts, tables, Assistant context, and exports. When a user switches market, the header changes immediately and the first loading state names the new market. A neutral “All markets” option may exist only in explicitly global comparison surfaces; it must not be the hidden default for an ordinary selected-market feed.

### Research card patterns

Company cards lead with canonical issuer name, ticker, exchange, selected market, last observation time, and status. News cards lead with headline and publication time, then entity relevance, sentiment, impact, source, and freshness. Flow rows lead with period and participant, then net value, activity, security, source, and sorting basis. Scorecards show pillar score, evidence count, coverage, and risk before narrative interpretation.

### Installer feedback

ForgeShelf install actions use a single primary button labeled Install when eligible. While running, the button changes to a disabled progress state and a visible progress card shows Preflight, Dependencies, Download, Verify, Activate, Complete, or Rollback. A checksum mismatch is explained in plain language and never shown as a generic network error. The user can retry or return to Browse. Installed and Active states are visually distinct; Remove is secondary and requires confirmation when the tool is active.

### Charts and report styling

Charts use gold for the primary reported series, teal for comparison or verified secondary series, violet for estimates/derived series, and muted dashed lines for unavailable intervals. Each chart has a text summary for accessibility and includes unit, currency, period, source, and freshness. PDF reports use the same navy/gold/teal language but include a white reading surface when appropriate for print. Every report begins with an executive summary and data-coverage legend, followed by business context, five-pillar analysis, charts, valuation/scenarios, risks, evidence, and source register.

### Interaction and accessibility gates

All primary actions use Pressable style feedback, a minimum 44×44 touch area, and accessible labels. Haptics are limited to primary actions, toggles, completion, and errors on native platforms. Motion stays within 80–300ms, respects reduced-motion settings, and never hides a state transition. Web keyboard focus must visibly traverse search, market selector, filters, cards, primary actions, and source links. Dynamic text must not clip scores, currencies, or status labels.

### Design acceptance criteria

The release design passes when every high-value screen uses semantic tokens, every market-aware screen exposes scope, every data state is understandable without a secondary screen, all gold surfaces use dark text, chart legends remain readable at 375px width, reports match the app’s evidence language, and ForgeShelf installation progress is visible without a modal trap.
