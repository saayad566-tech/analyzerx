/**
 * Backend component specification, API design and storage policy (Prompt 7,
 * sections 3, 4 and 5).
 *
 * This is a specification, not a running system. Every component below is
 * marked PLANNED, and none of it is described as existing. The prompt is
 * explicit: a durable queue, scheduler, database or storage system must not be
 * claimed until it has been deployed and tested, and none has been.
 */

export type ComponentStatus = "planned" | "blocked" | "not_required";

export type BackendComponent = {
  id: string;
  name: string;
  status: ComponentStatus;
  purpose: string;
  /** What it is built from. */
  approach: string;
  /** What it must not do. */
  guardrail: string;
  /** Why it is or is not needed. */
  justification: string;
};

export const BACKEND_COMPONENTS: BackendComponent[] = [
  {
    id: "auth",
    name: "Authentication and authorization",
    status: "planned",
    purpose: "Identify a caller and decide what it may do.",
    approach: "A maintained identity provider, with server-side authorization on every protected route and row-level security in the database.",
    guardrail: "Authorization is decided on the server. A client is never trusted to state its own permissions.",
    justification: "Only needed once accounts exist. Every local feature works without them, so this is the lowest-priority component.",
  },
  {
    id: "metadata",
    name: "Company and filing metadata",
    status: "planned",
    purpose: "Hold filing identity, versions and hashes so a filing is traceable across devices.",
    approach: "Relational tables for companies, securities, filings and filing versions, with the source-scoped identifier as the uniqueness key.",
    guardrail: "A company name is never the key. A ticker is never assumed globally unique.",
    justification: "The device already holds this locally. A backend shares it, which is the second reason to have one.",
  },
  {
    id: "source_registry",
    name: "Source registry",
    status: "planned",
    purpose: "Hold the per-market source definitions, terms and access classes in one place.",
    approach: "The registry already defined in the app is mirrored server-side so one change updates every client.",
    guardrail: "A source's terms are recorded, not interpreted away. A blocked source stays blocked.",
    justification: "Useful, but the app already carries the registry, so this is a convenience rather than a requirement.",
  },
  {
    id: "scheduler",
    name: "Job scheduling",
    status: "planned",
    purpose: "Check permitted sources while the app is closed. This is the one capability the device cannot provide.",
    approach: "A scheduled workflow that runs a discovery sweep once per day, which is the cadence the verified free tiers actually permit.",
    guardrail: "No sub-daily schedule on a free host that does not support one. The daily limit is respected rather than worked around.",
    justification: "The only genuine justification for a backend.",
  },
  {
    id: "job_state",
    name: "Durable job state",
    status: "planned",
    purpose: "Record each job's identity, state, attempts and result so a run survives a restart.",
    approach: "A jobs table with an idempotency key, a state column, an attempt count and a next-attempt time.",
    guardrail: "A failed check never advances the last successful check time, exactly as on the device.",
    justification: "Required for any reliable schedule.",
  },
  {
    id: "queue",
    name: "Queue semantics and dead-letter handling",
    status: "planned",
    purpose: "Bound concurrency, retry with backoff, and report work that never succeeded.",
    approach: "A queue with visibility timeouts and a dead-letter destination, or the scheduler's own retry with a recorded attempt count.",
    guardrail: "A dead-lettered job is reported, never silently dropped.",
    justification: "The verified free queue allows 10,000 operations per day, which is enough for a daily sweep but not for per-document fan-out.",
  },
  {
    id: "object_storage",
    name: "Object storage",
    status: "planned",
    purpose: "Hold retrieved documents where retention is permitted.",
    approach: "S3-compatible object storage, with the bucket private and access only through signed, short-lived URLs.",
    guardrail: "Only documents that may legally be retained are stored. Where retention rights are unclear, the source reference is kept and the content is not copied.",
    justification: "Useful for shared history; the device already retains what it needs locally.",
  },
  {
    id: "versioning",
    name: "Document hashes and versioning",
    status: "planned",
    purpose: "Identify the exact bytes of each version and link amendments.",
    approach: "SHA-256 over the retrieved bytes, with immutable version rows and an explicit supersedes link.",
    guardrail: "An earlier version is never overwritten, and a changed URL is not treated as a new filing by itself.",
    justification: "The device already does this; a backend makes it shared.",
  },
  {
    id: "migrations",
    name: "Database migrations",
    status: "planned",
    purpose: "Change the schema safely and reversibly.",
    approach: "Versioned migration files applied forward, with a documented rollback for each.",
    guardrail: "A migration is never applied by hand to production without a recorded rollback.",
    justification: "Required as soon as a database exists.",
  },
  {
    id: "rls",
    name: "Row-level security",
    status: "planned",
    purpose: "Ensure one user cannot read another's rows.",
    approach: "Policies on every user-scoped table, tested with a cross-user read attempt.",
    guardrail: "A privileged service key is never exposed to the Android client.",
    justification: "Required once there is more than one user.",
  },
  {
    id: "secrets",
    name: "Secrets management",
    status: "planned",
    purpose: "Hold database and provider credentials outside the source tree.",
    approach: "Environment variables set in the hosting provider's own settings, never committed.",
    guardrail: "No credential in the repository and none in the client bundle.",
    justification: "Required as soon as any credential exists.",
  },
  {
    id: "backups",
    name: "Backups and recovery",
    status: "blocked",
    purpose: "Recover from data loss.",
    approach: "A scheduled logical dump to object storage, with a documented restore procedure that is actually tested.",
    guardrail: "A backup is not called a backup until a restore has been performed from it.",
    justification: "Blocked: the verified free database tier does not include automatic backups, so this needs either a paid plan or a self-managed dump.",
  },
  {
    id: "monitoring",
    name: "Monitoring and audit logs",
    status: "planned",
    purpose: "Know when a source or a job fails, and who changed what.",
    approach: "Structured logs with a correlation id, plus audit rows for administrative actions.",
    guardrail: "No credential and no private user data is written to a log.",
    justification: "Required for an operational service.",
  },
];

