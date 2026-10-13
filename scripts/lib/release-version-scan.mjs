/*
 * Finds release-version literals in a text file (a CI workflow, typically).
 *
 * A naive "any x.y.z" scan produces false positives on unrelated numbers such as
 * the pnpm version (9.12.0) or the Android build-tools version (36.0.0). This
 * helper only matches a version that appears in a release-identity context:
 *
 *   v3.2.0              a version tag
 *   apk-3.2.0-45        a release asset tag
 *   analyzerx-3.2.0.apk an artifact name
 *   AnalyzerX 3.2.0     a release title / keystore distinguished name
 *
 * @param {string} text
 * @returns {string[]} the version strings found, in order, de-duplicated
 */

const PATTERNS = [
  /\bv(\d+\.\d+\.\d+)\b/g,
  /\bapk-(\d+\.\d+\.\d+)\b/g,
  /\banalyzerx-(\d+\.\d+\.\d+)\b/gi,
  /\bAnalyzerX\s+(\d+\.\d+\.\d+)\b/g,
];

export function findReleaseVersionLiterals(text) {
  const found = new Set();
  for (const pattern of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      found.add(match[1]);
    }
  }
  return [...found];
}
