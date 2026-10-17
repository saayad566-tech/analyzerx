# DESIGN_SYSTEM.md

The interface language, and the single place a colour, gap, radius or type decision is made.

## Where it lives

| Concern | File |
|---|---|
| The token language (colour, space, radius, type, elevation, motion) | `lib/design/tokens.ts` |
| The component kit built from those tokens | `components/ui/premium.tsx` |
| The Tailwind/CSS-var bridge (legacy class-based surfaces) | `theme.config.js`, `tailwind.config.js` |
| The product palette rationale (older doc, still the source for hue intent) | `design.md` |

`lib/design/tokens.ts` is authoritative. Screens read **semantic roles** (`color.accent`,
`color.surface`, `space.lg`) — never a raw hex, and never `palette` directly.

## The visual language

A deep, near-black "ink" field. Panels are separated by **tone**, not by a heavy stroke: on a canvas
this dark a shadow reads as mud, so a surface step plus a hairline reads as raised. One warm **signal**
accent is reserved for the single primary action on a screen; everything else earns colour by meaning.

### Colour roles

| Role | Value | Meaning |
|---|---|---|
| `canvas` / `canvasRaised` | `#070A10` / `#0A0E16` | app field, chrome |
| `surface` / `surfaceRaised` / `surfaceHigh` | `#121A28` / `#172134` / `#1D2A41` | the elevation ladder |
| `text` / `textMuted` / `textFaint` | `#F5F8FC` / `#9AA9BE` / `#6C7C93` | primary, secondary, tertiary |
| `accent` | `#FF6B35` | the one primary action per screen |
| `score` | `#F4B860` | intelligence scores, high-signal markers |
| `confirmed` | `#4FD1C5` | confirmed facts, positive |
| `inference` | `#A78BFA` | AI inference / model-generated |
| `alert` | `#FB7185` | warnings, breaking, negative |
| `info` | `#5EA9FF` | informational |
| `border` / `borderStrong` | `#222F45` / `#2E3D57` | hairlines |

The **confirmed vs inference** split is load-bearing: factual evidence is teal, model output is violet,
and a surface must never blur the two.

### Type

A real ramp, not ad-hoc sizes. `display` (34) is reserved for the one headline figure per screen;
`figure` (24) uses **tabular figures** so numbers do not jitter as they update; then `title`, `body`,
`label`, `caption`, `micro`, `eyebrow`.

### Space, radius, elevation, motion

A 4-pt spacing scale (`space.xxs`…`space.huge`); radii from `xs` (8) to `pill`; four elevation levels
(`flat`, `card`, `raised`, `high`) expressed as tone + hairline; motion durations from `instant` (90 ms)
to `slow` (320 ms) with a shared `pressOpacity` (0.72).

## The component kit

`components/ui/premium.tsx` exports `Surface`, `SectionHeader`, `Stat`, `Pill`, `Meter`, `Sparkline`,
`PrimaryAction`, `EmptyState` and `Divider`. Rules:

- One `PrimaryAction variant="solid"` per view — the accent is not decorative.
- Every async surface ships **loading / empty / error / unavailable** states; `EmptyState` is the
  honest one and never stands in for a fabricated row.
- Market-scoped surfaces render the selected market's badge and an explicit notice when a market has
  no dataset.
- Minimum 44 px touch targets; `accessibilityRole`/`accessibilityLabel` on every control.

## Adoption status

The shell (tab bar) and the Sectors screen are rebuilt on the tokens and kit and act as the reference.
The remaining screens still carry their original inline palette and migrate opportunistically — the
tokens and kit are additive, so an unmigrated screen keeps working and can be moved one at a time.

## Desktop (Windows EXE) surface

The web/desktop build renders the same components through `react-native-web`. Colour and type tokens
are plain values (no native dependency), so the language is identical on Android, web and the desktop
shell. See `desktop/` and `.github/workflows/desktop-exe.yml`.
