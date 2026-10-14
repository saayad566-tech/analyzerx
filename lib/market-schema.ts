/**
 * The shared zod schema for a market id.
 *
 * Replaces the 23 hand-written `z.enum(["IN","US",...])` copies in server/routers.ts.
 * One definition means adding a market cannot leave a stale enum behind, and a server
 * input can never accept a market the app does not support.
 */
import { z } from "zod";

import { MARKET_IDS, UNKNOWN_MARKET } from "./market-regions";

/** A configured market id. */
export const marketIdSchema = z.enum(MARKET_IDS);

/** A configured market id, or the explicit "ALL" selector where an endpoint supports it. */
export const marketIdOrAllSchema = z.enum(["ALL", ...MARKET_IDS]);

/** A configured market id, or the explicit UNKNOWN marker. Never silently India. */
export const marketIdOrUnknownSchema = z.enum([...MARKET_IDS, UNKNOWN_MARKET]);

export type MarketIdInput = z.infer<typeof marketIdSchema>;
