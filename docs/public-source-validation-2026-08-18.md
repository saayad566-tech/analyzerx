# Public Source Validation — 18 Aug 2026

## NSE FII/FPI and DII

Source: https://www.nseindia.com/reports/fii-dii

The official NSE page exposes two public CSV download controls and tables: NSE capital-market segment activity, and combined NSE/BSE/MSEI activity. The visible fields are category, date, buy value, sell value, and net value. The page states that the data is provisional, may change after custodial confirmation, and that final FII/FPI data should be obtained from NSDL or CDSL. The page does not expose stock-level or sector-level FII/DII attribution in the visible report.

## AMFI portfolio disclosure

Source: https://www.amfiindia.com/online-center/portfolio-disclosure

AMFI provides an official Portfolio Disclosure page with a disclosure-type selector. This is an authorized public source for mutual-fund portfolio disclosure, but the rendered page does not expose the files until a disclosure type is selected. The implementation should treat it as a monthly/periodic holdings source, not real-time flow data, and must record the disclosure period and retrieval time.

## Product implication

AnalyzerX can reliably use NSE for aggregate daily FII/FPI and DII totals, NSDL/CDSL for final FPI data, and AMFI/AMC disclosure files for periodic mutual-fund holdings. It must not claim live sector-wise FII/DII or intraday mutual-fund flows unless an authorized source explicitly provides those fields. Sector exposure can be derived only from dated holdings records with transparent classification and a Derived basis label.

## NSDL FPI reports

Source: https://www.fpi.nsdl.co.in/Reports/ReportsListing.aspx

NSDL’s public report index lists Latest, Current Month, Archive, calendar-year and financial-year FPI details, quarterly net investment details, and a dedicated Fortnightly Sector-wise FPI Investment Data report. It also lists trade-wise equity data and other FPI reports. This is the strongest authorized public route found for sector-wise foreign portfolio investment data. It does not by itself provide DII sector-wise flows or real-time mutual-fund buying.

## Updated coverage decision

Use NSE aggregate FII/FPI and DII CSV data for daily market-wide flows; use NSDL final and fortnightly sector-wise FPI reports for sector attribution; use AMFI and AMC portfolio disclosures for periodic mutual-fund holdings. Keep DII sector-wise and intraday mutual-fund flow fields unavailable unless another authorized source explicitly supplies them.

## PDF template verification finding

Visual inspection of the upgraded Tata Motors PDF showed a strong first page but blank subsequent pages except for the repeated header/footer. The likely cause is cursor drift during `pageAdded` header/footer rendering: the footer text call updates the live PDF cursor, so later section content starts near the page bottom and overflows into mostly empty pages. The renderer must preserve and restore the cursor position when painting page chrome.

## PDF layout pass two

After compacting the first-page coverage grid, the report dropped from nine pages to six pages and passed deterministic PDF verification. The remaining visual issues are layout-density problems rather than export failures: the financial-metrics heading inherits the x-position of the last chart block, and the valuation/scenario continuation begins too far to the right because the cursor is not reset before flowing text after fixed-position cards.

## Attached Multibagger Thesis PDF visual verification

The upgraded report exports successfully as an eight-page A4 PDF. Pages 1–3 preserve the existing AnalyzerX navy/gold cover, scorecards, business profile, charts, and financial metrics. The layout is readable and source-aware; unavailable values remain visibly labeled. The new thesis pages were added after the existing financial section and require separate inspection for score breakdown and pathway text.

## Multibagger-framework public sources

The attached framework can be grounded through official or public sources without adding user credentials. SEC EDGAR APIs provide structured company facts and filing data for U.S. issuers [SEC EDGAR API](https://www.sec.gov/search-filings/edgar-application-programming-interfaces). NSE corporate-filings pages expose official Indian announcements, shareholding patterns, results, actions, and related filings [NSE filings](https://www.nseindia.com/companies-listing/corporate-filings-application) [NSE shareholding](https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern). SEBI’s corporate-filings reference page links official exchange filing sources [SEBI corporate filings](https://www.sebi.gov.in/curation/corporate_filings.html). AMFI provides portfolio disclosures and Indian mutual-fund research information [AMFI portfolio disclosure](https://www.amfiindia.com/online-center/portfolio-disclosure) [AMFI research](https://www.amfiindia.com/research-information). These sources support filings, ownership, cash-flow/accounting evidence, catalysts, and fund holdings, but they do not guarantee complete live customer concentration, TAM, moat, management credibility, or intraday institutional-flow data; those fields remain explicitly unavailable or require dated company disclosures.
