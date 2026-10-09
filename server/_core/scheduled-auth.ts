export function isScheduledCallbackAuthorized(expectedToken: string | undefined, providedToken: string | undefined, isProduction: boolean) {
  if (!expectedToken) return !isProduction;
  return Boolean(providedToken && providedToken === expectedToken);
}
