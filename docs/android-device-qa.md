# AnalyzerX Android Device QA

## Preconditions

Use an authenticated Android arm64 build with the managed APK build completed and a device connected through adb. The device must have network access for Connected mode and enough storage and memory for any selected Local model.

## First-run Assistant

1. Clear AnalyzerX app data and launch the app.
2. Confirm the app opens directly into the main workflow without a blocking mode modal.
3. Confirm Auto is selected as the safe default when no runtime preference exists.
4. Open Local AI settings, choose Connected, relaunch, and confirm the choice persists.
5. Choose Local only after a verified model/runtime is available; confirm an unavailable model returns to Auto/Connected instead of blocking navigation.

## Market switching

1. Open Market & Country from Live or Account.
2. Select India, press Continue to AnalyzerX, and verify the main screen shows India exchanges/currency.
3. Repeat for US and UK.
4. From each selected market, search a market-native symbol, open analysis, news, flows, alerts, and Assistant.
5. Confirm each request carries the selected market and shows source/unavailable evidence honestly.

## Assistant and model management

1. Ask a current-market question in Connected mode and verify the response includes source/freshness context.
2. Switch to Auto and repeat; confirm Auto uses Local only when capability gates pass.
3. Attempt model load, stream, cancellation, unload, and reload on a supported device.
4. Confirm latency, battery, memory, thermal, and error samples appear in Local AI Telemetry.

## Release acceptance

No ANR, stuck screen, silent mode change, cross-market symbol contamination, or provider failure may block normal navigation. Record device model, Android version, ABI, model identifier, latency, peak memory, battery delta, thermal status, and provider/source outcomes for each run.
