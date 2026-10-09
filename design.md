# Market Event Intelligence — Mobile Interface Design

## Product direction

Market Event Intelligence is a focused iOS-style intelligence workspace for investors who need to understand **what happened, who is connected, what happened before or after, and whether several announcements form a larger business chain**. It is not a chronological news feed. The primary interaction is moving from a high-signal event into its connected storyline and relationship graph.

The initial experience is optimized for **portrait orientation and one-handed use**. The interface uses short information blocks, strong hierarchy, generous touch targets, and bottom-sheet patterns for filters and event details.

## Screen list

| Screen | Primary content and functionality |
|---|---|
| Live Events | A real-time stream of extracted events grouped by time, with intelligence score, event type, entities, value, confidence, source, and a clear “confirmed” versus “inferred” distinction. |
| Breaking Events | A compact high-priority queue for newly detected events with strong market relevance, including impact badges and quick access to storylines. |
| Company Timeline | A searchable company-specific timeline showing preceding and following events, relationships, orders, investments, and capacity changes. |
| Event Storylines | Grouped event chains such as partnership → order → capacity expansion → supplier benefit, with a chronological sequence and relationship summary. |
| Relationship Graph | A touch-friendly graph view showing Company → Event → Company → Order → Supplier → Project → Sector, with confirmed facts and AI inference visually separated. |
| Sector Intelligence | Sector-level patterns, active storylines, beneficiary clusters, and concentration of event activity. |
| Search | Search by company name, NSE/BSE symbol, project, contract, sector, event type, or relationship phrase. |
| Advanced Filters | Bottom sheet for company, symbol, sector, event type, market cap, value, time window, sentiment, confidence, and source. |
| Event Details | Full extraction record, source link, confidence, market relevance, intelligence score, connected entities, and previous/next events. |
| Alerts | Saved natural-language monitoring queries, such as large-cap company → major order → small-cap company, with delivery status and pause controls. |

## Key user flows

### Discover a developing business chain

1. User opens Live Events and sees a time-grouped stream.
2. User taps a high-signal order event.
3. Event Details opens with the exact timestamp, value, source, confidence, and relevance explanation.
4. User taps “View storyline” to see earlier partnership context and later capacity expansion.
5. User switches to the Relationship Graph to inspect connected suppliers, customers, projects, and sectors.

### Find a company relationship

1. User taps Search from the navigation or header.
2. User enters a company, symbol, project, or relationship phrase.
3. Results are grouped into Events, Storylines, and Companies.
4. User opens a Company Timeline and moves backward or forward across the selected relationship window.

### Create an alert

1. User opens Alerts and taps “New alert”.
2. User chooses or edits a natural-language rule.
3. The rule preview highlights entity type, order threshold, market-cap relationship, and source scope.
4. User saves the alert and can pause, edit, or delete it later.

## Information architecture

The bottom tab bar contains **Live**, **Storylines**, **Graph**, **Sectors**, and **Alerts**. Search is available from the Live header and the dedicated search affordance in the tab screens. Event Details, Company Timeline, Advanced Filters, and alert creation are stack routes or modal sheets.

Cards should never bury the event chain. The most important visual order is: exact time, event type, connected entities, value or project, score/confidence, then source and explanation. Every relationship card must label factual evidence separately from model inference.

## Color choices

The visual language is a dark market-terminal palette with a warm signal accent:

| Token | Color | Purpose |
|---|---|---|
| Ink | `#09111F` | App background and navigation chrome. |
| Panel | `#111C2D` | Elevated cards, sheets, and graph canvas. |
| Panel raised | `#17253A` | Selected cards and focused graph nodes. |
| Text primary | `#F4F7FB` | Main titles and key values. |
| Text secondary | `#91A2B8` | Supporting metadata and source labels. |
| Signal amber | `#F4B860` | Main brand accent, intelligence score, selected state, and high-signal markers. |
| Confirmed teal | `#4FD1C5` | Confirmed factual relationships and positive state. |
| Inference violet | `#A78BFA` | AI inference, likely linkage, and model-generated context. |
| Alert coral | `#FB7185` | Breaking events, warnings, and high-priority alerts. |
| Divider | `#26364D` | Subtle borders and timeline separators. |

The app should feel like a first-party iOS utility rather than a trading chart. Use rounded 18–22 px cards, 12–14 px chips, subtle borders, and restrained shadows. Avoid red/green price-market conventions except when expressing sentiment or alert urgency.
