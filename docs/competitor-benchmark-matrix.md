# Competitor benchmark matrix

| Capability | Screener.in evidence | Skillnet.in evidence | Current app before this upgrade | Priority | Safe implementation boundary |
|---|---|---|---|---|---|
| Long-horizon financial history | 10+ years and annual reports | Not verified on skillnet.in | Fundamental history and charts now available for public fallback series | High | Show source and period; do not fill missing history with fake points |
| Custom screening queries | Custom ratios, columns, saved screens, alerts | Not verified | Local filter chips only | High | Store user-defined rules locally; evaluate only available metrics |
| Peer comparison | Customizable peer comparison | Not verified | No dedicated peer table | High | Compare returned metrics and label missing peers |
| Watchlist/news feed | Watchlist with announcements and insider updates | Not verified | Recent searches and alerts, but no stock watchlist | High | Persist symbols locally and route to existing news/flows |
| Insider trades | Automatic insider-trade updates | Not verified | Positioning coverage contract, no reliable insider feed | Medium | Link only to official filing/source pages until structured data is connected |
| Credit ratings | Credit-rating tracking | Not verified | No dedicated rating view | Medium | Show source links/status, never infer ratings |
| Annual reports / filings | Annual reports linked to exchange documents | Not verified | Official source catalog and collector admin | High | Add official NSE/BSE/SEBI/IR entry links and freshness status |
| Volume with delivery | Volume charts with delivery percentages | Not verified | Dynamic NSE delivery route explicitly blocked | Medium | Show unavailable/blocked state until authorized endpoint exists |
| Excel/export workflows | Export and uploaded custom Excel | Not verified | No exportable research pack | Medium | Export source-backed JSON/CSV/Markdown; no fabricated Excel metrics |
| AI/narrative research | Screener AI is advertised | Not verified | Multi-tier score, storylines, news intelligence | Medium | Use existing server LLM only for explanations grounded in returned evidence |

## Prioritized build set

This phase will implement saved custom screens, peer comparison, a watchlist/research queue, official filing entry points, and source-aware export scaffolding. Delivery/delivery-percentage charts, insider/credit-rating data, and Skillnet-specific features remain explicitly unavailable until authoritative endpoints are connected.
