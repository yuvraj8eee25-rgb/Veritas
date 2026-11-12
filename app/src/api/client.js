import { auth, supabaseClient } from "./supabase.js";
import { apiCall, ApiError, userMessage } from "./transport.js";

export const rpc = (name, args, options) => apiCall(
  signal => {
    if (!supabaseClient) throw new ApiError("Supabase is not configured. Add the public project URL and anon key.");
    return supabaseClient.rpc(name, args).abortSignal(signal);
  }, options
);
export const edge = (name, body, options = {}) => apiCall(
  signal => {
    if (!supabaseClient) throw new ApiError("Supabase is not configured. Add the public project URL and anon key.");
    return supabaseClient.functions.invoke(name, {
      body,
      signal,
      headers: { "x-request-id": crypto.randomUUID() },
    });
  }, options
);
export const storageUpload = (bucket, path, file, fileOptions = {}, options = {}) => apiCall(
  () => {
    if (!supabaseClient) throw new ApiError("Supabase is not configured. Add the public project URL and anon key.");
    return supabaseClient.storage.from(bucket).upload(path, file, fileOptions);
  }, options
);
export const storageSignedUrl = async (bucket, path, expiresIn = 300, options = {}) => {
  const data = await apiCall(() => {
    if (!supabaseClient) throw new ApiError("Supabase is not configured. Add the public project URL and anon key.");
    return supabaseClient.storage.from(bucket).createSignedUrl(path, expiresIn);
  }, options);
  return data.signedUrl;
};
export const storageRemove = (bucket, paths, options = {}) => apiCall(() => {
  if (!supabaseClient) throw new ApiError("Supabase is not configured. Add the public project URL and anon key.");
  return supabaseClient.storage.from(bucket).remove(paths);
}, options);
export const tableQuery = (table, build, options = {}) => apiCall(signal => {
  if (!supabaseClient) throw new ApiError("Supabase is not configured. Add the public project URL and anon key.");
  return build(supabaseClient.from(table)).abortSignal(signal);
}, options);
export const realtimeChannel = (...args) => {
  if (!supabaseClient) throw new ApiError("Supabase is not configured.");
  return supabaseClient.channel(...args);
};
export const removeRealtimeChannel = channel => supabaseClient?.removeChannel(channel);
export const currentUser = (options = {}) => apiCall(async () => {
  if (!supabaseClient) throw new ApiError("Sign in to continue.");
  const { data, error } = await supabaseClient.auth.getUser();
  if (error) throw error;
  return { data: data.user };
}, { timeoutMs: 10000, ...options });
export { auth, supabaseClient, apiCall, ApiError, userMessage };
window.VeritasApi = { apiCall, rpc, edge, storageUpload, storageSignedUrl, storageRemove, tableQuery, realtimeChannel, removeRealtimeChannel, currentUser, isConfigured: Boolean(supabaseClient), userMessage, ApiError };
