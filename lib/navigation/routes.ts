/**
 * The route registry.
 *
 * expo-router derived routes from the file tree at build time. React Native has no dynamic
 * require, so the mapping from URL to screen is explicit here. `scripts/` regenerates it if
 * routes are added: every file under `app/` (except `_layout.tsx`) becomes one or more paths,
 * with `(group)` segments transparent exactly as expo-router treats them.
 */
import type { ComponentType } from "react";

import S_account from "@/app/account";
import S_admin from "@/app/admin";
import S_appearance from "@/app/appearance";
import S_custom_domain from "@/app/custom-domain";
import S_data_truth from "@/app/data-truth";
import S_diagnostics from "@/app/diagnostics";
import S_filings from "@/app/filings";
import S_general_chat from "@/app/general-chat";
import S_held_review from "@/app/held-review";
import S_history from "@/app/history";
import S_local_ai_telemetry from "@/app/local-ai-telemetry";
import S_local_ai from "@/app/local-ai";
import S_macro_context from "@/app/macro-context";
import S_market_chat from "@/app/market-chat";
import S_market_country from "@/app/market-country";
import S_marketplace from "@/app/marketplace";
import S_notifications from "@/app/notifications";
import S_quant_lab from "@/app/quant-lab";
import S_research_desk from "@/app/research-desk";
import S_research_workspace from "@/app/research-workspace";
import S_strategy_library from "@/app/strategy-library";
import S_support from "@/app/support";
import S__tabs__alerts from "@/app/(tabs)/alerts";
import S__tabs__assistant from "@/app/(tabs)/assistant";
import S__tabs__flows from "@/app/(tabs)/flows";
import S__tabs__graph from "@/app/(tabs)/graph";
import S__tabs__index from "@/app/(tabs)/index";
import S__tabs__screener from "@/app/(tabs)/screener";
import S__tabs__sectors from "@/app/(tabs)/sectors";
import S__tabs__storylines from "@/app/(tabs)/storylines";
import S_alert_result__id_ from "@/app/alert-result/[id]";
import S_company__symbol_ from "@/app/company/[symbol]";
import S_dev_theme_lab from "@/app/dev/theme-lab";
import S_filings__symbol_ from "@/app/filings/[symbol]";
import S_news__id_ from "@/app/news/[id]";
import S_oauth_callback from "@/app/oauth/callback";
import S_recommendation__id_ from "@/app/recommendation/[id]";
import S_sector__name_ from "@/app/sector/[name]";
import S_workstation_runner_index from "@/app/workstation-runner/index";

export const ROUTES: Record<string, ComponentType<Record<string, unknown>>> = {
  "/account": S_account,
  "/admin": S_admin,
  "/appearance": S_appearance,
  "/custom-domain": S_custom_domain,
  "/data-truth": S_data_truth,
  "/diagnostics": S_diagnostics,
  "/filings": S_filings,
  "/general-chat": S_general_chat,
  "/held-review": S_held_review,
  "/history": S_history,
  "/local-ai-telemetry": S_local_ai_telemetry,
  "/local-ai": S_local_ai,
  "/macro-context": S_macro_context,
  "/market-chat": S_market_chat,
  "/market-country": S_market_country,
  "/marketplace": S_marketplace,
  "/notifications": S_notifications,
  "/quant-lab": S_quant_lab,
  "/research-desk": S_research_desk,
  "/research-workspace": S_research_workspace,
  "/strategy-library": S_strategy_library,
  "/support": S_support,
  "/(tabs)/alerts": S__tabs__alerts,
  "/alerts": S__tabs__alerts,
  "/(tabs)/assistant": S__tabs__assistant,
  "/assistant": S__tabs__assistant,
  "/(tabs)/flows": S__tabs__flows,
  "/flows": S__tabs__flows,
  "/(tabs)/graph": S__tabs__graph,
  "/graph": S__tabs__graph,
  "/": S__tabs__index,
  "/(tabs)": S__tabs__index,
  "/(tabs)/screener": S__tabs__screener,
  "/screener": S__tabs__screener,
  "/(tabs)/sectors": S__tabs__sectors,
  "/sectors": S__tabs__sectors,
  "/(tabs)/storylines": S__tabs__storylines,
  "/storylines": S__tabs__storylines,
  "/alert-result/[id]": S_alert_result__id_,
  "/company/[symbol]": S_company__symbol_,
  "/dev/theme-lab": S_dev_theme_lab,
  "/filings/[symbol]": S_filings__symbol_,
  "/news/[id]": S_news__id_,
  "/oauth/callback": S_oauth_callback,
  "/recommendation/[id]": S_recommendation__id_,
  "/sector/[name]": S_sector__name_,
  "/workstation-runner": S_workstation_runner_index,
};

/** The tab routes, in the order the tab bar presents them. */
export const TAB_ROUTES = ["/(tabs)", "/(tabs)/storylines", "/(tabs)/graph", "/(tabs)/sectors", "/(tabs)/flows", "/(tabs)/screener", "/(tabs)/assistant", "/(tabs)/alerts"] as const;

