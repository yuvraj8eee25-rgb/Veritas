import test from "node:test";
import assert from "node:assert/strict";
import { apiCall, ApiError, userMessage } from "../src/api/transport.js";

test("apiCall returns response data and releases loading state", async () => {
  const loading = [];
  const data = await apiCall(async () => ({ data: { ok: true }, error: null }), { onLoading: value => loading.push(value) });
  assert.deepEqual(data, { ok: true });
  assert.deepEqual(loading, [true, false]);
});

test("apiCall times out even if an operation ignores AbortSignal", async () => {
  await assert.rejects(apiCall(() => new Promise(() => {}), { timeoutMs: 10 }), error => error instanceof ApiError && /too long/.test(error.message));
});

test("apiCall retries a declared safe transient request once", async () => {
  let calls = 0;
  const data = await apiCall(async () => {
    calls++;
    return calls === 1 ? { data: null, error: { message: "busy", status: 503 } } : { data: "ok", error: null };
  }, { retrySafe: true, retries: 1 });
  assert.equal(data, "ok");
  assert.equal(calls, 2);
});

test("apiCall does not retry writes unless the caller marks them safe", async () => {
  let calls = 0;
  await assert.rejects(apiCall(async () => {
    calls++;
    return { data: null, error: { message: "busy", status: 503 } };
  }, { retries: 2 }), ApiError);
  assert.equal(calls, 1);
});

test("userMessage maps expired sessions to a usable message", () => {
  assert.equal(userMessage(new Error("JWT expired")), "Your session has expired. Sign in again.");
});

test("userMessage gives rate limited callers a retry hint", () => {
  assert.equal(userMessage({ message: "Edge Function returned a non-2xx status code", context: { status: 429 } }), "You are making requests too quickly. Please wait and try again.");
});
