const state = { step: 1, submitted: false, coachNote: "", drillAssigned: false };
const byId = (id) => document.getElementById(id);
const text = (id, value) => { byId(id).textContent = value; };

function setView(view) {
  document.querySelectorAll(".view-tab").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  byId("student-view").hidden = view !== "student";
  byId("coach-view").hidden = view !== "coach";
  if (view === "coach") updateCoach();
}

function setStep(step, focus = true) {
  state.step = step;
  [1, 2, 3].forEach((number) => {
    byId(`step-${number}`).hidden = number !== step;
    const indicator = document.querySelector(`[data-progress="${number}"]`);
    indicator.classList.toggle("is-current", number === step);
    indicator.classList.toggle("is-done", number < step);
    if (number === step) indicator.setAttribute("aria-current", "step");
    else indicator.removeAttribute("aria-current");
  });
  if (step === 3) updateReview();
  if (focus) byId(`step-${step}`).querySelector("h3")?.focus();
  updateCoach();
}

function presentParts() {
  return {
    claim: byId("claim").value.trim().length >= 12,
    evidence: byId("evidence").value.trim().length >= 12,
    reasoning: byId("reasoning").value.trim().length >= 12,
  };
}

function updateReview() {
  const parts = presentParts();
  const count = Object.values(parts).filter(Boolean).length;
  text("structure-count", `${count} of 3 parts present`);
  text("review-heading", count === 3 ? "A more careful case is taking shape." : "Your draft has room to grow.");
  Object.entries(parts).forEach(([key, present]) => {
    const row = document.querySelector(`[data-review="${key}"]`);
    row.classList.toggle("needs-work", !present);
    row.querySelector(".review-check").textContent = present ? "✓" : "!";
    row.querySelector(".review-state").textContent = present ? "IN DRAFT" : "ADD A LITTLE MORE";
  });
  const selfChecks = [byId("check-concern").checked, byId("check-limit").checked].filter(Boolean).length;
  text("fairness-count", `${selfChecks} of 2 checks selected`);
}

function updateCoach() {
  const parts = presentParts();
  const count = Object.values(parts).filter(Boolean).length;
  const submitted = state.submitted;
  text("coach-status", submitted ? "Walkthrough complete" : "In progress");
  text("coach-structure", submitted ? `${count} of 3 parts` : "Waiting for review");
  text("coach-claim", submitted ? byId("claim").value.trim() : "Complete the student walkthrough to see the draft here.");
  text("coach-response", submitted ? byId("response").value.trim() : "The student’s response will appear here.");

  const acknowledges = byId("check-concern").checked;
  const qualifies = byId("check-limit").checked;
  text("next-practice-title", acknowledges && qualifies ? "Compare evidence across sources" : "Answer the strongest concern");
  text("next-practice-copy", acknowledges && qualifies
    ? "The student has checked the main trade-off and the source limit. Next, compare independent sources and note where they disagree."
    : "Have the student name the trade-off and add one sentence about what evidence would help resolve it.");
  if (byId("coach-note") !== document.activeElement) byId("coach-note").value = state.coachNote;
  text("coach-message", state.drillAssigned ? "Next drill added to this demo session." : "");
}

document.querySelectorAll(".view-tab").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});
document.querySelector("[data-open-coach]").addEventListener("click", () => setView("coach"));
document.querySelectorAll("[data-back]").forEach((button) => {
  button.addEventListener("click", () => setStep(Number(button.dataset.back)));
});

byId("case-form").addEventListener("submit", (event) => {
  event.preventDefault();
  setStep(2);
});

byId("response-form").addEventListener("submit", (event) => {
  event.preventDefault();
  state.submitted = true;
  setStep(3);
  text("student-message", "Review ready. Your responses are only held in this open browser tab.");
});

byId("coach-note-form").addEventListener("submit", (event) => {
  event.preventDefault();
  state.coachNote = byId("coach-note").value.trim();
  text("note-message", state.coachNote ? "Feedback saved in this preview." : "Write a short next step before saving feedback.");
});

byId("assign-drill").addEventListener("click", () => {
  state.drillAssigned = true;
  updateCoach();
});

byId("reset-demo").addEventListener("click", () => {
  byId("case-form").reset();
  byId("response-form").reset();
  byId("coach-note-form").reset();
  state.step = 1;
  state.submitted = false;
  state.coachNote = "";
  state.drillAssigned = false;
  text("student-message", "");
  text("coach-message", "");
  text("note-message", "");
  setView("student");
  setStep(1, false);
});

document.querySelectorAll("#case-form textarea, #response-form textarea, #response-form input").forEach((control) => {
  control.addEventListener("input", () => { state.submitted = false; updateCoach(); });
  control.addEventListener("change", () => { state.submitted = false; updateCoach(); });
});

setStep(1, false);
