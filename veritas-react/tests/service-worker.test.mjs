import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('worker excludes account/API responses and demo cannot replace the offline app shell', async () => {
  const handlers = {};
  const stored = new Map([['/', new Response('app-shell')], ['/offline.html', new Response('offline-page')]]);
  let offline = false;
  const key = request => typeof request === 'string' ? request : new URL(request.url).pathname;
  const cache = {
    put: async (request, response) => stored.set(key(request), response),
    keys: async () => [...stored.keys()].map(path => new Request(`https://veritas.test${path}`)),
    delete: async request => stored.delete(key(request)),
  };
  vm.runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    URL, self: { location: { origin: 'https://veritas.test' }, addEventListener: (name, fn) => handlers[name] = fn },
    caches: { open: async () => cache, match: async request => stored.get(key(request))?.clone() },
    fetch: async request => { if (offline) throw new Error('offline'); return new Response(new URL(request.url).pathname); },
  });
  function dispatch(path, mode = 'cors', headers = {}) {
    const pending = [];
    let response;
    handlers.fetch({ request: { url: `https://veritas.test${path}`, method: 'GET', mode, headers: new Headers(headers) },
      respondWith: promise => response = promise, waitUntil: promise => pending.push(promise) });
    return { response, pending };
  }
  assert.equal(dispatch('/api/health').response, undefined);
  assert.equal(dispatch('/private.json').response, undefined);
  assert.equal(dispatch('/icon.svg', 'cors', { authorization: 'Bearer secret' }).response, undefined);
  assert.equal(await (await dispatch('/demo/', 'navigate').response).text(), '/demo/');
  assert.equal(await stored.get('/').clone().text(), 'app-shell');
  offline = true;
  assert.equal(await (await dispatch('/workspace/study', 'navigate').response).text(), 'app-shell');
  assert.equal(await (await dispatch('/demo/', 'navigate').response).text(), 'offline-page');
});
