import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundedRequestText, RequestSizeError } from '../../app/supabase/functions/_shared/request-size.ts';
test('request limits count actual streamed UTF-8 bytes, even without content-length', async () => {
  const request = body => new Request('https://veritas.test', { method: 'POST', body });
  assert.equal(await boundedRequestText(request('é'), 2), 'é');
  await assert.rejects(() => boundedRequestText(request('éé'), 3), RequestSizeError);
  await assert.rejects(() => boundedRequestText(new Request('https://veritas.test', { method: 'POST', body: 'a', headers: { 'content-length': '1000' } }), 10), RequestSizeError);
});
