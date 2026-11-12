import { test, expect } from "@playwright/test";

const configured = process.env.VERITAS_E2E_TEST_PROJECT === "true"
  && Boolean(process.env.VERITAS_E2E_STUDENT_EMAIL && process.env.VERITAS_E2E_STUDENT_PASSWORD)
  && Boolean(process.env.VERITAS_E2E_COACH_EMAIL && process.env.VERITAS_E2E_COACH_PASSWORD)
  && Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY);

test.skip(!configured, "Requires a dedicated, disposable Veritas test project with Classroom migrations and server-side AI/search providers; never use production accounts.");

async function login(page, email, password) {
  await page.goto("/");
  await expect(page.locator("#screen-auth")).toHaveClass(/active/, { timeout: 10_000 });
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill(password);
  await page.getByRole("button", { name: "Log In" }).last().click();
  await expect(page.locator("#screen-home")).toHaveClass(/active/, { timeout: 20_000 });
}

test("AI debate and Evidence Lab return validated, clearly identified results", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  await login(page, process.env.VERITAS_E2E_STUDENT_EMAIL, process.env.VERITAS_E2E_STUDENT_PASSWORD);
  await page.locator('[data-nav="ai-debate"]').first().click();
  await page.locator("#aidebate-topic-input").fill("School uniforms should be optional.");
  await page.locator("#aidebate-start-btn").click();
  await expect(page.locator("#screen-ai-debate-room")).toHaveClass(/active/, { timeout: 15_000 });
  for (const argument of [
    "Uniform policies restrict personal expression without proving they improve learning.",
    "Schools can set appropriate standards while still allowing reasonable choices.",
    "Evidence should compare learning outcomes before and after a flexible uniform policy."
  ]) {
    await page.locator("#aidebate-input").fill(argument);
    await page.locator("#aidebate-send-btn").click();
    if (argument.startsWith("Schools")) await expect(page.locator("#aidebate-live-status")).toContainText(/Your turn|referee|Feedback|Estimated/i, { timeout: 60_000 });
    else await expect(page.locator("#aidebate-live-status")).toContainText(/Your turn/i, { timeout: 60_000 });
  }
  await expect(page.locator("#aidebate-ended-panel")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator("#aidebate-live-status")).toContainText(/Estimated feedback ready|Feedback ready/);
  await page.locator('[data-nav="investigation"]').first().click();
  await page.locator("#agent-claim-input").fill("School uniforms should be optional.");
  await page.locator("#agent-start-btn").click();
  await expect(page.locator("#agent-verdict-card")).toBeVisible({ timeout: 90_000 });
  await expect(page.locator("#agent-verdict-summary")).not.toBeEmpty();
  await expect(page.locator("#agent-verdict-card")).toContainText(/AI|estimate|fallback|search/i);
});

