# AnalyzerX UI/UX Design Brief

## Product mood

AnalyzerX should feel like a premium AI market-intelligence terminal: calm enough for long research sessions, expressive enough to make advanced AI capabilities legible, and structured enough that a user can move from discovery to evidence to action without losing context. The visual system uses dark navy or clean light surfaces, restrained gradients, precise borders, strong typography hierarchy, and selective gold for premium and high-priority states.

## Theme architecture

The Appearance screen is the single control surface for Premium Dark, AI Futuristic, Fintech, Minimal Modern, Apple-Inspired, Luxury, Neon AI, and Custom themes. Each theme is represented by centralized semantic tokens rather than screen-specific colors. Users can choose System, Light, or Dark mode where a theme provides both palettes. Theme changes persist locally and apply immediately through the global provider. Custom colors are limited to primary, background, text, and derived accent roles so the interface remains coherent.

The gold system is reserved for active states, primary actions, premium badges, important AI highlights, and selected chart emphasis. The canonical gold tokens are Primary `#FFD700`, Bright `#FFEA70`, Deep `#D4AF37`, and Highlight `#FFF4A3`. Dark text is used on gold controls, and light text is not placed on yellow surfaces.

## Navigation map

| Area | Primary screens | Main user path |
|---|---|---|
| Discover | Live, Stories, Graph, Sectors | Search symbol → inspect event → open timeline, graph, or source |
| Research | Flows, Screener, Research Workspace | Choose universe → filter → inspect evidence → save or export |
| Assistant | Assistant, Local AI, Telemetry | Ask question → choose engine → load model → inspect grounded response |
| Account | Account, Appearance, Support, Source preferences | Open account → manage theme, privacy, provider context, and support |

The mobile Account screen acts as the sidebar-style management hub. It preserves existing research, alert, source, support, and privacy routes while adding direct access to Appearance, Local AI models, Assistant, and the complete workspace.

## Appearance flow

The user opens Account → Appearance. The screen shows mode controls, theme cards with swatches and mood labels, and a live preview language that explains what changes. Selecting a theme applies immediately; selecting Custom exposes hex inputs and an Apply action. The page includes component samples for buttons, cards, typography, icons, chart accents, selected states, and input surfaces.

## Local AI management flow

The user opens Account → Local AI models. The dashboard shows device capability, native bridge status, the active Assistant connection, telemetry, and all model families. Downloaded models appear in the Active Local Model dropdown. Selecting another downloaded model unloads the previous runtime through the existing lifecycle manager, loads the new model, updates persisted active-model state, and exposes it to Assistant Local/Auto routing. Runtime-pending models remain visible for transparency but cannot be loaded.

## Data-source boundary

Theme changes, sidebar navigation, and local model management are presentation and device-preference layers. They do not alter provider adapters, source precedence, API credentials, grounded evidence retrieval, freshness calculations, scoring, or report generation. The Assistant continues to use the existing grounded-context route before local generation and retains Connected fallback behavior.
