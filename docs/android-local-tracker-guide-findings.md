# Android Continuous Tracker Guide: Verified Findings

## Decision

The attached guide describes a **custom native Android foreground-service architecture**, not a feature that can be added to the current Expo web/Expo Go runtime by changing JavaScript alone. The existing product should retain the server-first tracker as its reliability path. A device-side tracker can be offered later as an Android-only, user-initiated best-effort mode in a custom development/production build.

## Verified constraints

Android 14 requires foreground services to declare an appropriate service type and matching foreground-service permission. Android documents `dataSync` for data upload/download, fetch, local file processing, and cloud transfer; `specialUse` is intended only for use cases not covered by the defined types and is subject to additional policy review [1]. The guide's `specialUse` choice therefore should not be copied automatically for stock-news polling; `dataSync` or a user-visible alternative must be evaluated against the final implementation.

Android Doze suspends or defers network and CPU-intensive background work, ignores wake locks while the device is in Doze, and recommends Firebase Cloud Messaging for real-time downstream messages rather than maintaining a persistent network connection [2]. Battery-optimization exemption is not a universal guarantee and Google Play restricts direct exemption requests unless the app's core function is adversely affected [2]. The guide's permanent wake lock and automatic battery-whitelist request are therefore high-risk defaults and should be opt-in, justified, and accompanied by thermal/battery safeguards.

Expo supports custom native code through development builds, local Expo modules, and config plugins. Expo Go cannot load arbitrary custom native libraries; a custom native module requires a development or production build [3]. Expo's Continuous Native Generation workflow applies native configuration through app config and config plugins rather than editing generated Android files directly [4].

## Safe implementation boundary

The current server tracker remains the source of truth for continuous polling, deduplication, extraction, persistence, and push delivery. The mobile app can expose a clearly labelled Android-only **Device Assist** mode in a future custom build. That mode must be user-started, visibly show an ongoing notification, stop cleanly, respect thermal thresholds, avoid automatic battery-exemption requests, and fall back to server polling whenever the device service is unavailable. It must never claim guaranteed 24x7 operation or require a bundled 600–800 MB model before the native inference path is actually compiled and tested.

## References

[1]: https://developer.android.com/about/versions/14/changes/fgs-types-required "Android Developers: Foreground service types are required"
[2]: https://developer.android.com/training/monitoring-device-state/doze-standby "Android Developers: Optimize for Doze and App Standby"
[3]: https://docs.expo.dev/workflow/customizing/ "Expo Documentation: Add custom native code"
[4]: https://docs.expo.dev/workflow/continuous-native-generation/ "Expo Documentation: Continuous Native Generation"