test("Classroom invitation, submission, coach grading, and private attachment access", async ({ browser }) => {
  const coach = await browser.newPage();
  const student = await browser.newPage();
  await login(coach, process.env.VERITAS_E2E_COACH_EMAIL, process.env.VERITAS_E2E_COACH_PASSWORD);
  await coach.locator('[data-nav="classroom"]').first().click();
  await expect(coach.locator("#screen-classroom .classroom-wrap")).toContainText(/Your debate workspace/i, { timeout: 20_000 });
  const suffix = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const cohortName = `E2E ${suffix}`;
  const assignmentName = `Attachment flow ${suffix}`;
  await coach.getByRole("button", { name: "Create cohort" }).click();
  await coach.locator(".cw-dialog input[name=name]").fill(cohortName);
  await coach.locator(".cw-dialog").getByRole("button", { name: "Save" }).click();
  await coach.getByRole("button", { name: "Open cohort" }).click();
  await coach.locator('.cw-tabs button[data-id="Assignments"]').click();
  await coach.getByRole("button", { name: "Create assignment" }).click();
  await coach.locator(".cw-dialog input[name=title]").fill(assignmentName);
  await coach.locator(".cw-dialog textarea[name=instructions]").fill("Submit a short reasoned response and a text attachment.");
  await coach.locator('.cw-dialog select[name=status]').selectOption("published");
  await coach.locator('.cw-dialog input[name=allow_files]').check();
  await coach.locator(".cw-dialog").getByRole("button", { name: "Save" }).click();
  await coach.locator('.cw-tabs button[data-id="Members"]').click();
  await coach.getByRole("button", { name: "Invite members" }).click();
  const inviteRequestPromise = coach.waitForRequest(request => request.url().endsWith("/rpc/create_classroom_invite_idempotent"));
  const inviteResponsePromise = coach.waitForResponse(response => response.url().endsWith("/rpc/create_classroom_invite_idempotent"));
  await coach.getByRole("button", { name: "Generate invitations" }).click();
  const [inviteRequest, inviteResponse] = await Promise.all([inviteRequestPromise, inviteResponsePromise]);
  const createdInvite = await inviteResponse.json();
  const invitationLink = await coach.locator(".cw-dialog input[name=link]").evaluate(input => input.value);
  expect(new URL(invitationLink).origin).toBe(new URL(process.env.VITE_SITE_URL || "http://127.0.0.1:4173").origin);
  const inviteRetry = await coach.evaluate(args => window.VeritasApi.rpc("create_classroom_invite_idempotent", args, { timeoutMs: 15_000 }), inviteRequest.postDataJSON());
  expect(inviteRetry).toMatchObject({ id: createdInvite.id, token: new URL(invitationLink).searchParams.get("classroom_invite") });

  await login(student, process.env.VERITAS_E2E_STUDENT_EMAIL, process.env.VERITAS_E2E_STUDENT_PASSWORD);
  await student.goto(invitationLink);
  await student.locator('[data-nav="classroom"]').first().click();
  await expect(student).not.toHaveURL(/classroom_invite=/);
  await student.getByRole("button", { name: "Open cohort" }).click();
  await student.locator('.cw-tabs button[data-id="Assignments"]').click();
  await student.getByRole("button", { name: "Start assignment" }).click();
  await student.locator(".cw-dialog textarea[name=content]").fill("A test response with evidence and reasoning.");
  await student.locator("input[type=file]").setInputFiles({ name: "response.txt", mimeType: "text/plain", buffer: Buffer.from("test attachment") });
  await student.getByRole("button", { name: "Submit attempt" }).click();
  await expect(student.locator(".cw-dialog")).toHaveCount(0);
  await expect(student.locator("#screen-classroom .cw-stats")).toContainText("Completed");

  await coach.getByRole("button", { name: "All cohorts" }).click();
  await coach.getByRole("button", { name: "Refresh" }).click();
  await expect(coach.getByRole("button", { name: "Open cohort" })).toBeVisible();
  await coach.getByRole("button", { name: "Open cohort" }).click();
  await coach.locator('.cw-tabs button[data-id="Overview"]').click();
  await coach.getByRole("button", { name: /Review submissions/i }).click();
  await coach.getByRole("button", { name: new RegExp(`${assignmentName} · Attempt 1`) }).click();
  await expect(coach.getByRole("button", { name: "Download response.txt" })).toBeVisible();
  const attachmentTabPromise = coach.context().waitForEvent("page");
  await coach.getByRole("button", { name: "Download response.txt" }).click();
  const attachmentTab = await attachmentTabPromise;
  await expect(attachmentTab).toHaveURL(/storage\/v1\/object\/sign\//);
  await attachmentTab.close();
  await coach.locator('.cw-dialog select[name=mode]').selectOption("graded");
  await coach.locator('.cw-dialog textarea[name=feedback]').fill("Clear evidence and reasoning.");
  const gradeRequestPromise = coach.waitForRequest(request => request.url().endsWith("/rpc/grade_classroom_submission_idempotent"));
  const gradeResponsePromise = coach.waitForResponse(response => response.url().endsWith("/rpc/grade_classroom_submission_idempotent"));
  await coach.locator(".cw-dialog [data-action=save-grade]").click();
  const [gradeRequest, gradeResponse] = await Promise.all([gradeRequestPromise, gradeResponsePromise]);
  const savedGrade = await gradeResponse.json();
  const gradeRetry = await coach.evaluate(args => window.VeritasApi.rpc("grade_classroom_submission_idempotent", args, { timeoutMs: 15_000 }), gradeRequest.postDataJSON());
  expect(gradeRetry).toMatchObject({ id: savedGrade.id, version: savedGrade.version, score: savedGrade.score });
  await expect(coach.locator("#toast-root")).toContainText(/Feedback saved/);
  await coach.locator(".cw-dialog").getByRole("button", { name: "Close" }).click();
  await coach.locator(".cw-dialog").getByRole("button", { name: "Discard and close" }).click();
  await expect(coach.locator(".cw-dialog")).toBeHidden();
  await coach.close();
  await student.close();
});
