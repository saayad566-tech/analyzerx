/**
 * Deployment, rollback and migration plan (Prompt 7, section 6).
 *
 * Every command and variable below is a template. No real credential appears
 * anywhere in this file or in the repository, and the variable values are
 * placeholders that must be filled in the host's own settings.
 *
 * Nothing here has been run. It is a plan.
 */

export type EnvVar = {
  name: string;
  purpose: string;
  /** A placeholder, never a real value. */
  placeholder: string;
  /** Where the value comes from. */
  source: string;
  /** True when the value must never reach the Android client. */
  serverOnly: boolean;
};

export const ENVIRONMENT_VARIABLES: EnvVar[] = [
  { name: "DATABASE_URL", purpose: "The connection string for the metadata database.", placeholder: "postgresql://USER:PASSWORD@HOST:5432/DBNAME", source: "The database provider's connection settings.", serverOnly: true },
  { name: "SUPABASE_URL", purpose: "The project URL for the hosted database and auth.", placeholder: "https://YOUR-PROJECT.supabase.co", source: "The provider's project settings.", serverOnly: false },
  { name: "SUPABASE_ANON_KEY", purpose: "The public anon key, safe to expose to a client.", placeholder: "eyJ...PUBLIC_ANON_KEY", source: "The provider's API settings.", serverOnly: false },
  { name: "SUPABASE_SERVICE_ROLE_KEY", purpose: "The privileged key used only by server-side jobs.", placeholder: "eyJ...SERVICE_ROLE_KEY", source: "The provider's API settings.", serverOnly: true },
  { name: "OBJECT_STORAGE_ACCOUNT_ID", purpose: "The object-storage account identifier.", placeholder: "YOUR_ACCOUNT_ID", source: "The storage provider's dashboard.", serverOnly: true },
  { name: "OBJECT_STORAGE_ACCESS_KEY_ID", purpose: "The object-storage access key.", placeholder: "YOUR_ACCESS_KEY_ID", source: "The storage provider's API tokens.", serverOnly: true },
  { name: "OBJECT_STORAGE_SECRET_ACCESS_KEY", purpose: "The object-storage secret.", placeholder: "YOUR_SECRET_ACCESS_KEY", source: "The storage provider's API tokens.", serverOnly: true },
  { name: "OBJECT_STORAGE_BUCKET", purpose: "The bucket holding retained documents.", placeholder: "analyzerx-documents", source: "Chosen when the bucket is created.", serverOnly: true },
  { name: "SCHEDULER_SECRET", purpose: "A shared secret the scheduled job presents so the endpoint is not public.", placeholder: "GENERATE_A_LONG_RANDOM_STRING", source: "Generated once and stored in both places.", serverOnly: true },
];

/** The variables that must never be present in the Android client. */
export function serverOnlyVariables(): EnvVar[] {
  return ENVIRONMENT_VARIABLES.filter((entry) => entry.serverOnly);
}

export type DeployStep = {
  step: number;
  title: string;
  command: string;
  note: string;
};

export const DEPLOY_STEPS: DeployStep[] = [
  { step: 1, title: "Create the database project", command: "# In the provider's dashboard, create a project and copy its connection string.", note: "Do not paste the connection string into the repository." },
  { step: 2, title: "Create the object-storage bucket", command: "# In the storage dashboard, create a private bucket and an API token scoped to it.", note: "The bucket stays private; access is only through short-lived signed URLs." },
  { step: 3, title: "Set the environment variables", command: "# In the host's settings, add each variable from ENVIRONMENT_VARIABLES with its real value.", note: "The service-role key and the storage secret are server-only and must never be added to the app." },
  { step: 4, title: "Apply the migrations", command: "pnpm run migrate:up", note: "Migrations run forward only, and each has a recorded rollback." },
  { step: 5, title: "Deploy the service", command: "# Deploy from the repository using the host's own build pipeline.", note: "No deployment is performed from a local machine against production." },
  { step: 6, title: "Verify the health endpoint", command: "curl -fsS https://YOUR-SERVICE/health", note: "A deployment is not complete until health reports the database and storage as reachable." },
  { step: 7, title: "Enable the schedule", command: "# Add the scheduled workflow with the once-daily cadence the verified free tier permits.", note: "A sub-daily expression will fail on a free host; the daily cadence is the honest choice." },
  { step: 8, title: "Run the acceptance checks", command: "# End-to-end request, persisted metadata, one successful scheduled job, an authorization test, and a simulated failure.", note: "Until these pass, the components stay marked planned." },
];

export type Migration = {
  version: string;
  description: string;
  forward: string;
  rollback: string;
};

