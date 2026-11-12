import { test, expect } from "@playwright/test";

test("production shell works offline and never caches private API routes", async ({ page, context }) => {
  await page.goto("/");
  await page.waitForFunction(async () => "serviceWorker" in navigator && Boolean((await navigator.serviceWorker.ready).active));
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  const cached = await page.evaluate(async () => {
    await fetch("/rest/v1/rpc/pwa-cache-probe", { method: "GET" }).catch(() => {});
    await fetch("/auth/v1/user").catch(() => {});
    const cacheNames = await caches.keys();
    const urls = (await Promise.all(cacheNames.map(async key => (await caches.open(key)).keys()))).flat().map(request => new URL(request.url).pathname);
    return { cacheNames, urls };
  });
  expect(cached.urls).toContain("/");
  expect(cached.urls.some(url => /\/(?:rest\/v1|auth\/v1|functions\/v1|realtime\/v1|storage\/v1)(?:\/|$)/.test(url))).toBe(false);

  await context.setOffline(true);
  await expect(page.locator("#pwa-status")).toContainText("You’re offline");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/Veritas/);
  await expect(page.locator("#screen-auth")).toHaveClass(/active/, { timeout: 10_000 });
  await context.setOffline(false);
});
