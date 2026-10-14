# Android APK signing — why builds must share one key

## The failure

Installing a new AnalyzerX build over an existing one fails with:

```
Couldn't install (-7)
Reason: Conflicting app signatures
Suggestion: Uninstall the current version of this app and install the app again.
```

This is `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. Android will only update an app in
place when the new APK is signed with the **same certificate** as the installed
one. It is not a corrupt download and not a version-code problem.

## The root cause (measured, not assumed)

The release workflow ran `keytool -genkeypair` on every build and deleted the
keystore afterwards. A generated keypair is different each time, so **every
release was signed with a brand-new certificate**. The SHA-256 of the signing
certificate across four delivered builds:

| Build | Signing certificate SHA-256 |
| --- | --- |
| 3.2.0-48 | `fb2499bb1d5db18a204545527a48c5814f3e8347453c4aa858102893cd9a0365` |
| 3.5.0-52 | `d67ce2714fecca520ea8df5506fd40af13068f7844bf1f7f2787cb54fa019378` |
| 3.6.0-54 | `1e79b6f3309d5cdf4338369e09983e965d100e5bd0216c7253cd6e69fe217202` |
| 3.7.0-56 | `71fa3b237ca0bd86c991928226225bc8911d6bdbdaff8413685df3262690269b` |

Four builds, four different keys. No AnalyzerX APK could ever upgrade another —
including 3.6.0 → 3.7.0 on the same device.

## The fix

`android/app/build.gradle` already signs the release build with the committed
`android/app/debug.keystore` (`signingConfig signingConfigs.debug`), which is a
**stable** key. The workflow was then overwriting that signature with a random
one.

The signing step now:

1. **Uses a stable release key when `ANDROID_KEYSTORE_BASE64` is set** (a
   repository secret), and
2. **Otherwise keeps Gradle's signature** from the committed keystore.

Either way the certificate is identical on every build, so upgrades work in
place. The step also prints the signer certificate (`apksigner verify
--print-certs`) so key stability is auditable in the build log.

## Current state of the published artifacts

As of build 94 (`analyzerx-3.24.0-94.apk`) the release keystore secrets are **not**
configured, so both fallbacks apply and every published APK is signed with the committed
`android/app/debug.keystore`. Inspecting the signing block of the shipped artifact
confirms this: the signer certificate subject is `CN=Android Debug, O=Android, C=US`,
and the APK carries a single `v2` block with no v3 entry and no v1 JAR signature.

This is stable — the certificate has not changed across builds 57–94, so in-place
upgrades work — but a debug key is not acceptable for public distribution, and Google
Play rejects it. Setting the secrets below is what moves the artifact to a proper
release signature.

## Using a proper release key (recommended for public distribution)

1. Create a keystore once and keep it safe — losing it means you can never update
   the app again:
   ```
   keytool -genkeypair -v -keystore analyzerx-release.keystore \
     -storepass <password> -keypass <password> \
     -alias analyzerx -keyalg RSA -keysize 4096 -validity 10000 \
     -dname "CN=AnalyzerX Release, OU=Mobile, O=AnalyzerX, L=Local, ST=Local, C=IN"
   ```
2. Base64-encode it and add these repository secrets:
   `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_PASSWORD` (optional; defaults to the store password).

Secrets are never written into the repository. Do not commit a release keystore.

## One-time step on any device that already has AnalyzerX

The certificate that signed the currently installed build is not recoverable, so
the existing install must be removed **once**:

1. Uninstall AnalyzerX (long-press the icon → Uninstall, or Settings → Apps).
2. Install the new APK.

From this build onward, every future build upgrades in place with no uninstall.

> Uninstalling clears the app's local storage, including any downloaded local-AI
> model and saved watchlists. Export anything you need first.
