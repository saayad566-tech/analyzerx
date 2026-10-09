# EAS build and Local AI dashboard fix

## Android build diagnosis

The concrete local Gradle failure was not an unknown LiteRT-LM dependency error. Gradle reported that the Android SDK location was missing because this sandbox has no `ANDROID_HOME`/`sdk.dir`. Before reaching that environment gate, the generated `MainApplication.kt` also contained an invalid Kotlin import appended after the class. The Expo plugin has been corrected to insert both Local AI package imports inside the Kotlin import section, and a clean Expo prebuild regenerated a syntactically valid registration with LiteRT-LM dependency placement inside `dependencies {}`.

An EAS retry must use an Android SDK-equipped EAS worker and should collect the full “Run gradlew” log if it still fails. The next likely gates are the SDK/NDK versions required by LiteRT-LM and whether the native artifact can be resolved. No APK success is claimed from this sandbox.

## Lyro widget removal

Only the web-only widget integration was removed: its root-layout import and mount were deleted, and the unused `components/web-tidio-widget.tsx` file was removed. The native support screen, AnalyzerX Assistant, notification system, and all other app functionality remain intact. No Lyro/Tidio runtime reference remains in the application source.

## Local AI management dashboard

The Local AI screen now includes an explicit Assistant connection card. It shows whether a verified model is loaded for Local mode, explains the grounded-context boundary, states that Automatic mode falls back to Connected mode when native inference is unavailable, and provides a direct Open Assistant action. Existing model search, capability assessment, download/pause/resume/delete, load/unload, active-model persistence, telemetry, and truthful runtime-pending states remain available.

## Verification

TypeScript, lint, production backend build, Expo web export with 28 routes, clean Android prebuild, and mobile visual checks passed. The local Gradle attempt now reaches the environment-specific SDK-location gate. The web preview no longer mounts the removed support widget. Physical EAS/Android compilation still requires the external SDK-equipped build worker.
