# Alternative Build Pipeline — GitHub-free APK + EXE

A complete, GitHub-independent path for building the AnalyzerX Android APK and the Windows `.exe`
when GitHub Actions minutes run out or the sandbox pod recycles before a heavy Gradle/Electron build
finishes.

> **Read this first.** `.gitlab-ci.yml` and `.woodpecker.yml` only take effect on **GitLab** and
> **Codeberg** respectively. This repository is hosted on **GitHub**, so on their own these two files
> are inert — GitHub does not read them. They become live the moment the repo is mirrored to (or
> hosted on) one of those providers. The part that works **today, with no new account**, is the
> local / Docker path in §6 (`build.sh` + `Dockerfile.build`).

---

## 1. Provider options (no GitHub required)

| Provider | Config file | Free tier | Windows runner? | Notes |
|---|---|---|---|---|
| **GitLab CI** (gitlab.com) | `.gitlab-ci.yml` | ~400 compute-min/month | yes (self-hosted, tagged) | closest drop-in to GitHub Actions |
| **Codeberg + Woodpecker** | `.woodpecker.yml` | free for FOSS, shared agents | yes (own agent) | community-run, good for open source |
| **Self-hosted runner** | — | unlimited (your hardware) | yes | a VPS or an old PC; the reliable endgame |
| **Local / Docker** | `Dockerfile.build`, `build.sh` | unlimited | yes | build on your own machine, no CI at all |
| **Cloudflare Pages / Vercel** | provider dashboard | generous free tier | n/a | web/Electron front-ends only |

**Rule of thumb:** a hosted CI is convenient, but a **self-hosted runner or a local Docker build** is
what makes the pipeline unbreakable — no minutes, no quota, no platform build-time cap.

---

## 2. What each job does

Both CI configs mirror the GitHub workflows, but through this repo's real toolchain (**pnpm**, not
npm):

| Stage | Command |
|---|---|
| validate | `pnpm install --frozen-lockfile` → `pnpm check` (tsc) → `pnpm release:verify` |
| build:android | `cd android && ./gradlew assembleRelease --no-daemon` → `android/app/build/outputs/apk/release/*.apk` |
| build:windows | `pnpm web:bundle` → stage `dist/web` into `desktop/app` → `cd desktop && npx electron-builder --win` → `desktop/release/*.exe` |
| verify:artifacts | `python scripts/verify_artifacts.py --dir .` (non-zero size + correct magic bytes) |

The Windows job is `allow_failure` / `failure: ignore` until you register a `windows`-tagged runner,
so it never blocks the Android build.

---

## 3. GitLab CI

1. Push (or mirror) the repo to GitLab.
2. `.gitlab-ci.yml` is already at the repo root.
3. Commit and push. `validate:project` and `build:android` run immediately on shared runners.

For the `.exe`, register a runner tagged `windows` (§5). Until then `build:windows` is
`allow_failure: true`.

---

## 4. Codeberg / Woodpecker CI

1. Push the repo to Codeberg and enable Woodpecker in the repo settings.
2. `.woodpecker.yml` is already at the repo root.
3. Commit. The `validate` and `android-apk` steps run on a shared agent.

---

## 5. Self-hosted runner (the unbreakable option)

```bash
# Linux runner (Android builds)
curl -L https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh | sudo bash
sudo apt-get install -y gitlab-runner
sudo gitlab-runner register \
  --url https://gitlab.com/ --registration-token "<TOKEN>" \
  --executor docker --docker-image reactnativecommunity/react-native-android:latest \
  --description "android-builder" --tag-list android

# Windows runner (EXE builds) — install GitLab Runner for Windows, then:
gitlab-runner register --url https://gitlab.com/ --registration-token "<TOKEN>" \
  --executor shell --description "windows-builder" --tag-list windows
```

Self-hosted runners consume **no hosted minutes** and have **no platform build-time cap**.

---

## 6. Local / Docker build (works right now, no new account)

```bash
# On your own machine:
chmod +x build.sh
./build.sh                  # APK + EXE, then verifies both
./build.sh android          # APK only
./build.sh windows          # EXE only
./build.sh verify           # just re-check dist/

# Reproducible, containerised (same result everywhere):
docker build -f Dockerfile.build -t analyzerx-builder .
docker run --rm -v "$PWD":/work -w /work analyzerx-builder bash build.sh android
```

`build.sh` installs pnpm if missing, runs `pnpm install --frozen-lockfile`, then the target build,
and copies the finished APK/EXE into `dist/` before verifying them. Set `OFFLINE=1` to add
`--offline` to Gradle (only when the dependency cache is already warm).

---

## 7. Working from mobile — avoid the sandbox timeout

A phone-sized sandbox cannot compile a heavy SDK in time. **Do not compile in the sandbox.** Edit and
verify there; let CI or your own machine do the heavy build.

```bash
# In the sandbox: edit, then push. Never run the full Gradle build here.
git add -A && git commit -m "wip" && git push     # triggers GitLab/Woodpecker CI

# Check the run without a browser:
glab ci status                                    # GitLab
glab ci artifact <job> ./dist                     # fetch the artifact once green
```

If you must build in a constrained environment, keep it small and offline: `./build.sh android`.

---

## 8. Ready-to-use commands (copy-paste)

```bash
# Android APK, tuned:
cd android && ./gradlew assembleRelease --no-daemon \
  -Dorg.gradle.jvmargs="-Xmx4g -XX:MaxMetaspaceSize=1g"

# Windows EXE:
pnpm web:bundle
mkdir -p desktop/app && cp -r dist/web/. desktop/app/ && cp public/index.html desktop/app/index.html
cd desktop && npm install --no-audit --no-fund && npx electron-builder --win --publish never

# Verify the artifacts are real (magic bytes + non-zero size):
python3 scripts/verify_artifacts.py --dir .

# Lint a CI workflow before trusting it (github-actions-ci skill ships ci_lint):
python3 -m ci_lint lint --file .github/workflows/android-apk.yml
```

---

## 9. Non-negotiables

- **Raise the heap, never shrink it** — `-Xmx4g`, not `768m`.
- **Never** shrink the build or drop an architecture to fit a small sandbox — fail over to a runner
  instead.
- **Verify artifacts** (non-zero, correct magic bytes) before delivering.
- **Never claim a green build** you did not actually run.
