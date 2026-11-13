export function supabaseFunctionTimeouts(functionName: string, body: unknown) {
  const isEvidenceVerification = functionName === "assess-evidence"
    && body !== null && typeof body === "object" && "action" in body
    && body.action === "verify_passages";
  // Allow the API route to return an error before the browser aborts.
  return isEvidenceVerification
    ? { proxy: 130_000, browser: 140_000 }
    : { proxy: 70_000, browser: 75_000 };
}
