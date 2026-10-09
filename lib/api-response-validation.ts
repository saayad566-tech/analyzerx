export function assertJsonApiResponse(
  response: { status: number; contentType: string; body: string },
  route: string,
): void {
  if (response.contentType && !/\bapplication\/(?:json|problem\+json)\b/i.test(response.contentType)) {
    throw new Error(`AnalyzerX API returned a non-JSON response (${response.status}) from ${route}. Check the connected service and retry.`);
  }
  try {
    JSON.parse(response.body);
  } catch {
    throw new Error(`AnalyzerX API returned malformed JSON (${response.status}) from ${route}. Check the connected service and retry.`);
  }
}
