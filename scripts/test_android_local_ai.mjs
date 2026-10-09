import { execFileSync } from "node:child_process";

const serialIndex = process.argv.indexOf("--serial");
const serial = serialIndex >= 0 ? process.argv[serialIndex + 1] : null;
const adbArgs = serial ? ["-s", serial] : [];

function adb(args) {
  return execFileSync("adb", [...adbArgs, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function check(label, fn) {
  try { return { label, status: "pass", value: fn() }; }
  catch (error) { return { label, status: "blocked", value: error instanceof Error ? error.message : String(error) }; }
}

const checks = [];
try {
  checks.push(check("adb device connected", () => adb(["get-state"])));
  checks.push(check("arm64 ABI present", () => {
    const abi = adb(["shell", "getprop", "ro.product.cpu.abilist"]);
    if (!/(arm64-v8a|arm64)/i.test(abi)) throw new Error(`Device ABI is ${abi || "unknown"}`);
    return abi;
  }));
  checks.push(check("AnalyzerX package installed", () => adb(["shell", "pm", "path", "com.app.marketeventintelligence"])));
  checks.push({ label: "Gemma 3 1B load/stream/unload", status: "manual", value: "Run Local AI: download verified Gemma 3 1B, Load model, send a Local-mode text prompt, cancel once, unload, and confirm telemetry records success/error." });
  checks.push({ label: "Gemma 4 E2B load/stream/unload", status: "manual", value: "Run the same flow with Gemma 4 E2B and verify text plus supported multimodal input." });
} catch (error) {
  checks.push({ label: "Android smoke test availability", status: "blocked", value: error instanceof Error ? error.message : String(error) });
}

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), serial, checks, releaseDecision: checks.some((check) => check.status === "blocked") ? "blocked" : "device-manual-gates-required" }, null, 2));
