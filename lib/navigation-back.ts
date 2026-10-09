export type BackAction = "stack" | "home" | "stay";
export type RootBackFeedback = "confirm" | "exit";

export function resolveRootBackFeedback(lastBackAt: number, now: number, windowMs = 2_000): RootBackFeedback {
  return now - lastBackAt < windowMs ? "exit" : "confirm";
}


const ROOT_PATHS = new Set(["/", "/(tabs)", "/(tabs)/index"]);

export function resolveBackAction(canGoBack: boolean, pathname: string): BackAction {
  if (canGoBack) return "stack";
  return ROOT_PATHS.has(pathname) ? "stay" : "home";
}
