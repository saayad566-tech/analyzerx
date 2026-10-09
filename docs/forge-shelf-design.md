# ForgeShelf Marketplace Design

## Product promise

**ForgeShelf** is AnalyzerX’s open-source local AI capability store. Every listing explains what it does, where it came from, what hardware it needs, what permissions it requests, and whether it is actually installable on the current device. The primary action is always functional: **Install**, **Use**, **Update**, **Pause**, **Remove**, or **View requirements**—never a decorative catalog button.

## Screens and navigation

| Screen | Purpose | Primary actions |
|---|---|---|
| ForgeShelf Home | Discover recommended tools and models for the current device | Search, category filter, open details, install |
| Tool Details | Explain capability, source, license, size, checksum, hardware fit, permissions, changelog, and AnalyzerX destinations | Install, use now, update, remove, report issue |
| Installed | Manage installed models/tools and active runtime | Launch, switch active model, update, pause, remove |
| Downloads | Show install/update progress, checksum verification, failures, retry, and rollback | Pause, resume, retry, cancel, inspect log |
| Hardware Fit | Show detected platform/ABI/RAM/storage/backend and why a tool is recommended/reduced/unsupported | Refresh hardware profile, pair desktop host |
| Model Manager | Filter Local AI models by size, capability, quantization, and device fit | Download, select active model, unload, delete |
| Settings | Configure Wi-Fi-only downloads, automatic updates, storage cap, telemetry, and source policy | Save policy, clear cache, export audit |

## Home information architecture

The top area shows the ForgeShelf identity, a device-fit chip, and a search box. The first shelf is “Recommended for this device,” followed by “Local chat models,” “News and finance tools,” “Developer utilities,” “Installed,” and “Updates available.” Each card shows the tool name, capability, size, license, runtime, compatibility badge, install state, and one primary action.

## Tool lifecycle states

A tool must move through explicit states: `not-installed`, `queued`, `downloading`, `verifying`, `installed`, `active`, `update-available`, `updating`, `paused`, `failed`, `unsupported`, and `removed`. A failed or unsupported state must include a human-readable reason and a recovery action. Installed artifacts must be checksum-verified before activation. If activation fails, the previous active version remains available.

## Main flow: discover to use

The user opens ForgeShelf, searches or chooses a category, opens a detail page, reviews source/license/compatibility, and taps Install. The app checks storage, platform, ABI, backend, model size, license policy, and whether a local host bridge is available. If the artifact is installable, a download task begins and appears in Downloads. After checksum verification, the tool is registered in Installed. For Assistant-capable models, the user can tap Use now, which opens Local AI with the model selected; for analysis tools, Use now opens the relevant AnalyzerX screen.

## Main flow: model switching

The user opens Installed or Model Manager, selects a downloaded model, sees capability and resource impact, and taps Set active. AnalyzerX unloads the current model if required, loads the selected model through the existing Local AI adapter, records the active model preference, and returns a clear success or unavailable state. A failed load never erases the previous working model.

## Main flow: updates and removal

Updates available appears as a first-class shelf and in Installed. The user can update one tool or all compatible tools, subject to Wi-Fi/storage policy. Each update shows a changelog and size before download. Removal requires confirmation and explains that local cached files and telemetry may be deleted separately. Removing the active model automatically falls back to Auto/Connected mode and keeps the Assistant usable.

## Name and visual direction

ForgeShelf uses AnalyzerX’s existing navy, teal, and gold terminal aesthetic, with a storefront metaphor kept subtle: shelves, package chips, a download tray, and a verified shield. It should feel like a professional tool registry rather than a consumer entertainment store. Avoid claiming “open source” for an artifact unless its repository, license, and redistribution policy are explicitly recorded.
