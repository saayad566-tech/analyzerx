/**
 * Security audit (Prompt 6, section 3).
 *
 * This records what was actually found in the repository, with the severity,
 * what was done about it, and what risk remains. Two findings were real and are
 * now fixed; the rest are stated as open or as controls that are in place.
 *
 * It does NOT describe the application as security-certified. No independent
 * assessment has been performed, and saying otherwise would be a claim this
 * audit cannot support.
 */

export type FindingSeverity = "high" | "medium" | "low" | "informational";
export type FindingStatus = "fixed" | "open" | "control_in_place" | "not_assessed";

export type SecurityFinding = {
  id: string;
  area: string;
  title: string;
  severity: FindingSeverity;
  status: FindingStatus;
  /** What was observed, with the file where it was observed. */
  observation: string;
  /** What was done, or what should be done. */
  remediation: string;
  /** What risk remains after the remediation. */
  residualRisk: string;
};

export const SECURITY_FINDINGS: SecurityFinding[] = [
  {
    id: "SEC-1",
    area: "Logging",
    title: "A session token prefix was written to the log",
    severity: "medium",
    status: "fixed",
    observation:
      "lib/_core/auth.ts logged the first 20 characters of the session token when storing it. A partial credential in a log is still credential material, and logs are readable on a rooted or backed-up device.",
    remediation: "The log line now states that the token is being stored without including any part of it.",
    residualRisk: "None for this line. Other logging should be reviewed whenever new credential-handling code is added.",
  },
  {
    id: "SEC-2",
    area: "API-key and credential storage",
    title: "A runner token was held in unencrypted AsyncStorage",
    severity: "medium",
    status: "fixed",
    observation:
      "lib/workstation-runner.ts stored a bearer token under analyzerx.byoh.runner.token in AsyncStorage, which is not encrypted, while the session token in lib/_core/auth.ts correctly used the platform secure store.",
    remediation:
      "The runner token now goes through the platform secure store, the same mechanism the session token uses. The non-sensitive runner URL stays in AsyncStorage, where it belongs.",
    residualRisk: "A device with an unlocked bootloader can still be attacked; the secure store raises the bar rather than removing the risk.",
  },
  {
    id: "SEC-3",
    area: "Local data protection",
    title: "Cached filings are not encrypted at rest",
    severity: "low",
    status: "open",
    observation:
      "Extracted filing text and metadata are held on the device without encryption. They are public filings rather than private user data, but they are still readable by anything with access to the app's storage.",
    remediation:
      "Encrypt the document store at rest, or reduce what is retained. Not implemented in this build.",
    residualRisk: "Low, because the content is public disclosure rather than personal data. It would rise if private notes or watchlists were stored alongside it.",
  },
  {
    id: "SEC-4",
    area: "Dependency vulnerabilities",
    title: "No dependency vulnerability scan was completed in this build",
    severity: "low",
    status: "not_assessed",
    observation:
      "A dependency audit could not be completed in the build environment, so the installed tree has not been checked against the advisory database.",
    remediation: "Run the package manager's audit in an environment with network access, and review any advisory it reports.",
    residualRisk: "Unknown until the scan runs. Not asserted to be clean.",
  },
  {
    id: "SEC-5",
    area: "API-key storage",
    title: "No API secret is embedded in the client",
    severity: "informational",
    status: "control_in_place",
    observation:
      "A source scan of lib/ and app/ found no api-key, secret or token literal in source. Sources needing a key are declared as blocked with the key named as the dependency rather than being shipped.",
    remediation: "Keep it that way: a key belongs in a user setting held by the secure store, or on a backend, never in the bundle.",
    residualRisk: "None while the control holds.",
  },
  {
    id: "SEC-6",
    area: "Network transport",
    title: "Outbound requests are constrained by a single safety layer",
    severity: "informational",
    status: "control_in_place",
    observation:
      "Every connector request goes through one fetch path: HTTPS only, approved hosts only, manual redirect handling with each hop re-checked, a timeout, a response-size ceiling and content-type validation. Loopback, private and link-local destinations are refused.",
    remediation: "Route any new outbound call through the same layer rather than calling fetch directly.",
    residualRisk: "A new call that bypasses the layer would not be covered.",
  },
  {
    id: "SEC-7",
    area: "Document parsers",
    title: "Downloaded documents are treated as untrusted input",
    severity: "informational",
    status: "control_in_place",
    observation:
      "HTML, PDF, CSV, XBRL and JSON are parsed by pure code that never executes scripts or embedded document code, with a size ceiling, a decompressed-size ceiling, and explicit warnings for malformed, truncated and encrypted content.",
    remediation: "Keep parsers pure and bounded; never add a parser that executes document content.",
    residualRisk: "A parser bug is still possible; the bounds limit its blast radius rather than eliminating it.",
  },
  {
    id: "SEC-8",
    area: "Permissions",
    title: "The app requests a single permission",
    severity: "informational",
    status: "control_in_place",
    observation: "The Android configuration declares only POST_NOTIFICATIONS. No storage, camera, location or contacts permission is requested.",
    remediation: "Add a permission only when a feature genuinely needs it, and say why.",
    residualRisk: "None while the list stays minimal.",
  },
  {
    id: "SEC-9",
    area: "WebView",
    title: "No WebView is used",
    severity: "informational",
    status: "control_in_place",
    observation: "A scan of app/, lib/ and components/ found no WebView usage, so the usual WebView attack surface is absent.",
    remediation: "If a WebView is ever added, disable JavaScript by default and restrict navigation to approved hosts.",
    residualRisk: "None while no WebView is present.",
  },
  {
    id: "SEC-10",
    area: "Crash reports",
    title: "No third-party crash reporter is bundled",
    severity: "informational",
    status: "control_in_place",
    observation: "No crash-reporting SDK is present, so no crash payload leaves the device.",
    remediation: "If one is added, scrub credentials and user data before it is sent.",
    residualRisk: "None while none is bundled.",
  },
];