export function plannedComponents(): BackendComponent[] {
  return BACKEND_COMPONENTS.filter((component) => component.status === "planned");
}

export function blockedComponents(): BackendComponent[] {
  return BACKEND_COMPONENTS.filter((component) => component.status === "blocked");
}

/* ------------------------------------------------------------------ *
 * API design
 * ------------------------------------------------------------------ */

export type EndpointSpec = {
  method: "GET" | "POST";
  path: string;
  purpose: string;
  auth: "public" | "authenticated" | "admin";
  validation: string[];
  rateLimit: string;
};

export const ENDPOINTS: EndpointSpec[] = [
  {
    method: "GET",
    path: "/health",
    purpose: "Report whether the service and its dependencies are up.",
    auth: "public",
    validation: ["No parameters."],
    rateLimit: "A generous per-IP limit; it is a cheap read.",
  },
  {
    method: "GET",
    path: "/sources",
    purpose: "Return the source registry with coverage state per market.",
    auth: "public",
    validation: ["An optional market filter, validated against the known market list."],
    rateLimit: "Per-IP limit.",
  },
  {
    method: "GET",
    path: "/filings",
    purpose: "List filing metadata for a company or a market.",
    auth: "authenticated",
    validation: ["A page size bounded to a maximum.", "A company identifier validated against its own format."],
    rateLimit: "Per-user limit.",
  },
  {
    method: "POST",
    path: "/jobs/discovery",
    purpose: "Enqueue a discovery sweep for one source and market.",
    auth: "admin",
    validation: ["The source id must exist in the registry.", "The market must be one the source belongs to."],
    rateLimit: "Strict, because it fans out to a third party.",
  },
];

/**
 * The rule that keeps a public endpoint from becoming an open proxy.
 *
 * A server that fetches a URL supplied by a caller is a proxy, and an
 * unauthenticated one is an open proxy. So the server never accepts a URL: a
 * caller names a source and a filing, and the server resolves the address from
 * its own registry.
 */
