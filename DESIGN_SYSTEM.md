# DESIGN_SYSTEM.md

Reuses the shipped dark market-terminal palette from `design.md` (single source of truth for tokens).

| Token | Value | Use |
|---|---|---|
| Ink | #09111F | app background |
| Panel | #111C2D | cards/sheets |
| Panel raised | #17253A | selected/focused |
| Text primary | #F4F7FB | titles, key values |
| Text secondary | #91A2B8 | metadata |
| Signal amber | #F4B860 | brand accent, scores |
| Confirmed teal | #4FD1C5 | confirmed/positive |
| Inference violet | #A78BFA | AI inference |
| Alert coral | #FB7185 | warnings/breaking |
| Divider | #26364D | borders |

Rules for new UI added this session: radii 18–22 cards / 12–14 chips; 44 px min touch targets;
every async surface ships loading / empty / error / offline / success states; market-scoped surfaces
must render the selected market's badge and an explicit notice when a market has no dataset.
