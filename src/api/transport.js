export class ApiError extends Error {
  constructor(message, { code, status, cause } = {}) {
    super(message, { cause });
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export function userMessage(error) {
  const raw = String(error?.message || "");
  const status = error?.status || error?.context?.status || error?.cause?.context?.status;
  if (error?.name === "AbortError" || /aborted|timeout/i.test(raw)) return "The request took too long. Check your connection and try again.";
  if (/JWT|token.*expired|session.*expired/i.test(raw)) return "Your session has expired. Sign in again.";
  if (/Failed to fetch|NetworkError|fetch failed/i.test(raw)) return "Could not reach Veritas. Check your connection and try again.";
  if (status === 429) return "You are making requests too quickly. Please wait and try again.";
  if (status >= 500) return "Veritas could not complete that request. Please try again shortly.";
  return raw || "Something went wrong. Please try again.";
}

export async function apiCall(operation, { timeoutMs = 20000, retries = 0, retrySafe = false, onLoading } = {}) {
  let attempt = 0;
  onLoading?.(true);
  try {
    while (true) {
      const controller = new AbortController();
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          const error = new Error("Request timed out");
          error.name = "AbortError";
          reject(error);
        }, timeoutMs);
      });
      try {
        const result = await Promise.race([operation(controller.signal), timeout]);
        if (result?.error) throw new ApiError(userMessage(result.error), { code: result.error.code, status: result.error.status || result.error.context?.status, cause: result.error });
        return result?.data;
      } catch (error) {
        const status = error?.status || error?.cause?.context?.status;
        const retryable = retrySafe && attempt < retries && (error?.name === "AbortError" || status >= 500 || status === 429);
        if (!retryable) throw new ApiError(userMessage(error), { status, code: error?.code, cause: error });
        await new Promise(resolve => setTimeout(resolve, 250 * (2 ** attempt)));
        attempt++;
      } finally {
        clearTimeout(timer);
      }
    }
  } finally {
    onLoading?.(false);
  }
}
