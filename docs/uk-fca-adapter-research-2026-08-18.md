# UK FCA NSM Adapter Research

The UK Financial Conduct Authority states that the National Storage Mechanism stores regulated announcements and disclosed documents and supports searching by company name, LEI, filing date, and document keywords. The FCA also states that the NSM is not a real-time provision of information and that issuer timeliness and accuracy remain issuer responsibilities. Therefore AnalyzerX treats FCA data as event-driven regulatory evidence, not as an exchange quote or guaranteed real-time feed.

The FCA describes three submission routes: Primary Information Providers for regulatory announcements, the Electronic Submission System for annual financial reports and other regulated information, and FCA-published prospectuses. The FCA documentation also records issuer name and LEI metadata, headline categories, related issuers, corrections, and access to original/downloadable documents. The adapter therefore requires exact issuer resolution and a validated disclosure object with id, issuer name, optional LEI, headline, filed timestamp, document URL, optional category, related issuers, and correction state.

The FCA’s structured-reporting page states that annual financial reports use structured digital reporting standards and that the NSM can expose structured reports for public viewing and download. AnalyzerX does not infer XBRL values from the FCA NSM adapter until a stable machine-readable endpoint and schema are explicitly configured.

## References

[1]: https://www.fca.org.uk/markets/primary-markets/regulatory-disclosures/national-storage-mechanism "FCA National Storage Mechanism"
[2]: https://www.fca.org.uk/markets/filing-structured-annual-financial-reports "FCA Filing of Structured Annual Financial Reports"
[3]: https://data.fca.org.uk/#/nsm/nationalstoragemanagement "FCA NSM data portal"
