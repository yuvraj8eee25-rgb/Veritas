# Veritas — Agentic AI Investigation Platform

> **Tech Zephyr 4.0 — Agentic AI Hackathon MVP** at **IIT Bhubaneswar**

Veritas extends traditional AI debate coaching into a **genuinely agentic fact & logic scanner**. Rather than sending a prompt directly to an LLM for an immediate response, Veritas deploys an **autonomous controller loop** that investigates complex claims step-by-step: planning research, selecting tools, evaluating intermediate results, adapting to failures, and synthesizing verified verdicts.

---

## 🏛️ Architecture Overview

```text
               ┌────────────────────────┐
               │    USER PROPOSITION    │
               └───────────┬────────────┘
                           │
                           ▼
               ┌────────────────────────┐
               │   AGENT CONTROLLER     │
               └───────────┬────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         │                                   │
         ▼                                   ▼
┌─────────────────┐                 ┌─────────────────┐
│ TOOL REGISTRY   │                 │ AGENT EVALUATOR │
├─────────────────┤                 ├─────────────────┤
│ understand_claim│                 │ - Utility Check │
│ search_web      │                 │ - Quality Rating│
│ analyze_evidence│                 │ - Contradictions│
│ compare_sources │                 │ - Re-planning   │
│ final_verify    │                 └────────┬────────┘
└────────┬────────┘                          │
         │                                   │
         └─────────────────┬─────────────────┘
                           │
                           ▼
              ┌───────────────────────────┐
              │ ADAPTATION & REPLAN ENGINE│
              └────────────┬──────────────┘
                           │
                           ▼
              ┌───────────────────────────┐
              │  LIVE EXECUTION TRACE UI  │
              └────────────┬──────────────┘
                           │
                           ▼
              ┌───────────────────────────┐
              │       FINAL VERDICT       │
              └───────────────────────────┘
```

---

## 🔄 Agentic Decision Loop

The core controller operates on an iterative feedback loop:

```text
Goal → Understand → Plan → Select Action → Execute Tool → Observe Result → Evaluate → Adapt / Replan → Verify → Final Outcome
```

### Deterministic & LLM-Driven Capabilities:
1. **Understand & Decompose (`understand_claim`)**: Deconstructs user claim into 3 testable sub-claims and formulates search vectors.
2. **Multi-Angle Research (`search_web`)**: Retrieves academic, policy, and empirical sources.
3. **Evidence Extraction (`analyze_evidence`)**: Categorizes evidence into supporting vs. opposing points with authority metrics.
4. **Cross-Examination (`compare_sources`)**: Detects conflicts, ambiguities, and alignment across independent sources.
5. **Final Audit (`final_verification`)**: Calculates multi-variable confidence score (0–100%) and renders structured verdict.

---

## ⚡ Real-Time Adaptation Scenarios (Demonstrable Robustness)

Veritas detects intermediate failures and dynamically alters its execution strategy:

### Scenario 1: Primary Search Failure & Recovery
- **Trigger**: Search gateway error or empty result set (`search_failure` mode).
- **Evaluation**: `AgentEvaluator` detects failed step.
- **Adaptation**: Agent logs operational reason: *"Primary search gateway failed. Switching query parameters and retrying search..."*
- **Outcome**: Re-plans search with modified parameters and recovers successfully.

### Scenario 2: Source Contradiction Resolution
- **Trigger**: Source A claims X while Source B claims Y (`conflicting_evidence` mode).
- **Evaluation**: `AgentEvaluator` flags contradiction severity.
- **Adaptation**: Agent logs operational reason: *"Conflicting evidence detected on core claims. Injecting independent verification phase..."*
- **Outcome**: Launches targeted comparative verification before rendering final verdict.

---

## 🛠️ Stack & Integration

- **Frontend**: Vanilla HTML5, CSS3, ES6+ JS (No React, no bundler, direct DOM updates).
- **Backend / AI**: Supabase Edge Functions (`ai-debate`) calling Google Gemini (`gemini-3.1-flash-lite`).
- **Resilience**: Heuristic fallback engine ensures 100% crash-free execution offline or without active API keys.
- **State Management**: Bounded state object (`InvestigationState`) with hard limits:
  - `MAX_AGENT_STEPS = 8`
  - `MAX_SEARCHES = 5`
  - `MAX_SOURCES = 12`
  - `MAX_LLM_CALLS = 8`

---

## 🚀 Running Locally

1. Clone repository into local directory.
2. Open `index.html` directly in any web browser (no `npm install` or build step required).
3. Navigate to **Play → Agentic AI** in the sidebar.
4. Enter any proposition or click a Quick Prompt.
5. Select a **Failure Demo Mode** from the dropdown to demonstrate live self-recovery to judges.
6. Click **Start Autonomous Investigation**.

---

## 🎯 Hackathon Demonstration Workflow

1. Select **"Demo: Search Failure & Self-Recovery"** -> Click **Start Autonomous Investigation**.
   - Observe Step 2 fail -> Watch yellow **ADAPTATION TRIGGERED** card appear live in the trace -> Watch agent re-plan search and finalize verdict.
2. Select **"Demo: Conflicting Evidence Resolution"** -> Click **Start Autonomous Investigation**.
   - Observe Step 4 detect contradiction between sources -> Watch agent inject verification phase -> Observe resolved verdict with confidence breakdown.
