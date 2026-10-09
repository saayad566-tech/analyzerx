# Official downloadable-file validation — 2026-08-18

## NSE FII/FPI + DII

The official NSE FII/DII page visibly exposes two CSV download entries: NSE capital-market FII/FPI + DII activity and combined NSE/BSE/MSEI capital-market activity. The page was accessible for content extraction but blocked by a CAPTCHA for direct interactive inspection, so exact CSV URLs and column headers must not be guessed. The collector should resolve download links from the authorized page response when available, retain the raw bytes and link, and return an explicit blocked/unavailable state when the page is protected.

Source: https://www.nseindia.com/reports/fii-dii

## NSDL fortnightly sector-wise FPI

The official NSDL selector lists period-end reports such as JUL 31, 2026, JUL 15, 2026, and earlier periods. Selecting a period opens a report with a stable HTML path pattern like `https://www.fpi.nsdl.co.in/web/StaticReports/Fortnightly_Sector_wise_FII_Investment_Data/FIIInvestSector_Jul312026.html`.

The validated report includes sector rows and columns for AUC as of the prior period, net investment for each half-month, and AUC as of the selected period. Reported units include INR crore and USD million. It covers Equity, Debt General Limit, Debt VRR, Debt-FAR, Mutual Funds, and related categories. It states that NSDL relies on BSE’s common industry classification and classifies issuers outside the covered universe under Others. The report is periodic and is not an intraday FII/DII feed; it does not provide DII sector flows.

Source: https://www.fpi.nsdl.co.in/web/Reports/FPI_Fortnightly_Selection.aspx
Example report: https://www.fpi.nsdl.co.in/web/StaticReports/Fortnightly_Sector_wise_FII_Investment_Data/FIIInvestSector_Jul312026.html

## Implementation constraint

Only the NSDL report’s validated structure is safe to parse directly at this stage. NSE CSV and AMFI file URLs must be resolved from the official page/download response rather than guessed or hard-coded. Any unavailable, protected, malformed, stale, or schema-changing response remains explicitly unavailable and must not be converted into fixture scores.

## AMFI portfolio disclosure

The official AMFI Portfolio Disclosure page exposes three disclosure types: Fortnightly Portfolio Disclosure, Monthly Portfolio Disclosure, and Half Yearly Portfolio Disclosure. The page uses a dynamic selector, so the parser must resolve the selected disclosure’s actual downloadable assets from the page/application response instead of guessing file URLs. Holdings must be stored with disclosure type, period, AMC/scheme, security identifier/name, units/value/weight when present, retrieval timestamp, and a change-detection basis. AMFI disclosure is periodic holdings evidence, not a real-time mutual-fund transaction feed.

Source: https://www.amfiindia.com/online-center/portfolio-disclosure

## Additional BSE validation

On 2026-08-18, the official BSE corporate announcements and corporate-actions pages were reachable as public web pages, but extraction returned only a generic BSE shell and the browser rendered a blank dynamic surface. No stable public JSON/CSV/XLSX schema or documented machine-readable endpoint was verified from the public page. AnalyzerX should keep BSE as a catalogued page-snapshot/transport-limited source until a compliant endpoint and schema can be validated; it must not infer or scrape hidden endpoints, bypass WAF/CAPTCHA, or mark unvalidated responses as verified evidence.

Sources: https://www.bseindia.com/corporates/ann.html and https://www.bseindia.com/corporates/corporates_act
