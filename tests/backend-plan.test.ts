import { describe, expect, it } from "vitest";

import {
  ARCHITECTURE_OPTIONS,
  API_SECURITY_CONTROLS,
  assertNoCredentialValues,
  assertNoPrivilegedKeyInClient,
  BACKEND_COMPONENTS,
  BACKEND_STATUS_STATEMENT,
  backendStatement,
  blockedComponents,
  canRunFeature,
  DEFAULT_BACKEND_SETTINGS,
  DEPLOY_STEPS,
  deploymentPlan,
  ENDPOINTS,
  ENVIRONMENT_VARIABLES,
  estimateUserCost,
  estimateUserScales,
  FEATURE_AVAILABILITY,
  featuresWithoutBackend,
  filingsBeforeDatabaseLimit,
  FREE_TIER_WARNING,
  freeTierBoundary,
  mayRetainContent,
  MIGRATIONS,
  NO_OPEN_PROXY_RULE,
  plannedComponents,
  PROVIDER_FACTS,
  providerFact,
  pausingProviders,
  recommendArchitecture,
  resolveBackendConfig,
  RETENTION_RULES,
  ROLLBACK_PLAN,
  serverOnlyVariables,
  storagePolicy,
  summariseFreeTiers,
  unavailableWithoutBackend,
  userCostTable,
  type BackendSettings,
} from "../lib/filing-intelligence";

/* ------------------------------------------------------------------ *
 * Architecture decision
 * ------------------------------------------------------------------ */

describe("architecture decision: three options compared, one recommended", () => {
  it("compares all three options on the same criteria", () => {
    expect(ARCHITECTURE_OPTIONS).toHaveLength(3);
    const criteria = ARCHITECTURE_OPTIONS[0].scores.map((score) => score.criterion);
    for (const option of ARCHITECTURE_OPTIONS) {
      expect(option.scores.map((score) => score.criterion)).toEqual(criteria);
    }
    for (const required of ["Cost", "Reliability", "Maintenance", "Privacy", "Complexity", "Rate limits", "Scheduled execution", "Storage", "Multi-user"]) {
      expect(criteria).toContain(required);
    }
  });

  it("recommends the optional backend while keeping Android-only as the baseline", () => {
    const recommendation = recommendArchitecture();
    expect(recommendation.recommended).toBe("B_optional_backend");
    expect(recommendation.baseline).toBe("A_android_only");
    expect(recommendation.rationale.length).toBeGreaterThan(3);
  });

  it("states the guardrails, including that the app must work unconfigured", () => {
    const guardrails = recommendArchitecture().guardrails.join(" ");
    expect(guardrails).toMatch(/must build and work fully with no backend configured/);
    expect(guardrails).toMatch(/No analysis is moved to the server/);
    expect(guardrails).toMatch(/No privileged key is ever placed in the Android client/);
    expect(guardrails).toMatch(/No component is described as existing until it has been deployed and tested/);
  });

  it("names the one capability a backend genuinely adds", () => {
    const optionB = ARCHITECTURE_OPTIONS.find((option) => option.option === "B_optional_backend")!;
    expect(optionB.enables.join(" ")).toMatch(/Closed-app filing detection/);
  });
});

/* ------------------------------------------------------------------ *
 * Free-tier register
 * ------------------------------------------------------------------ */

