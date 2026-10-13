import { describe, expect, it } from "vitest";

import {
  INITIAL_APP_LIFECYCLE,
  canTransition,
  describeAppLifecycle,
  isBusy,
  reduceAppLifecycle,
  retryDelayMs,
  type AppLifecycleEvent,
  type AppLifecycleModel,
} from "../lib/app-state";

const run = (events: AppLifecycleEvent[], start: AppLifecycleModel = INITIAL_APP_LIFECYCLE) =>
  events.reduce((model, event) => reduceAppLifecycle(model, event, 1000), start);

describe("app lifecycle state machine", () => {
  it("starts uninitialized and blocks", () => {
    expect(INITIAL_APP_LIFECYCLE.state).toBe("uninitialized");
    expect(describeAppLifecycle("uninitialized").isBlocking).toBe(true);
    expect(isBusy("uninitialized")).toBe(true);
  });

  it("walks the happy path uninitialized -> loading -> ready", () => {
    expect(run([{ type: "BOOTSTRAP_START" }]).state).toBe("loading");
    expect(run([{ type: "BOOTSTRAP_START" }, { type: "BOOTSTRAP_SUCCESS", hasData: true }]).state).toBe("ready");
  });

  it("distinguishes empty data from ready", () => {
    expect(run([{ type: "BOOTSTRAP_START" }, { type: "BOOTSTRAP_SUCCESS", hasData: false }]).state).toBe("empty-data");
    expect(run([{ type: "BOOTSTRAP_START" }, { type: "BOOTSTRAP_EMPTY" }]).state).toBe("empty-data");
  });

  it("counts retries on failure and clears them on success", () => {
    const failed = run([{ type: "BOOTSTRAP_START" }, { type: "BOOTSTRAP_FAILURE", message: "boom" }]);
    expect(failed.state).toBe("error");
    expect(failed.retryCount).toBe(1);
    expect(failed.lastError).toBe("boom");
    expect(run([{ type: "BOOTSTRAP_SUCCESS", hasData: true }], failed).retryCount).toBe(1);
    expect(run([{ type: "BOOTSTRAP_SUCCESS", hasData: true }], failed).state).toBe("ready");
  });

  it("goes offline on connectivity loss but ignores it before bootstrap", () => {
    expect(run([{ type: "CONNECTIVITY_LOST" }]).state).toBe("uninitialized");
    const ready = run([{ type: "BOOTSTRAP_START" }, { type: "BOOTSTRAP_SUCCESS", hasData: true }]);
    expect(run([{ type: "CONNECTIVITY_LOST" }], ready).state).toBe("offline");
  });

  it("recovers from offline via reconnect", () => {
    const offline = run([{ type: "BOOTSTRAP_START" }, { type: "BOOTSTRAP_SUCCESS", hasData: true }, { type: "CONNECTIVITY_LOST" }]);
    expect(run([{ type: "RECONNECT_START" }], offline).state).toBe("reconnecting");
    expect(run([{ type: "RECONNECT_SUCCESS", hasData: true }], offline).state).toBe("ready");
    expect(run([{ type: "RECONNECT_FAILURE", message: "still down" }], offline).state).toBe("offline");
  });

  it("is idempotent — a no-op event returns the same object", () => {
    const ready = run([{ type: "BOOTSTRAP_START" }, { type: "BOOTSTRAP_SUCCESS", hasData: true }]);
    expect(reduceAppLifecycle(ready, { type: "BOOTSTRAP_SUCCESS", hasData: true })).toBe(ready);
  });

  it("rejects undeclared transitions", () => {
    expect(canTransition("uninitialized", "reconnecting")).toBe(false);
    expect(canTransition("ready", "offline")).toBe(true);
  });

  it("resets to the pristine model", () => {
    const ready = run([{ type: "BOOTSTRAP_START" }, { type: "BOOTSTRAP_SUCCESS", hasData: true }]);
    expect(run([{ type: "RESET" }], ready).state).toBe("uninitialized");
  });

  it("computes capped exponential backoff deterministically", () => {
    expect(retryDelayMs(0, 750, 30_000)).toBe(750);
    expect(retryDelayMs(1, 750, 30_000)).toBe(1500);
    expect(retryDelayMs(10, 750, 30_000)).toBe(30_000);
  });

  it("is deterministic for identical inputs", () => {
    const events: AppLifecycleEvent[] = [{ type: "BOOTSTRAP_START" }, { type: "BOOTSTRAP_FAILURE", message: "x" }];
    expect(run(events)).toEqual(run(events));
  });
});
