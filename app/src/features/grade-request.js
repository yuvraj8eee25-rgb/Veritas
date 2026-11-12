export function gradeRequest(storage, submissionId, version, cryptoApi = globalThis.crypto) {
  const key = `veritas:classroom-grade:${submissionId}:${version}`;
  let requestId = storage.getItem(key);
  if (!requestId) {
    requestId = cryptoApi.randomUUID();
    storage.setItem(key, requestId);
  }
  return { key, requestId };
}

export function clearGradeRequest(storage, key) {
  storage.removeItem(key);
}