describe("free-tier register: verified limits with their source", () => {
  it("records the source URL and the date checked for every provider", () => {
    for (const fact of PROVIDER_FACTS) {
      expect(fact.sourceUrl).toMatch(/^https:\/\//);
      expect(fact.checkedUtc).toBeTruthy();
      expect(fact.limits.length).toBeGreaterThan(0);
      expect(fact.keyConstraint.length).toBeGreaterThan(20);
    }
  });

  it("records the verified Supabase free limits", () => {
    const limits = providerFact("Supabase")!.limits;
    expect(limits.find((limit) => limit.resource === "Database size")?.included).toBe("500 MB per project");
    expect(limits.find((limit) => limit.resource === "Egress")?.included).toMatch(/5 GB/);
    expect(providerFact("Supabase")!.pausesWhenIdle).toBe(true);
  });

  it("records the Vercel once-per-day cron constraint, which constrains the schedule", () => {
    const vercel = providerFact("Vercel (Hobby)")!;
    expect(vercel.keyConstraint).toMatch(/ONCE PER DAY/);
    expect(vercel.keyConstraint).toMatch(/fails at deployment/);
  });

  it("records the zero-egress object storage tier", () => {
    const r2 = providerFact("Cloudflare R2")!;
    expect(r2.limits.find((limit) => limit.resource === "Storage")?.included).toBe("10 GB-month per month");
    expect(r2.limits.find((limit) => limit.resource === "Egress")?.included).toMatch(/Free/);
  });

  it("records that GitHub Actions minutes are free on public repositories", () => {
    const actions = providerFact("GitHub Actions")!;
    expect(actions.limits.find((limit) => limit.resource === "Minutes, public repositories")?.included).toMatch(/Free/);
  });

  it("classifies each provider by how it is actually free", () => {
    expect(providerFact("PostgreSQL")!.costModel).toBe("permanently_free_software");
    expect(providerFact("Supabase")!.costModel).toBe("free_hosted_tier");
  });

  it("warns that a free tier is not a commitment", () => {
    expect(FREE_TIER_WARNING).toMatch(/not a commitment/);
    expect(FREE_TIER_WARNING).toMatch(/pause, throttle or expire/);
    expect(summariseFreeTiers().warning).toBe(FREE_TIER_WARNING);
  });

  it("names the providers that pause idle resources", () => {
    expect(pausingProviders().map((entry) => entry.provider)).toContain("Supabase");
  });
});

/* ------------------------------------------------------------------ *
 * Client boundary: the acceptance criterion
 * ------------------------------------------------------------------ */

describe("client boundary: the app works with no backend configured", () => {
  it("defaults to no backend, which is a fully working state", () => {
    const config = resolveBackendConfig();
    expect(config.state).toBe("not_configured");
    expect(config.usable).toBe(false);
    expect(config.reason).toMatch(/fully working state/);
    expect(DEFAULT_BACKEND_SETTINGS.enabled).toBe(false);
  });

  it("keeps every local analysis feature working with no backend", () => {
    const config = resolveBackendConfig();
    for (const feature of ["Filing discovery", "Document retrieval and parsing", "Financial calculations", "Evidence validation and the report", "Local AI assistant"]) {
      expect(canRunFeature(feature, config).can).toBe(true);
    }
  });

  it("marks only the three capabilities a backend adds as unavailable", () => {
    const unavailable = unavailableWithoutBackend().map((entry) => entry.feature);
    expect(unavailable).toContain("Detection while the app is closed");
    expect(unavailable).toContain("Shared filing metadata across devices");
    expect(unavailable).toContain("Accounts and sign-in");
    expect(featuresWithoutBackend().length).toBeGreaterThan(unavailable.length);
  });

  it("reports why a backend-only feature cannot run, rather than failing silently", () => {
    const result = canRunFeature("Detection while the app is closed", resolveBackendConfig());
    expect(result.can).toBe(false);
    expect(result.reason).toMatch(/No backend is configured/);
  });

  it("enables a backend-only feature once a backend is configured and reachable", () => {
    const settings: BackendSettings = { enabled: true, baseUrl: "https://api.example.invalid", lastCheckOk: true };
    expect(canRunFeature("Detection while the app is closed", resolveBackendConfig(settings)).can).toBe(true);
  });

  it("refuses a plain-http backend rather than using it in the clear", () => {
    const config = resolveBackendConfig({ enabled: true, baseUrl: "http://api.example.invalid", lastCheckOk: true });
    expect(config.state).toBe("misconfigured");
    expect(config.reason).toMatch(/must use https/);
    expect(config.usable).toBe(false);
  });

  it("falls back to device-only when a configured backend is unreachable", () => {
    const config = resolveBackendConfig({ enabled: true, baseUrl: "https://api.example.invalid", lastCheckOk: false });
    expect(config.state).toBe("configured_unreachable");
    expect(config.usable).toBe(false);
    expect(config.reason).toMatch(/Device-only behaviour is used/);
    // Local features still work while the backend is down.
    expect(canRunFeature("Financial calculations", config).can).toBe(true);
  });

  it("rejects an enabled backend with no address", () => {
    expect(resolveBackendConfig({ enabled: true, baseUrl: null, lastCheckOk: null }).state).toBe("misconfigured");
  });

  it("states the position plainly", () => {
    const statement = backendStatement();
    expect(statement).toMatch(/work with no backend at all/);
    expect(statement).toMatch(/only capability a backend adds is detection while the app is closed/);
  });

  it("refuses a privileged key in the client", () => {
    expect(assertNoPrivilegedKeyInClient({ SUPABASE_URL: "x", SUPABASE_ANON_KEY: "y" }).clean).toBe(true);
    const dirty = assertNoPrivilegedKeyInClient({ SUPABASE_SERVICE_ROLE_KEY: "x" });
    expect(dirty.clean).toBe(false);
    expect(dirty.offenders).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(assertNoPrivilegedKeyInClient({ DB_PASSWORD: "x" }).clean).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Specification
 * ------------------------------------------------------------------ */

describe("backend specification: planned, never claimed as deployed", () => {
  it("covers every component the prompt names", () => {
    const ids = BACKEND_COMPONENTS.map((component) => component.id);
    for (const required of ["auth", "metadata", "source_registry", "scheduler", "job_state", "queue", "object_storage", "versioning", "migrations", "rls", "secrets", "backups", "monitoring"]) {
      expect(ids).toContain(required);
    }
  });

  it("marks nothing as deployed and states that plainly", () => {
    for (const component of BACKEND_COMPONENTS) {
      expect(["planned", "blocked", "not_required"]).toContain(component.status);
    }
    expect(BACKEND_STATUS_STATEMENT).toMatch(/None of these components is deployed/);
    expect(BACKEND_STATUS_STATEMENT).toMatch(/No durable queue, scheduler, database or storage system is claimed to exist/);
  });

  it("blocks the backup component on the verified absence of free automatic backups", () => {
    const backups = blockedComponents();
    expect(backups.map((component) => component.id)).toContain("backups");
    expect(backups[0].justification).toMatch(/does not include automatic backups/);
  });

  it("gives every component a guardrail", () => {
    for (const component of BACKEND_COMPONENTS) {
      expect(component.guardrail.length).toBeGreaterThan(20);
      expect(component.justification.length).toBeGreaterThan(20);
    }
  });

  it("justifies the scheduler as the one genuine reason for a backend", () => {
    const scheduler = plannedComponents().find((component) => component.id === "scheduler")!;
    expect(scheduler.justification).toMatch(/only genuine justification/);
    expect(scheduler.guardrail).toMatch(/daily limit is respected/);
  });

  it("prevents the API becoming an open proxy", () => {
    expect(NO_OPEN_PROXY_RULE).toMatch(/never accepts a caller-supplied URL/);
    for (const endpoint of ENDPOINTS) {
      expect(endpoint.path).not.toMatch(/fetch|proxy|url/);
    }
  });

  it("specifies auth, validation and rate limits on every endpoint", () => {
    expect(ENDPOINTS.length).toBeGreaterThan(2);
    for (const endpoint of ENDPOINTS) {
      expect(["public", "authenticated", "admin"]).toContain(endpoint.auth);
      expect(endpoint.validation.length).toBeGreaterThan(0);
      expect(endpoint.rateLimit.length).toBeGreaterThan(5);
    }
    expect(API_SECURITY_CONTROLS.map((control) => control.control)).toContain("SSRF");
  });
});

/* ------------------------------------------------------------------ *
 * Storage policy
 * ------------------------------------------------------------------ */

describe("storage policy: metadata separate from content", () => {
  it("separates metadata from content", () => {
    expect(storagePolicy().separation).toMatch(/Metadata is stored separately from document content/);
  });

  it("does not copy content whose retention rights are unclear", () => {
    const exchange = RETENTION_RULES.find((rule) => rule.content.includes("Indian exchange"))!;
    expect(exchange.retain).toBe("content_with_conditions");
    expect(mayRetainContent(exchange.retain).mayCopy).toBe(false);

    const ir = RETENTION_RULES.find((rule) => rule.content.includes("investor-relations"))!;
    expect(mayRetainContent(ir.retain).mayCopy).toBe(false);
    expect(mayRetainContent(ir.retain).note).toMatch(/Only metadata is retained/);
  });

  it("permits content retention where the licence allows it", () => {
    const us = RETENTION_RULES.find((rule) => rule.content.includes("US federal"))!;
    expect(mayRetainContent(us.retain).mayCopy).toBe(true);
  });

  it("states a quota and a deletion mechanism", () => {
    const policy = storagePolicy();
    expect(policy.quotaNote).toMatch(/10 GB-month/);
    expect(policy.deletionNote).toMatch(/audit row/);
  });
});

/* ------------------------------------------------------------------ *
 * Cost
 * ------------------------------------------------------------------ */

describe("cost at 10, 100 and 1,000 users", () => {
  it("estimates all three scales and states its assumptions", () => {
    const estimates = estimateUserScales();
    expect(estimates.map((estimate) => estimate.scale)).toEqual([10, 100, 1000]);
    expect(userCostTable()).toMatch(/Assumptions:/);
  });

  it("keeps the smallest scale inside the free tiers", () => {
    expect(estimateUserCost(10).verdict).toBe("within_free_tiers");
    expect(estimateUserCost(10).firstFailure).toBeNull();
  });

  it("names the first free tier to fail and at what scale", () => {
    const large = estimateUserCost(1000);
    expect(large.verdict).toBe("exceeds_a_free_tier");
    expect(large.firstFailure).toMatch(/database size is exceeded/);
    expect(large.firstFailure).toMatch(/500 MB free tier/);
  });

  it("computes the boundary from the verified database limit, not a guess", () => {
    const limit = filingsBeforeDatabaseLimit();
    expect(limit).toBeGreaterThan(50_000);
    expect(limit).toBeLessThan(200_000);
    const boundary = freeTierBoundary();
    expect(boundary.firstFailureResource).toMatch(/verified 500 MB free database size/);
    expect(boundary.pastIt.length).toBeGreaterThan(1);
  });

  it("distinguishes functional ceilings from quotas", () => {
    const ceilings = freeTierBoundary().functionalCeilings.join(" ");
    expect(ceilings).toMatch(/ONCE PER DAY/);
    expect(ceilings).toMatch(/10 ms per request/);
    expect(ceilings).toMatch(/10,000 operations per day/);
  });
});

/* ------------------------------------------------------------------ *
 * Deployment
 * ------------------------------------------------------------------ */

describe("deployment plan: templates only, no credentials", () => {
  it("gives every variable a placeholder and never a real value", () => {
    for (const variable of ENVIRONMENT_VARIABLES) {
      expect(variable.placeholder.length).toBeGreaterThan(3);
      expect(variable.purpose.length).toBeGreaterThan(10);
    }
    expect(assertNoCredentialValues(JSON.stringify(ENVIRONMENT_VARIABLES)).clean).toBe(true);
  });

  it("marks the privileged variables as server-only", () => {
    const serverOnly = serverOnlyVariables().map((variable) => variable.name);
    expect(serverOnly).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(serverOnly).toContain("OBJECT_STORAGE_SECRET_ACCESS_KEY");
    expect(serverOnly).not.toContain("SUPABASE_ANON_KEY");
  });

  it("detects a credential-shaped value if one were ever committed", () => {
    expect(assertNoCredentialValues("postgresql://adminuser:Xk92mQv7pLw3@db.internal:5432/prod").clean).toBe(false);
    expect(assertNoCredentialValues("DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME").clean).toBe(true);
    expect(assertNoCredentialValues("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9payload").clean).toBe(false);
  });

  it("gives an exact command for every deploy step", () => {
    expect(DEPLOY_STEPS.length).toBeGreaterThanOrEqual(8);
    for (const step of DEPLOY_STEPS) {
      expect(step.command.length).toBeGreaterThan(5);
      expect(step.note.length).toBeGreaterThan(10);
    }
  });

  it("pairs every migration with a rollback statement", () => {
    expect(MIGRATIONS.length).toBeGreaterThan(2);
    for (const migration of MIGRATIONS) {
      expect(migration.forward.length).toBeGreaterThan(20);
      expect(migration.rollback.length).toBeGreaterThan(5);
    }
  });

  it("states a rollback trigger, steps and what is preserved", () => {
    expect(ROLLBACK_PLAN.trigger.length).toBeGreaterThan(1);
    expect(ROLLBACK_PLAN.steps.length).toBeGreaterThan(2);
    expect(ROLLBACK_PLAN.preserved.join(" ")).toMatch(/The Android app is unaffected/);
  });

  it("states that nothing has been executed", () => {
    expect(deploymentPlan().status).toMatch(/has not been executed/);
    expect(deploymentPlan().status).toMatch(/Nothing here is claimed as deployed or tested/);
  });
});

/* ------------------------------------------------------------------ *
 * Acceptance
 * ------------------------------------------------------------------ */

describe("acceptance: the app builds and works without the backend", () => {
  it("has no feature that fails because a backend is absent, other than the three named", () => {
    const config = resolveBackendConfig();
    const broken = FEATURE_AVAILABILITY.filter((entry) => !canRunFeature(entry.feature, config).can);
    expect(broken.map((entry) => entry.feature).sort()).toEqual(
      ["Accounts and sign-in", "Detection while the app is closed", "Shared filing metadata across devices"].sort(),
    );
  });

  it("reports a working state rather than a degraded one when nothing is configured", () => {
    const config = resolveBackendConfig();
    expect(config.state).toBe("not_configured");
    expect(config.reason).toMatch(/fully working state/);
    expect(backendStatement(config)).toMatch(/nothing is missing for local analysis/);
  });
});
