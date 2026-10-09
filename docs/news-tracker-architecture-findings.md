# News Tracker Architecture Findings

## Verified platform constraints

Expo BackgroundTask uses WorkManager on Android and BGTaskScheduler on iOS. Android allows a minimum periodic interval of 15 minutes, but the exact execution time depends on constraints and system scheduling. Tasks require suitable battery and network conditions and do not execute continuously. If the user force-kills the app, background tasks stop until the app is restarted; iOS app-switcher termination is especially restrictive.

Apple documents BGAppRefreshTask as a short background task for refreshing small amounts of information, including stock values. It is system-scheduled and is not a guaranteed 15-minute or 24x7 worker.

## Architecture implications

A bundled 0.5B–1B quantized model inside an Expo mobile build requires a custom native build and a supported native inference runtime such as llama.cpp, ExecuTorch, or MLC. It cannot be treated as a normal JavaScript asset for Expo Go. A model of several hundred megabytes increases APK/IPA size, memory pressure, startup time, and thermal/battery load. Running model inference inside iOS/Android background refresh windows is not reliable for continuous polling.

## Feasible options

1. Device-first best-effort: custom native Android/iOS build with a small quantized model, local SQLite, Expo background tasks, and local notifications. This provides offline extraction when the OS grants execution time, but cannot guarantee 24x7 operation or exact 15-minute cadence.

2. Always-on service with mobile client: a persistent server polls RSS/news providers, deduplicates and extracts structured JSON using a server-side model, stores events, and sends push notifications. The mobile app reads the event store and can optionally run a small bundled model for offline reclassification when opened. This provides the most reliable 24x7 tracking.

3. Hybrid: server handles always-on feed collection and alerting; the app uses a bundled model only for on-device summaries when foregrounded or when a background task is granted. This preserves the offline/local capability without making it responsible for guaranteed monitoring.

## Sources

- Expo BackgroundTask documentation: https://docs.expo.dev/versions/latest/sdk/background-task/
- Android WorkManager periodic work: https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work
- Apple BGAppRefreshTask: https://developer.apple.com/documentation/backgroundtasks/bgapprefreshtask
