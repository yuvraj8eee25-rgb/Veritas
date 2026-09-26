import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const uid = "00000000-0000-4000-8000-000000000011";
const jwt = () => {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: uid, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.local-test-signature`;
};

async function mockSupabase(page) {
  await page.route("**/rest/v1/**", async route => route.fulfill({ json: {} }));
  await page.route("**/auth/v1/token**", async route => {
    return route.fulfill({ json: { access_token: jwt(), refresh_token: "local-test-refresh", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid, aud: "authenticated", role: "authenticated", email: "tester@example.invalid", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: new Date().toISOString() } } });
  });
  await page.route("**/auth/v1/user**", async route => route.fulfill({ json: { id: uid, aud: "authenticated", role: "authenticated", email: "tester@example.invalid", app_metadata: {}, user_metadata: {} } }));
  await page.route("**/rest/v1/rpc/classroom_command**", async route => route.fulfill({ json: { user: uid, role: "student", cohorts: [], assignments: [], submissions: [], members: [], organizations: [], drafts: [], invites: [], announcements: [], reads: [] } }));
  await page.route("**/rest/v1/profiles**", async route => route.fulfill({ json: [] }));
  await page.route("**/functions/v1/**", async route => route.fulfill({ json: { ok: false } }));
  await page.route("**/storage/v1/**", async route => route.fulfill({ json: {} }));
}

async function signIn(page) {
  await mockSupabase(page);
  await page.goto("/");
  await expect(page.locator("#screen-auth")).toHaveClass(/active/, { timeout: 8_000 });
  await page.locator("#auth-email").fill("tester@example.invalid");
  await page.locator("#auth-password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Log In" }).last().click();
  await expect(page.locator("#screen-home")).toHaveClass(/active/, { timeout: 8_000 });
}

async function expectAccessible(page, name) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(result.violations, `${name}: ${result.violations.map(v => `${v.id}: ${v.help}`).join("; ")}`).toEqual([]);
}

test("sign-in validation, successful mocked sign-in, and offline practice persistence", async ({ page }) => {
  await mockSupabase(page);
  await page.goto("/");
  await expect(page.locator("#screen-auth")).toHaveClass(/active/, { timeout: 8_000 });
  await page.getByRole("button", { name: "Log In" }).last().click();
  await expect(page.locator("#auth-alert")).toContainText("Please enter both email and password");
  await expectAccessible(page, "sign-in");
  await page.locator("#auth-email").fill("tester@example.invalid");
  await page.locator("#auth-password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Log In" }).last().click();
  await expect(page.locator("#screen-home")).toHaveClass(/active/, { timeout: 8_000 });
  await expectAccessible(page, "home");
  await page.evaluate(() => localStorage.setItem("veritas_save_v1", JSON.stringify({ totalXp: 42 })));
  await page.reload();
  await expect(page.locator("#screen-home")).toHaveClass(/active/, { timeout: 8_000 });
  const savedXp = await page.evaluate(() => JSON.parse(localStorage.getItem("veritas_save_v1")).totalXp);
  expect(savedXp).toBe(42);
});

test("major debate, evidence, and Classroom screens pass automated accessibility scans", async ({ page }) => {
  await signIn(page);
  for (const [nav, screen] of [["ai-debate", "ai-debate"], ["investigation", "investigation"], ["classroom", "classroom"]]) {
    await page.locator(`[data-nav="${nav}"]`).first().click();
    await expect(page.locator(`#screen-${screen}`)).toHaveClass(/active/);
    if (screen === "classroom") await expect(page.locator("#screen-classroom .classroom-wrap")).toContainText("Classroom");
    await expectAccessible(page, screen);
    if (screen === "classroom") {
      await page.getByRole("button", { name: "Create cohort" }).click();
      await expect(page.locator(".cw-dialog")).toBeVisible();
      await expectAccessible(page, "Classroom create dialog");
      await page.keyboard.press("Escape");
      await expect(page.locator(".cw-dialog")).toBeHidden();
      const focusAction = await page.evaluate(() => document.activeElement?.dataset?.action);
      expect(focusAction).toBe("cohort");
    }
  }
});

test("responsive dashboard has no horizontal page overflow", async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 375, height: 812 });
  const sizes = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.viewport + 1);
});
