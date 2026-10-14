# AnalyzerX — Assumptions

Where the master directive left something ambiguous, the safest sensible default was
chosen and is logged here rather than left implicit.

## A1 — The repository is the source of truth, not prior messages

Where a message and the code disagreed, the code won. The version is always resolved
from `package.json` and never from a remembered or quoted number.

## A2 — "Supported market" means the app has an adapter, not that the country exists

The registry holds 199 countries; the app supports 10. A country present in the
registry but without an adapter is reported `Not Implemented` with a reason. Chosen
because the alternative — implying coverage from the presence of a name — is the exact
overclaim the mandates forbid.

## A3 — Missing device signals never promote a device

`classifyDevice` treats an unreadable signal as absent, and a device with no readable
signals at all as `mid`. A single low-end signal is enough to demote. Deliberately
asymmetric: behaving modestly on a capable device is a small cost; over-committing on
a weak one is a crash.

## A4 — Model memory budget is 40% of total RAM

The remainder covers the OS, the app and the KV cache. On-device guidance is to take
the weight size and add 50-100% headroom, so a budget equal to the file size would be a
trap. 40% approximates that conservatively without reading live free memory, which is
unreliable on Android.

## A5 — One static User-Agent for Yahoo, no rotation

The Yahoo chart endpoint rejects default library agents outright. A single fixed
browser-like string is the endpoint's requirement, not evasion. Rotation and proxies
were refused — see `docs/ANALYZERX_ENGINEERING_DECISIONS.md`, D1.

## A6 — Exchange holidays are not modelled

A holiday renders as a normal trading day. Modelling them needs a maintained per-exchange
calendar; a guessed one would be worse than a documented gap.

## A7 — Licensed data is labelled, never approximated

Real-time quotes are licensed in every market. The app shows delayed data labelled as
delayed and shows nothing where a category is licensed, rather than substituting another
market's figures.

## A8 — No hosted authentication without a decision

A real sign-up/OTP/social flow needs a backend and provider credentials — paid and
networked, against the zero-cost/offline constraint. The per-user-and-market scoping was
built; the hosted half waits on the user's decision.

## A9 — Documentation supports implementation, never replaces it

Ledgers are updated only where reality changed. A docs-only commit is stated as such and
does not invalidate an APK.

## A10 — Unverifiable claims are not made

No device, emulator or Android toolchain is available here. Every UI claim is marked
unverified on hardware, and no benchmark or test result is reported that was not run.
