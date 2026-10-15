import Constants from "@/lib/platform/constants";

export type AnalyzerXReleaseInfo = {
  version: string;
  androidVersionCode: number | null;
  iosBuildNumber: string;
  sourceRevision: string;
  manifestVersion: number;
};

const configured = (
  Constants.expoConfig?.extra as
    | { analyzerxRelease?: Partial<AnalyzerXReleaseInfo> }
    | undefined
)?.analyzerxRelease;

export const analyzerXReleaseInfo: AnalyzerXReleaseInfo = {
  version: configured?.version ?? Constants.expoConfig?.version ?? "unknown",
  androidVersionCode:
    typeof configured?.androidVersionCode === "number"
      ? configured.androidVersionCode
      : (Constants.expoConfig?.android?.versionCode ?? null),
  iosBuildNumber:
    configured?.iosBuildNumber ??
    Constants.expoConfig?.ios?.buildNumber ??
    "unknown",
  sourceRevision: configured?.sourceRevision ?? "unverified-build",
  manifestVersion: configured?.manifestVersion ?? 0,
};

export function releaseIdentityLabel(
  info: AnalyzerXReleaseInfo = analyzerXReleaseInfo,
) {
  const code =
    info.androidVersionCode === null
      ? ""
      : ` · code ${info.androidVersionCode}`;
  return `AnalyzerX ${info.version}${code}`;
}

export function isVerifiedRelease(
  info: AnalyzerXReleaseInfo = analyzerXReleaseInfo,
) {
  return (
    info.manifestVersion === 1 &&
    info.sourceRevision !== "unverified-build" &&
    info.sourceRevision.length >= 7
  );
}
