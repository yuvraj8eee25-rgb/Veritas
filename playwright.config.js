import { defineConfig, devices } from "@playwright/test";

const credentialed = process.env.VERITAS_E2E_CREDENTIALS === "true";
const testSupabaseUrl = credentialed ? process.env.VITE_SUPABASE_URL : "https://veritas-e2e-placeholder.supabase.co";
const testSupabaseAnonKey = credentialed ? process.env.VITE_SUPABASE_ANON_KEY : "veritas-e2e-public-placeholder";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: credentialed ? "credentialed.spec.js" : "smoke.spec.js",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure", channel: "chromium", ...devices["Desktop Chrome"] },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: testSupabaseUrl || "https://veritas-e2e-placeholder.supabase.co",
      VITE_SUPABASE_ANON_KEY: testSupabaseAnonKey || "veritas-e2e-public-placeholder",
      VITE_SITE_URL: credentialed ? (process.env.VITE_SITE_URL || "http://127.0.0.1:4173") : "http://127.0.0.1:4173"
    }
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
