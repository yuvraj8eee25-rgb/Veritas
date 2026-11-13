# Functional bug: Evidence Lab search transport and empty results

## Evidence read

The current request path is EvidenceLab.tsx -> invokeVeritasFunction() -> POST /api/supabase-functions -> Supabase Edge Function. The browser client obtains the signed-in session token, sends the function name/body plus request ID to the same-origin Next.js proxy, and parses its JSON response.

## Failure points and current behavior

- Evidence Lab stops before the proxy if Supabase is unconfigured, the user session is missing, or the claim is shorter than 8 characters. The component sets an inline error with role=alert.
- The client helper can fail while reading the session, without an access token, during fetch to Next.js, or while parsing a non-JSON response. A fetch rejection becomes “Could not reach the Next.js Supabase proxy. Reference: <request ID>”. Non-2xx JSON uses the returned error and request_id/x-request-id.
- The proxy can return 401 for absent Bearer auth, 400 for invalid JSON or a function outside its allowlist, 503 when Supabase URL/key are missing, 504 after its 70-second timeout, and 502 when it cannot reach Supabase. These errors use JSON { error, request_id }, Cache-Control: no-store, and x-request-id. For an upstream response, the proxy forwards the status and response body unchanged and preserves/sets x-request-id and Retry-After.
- The Exa search helper catches function errors and retries missing primary directions. If searches finish with zero sources and any direction failed, the component throws “Evidence search failed: <detail>”; if all searches succeeded but returned no sources, it throws “Search completed, but returned no sources. Try a more specific claim or different wording.” The UI renders that message in its inline role=alert error paragraph.
- Assessment failures after sources are found do not fail the investigation: the UI uses a weak keyword estimate, caps confidence, and adds a caveat. Successful zero-source search does not create an investigation result card.
- “No sources were found” and “Failed to send a request to the Edge Function” are not literal strings in the three inspected React files. The screenshot wording may come from an upstream function response or an earlier version. Without the original request ID and server logs, the exact failing hop cannot be verified.

## Proposed fix (functional task; no code changed here)

Capture request IDs and structured phase/error details in server logs; keep those IDs visible in the UI. Distinguish an upstream Edge Function HTTP error from a browser-to-Next proxy network rejection, and provide retry guidance only for transient failures. Validate Edge Function response shape/status, return a typed empty-result outcome when a search succeeds with zero results, and make retry handling preserve the claim and trace. Confirm the fix against the actual Supabase project and Edge Function logs before redesigning the Evidence Lab screen.