export type SecurityAudit = {
  findings: SecurityFinding[];
  counts: { high: number; medium: number; low: number; informational: number; fixed: number; open: number; notAssessed: number };
  /** The one thing this audit must not claim. */
  certification: string;
  statement: string;
};

export function buildSecurityAudit(): SecurityAudit {
  const counts = {
    high: SECURITY_FINDINGS.filter((f) => f.severity === "high").length,
    medium: SECURITY_FINDINGS.filter((f) => f.severity === "medium").length,
    low: SECURITY_FINDINGS.filter((f) => f.severity === "low").length,
    informational: SECURITY_FINDINGS.filter((f) => f.severity === "informational").length,
    fixed: SECURITY_FINDINGS.filter((f) => f.status === "fixed").length,
    open: SECURITY_FINDINGS.filter((f) => f.status === "open").length,
    notAssessed: SECURITY_FINDINGS.filter((f) => f.status === "not_assessed").length,
  };
  return {
    findings: SECURITY_FINDINGS,
    counts,
    certification:
      "This application is NOT security-certified. No independent security assessment has been performed, and this audit is a self-review.",
    statement: `${SECURITY_FINDINGS.length} areas were reviewed: ${counts.high} high, ${counts.medium} medium, ${counts.low} low and ${counts.informational} informational. ${counts.fixed} finding(s) were fixed in this build, ${counts.open} remain open, and ${counts.notAssessed} could not be assessed here.`,
  };
}

export function findingsBySeverity(severity: FindingSeverity): SecurityFinding[] {
  return SECURITY_FINDINGS.filter((finding) => finding.severity === severity);
}

export function openFindings(): SecurityFinding[] {
  return SECURITY_FINDINGS.filter((finding) => finding.status === "open" || finding.status === "not_assessed");
}

/** Render the audit as plain text, for a report or a documentation screen. */
export function renderSecurityAudit(audit: SecurityAudit = buildSecurityAudit()): string {
  const lines: string[] = ["SECURITY AUDIT", "", audit.statement, "", audit.certification, ""];
  for (const finding of audit.findings) {
    lines.push(`[${finding.severity.toUpperCase()}] ${finding.id} ${finding.title} (${finding.status})`);
    lines.push(`  Area:        ${finding.area}`);
    lines.push(`  Observed:    ${finding.observation}`);
    lines.push(`  Remediation: ${finding.remediation}`);
    lines.push(`  Residual:    ${finding.residualRisk}`);
    lines.push("");
  }
  return lines.join("\n");
}
