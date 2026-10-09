# Live FII/DII history source observation

Observed on 2026-08-17 from `https://fii-diidata.mrchartist.com/api/history` using a passive GET request. The endpoint returned dated historical records, including fields such as `date`, `fii_buy`, `fii_sell`, `fii_net`, `dii_buy`, `dii_sell`, and `dii_net`. Sample records included 30-Jul-2026 and 29-Jul-2026. The source also returned additional options-position fields, but this change uses only the verified FII/DII buy, sell, and net fields.

The prior adapter treated an array payload as one latest record via `getRecord`, which caused all UI ranges to display the same snapshot. The new adapter parses the full array, aggregates available sessions for the selected range, and calculates prior-comparable-period changes without fabricating missing values. If history is unavailable, it explicitly labels the result as a latest-session fallback.

Source URL: https://fii-diidata.mrchartist.com/api/history
