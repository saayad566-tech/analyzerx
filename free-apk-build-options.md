# Free APK Build Options — Verified Findings

## Expo local production build

Expo's official local production guide states that an Android release build requires OpenJDK, a generated `android` directory (run `npx expo prebuild` when using Continuous Native Generation), an upload key, Gradle signing variables, and a local Gradle build. The guide's release command is `cd android && ./gradlew app:bundleRelease` for an Android App Bundle; an APK can be produced with the corresponding `assembleRelease` task. Source: https://docs.expo.dev/guides/local-app-production/

## EAS local build

Expo's official local-build guide documents `eas build --platform android --local`. It runs the EAS build process on the user's own machine rather than the hosted builder, but requires local authentication and Android SDK/NDK/tooling. It is therefore a no-cloud-credit option, not a zero-requirement option. Source: https://docs.expo.dev/build-reference/local-builds/

## GitHub Actions

GitHub's official billing documentation states that standard GitHub-hosted runners are free for public repositories. Private repositories receive plan-dependent free minutes; GitHub Free currently lists 2,000 minutes/month, with artifact storage limits. A public repository can therefore run a workflow that builds and uploads an APK without EAS credits, provided secrets are handled safely. Sources: https://docs.github.com/en/actions/concepts/runners/github-hosted-runners and https://docs.github.com/en/billing/concepts/product-billing/github-actions

## AnalyzerX constraints

AnalyzerX has an Expo-managed project with an optional native Local AI bridge disabled by default for stable Android builds. The latest checkpoint passed deterministic Local AI and marketplace tests, TypeScript compilation, and the production server build. No Android SDK/device is attached to the current sandbox, so a real local Gradle/EAS build cannot be executed here. Native Local AI certification remains hardware-gated.

## Recommended order

1. Have a trusted collaborator run `eas build --platform android --local` or Gradle locally on Linux/macOS with Android SDK/NDK installed.
2. If no collaborator machine is available, use a public GitHub repository with a minimal Android workflow and download the APK artifact; do not publish secrets.
3. Use a private GitHub repository only if the account has enough included Actions minutes and artifact storage.
4. Keep the native Local AI bridge disabled for the first stable APK build; certify it separately on an arm64 Android device.
