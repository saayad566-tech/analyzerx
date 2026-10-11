# AnalyzerX — UI/UX Design Brief

**Version:** 2.0 · **Supersedes:** `docs/analyzerx-ui-ux-brief.md` · Corrects hosted-era references; adds grid, responsive and accessibility detail.

## Design mood

A premium institutional research terminal translated into a calm, approachable mobile product. The visual language is **warm metallic gold over deep navy**, with restrained glow, dense but readable information, editorial news hierarchy and clear evidence states. It must feel analytical rather than casino-like: no neon backgrounds, no decorative gradients behind dense data, and no treatment that implies certainty where evidence is weak.

## Colour palette

| Token | Hex | Use |
| --- | --- | --- |
| Brand gold | `#FDB913` | Primary action, active tab, score emphasis, selected chips |
| Solar highlight | `#FFD700` | Small highlight / pressed sheen only |
| Amber shadow | `#F5A623` | Secondary gold accent, score ranges |
| Deep navy | `#09111F` | App background, dark navigation |
| Navy surface | `#111C2D` | Cards, sheets, inputs |
| Navy elevated | `#17253A` | Nested cards, provider panels |
| Charcoal | `#111111` | High-contrast text on gold |
| Foreground | `#F4F7FB` | Primary text on navy |
| Muted | `#91A2B8` | Secondary labels, metadata |
| Border | `#26364D` | Dividers, outlines, inactive controls |
| Success teal | `#4FD1C5` | Fresh, positive, verified |
| Warning amber | `#F5A623` | Stale, estimated, cooldown |
| Error coral | `#FB7185` | Provider failure, negative, blocked |
| Inference violet | `#A78BFA` | Model-derived context, scenario |

**Contrast rule.** Gold must never carry white or pale-yellow text — on a gold surface, text and icons use deep navy or charcoal. Contrast is checked for primary text, status text, disabled text and iconography.

## Light and dark themes

Screens consume **semantic tokens**, never raw literals (raw colour is permitted only in the theme registry and chart palette). Default dark values with light-mode guidance:

| Semantic token | Dark | Light | Meaning |
| --- | --- | --- | --- |
| background | `#09111F` | `#F7F9FC` | Page |
| surface | `#111C2D` | `#FFFFFF` | Primary card |
| elevated | `#17253A` | `#EEF2F7` | Nested card / sheet |
| foreground | `#F4F7FB` | `#111827` | Primary text |
| muted | `#91A2B8` | `#526173` | Secondary text |
| border | `#26364D` | `#D7DEE8` | Dividers / outlines |
| primary | `#FDB913` | `#B77900` | Action / selected |
| verified | `#4FD1C5` | `#087F78` | Fresh / healthy |
| warning | `#F5A623` | `#9A5A00` | Stale / estimated |
| error | `#FB7185` | `#B4233C` | Failed / negative |
| inference | `#A78BFA` | `#6941C6` | Model-derived / scenario |

The theme registry provides Premium Dark, AI Futuristic, Fintech, Minimal Modern, Apple-Inspired, Luxury, Neon AI and Custom, plus Light / Dark / System mode. Switching is immediate, preserves contrast, and never requires a restart. The theme preview is an interactive sample surface — primary button, verified badge, icon, evidence card, type hierarchy and chart bars — not a static swatch list.

## Typography

Platform system sans-serif (San Francisco on Apple, Roboto on Android, system sans on web).

| Style | Size | Weight | Line height | Use |
| --- | ---: | ---: | ---: | --- |
| Display title | 32 | 800 | 38 | Screen title |
| Section title | 20 | 800 | 26 | Card / section heading |
| Card title | 16 | 800 | 21 | Entity, news, flow, strategy |
| Body | 14 | 500 | 20 | Explanations, summaries |
| Metadata | 11 | 700 | 15 | Source, time, status |
| Micro label | 9–10 | 800 | 13 | Eyebrow, score label, badge |
| Numeric metric | 24–30 | 800 | 30–34 | Quote, score, aggregate flow |

Numbers use tabular alignment. Headlines are sentence case, max four lines in a card. Long evidence text collapses behind "Show evidence".

## Spacing, grid and responsive behaviour