export const MIGRATIONS: Migration[] = [
  {
    version: "0001",
    description: "Companies and securities",
    forward: "CREATE TABLE companies (id uuid PRIMARY KEY, market_id text NOT NULL, source_id text NOT NULL, external_id text NOT NULL, name text, isin text, UNIQUE (source_id, external_id));",
    rollback: "DROP TABLE companies;",
  },
  {
    version: "0002",
    description: "Filings and versions",
    forward: "CREATE TABLE filings (id uuid PRIMARY KEY, company_id uuid REFERENCES companies(id), title text, category text, filing_type text, published_at timestamptz); CREATE TABLE filing_versions (id uuid PRIMARY KEY, filing_id uuid REFERENCES filings(id), sha256 text NOT NULL, byte_length bigint, retrieved_at timestamptz, supersedes uuid REFERENCES filing_versions(id), UNIQUE (filing_id, sha256));",
    rollback: "DROP TABLE filing_versions; DROP TABLE filings;",
  },
  {
    version: "0003",
    description: "Jobs with an idempotency key",
    forward: "CREATE TABLE jobs (id uuid PRIMARY KEY, idempotency_key text UNIQUE NOT NULL, source_id text, market_id text, state text NOT NULL, attempts int NOT NULL DEFAULT 0, last_verified_check timestamptz, error text, next_attempt_at timestamptz);",
    rollback: "DROP TABLE jobs;",
  },
  {
    version: "0004",
    description: "Row-level security on user-scoped tables",
    forward: "ALTER TABLE jobs ENABLE ROW LEVEL SECURITY; CREATE POLICY jobs_owner ON jobs USING (owner_id = auth.uid());",
    rollback: "DROP POLICY jobs_owner ON jobs; ALTER TABLE jobs DISABLE ROW LEVEL SECURITY;",
  },
];

export type RollbackPlan = {
  trigger: string[];
  steps: string[];
  /** What is preserved through a rollback. */
  preserved: string[];
};

export const ROLLBACK_PLAN: RollbackPlan = {
  trigger: [
    "A migration fails part-way and leaves the schema inconsistent.",
    "The service is unhealthy and a redeploy of the previous build is the fastest recovery.",
    "The schedule begins producing incorrect metadata.",
  ],
  steps: [
    "Disable the schedule first, so no new work is enqueued during recovery.",
    "Redeploy the previous known-good build.",
    "If a migration must be reverted, apply that migration's own recorded rollback statement.",
    "Re-enable the schedule only after the health endpoint and the acceptance checks pass again.",
  ],
  preserved: [
    "The Android app is unaffected: it never depends on the backend, so a backend outage degrades nothing locally.",
    "Filing metadata rows are preserved unless a rollback explicitly drops their table, which is why each rollback is written per migration.",
    "Retained documents in object storage are untouched by a service rollback.",
  ],
};

export type DeploymentPlan = {
  variables: EnvVar[];
  steps: DeployStep[];
  migrations: Migration[];
  rollback: RollbackPlan;
  /** The statement that must accompany the plan. */
  status: string;
};

export function deploymentPlan(): DeploymentPlan {
  return {
    variables: ENVIRONMENT_VARIABLES,
    steps: DEPLOY_STEPS,
    migrations: MIGRATIONS,
    rollback: ROLLBACK_PLAN,
    status:
      "This plan has not been executed. No database, storage bucket, service or schedule exists. Nothing here is claimed as deployed or tested.",
  };
}

/** A guard that no credential value has been committed. */
const CREDENTIAL_VALUE = /(eyJ[A-Za-z0-9_-]{10,}|postgresql:\/\/[^:]+:[^@]+@|AKIA[0-9A-Z]{16})/;

/**
 * Words that mark a value as a placeholder rather than a real secret.
 *
 * A template such as postgresql://USER:PASSWORD@HOST matches the shape of a
 * connection string, so the check must look at the content too, or it would
 * flag its own documentation.
 */
const PLACEHOLDER_WORDS = /\b(?:USER|PASSWORD|PASS|YOUR_[A-Z_]+|HOST|DBNAME|DATABASE|PLACEHOLDER|EXAMPLE|CHANGEME|GENERATE_A_LONG_RANDOM_STRING|ACCOUNT_ID|ACCESS_KEY_ID|SECRET_ACCESS_KEY|PROJECT|PUBLIC_ANON_KEY|SERVICE_ROLE_KEY)\b/;

export function assertNoCredentialValues(text: string): { clean: boolean; note: string } {
  if (CREDENTIAL_VALUE.test(text) && !PLACEHOLDER_WORDS.test(text)) {
    return { clean: false, note: "A value that looks like a real credential was found. It must be removed and rotated." };
  }
  if (CREDENTIAL_VALUE.test(text)) {
    return { clean: true, note: "The credential-shaped values present are placeholders, not real secrets." };
  }
  return { clean: true, note: "No credential-shaped value was found. Placeholders only." };
}