export const NO_OPEN_PROXY_RULE =
  "The API never accepts a caller-supplied URL to fetch. A caller names a registered source and a filing identifier, and the server resolves the address from its own registry. Combined with the same approved-host and redirect checks the app uses, this prevents the endpoint from being used as an open proxy.";

export type ApiSecurityControl = {
  control: string;
  detail: string;
};

export const API_SECURITY_CONTROLS: ApiSecurityControl[] = [
  { control: "Transport", detail: "TLS only. A plain-http request is refused rather than redirected." },
  { control: "Authentication", detail: "A maintained identity provider; no bespoke password storage." },
  { control: "Authorization", detail: "Server-side on every protected route, with row-level security as a second layer." },
  { control: "Input validation", detail: "Every parameter validated against its own format, with a bounded page size and a bounded body." },
  { control: "Rate limiting", detail: "Per-IP for public reads, per-user for authenticated reads, and strict limits on anything that fans out to a third party." },
  { control: "Abuse protection", detail: "A request that repeatedly fails validation is throttled rather than served." },
  { control: "SSRF", detail: "The server resolves addresses from its own registry and refuses loopback, private and link-local destinations." },
  { control: "Audit logging", detail: "Administrative actions and configuration changes are recorded, with no credential in the log." },
  { control: "Secrets", detail: "Held in the host's environment settings, never in the repository and never in the client." },
];

/* ------------------------------------------------------------------ *
 * Storage policy
 * ------------------------------------------------------------------ */

export type RetentionRule = {
  content: string;
  retain: "metadata_only" | "content_permitted" | "content_with_conditions";
  reason: string;
};

export const RETENTION_RULES: RetentionRule[] = [
  {
    content: "Filing metadata: identity, source, dates, version, hash",
    retain: "metadata_only",
    reason: "Metadata carries no redistribution question and is the minimum needed to trace a filing.",
  },
  {
    content: "US federal filings",
    retain: "content_permitted",
    reason: "US federal government works, published for public access under the documented fair-access terms.",
  },
  {
    content: "Indian exchange announcements",
    retain: "content_with_conditions",
    reason: "NSE and BSE terms restrict redistribution, so the source reference and metadata are kept and the document content is not redistributed.",
  },
  {
    content: "SEBI regulatory documents",
    retain: "content_with_conditions",
    reason: "SEBI's website policy discusses permission and attribution for reproducing content, so the reference is kept and the content is not copied.",
  },
  {
    content: "Open-government datasets",
    retain: "content_permitted",
    reason: "Published under an open licence, with attribution and per-dataset licence checks.",
  },
  {
    content: "Company investor-relations documents",
    retain: "metadata_only",
    reason: "Each company's own terms govern, and they have not been reviewed, so only the reference is kept.",
  },
];

export type StoragePolicy = {
  separation: string;
  quotaNote: string;
  deletionNote: string;
  rules: RetentionRule[];
};

export function storagePolicy(): StoragePolicy {
  return {
    separation: "Metadata is stored separately from document content. Metadata lives in the database; content lives in object storage only when retention is permitted.",
    quotaNote: "The verified free object-storage tier includes 10 GB-month, which is roughly 35,000 average filings. Beyond that the tier is exceeded rather than silently charged.",
    deletionNote: "A deletion removes the object and its version rows, and records an audit row so the removal is traceable. A retention ceiling evicts the least recently used content first.",
    rules: RETENTION_RULES,
  };
}

/** The rule that decides whether content may be copied or only referenced. */
export function mayRetainContent(retain: RetentionRule["retain"]): { mayCopy: boolean; note: string } {
  if (retain === "content_permitted") return { mayCopy: true, note: "Retention is permitted by the source's licence." };
  if (retain === "content_with_conditions") {
    return { mayCopy: false, note: "Retention is conditional, so the source reference and metadata are kept and the content is not copied." };
  }
  return { mayCopy: false, note: "Only metadata is retained; the content is not copied." };
}

/** The status statement that must accompany the specification. */
export const BACKEND_STATUS_STATEMENT =
  "None of these components is deployed. They are a specification, and every one is marked planned or blocked. No durable queue, scheduler, database or storage system is claimed to exist.";