Base grid is 4-point: `4, 8, 12, 16, 20, 24, 32, 40`. Screen side padding is 20 on phones, 24 on wider layouts; card padding 16–18; card radius 16–18; pills 8–10; touch targets at least 44×44. Dense sections are separated by 16–24 points rather than extra borders.

Portrait phone is primary. Tablet and web widen cards into two-column research sections while preserving reading order. Bottom tabs remain on narrow screens; account and admin actions are reachable from a top-right menu or dedicated route. Horizontal rails are used only for editorial news and compact filters, never for primary research content. A compact, persistent **market-context chip** (country/market + exchange scope) precedes search, news, charts, tables, assistant context and exports, and updates immediately on market switch.

## Components

| Component | Style | Interaction |
| --- | --- | --- |
| Primary button | Gold fill, navy text, 12–14 radius | Haptic light impact; disabled keeps readable contrast |
| Secondary button | Navy surface, gold outline / muted border | Opacity feedback |
| Card | Navy surface, 1px border, 16–18 radius | Tappable cards carry a chevron affordance |
| Evidence badge | Bordered pill: Fresh / Stale / Derived / Estimated / Unavailable | Opens source and methodology |
| Score ring | Gold/teal/coral segmented ring, numeric centre | Opens weighted breakdown |
| Filter chip | Navy surface, muted text; selected gold fill, navy text | Horizontal scroll, single-line labels |
| News rail card | Kicker, headline, summary, source, time, impact | Swipe; headline opens detail |
| Data table | Strong row labels, tabular metrics, visible source column | Horizontal scroll only when necessary |
| Form field | Elevated surface, 1px border, label above, inline validation | Error text below field, never colour-only |
| Modal / bottom sheet | Elevated surface, rounded top corners, drag handle | Backdrop dismissal plus explicit close |
| Chart | Minimal grid; gold primary, teal comparison, violet estimate, muted dashed for unavailable | Tap points for period/source detail |
| Chat bubble | User right-aligned; assistant left with evidence footer | Follow-ups are pill buttons |

## Navigation

Bottom tabs for the six primary surfaces; stack routes for detail screens; sheets for lightweight context. Back is always available and never traps. Deep links resolve to the same screens.

## Motion and feedback

80–300 ms timings. Pressable cards may scale to 0.97 with reduced opacity. No bounce, no continuous shimmer. Skeletons stop at first usable response. Refresh shows a spinner and a result message. Network retries are visible — cooldown and next retry time are shown, not hidden. Reduced-motion settings are respected and never hide a state transition.

## States

- **Loading** — skeleton, never a full-screen spinner over usable content.
- **Empty** — explicit copy plus the action that fills it.
- **Error** — section/field level, names the provider, offers retry.
- **Stale** — value retained with age and source.
- **Unavailable** — states the missing capability; never a fabricated value.
- **Estimated / Derived** — violet with a methodology link.

Status is never colour alone: `Fresh` = teal + checkmark + source/time; `Delayed` = amber + clock; `Stale` = amber + age; `Unavailable` = muted/coral + info icon; `Estimated` = violet + methodology; `Derived` = violet + formula; `Blocked` = coral + retry.

## Accessibility

All interactive elements expose labels and roles. Colour is never the only signal. Dynamic text must not clip scores, currencies or status labels. Charts provide accessible summaries and tappable data points with unit, currency, period, source and freshness. Web keyboard focus visibly traverses search, market selector, filters, cards, primary actions and source links in logical order. Screen readers receive symbol, metric, freshness and action context.

## Content style

Direct language: "Fresh NSE report", "Stale by 2 days", "Derived from operating cash flow and capex", "Unavailable from configured providers". Avoid "AI says" and bare "verified". Recommendations are research signals, not promises.

## Design acceptance criteria

Every high-value screen uses semantic tokens; every market-aware screen exposes scope; every data state is understandable without a secondary screen; all gold surfaces use dark text; chart legends remain readable at 375 px width; reports match the app's evidence language; and no screen can render a fabricated value.

## Note on removed references

Earlier drafts of this brief described an installer progress surface ("ForgeShelf") and a Manus OAuth identity. Neither exists in the shipped Android app; the progress-card pattern is retained only as guidance should an installer surface ever be added.
