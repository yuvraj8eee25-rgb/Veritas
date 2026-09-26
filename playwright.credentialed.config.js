import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";

export default defineConfig({
  ...base,
  testMatch: "credentialed.spec.js",
  fullyParallel: false,
  workers: 1,
  timeout: 5 * 60_000,
  expect: { timeout: 30_000 }
});
