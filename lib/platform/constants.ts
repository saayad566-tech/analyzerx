/**
 * Build-time constants.
 *
 * The previous implementation read these from the Expo runtime config. They are now a plain module
 * whose values mirror `app.config.ts`, so the release identity is still verifiable from the app
 * without a framework runtime. Keep these in step with `app.config.ts`.
 */
export type ReleaseExtra = {
  analyzerxRelease: {
    version: string;
    androidVersionCode: number;
    iosBuildNumber: string;
    sourceRevision: string;
    manifestVersion: number;
  };
};

const RELEASE: ReleaseExtra = {
  analyzerxRelease: {
    version: "3.2.0",
    androidVersionCode: 3200,
    iosBuildNumber: "1400",
    sourceRevision: process.env.ANALYZERX_SOURCE_REVISION ?? "unverified-build",
    manifestVersion: 1,
  },
};

const Constants = {
  expoConfig: {
    version: RELEASE.analyzerxRelease.version,
    extra: RELEASE as ReleaseExtra & { eas?: { projectId?: string } },
    android: { versionCode: RELEASE.analyzerxRelease.androidVersionCode },
    ios: { buildNumber: RELEASE.analyzerxRelease.iosBuildNumber },
  },
  // No Expo project id exists off the Expo runtime; push registration uses the app's own FCM path.
  easConfig: undefined as { projectId?: string } | undefined,
};

export default Constants;
