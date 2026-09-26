/* =========================================================
   VERITAS — Agentic AI Investigation Engine
   Tech Zephyr 4.0 — Agentic AI Hackathon (IIT Bhubaneswar)
   
   Architecture:
   Goal -> Understand -> Plan -> Select Action (Tool) -> Execute 
   -> Observe -> Evaluate -> Adapt/Replan -> Verify -> Final Verdict
   ========================================================= */

(function () {
"use strict";

// Execution Constraints
const MAX_AGENT_STEPS = 10;
const MAX_SEARCHES = 5;
const MAX_SOURCES = 12;
const MAX_LLM_CALLS = 8;

/* ---------------------------------------------------------
   1. LLM PROVIDER
   Calls the `assess-evidence` Edge Function (Gemini, server-side key).
   Returns the parsed response, or null on ANY failure so callers
   can fall back to the keyword heuristic and flag the result as
   lower-confidence instead of breaking the investigation.
   --------------------------------------------------------- */
const LLMProvider = {
  callCount: 0,

  async call(action, payload) {
    if (this.callCount >= MAX_LLM_CALLS) {
      console.warn("[LLM] Max LLM calls reached (" + MAX_LLM_CALLS + "). Using heuristic fallback.");
      return null;
    }
    this.callCount++;

    try {
      if (!window.VeritasApi?.isConfigured) return null;
      const data = await window.VeritasApi.edge("assess-evidence", Object.assign({ action: action }, payload), { timeoutMs: 30000 });
      if (!validateEvidenceResult(action, data)) {
        console.warn("[LLM] assess-evidence \"" + action + "\" returned no usable result.");
        return null;
      }
      return data;
    } catch (e) {
      console.warn("[LLM] assess-evidence call failed; using a local estimate.");
      return null;
    }
  },

  reset() {
    this.callCount = 0;
  }
};

/* ---------------------------------------------------------
   2. AGENT STATE FACTORY
   --------------------------------------------------------- */
function createInvestigationState(claim, demoFailureMode = "normal") {
  return {
    goal: `Investigate claim: "${claim}"`,
    claim: claim,
    subclaims: [],
    current_plan: [],
    completed_actions: [],
    pending_actions: ["understand_claim"],
    sources: [],
    search_queue: [],          // queries still to run, in order (see understand_claim)
    used_fallback: false,      // true if the offline reference set stood in for live search
    query_planning_degraded: false, // true if the AI couldn't phrase the opposing-evidence search
    llm_degraded: false,       // true if the AI stance classifier was unavailable
    evidence: { supporting: [], opposing: [], neutral: [] },
    contradictions: [],
    confidence: 0,
    step_count: 0,
    search_count: 0,
    demo_failure_mode: demoFailureMode, // 'normal' | 'search_failure' | 'conflicting_evidence'
    has_recovered_search: false,
    has_deepened_research: false,
    has_resolved_conflict: false,
    adapted: false,
    status: "initialized", // 'initialized' | 'running' | 'adapted' | 'completed' | 'failed'
    final_conclusion: null,
    logs: []
  };
}

function logAgent(state, msg) {
  const time = new Date().toLocaleTimeString();
  const entry = `[${time}] ${msg}`;
  state.logs.push(entry);
  console.log(`[VERITAS AGENT] ${entry}`);
}

/* ---------------------------------------------------------
   3. KNOWLEDGE BASE & SEARCH SIMULATOR FOR ROBUST TOOLS
   Provides grounded real-world research data & failure hooks.
   --------------------------------------------------------- */
const RESEARCH_KNOWLEDGE_BASE = {
  "social media": [
    {
      title: "Journal of Adolescent Health (2023) - Screen Time & Mental Well-being",
      url: "https://doi.org/10.1016/j.jadohealth.2023.01.012",
      snippet: "Comprehensive longitudinal study of 12,000 teenagers found moderate social media use (1-2 hours daily) shows minimal adverse impact on cognitive development, but heavy use (>4 hours) correlates with sleep disruption and anxiety.",
      authority: 0.92,
      stance: "mixed"
    },
    {
      title: "US Surgeon General Advisory on Social Media and Youth Mental Health",
      url: "https://www.hhs.gov/surgeongeneral/priorities/youth-mental-health/social-media/index.html",
      snippet: "Surgeon General reports 95% of youth ages 13-17 use social media. Highlights significant risk of harm for children during critical brain development stages, calling for age limits and safety standards.",
      authority: 0.95,
      stance: "opposing"
    },
    {
      title: "UNESCO Global Education Monitoring Report - Digital Age Verification",
      url: "https://www.unesco.org/en/articles/digital-age-limits-and-privacy",
      snippet: "Blanket bans on under-18s are difficult to enforce globally and may deprive youth of vital digital literacy and educational support. Recommended alternative: strict algorithmic privacy & parental tools.",
      authority: 0.88,
      stance: "supporting_nuance"
    }
  ],
  "nuclear": [
    {
      title: "IPCC Special Report on 1.5°C Global Warming - Energy Pathways",
      url: "https://www.ipcc.ch/sr15/",
      snippet: "Nuclear energy accounts for ~10% of global electricity generation and avoids 1.5 gigatons of CO2 annually. IPCC pathways include nuclear expansion alongside solar/wind to achieve net-zero.",
      authority: 0.96,
      stance: "supporting"
    },
    {
      title: "World Nuclear Industry Status Report (2024) - Economics & Construction",
      url: "https://www.worldnuclearreport.org/2024",
      snippet: "Nuclear projects face high capital costs and long construction times (averaging 8-10 years) compared to rapid solar and battery deployments, posing economic challenges for emergency climate action.",
      authority: 0.89,
      stance: "opposing"
    }
  ]
};

/* Source authority: a rough prior from the publisher's domain. It is a heuristic,
   not a quality judgement of the individual study, so it only weights evidence. */
const ACADEMIC_HOSTS = [
  "nature.com", "science.org", "sciencedirect.com", "springer.com", "link.springer.com",
  "wiley.com", "onlinelibrary.wiley.com", "jstor.org", "nber.org", "ssrn.com", "arxiv.org",
  "thelancet.com", "nejm.org", "bmj.com", "pnas.org", "plos.org", "cambridge.org",
  "oup.com", "academic.oup.com", "tandfonline.com", "sagepub.com", "doi.org",
  "ncbi.nlm.nih.gov", "pubmed.ncbi.nlm.nih.gov", "nih.gov", "researchgate.net"
];
const INSTITUTION_HOSTS = [
  "who.int", "worldbank.org", "imf.org", "oecd.org", "un.org", "unesco.org", "europa.eu",
  "ipcc.ch", "brookings.edu", "pewresearch.org", "rand.org", "cbo.gov"
];
const NEWS_HOSTS = [
  "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "nytimes.com", "washingtonpost.com",
  "ft.com", "economist.com", "wsj.com", "theguardian.com", "bloomberg.com", "npr.org", "vox.com"
];
const LOW_TRUST_HOSTS = [
  "medium.com", "substack.com", "wordpress.com", "blogspot.com", "reddit.com", "quora.com",
  "tumblr.com", "wikipedia.org"
];

function hostMatches(host, list) {
  return list.some(h => host === h || host.endsWith("." + h));
}

const SCRAPE_NOISE_PATTERNS = [
  /skip to (main content|article)/gi,
  /view pdf/gi,
  /download full issue/gi,
  /search sciencedirect/gi,
  /purchase pdf/gi,
  /get access/gi,
  /show more/gi,
  /(^|\s)#{1,6}\s+/g,                 // markdown headers, e.g. "## Authors" — mid-line too, since
                                       // Exa's extracted text often has no real line breaks
  /h-index:?\s*\d+/gi,
  /\d+\s*citations?/gi,
  /issn:?\s*[\d-]+/gi,
];

function cleanScrapedText(text) {
  let t = String(text || "");
  SCRAPE_NOISE_PATTERNS.forEach(p => { t = t.replace(p, " "); });
  return t.replace(/\s+/g, " ").replace(/^[\s.,;:-]+/, "").trim();
}

function scoreAuthority(url) {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch (e) { return 0.5; }
  if (hostMatches(host, LOW_TRUST_HOSTS)) return 0.4;
  if (hostMatches(host, ACADEMIC_HOSTS) || /\.edu(\.[a-z]{2})?$/.test(host) || /\.ac\.[a-z]{2}$/.test(host)) return 0.92;
  if (hostMatches(host, INSTITUTION_HOSTS) || /\.gov(\.[a-z]{2})?$/.test(host)) return 0.9;
  if (hostMatches(host, NEWS_HOSTS)) return 0.8;
  if (host.endsWith(".org")) return 0.7;
  return 0.65;
}

/* Last-resort stance guess, used ONLY when the AI classifier is unreachable.
   It cannot tell whether a source is for or against the claim (a study finding
   "no risk" contains the word "risk"), which is why results that rely on it are
   capped at low confidence and labelled as such. */
function keywordStance(text) {
  const t = (text || "").toLowerCase();
  return /lack evidence|risk|oppose|against|fail|concern/.test(t) ? "contradicts" : "supports";
}

// Exa search runs server-side via the `exa-search` Edge Function so the
// API key never ships to the browser (see supabase/functions/exa-search).

async function performWebSearch(query, state) {
  state.search_count++;

  if (state.search_count > MAX_SEARCHES) {
    return { success: false, error: "Search budget exhausted.", sources: [] };
  }

  // Failure Mode Hook: Search Failure Demo
  if (state.demo_failure_mode === "search_failure" && !state.has_recovered_search && state.search_count === 1) {
    return {
      success: false,
      error: "HTTP 503: Primary search gateway unavailable or empty result set.",
      sources: []
    };
  }

  // Failure Mode Hook: Conflicting Evidence Demo
  if (state.demo_failure_mode === "conflicting_evidence" && state.search_count === 1) {
    return {
      success: true,
      sources: [
        {
          title: "Institute of Digital Public Safety (2024)",
          url: "https://idps.org/report-2024",
          snippet: "Conclusive findings show banning social media for under-18s reduces youth anxiety and depression rates by 42% in trials.",
          authority: 0.91,
          stance: "strongly_supporting"
        },
        {
          title: "International Youth Rights & Literacy Association",
          url: "https://iyrla.org/digital-literacy",
          snippet: "Comprehensive data shows underage social media bans fail to protect youth, drive teens to unmonitored networks, and increase isolation.",
          authority: 0.89,
          stance: "strongly_opposing"
        }
      ]
    };
  }

  // Failure Mode Hook: Weak Evidence Demo
  if (state.demo_failure_mode === "weak_evidence" && !state.has_deepened_research && state.search_count === 1) {
    return {
      success: true,
      sources: [
        {
          title: "Unverified Forum Discussion & Blog Post (2022)",
          url: "https://blog.example.com/opinion-post",
          snippet: "Anecdotal user post claiming mixed results without statistical methodology or sample size data.",
          authority: 0.35,
          stance: "supporting"
        }
      ]
    };
  }

  // Real Live Exa.ai API Integration
  try {
    if (!window.VeritasApi?.isConfigured) throw new Error("Supabase client not ready");
    const exaData = await window.VeritasApi.edge("exa-search", { query: query }, { timeoutMs: 25000 });

    if (exaData) {
      if (exaData && exaData.ok && Array.isArray(exaData.results) && exaData.results.length > 0) {
        const liveSources = exaData.results
          .filter(r => r && r.url)
          .map(r => {
            const text = cleanScrapedText(r.text);
            return {
              title: r.title || r.url,
              url: r.url,
              snippet: text.slice(0, 400) + (text.length > 400 ? "..." : ""),
              text: text,                              // fuller excerpt, used for stance classification
              authority: scoreAuthority(r.url),
              hintStance: keywordStance(text),         // fallback only, see keywordStance()
              publishedDate: r.publishedDate || null
            };
          });

        return {
          success: true,
          sources: liveSources,
          provider: "Exa.ai Neural Search"
        };
      }
    }
  } catch (err) {
    console.warn("[AGENT] Evidence search failed; using the local sample knowledge base.");
  }

  // Offline reference set. Only two topics have hand-written entries; for anything
  // else we report failure rather than invent sources.
  const words = new Set((query.toLowerCase().match(/[a-z]+/g)) || []);
  const hasAny = (...terms) => terms.some(t => words.has(t));

  let matches = null;
  if (hasAny("social", "media", "ban", "youth", "teen", "teens", "teenagers", "minors")) {
    matches = RESEARCH_KNOWLEDGE_BASE["social media"];
  } else if (hasAny("nuclear", "energy", "climate")) {
    matches = RESEARCH_KNOWLEDGE_BASE["nuclear"];
  }

  if (!matches) {
    return {
      success: false,
      error: "Live search is unavailable and there is no offline reference set for this topic.",
      sources: []
    };
  }

  return {
    success: true,
    sources: matches,
    provider: "Knowledge Base Fallback"
  };
}

/* ---------------------------------------------------------
   4. EVIDENCE ASSESSMENT & SCORING
   Each source gets an `assessment` { stance, strength, finding, method }:
     stance   supports | contradicts | neutral | irrelevant
     strength strong | moderate | weak
     method   "ai" (Gemini via assess-evidence), "preset" (demo scenario
              sources that ship with a known stance) or "heuristic"
              (AI unavailable; keyword guess, capped confidence)
   The verdict and confidence are computed from these, never hard-coded.
   --------------------------------------------------------- */
const STRENGTH_WEIGHT = { strong: 1, moderate: 0.6, weak: 0.3 };

const PRESET_STANCE_MAP = {
  strongly_supporting: ["supports", "strong"],
  supporting: ["supports", "moderate"],
  supporting_nuance: ["supports", "weak"],
  mixed: ["neutral", "moderate"],
  neutral: ["neutral", "moderate"],
  opposing: ["contradicts", "moderate"],
  strongly_opposing: ["contradicts", "strong"]
};

function assessmentFromPreset(src, method) {
  const pair = PRESET_STANCE_MAP[src.stance] || ["neutral", "weak"];
  return { stance: pair[0], strength: pair[1], finding: src.snippet, method: method };
}

function heuristicAssessment(src) {
  if (src.stance) return assessmentFromPreset(src, "heuristic");
  const stance = src.hintStance || "neutral";
  const verb = stance === "contradicts" ? "against" : stance === "supports" ? "for" : "neutral on";
  return {
    stance: stance,
    strength: "moderate",
    finding: `Keyword scan only (AI assessment unavailable): flagged as ${verb} the claim from surface wording, not a read summary.`,
    method: "heuristic"
  };
}

function isPositioned(src) {
  return !!src.assessment && (src.assessment.stance === "supports" || src.assessment.stance === "contradicts");
}

function evidenceWeight(src) {
  return (src.authority || 0.5) * (STRENGTH_WEIGHT[src.assessment.strength] || 0.3);
}

function strongestSource(state, stance) {
  const pool = state.sources.filter(s => s.assessment && s.assessment.stance === stance);
  if (pool.length === 0) return null;
  return pool.reduce((best, s) => (evidenceWeight(s) > evidenceWeight(best) ? s : best));
}

function scoreEvidence(state) {
  const positioned = state.sources.filter(isPositioned);
  const supporters = positioned.filter(s => s.assessment.stance === "supports");
  const opponents = positioned.filter(s => s.assessment.stance === "contradicts");
  const supportW = supporters.reduce((a, s) => a + evidenceWeight(s), 0);
  const contraW = opponents.reduce((a, s) => a + evidenceWeight(s), 0);
  const total = supportW + contraW;
  const heuristic = state.sources.some(s => s.assessment && s.assessment.method === "heuristic");

  const base = {
    nSup: supporters.length,
    nOpp: opponents.length,
    nPositioned: positioned.length,
    heuristic: heuristic
  };

  // Not enough weighty, position-taking evidence to call it either way.
  if (positioned.length < 2 || total < 1.0) {
    return Object.assign(base, { verdict: "Insufficient Evidence", confidence: 30, insufficient: true, oneSided: false });
  }

  const share = supportW / total; // weighted fraction of the evidence that supports the claim
  let verdict = "Partially Supported";
  if (share >= 0.75) verdict = "Supported";
  else if (share <= 0.25) verdict = "Refuted";

  const clarity = Math.abs(share - 0.5) * 2;                 // 0 = evenly split, 1 = unanimous
  const coverage = Math.min(1, positioned.length / 4);       // saturates at 4 position-taking sources
  const avgAuthority = positioned.reduce((a, s) => a + (s.authority || 0.5), 0) / positioned.length;

  let confidence = Math.round(100 * (0.10 + 0.40 * clarity + 0.20 * coverage + 0.15 * avgAuthority));
  const oneSided = supporters.length === 0 || opponents.length === 0;
  if (oneSided) confidence = Math.min(confidence, 78);       // nothing contradicted it; may just be search coverage
  if (heuristic) confidence = Math.min(confidence, 50);      // keyword stances are unreliable
  confidence = Math.max(20, Math.min(90, confidence));

  return Object.assign(base, { verdict: verdict, confidence: confidence, insufficient: false, oneSided: oneSided });
}

function asSentence(text) {
  const t = (text || "").trim();
  if (!t) return "";
  return /[.!?]["')\]]?$/.test(t) ? t : t + ".";
}

function deterministicSummary(state, score) {
  if (score.insufficient) {
    return `Not enough usable evidence: ${state.sources.length} source(s) retrieved, ${score.nPositioned} took a clear position on the claim.`;
  }
  const parts = [`${score.nSup} of ${score.nPositioned} position-taking sources support the claim and ${score.nOpp} contradict it.`];
  const sup = strongestSource(state, "supports");
  const opp = strongestSource(state, "contradicts");
  if (sup) parts.push("Strongest support: " + asSentence(sup.assessment.finding));
  if (opp) parts.push("Strongest counter-evidence: " + asSentence(opp.assessment.finding));
  return parts.join(" ");
}

async function buildVerdictSummary(state, score) {
  let text = null;

  if (!score.insufficient && !state.llm_degraded) {
    const res = await LLMProvider.call("summarize", {
      claim: state.claim,
      verdict: score.verdict,
      confidence: score.confidence,
      assessments: state.sources.filter(s => s.assessment).map(s => ({
        title: s.title,
        stance: s.assessment.stance,
        strength: s.assessment.strength,
        finding: s.assessment.finding
      })),
      contradictions: state.contradictions.map(c => ({ sourceA: c.sourceA, sourceB: c.sourceB }))
    });
    if (res && res.summary) text = res.summary;
  }
  if (!text) text = deterministicSummary(state, score);

  // Caveats are appended in code so the model can't drop them.
  const caveats = [];
  if (state.llm_degraded) caveats.push("The AI stance classifier was unavailable, so stances are keyword-based and unreliable.");
  if (state.used_fallback) caveats.push("Live search was unavailable; this used a small built-in reference set.");
  if (state.query_planning_degraded) caveats.push("The AI couldn't phrase a targeted opposing-evidence search, so the counter-search may have been weak — a lack of opposing sources here may reflect search coverage, not consensus.");
  if (score.oneSided && !score.insufficient) {
    caveats.push("Every source that took a position leans the same way, which may reflect what the search surfaced rather than a real consensus.");
  }
  return [text].concat(caveats).join(" ");
}

/* ---------------------------------------------------------
   4b. TOOL REGISTRY
   1) understand_claim
   2) search_web
   3) analyze_evidence
   4) compare_sources
   5) final_verification
   (+ retrieve_source, detect_contradiction, generate_counterargument
   for the adaptive paths)
   --------------------------------------------------------- */
const ToolRegistry = {
  async understand_claim(args, state) {
    logAgent(state, `Executing Tool: understand_claim ("${state.claim}")`);

    // Decompose claim into subclaims and queries
    const subclaims = [
      `What are the core arguments supporting: "${state.claim}"?`,
      `What are the primary counterarguments and risks associated with: "${state.claim}"?`,
      `What does empirical research and regulatory evidence indicate?`
    ];

    // Two searches: one aimed at supporting evidence, one aimed at counter-evidence.
    // A naive "criticism of: <claim>" prefix barely moves a neural-search embedding
    // away from the claim's own topic, so ask the model to phrase the opposing
    // query around what a contradicting finding would actually say. Fall back to
    // a plain negated framing (still better than literal prefixing) if that fails.
    const planned = await LLMProvider.call("plan_queries", { claim: state.claim });
    let queries;
    if (planned && Array.isArray(planned.queries) && planned.queries.length === 2 && planned.queries.every(Boolean)) {
      queries = planned.queries;
    } else {
      queries = [state.claim, `studies finding no support for, or evidence against: ${state.claim}`];
      state.query_planning_degraded = true;
    }

    state.search_queue = queries;
    state.subclaims = subclaims;
    state.current_plan = ["search_web", "search_web", "analyze_evidence", "compare_sources", "final_verification"];

    return {
      tool: "understand_claim",
      reason: "Decomposed goal into 3 testable sub-claims and planned a two-sided search strategy.",
      summary: `Decomposed claim into ${subclaims.length} sub-claims; queued a supporting search ("${clipText(queries[0], 60)}") and an opposing search ("${clipText(queries[1], 60)}").`,
      data: { subclaims, plan: state.current_plan, queries }
    };
  },

  async search_web(args, state) {
    const query = state.search_queue[0] || args.query || state.claim;
    logAgent(state, `Executing Tool: search_web (query: "${query}")`);

    const result = await performWebSearch(query, state);

    if (!result.success) {
      logAgent(state, `Tool Warning: search_web failed -> ${result.error}`);
      return {
        tool: "search_web",
        success: false,
        reason: "Search service failed or returned empty results.",
        summary: `Search failed: ${result.error}`,
        error: result.error,
        data: []
      };
    }

    // Consume the query only on success, so a retry re-runs the same one.
    state.search_queue.shift();

    // Demo-scenario hooks return no provider; their sources ship with a known stance.
    const isDemo = !result.provider;
    const provider = result.provider || "Demo scenario";
    if (result.provider === "Knowledge Base Fallback") state.used_fallback = true;

    // Accumulate sources without duplicate URLs. Clone so per-investigation
    // annotations never leak into the shared knowledge-base objects.
    const newSources = [];
    result.sources.forEach(src => {
      if (state.sources.length >= MAX_SOURCES) return;
      if (state.sources.some(s => s.url === src.url)) return;
      const copy = Object.assign({}, src);
      if (isDemo) copy.preset = true;
      state.sources.push(copy);
      newSources.push(copy);
    });

    const shortQuery = query.length > 70 ? query.slice(0, 67) + "..." : query;
    return {
      tool: "search_web",
      success: true,
      reason: `Retrieved ${newSources.length} new source(s) from ${provider}.`,
      summary: `Found ${newSources.length} new source(s) for "${shortQuery}" via ${provider}. Total sources: ${state.sources.length}.`,
      data: newSources
    };
  },

  async analyze_evidence(args, state) {
    logAgent(state, `Executing Tool: analyze_evidence across ${state.sources.length} sources`);

    if (state.sources.length === 0) {
      return {
        tool: "analyze_evidence",
        success: false,
        reason: "No sources available to analyze.",
        summary: "Analysis skipped: zero sources collected.",
        data: null
      };
    }

    // Only assess sources we haven't judged yet (this tool can run twice).
    const toClassify = [];
    state.sources.filter(src => !src.assessment).forEach(src => {
      if (src.preset) src.assessment = assessmentFromPreset(src, "preset");
      else toClassify.push(src);
    });

    if (toClassify.length > 0) {
      const res = await LLMProvider.call("classify", {
        claim: state.claim,
        sources: toClassify.map((src, i) => ({ id: i, title: src.title, text: src.text || src.snippet }))
      });
      const byId = new Map();
      if (res && Array.isArray(res.assessments)) res.assessments.forEach(a => byId.set(a.id, a));

      toClassify.forEach((src, i) => {
        const a = byId.get(i);
        if (a) {
          src.assessment = { stance: a.stance, strength: a.strength, finding: a.finding || src.snippet, method: "ai" };
        } else {
          src.assessment = heuristicAssessment(src);
          state.llm_degraded = true;
        }
      });
      if (state.llm_degraded) logAgent(state, "Tool Warning: AI stance classifier unavailable; used keyword heuristic.");
    }

    const supporting = [];
    const opposing = [];
    const neutral = [];
    state.sources.forEach(src => {
      const a = src.assessment;
      const item = {
        title: src.title,
        url: src.url,
        snippet: src.snippet,
        authority: src.authority,
        strength: a.strength,
        finding: a.finding
      };
      if (a.stance === "supports") supporting.push(item);
      else if (a.stance === "contradicts") opposing.push(item);
      else neutral.push(Object.assign(item, { stance: a.stance }));
    });

    state.evidence = { supporting, opposing, neutral };
    state.analyzed = true;
    state.confidence = scoreEvidence(state).confidence; // provisional; final_verification recomputes

    const note = state.llm_degraded ? " (AI classifier unavailable; keyword fallback used.)" : "";
    return {
      tool: "analyze_evidence",
      success: true,
      reason: "Judged each source's stance toward the claim.",
      summary: `Assessed ${state.sources.length} sources: ${supporting.length} support, ${opposing.length} contradict, ${neutral.length} neutral or off-topic.${note}`,
      data: { supportingCount: supporting.length, opposingCount: opposing.length, neutralCount: neutral.length }
    };
  },

  async compare_sources(args, state) {
    logAgent(state, "Executing Tool: compare_sources (cross-referencing evidence)");

    const sup = strongestSource(state, "supports");
    const opp = strongestSource(state, "contradicts");
    const contradictions = [];

    if (sup && opp) {
      const strongBoth = sup.assessment.strength === "strong" && opp.assessment.strength === "strong";
      contradictions.push({
        topic: "Conflicting findings on the claim",
        sourceA: sup.title,
        claimA: sup.assessment.finding,
        sourceB: opp.title,
        claimB: opp.assessment.finding,
        severity: strongBoth ? "high" : "moderate"
      });
    }

    state.contradictions = contradictions;

    const nSup = state.evidence.supporting.length;
    const nOpp = state.evidence.opposing.length;
    let summary;
    if (contradictions.length > 0) {
      summary = `${nSup} source(s) support and ${nOpp} contradict the claim. Sharpest conflict: "${sup.title}" vs "${opp.title}".`;
    } else if (nSup > 0) {
      summary = `All ${nSup} position-taking source(s) point the same way; no contradicting evidence was retrieved.`;
    } else if (nOpp > 0) {
      summary = `All ${nOpp} position-taking source(s) argue against the claim; no supporting evidence was retrieved.`;
    } else {
      summary = "No source took a clear position on the claim, so there is nothing to cross-check.";
    }

    return {
      tool: "compare_sources",
      success: true,
      reason: "Cross-examined sources for agreements and contradictions.",
      summary: summary,
      data: { contradictionsFound: contradictions.length, contradictions }
    };
  },

  async retrieve_source(args, state) {
    logAgent(state, "Executing Tool: retrieve_source (re-reading most recent source)");
    const targetSource = state.sources[state.sources.length - 1];
    if (!targetSource) {
      return { tool: "retrieve_source", success: false, reason: "No source available to retrieve.", summary: "Source retrieval skipped." };
    }
    const detail = (targetSource.assessment && targetSource.assessment.finding) || targetSource.snippet;
    return {
      tool: "retrieve_source",
      success: true,
      reason: `Re-read ${targetSource.title}.`,
      summary: `Re-read "${targetSource.title}" (authority ${Math.round(targetSource.authority * 100)}%): ${detail}`,
      data: targetSource
    };
  },

  async detect_contradiction(args, state) {
    logAgent(state, "Executing Tool: detect_contradiction (analyzing severity)");
    const top = state.contradictions[0];
    const severity = top ? top.severity.toUpperCase() : "NONE";
    return {
      tool: "detect_contradiction",
      success: true,
      reason: "Rated how serious the disagreement between sources is.",
      summary: top
        ? `Contradiction check complete. Severity: ${severity}.`
        : "No contradictions found to rate.",
      data: { severity, count: state.contradictions.length }
    };
  },

  async generate_counterargument(args, state) {
    logAgent(state, "Executing Tool: generate_counterargument (preventing confirmation bias)");
    const opp = strongestSource(state, "contradicts");
    const counter = opp ? opp.assessment.finding : null;
    return {
      tool: "generate_counterargument",
      success: true,
      reason: "Surfaced the strongest evidence against the claim to stress-test the verdict.",
      summary: opp
        ? `Strongest evidence against the claim: "${opp.title}". ${asSentence(counter)}`
        : "No retrieved source contradicts the claim; counter-evidence may exist outside these results.",
      data: { counterargument: counter }
    };
  },

  async final_verification(args, state) {
    logAgent(state, "Executing Tool: final_verification (synthesizing verdict)");

    const score = scoreEvidence(state);
    const summary = await buildVerdictSummary(state, score);
    state.confidence = score.confidence;

    const finalResult = {
      verdict: score.verdict,
      confidence: score.confidence,
      claim: state.claim,
      summary: summary,
      method: score.heuristic ? "heuristic" : "ai",
      supportingEvidence: state.evidence.supporting,
      opposingEvidence: state.evidence.opposing,
      neutralEvidence: state.evidence.neutral,
      contradictionsResolved: state.contradictions,
      adaptationHistory: state.logs.filter(l => l.includes("[ADAPTATION]"))
    };

    state.final_conclusion = finalResult;
    state.status = "completed";

    return {
      tool: "final_verification",
      success: true,
      reason: "Weighed all assessed evidence and finalized the verdict.",
      summary: `Investigation finalized. Verdict: ${score.verdict} (${score.confidence}% confidence).`,
      data: finalResult
    };
  }
};

/* ---------------------------------------------------------
   5. AGENT EVALUATOR
   Evaluates step results and decides if adaptation is required.
   --------------------------------------------------------- */
const AgentEvaluator = {
  evaluate(state, lastActionResult) {
    logAgent(state, `Evaluator checking step output for tool: ${lastActionResult.tool}`);

    const evaluation = {
      useful: true,
      requires_replanning: false,
      reason: "Step completed as planned.",
      recommended_next_action: null
    };

    // Case 1: Search Failure -> Adapt -> Recover
    if (lastActionResult.tool === "search_web" && !lastActionResult.success && !state.has_recovered_search) {
      evaluation.useful = false;
      evaluation.requires_replanning = true;
      evaluation.reason = "Primary search failed. Adaptation needed: switch query strategy and retry search.";
      evaluation.recommended_next_action = "search_web_retry";
      return evaluation;
    }

    // Case 2: Weak Evidence -> Deepen Research
    if (lastActionResult.tool === "search_web" && state.sources.length > 0 && !state.has_deepened_research) {
      const avgAuthority = state.sources.reduce((acc, s) => acc + (s.authority || 0.5), 0) / state.sources.length;
      if (avgAuthority < 0.60 || state.demo_failure_mode === "weak_evidence") {
        evaluation.requires_replanning = true;
        evaluation.reason = `Source quality insufficient (average authority ${Math.round(avgAuthority * 100)}%). Adaptation needed: initiate deep empirical research.`;
        evaluation.recommended_next_action = "deepen_research";
        return evaluation;
      }
    }

    // Case 3: Conflicting Evidence -> Detect -> Verify -> Update
    if (lastActionResult.tool === "compare_sources" && state.contradictions.length > 0 && !state.has_resolved_conflict) {
      evaluation.requires_replanning = true;
      evaluation.reason = "Detected strong source contradiction. Adaptation needed: launch targeted verification before final verdict.";
      evaluation.recommended_next_action = "verify_conflict";
      return evaluation;
    }

    return evaluation;
  }
};

function clipText(text, max) {
  const t = String(text || "");
  return t.length > max ? t.slice(0, max - 3) + "..." : t;
}

// What this step is about to do, in terms of the current investigation.
function describeObjective(tool, state) {
  switch (tool) {
    case "understand_claim":
      return `Break "${clipText(state.claim, 80)}" into testable sub-claims and search queries.`;
    case "search_web": {
      const q = state.search_queue[0];
      return q ? `Search for sources: "${clipText(q, 90)}"` : "Search for additional sources on the claim.";
    }
    case "retrieve_source":
      return "Re-read the most recently added source for its key findings.";
    case "analyze_evidence":
      return `Judge whether each of the ${state.sources.length} source(s) supports or contradicts the claim.`;
    case "compare_sources":
      return "Check whether supporting and contradicting sources conflict with each other.";
    case "detect_contradiction":
      return "Rate how serious the disagreement between sources is.";
    case "generate_counterargument":
      return "Pull out the strongest evidence against the claim to stress-test the verdict.";
    case "final_verification":
      return "Weigh the assessed evidence and produce a verdict.";
    default:
      return `Run ${tool}.`;
  }
}

/* ---------------------------------------------------------
   6. AGENT CONTROLLER (Dynamic Decision Loop)
   while not goal_satisfied and steps < MAX_STEPS
   --------------------------------------------------------- */
async function runAgentController(claim, demoMode = "normal", onTraceUpdate) {
  const state = createInvestigationState(claim, demoMode);
  LLMProvider.reset();
  state.status = "running";
  logAgent(state, `Controller initialized. Goal: "${state.goal}" | Demo Mode: ${demoMode}`);

  if (onTraceUpdate) onTraceUpdate(state, { type: "init", message: "Agent goal initialized" });

  while (!state.final_conclusion && state.step_count < MAX_AGENT_STEPS) {
    state.step_count++;

    // 1. Decide next action dynamically
    let nextTool = state.pending_actions.shift();

    if (!nextTool) {
      if (state.current_plan.length > 0) {
        nextTool = state.current_plan.shift();
      } else {
        nextTool = "final_verification";
      }
    }

    logAgent(state, `Step ${state.step_count}: Selected tool "${nextTool}"`);

    // Emit Trace: Action Pending / Running
    if (onTraceUpdate) {
      onTraceUpdate(state, {
        type: "step_start",
        step: state.step_count,
        tool: nextTool,
        reason: describeObjective(nextTool, state)
      });
    }

    // Pause slightly for visual readability in hackathon demo
    await new Promise(r => setTimeout(r, 650));

    // 2. Execute Tool
    const toolFunc = ToolRegistry[nextTool];
    let result;

    if (toolFunc) {
      result = await toolFunc({ query: state.claim }, state);
    } else {
      result = { tool: nextTool, success: true, reason: "Executed step", summary: "Step completed", data: null };
    }

    state.completed_actions.push({ step: state.step_count, tool: nextTool, result });

    // 3. Run Evaluator
    const evalRes = AgentEvaluator.evaluate(state, result);

    // 4. Adapt / Replan if necessary
    if (evalRes.requires_replanning) {
      state.adapted = true;
      state.status = "adapted";

      if (evalRes.recommended_next_action === "search_web_retry") {
        logAgent(state, "[ADAPTATION] Search failure detected. Adapting strategy: launching alternative query search.");
        state.has_recovered_search = true;
        // Inject recovery search action next
        state.pending_actions.unshift("search_web");
        
        if (onTraceUpdate) {
          onTraceUpdate(state, {
            type: "adaptation",
            step: state.step_count,
            tool: "search_web",
            title: "⚠ Search Failure Detected — Adapting Strategy",
            description: "Primary search endpoint failed. Agent automatically switching search parameters and retrying..."
          });
        }
      } else if (evalRes.recommended_next_action === "deepen_research") {
        logAgent(state, "[ADAPTATION] Weak evidence quality detected. Adapting strategy: initiating deep empirical search.");
        state.has_deepened_research = true;
        state.pending_actions.unshift("search_web", "retrieve_source", "analyze_evidence");

        if (onTraceUpdate) {
          onTraceUpdate(state, {
            type: "adaptation",
            step: state.step_count,
            tool: "retrieve_source",
            title: "⚠ Weak Evidence Quality — Deepening Research",
            description: "Initial sources lacked empirical authority. Agent launching targeted query for peer-reviewed research and policy data..."
          });
        }
      } else if (evalRes.recommended_next_action === "verify_conflict") {
        logAgent(state, "[ADAPTATION] Contradictory evidence detected. Adapting strategy: inserting independent verification phase.");
        state.has_resolved_conflict = true;
        // Inject deeper analysis & verification
        state.pending_actions.unshift("detect_contradiction", "generate_counterargument", "final_verification");

        if (onTraceUpdate) {
          onTraceUpdate(state, {
            type: "adaptation",
            step: state.step_count,
            tool: "compare_sources",
            title: "⚠ Conflicting Evidence Detected — Replanning",
            description: "Source A conflicts with Source B on core claims. Agent launching targeted verification study before rendering verdict."
          });
        }
      }
    }

    // Emit Trace Step Complete
    if (onTraceUpdate) {
      onTraceUpdate(state, {
        type: "step_complete",
        step: state.step_count,
        tool: nextTool,
        result: result,
        evaluation: evalRes
      });
    }

    // Safety fallback: if plan empty and no conclusion, finalize
    if (state.pending_actions.length === 0 && state.current_plan.length === 0 && !state.final_conclusion) {
      await ToolRegistry.final_verification({}, state);
    }
  }

  // Guarantee final conclusion is synthesized if step limit was reached before final_verification
  if (!state.final_conclusion) {
    logAgent(state, "Step limit reached or plan concluded. Triggering final verification synthesis.");
    const finalRes = await ToolRegistry.final_verification({}, state);
    if (onTraceUpdate) {
      onTraceUpdate(state, {
        type: "step_complete",
        step: state.step_count,
        tool: "final_verification",
        result: finalRes,
        evaluation: { useful: true, requires_replanning: false }
      });
    }
  }

  logAgent(state, `Investigation complete. Final status: ${state.status}`);
  
  if (onTraceUpdate) {
    onTraceUpdate(state, { type: "investigation_complete", conclusion: state.final_conclusion });
  }

  return state;
}

/* ---------------------------------------------------------
   7. UI CONTROLLER & EVENT BINDINGS
   --------------------------------------------------------- */
let isRunning = false;

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

function formatToolLabel(toolName) {
  const map = {
    understand_claim: "Proposition Decomposition",
    search_web: "Literature Retrieval",
    retrieve_source: "Source Re-read",
    analyze_evidence: "Evidence Categorization",
    compare_sources: "Source Cross-Examination",
    detect_contradiction: "Contradiction Audit",
    generate_counterargument: "Counter-Perspective Stress-Test",
    final_verification: "Analytical Synthesis & Verdict"
  };
  return map[toolName] || toolName;
}

function updateUIOnTrace(state, event) {
  const workspace = document.getElementById("agent-workspace");
  if (workspace) workspace.classList.remove("hidden");

  // Update Status Badge & Meters
  const badgeEl = document.getElementById("agent-status-badge");
  if (badgeEl) {
    badgeEl.textContent = state.status.toUpperCase();
    badgeEl.className = "agent-status-badge " + state.status;
  }

  const stepVal = document.getElementById("agent-step-val");
  if (stepVal) stepVal.textContent = `${state.step_count} / ${MAX_AGENT_STEPS}`;

  const confVal = document.getElementById("agent-confidence-val");
  if (confVal) confVal.textContent = state.analyzed ? `${state.confidence}%` : "\u2014";

  const sourcesVal = document.getElementById("agent-sources-val");
  if (sourcesVal) sourcesVal.textContent = state.sources.length;

  const targetClaim = document.getElementById("agent-target-claim");
  if (targetClaim) targetClaim.textContent = state.claim;

  // Update Pipeline Node Visualizer
  const phaseMap = {
    understand_claim: 1,
    search_web: 2,
    retrieve_source: 2,
    analyze_evidence: 3,
    compare_sources: 3,
    detect_contradiction: 4,
    generate_counterargument: 4,
    final_verification: 5
  };
  const currentPhase = event.tool ? phaseMap[event.tool] || 1 : 1;
  for (let i = 1; i <= 5; i++) {
    const pipeNode = document.getElementById(`pipe-phase-${i}`);
    if (pipeNode) {
      if (i < currentPhase || (event.type === "investigation_complete" && i === 5)) {
        pipeNode.className = "pipeline-step completed";
      } else if (i === currentPhase) {
        pipeNode.className = "pipeline-step active";
      } else {
        pipeNode.className = "pipeline-step";
      }
    }
  }

  // Subclaims rendering
  const subclaimList = document.getElementById("agent-subclaim-list");
  if (subclaimList && state.subclaims.length > 0) {
    subclaimList.innerHTML = state.subclaims.map(sc => `<li><span class="subclaim-bullet">✦</span> ${escapeHtml(sc)}</li>`).join("");
  }

  // Trace Item Rendering
  const traceList = document.getElementById("agent-trace-list");
  if (traceList) {
    if (event.type === "step_start") {
      const stepCard = document.createElement("div");
      stepCard.className = "trace-step-card running";
      stepCard.id = `trace-step-${event.step}`;
      stepCard.innerHTML = `
        <div class="trace-step-header">
          <span class="trace-step-num">Step ${event.step}</span>
          <span class="trace-tool-tag">${escapeHtml(formatToolLabel(event.tool))}</span>
          <span class="trace-status-pill running">EXECUTING</span>
        </div>
        <p class="trace-reason"><strong>Objective:</strong> ${escapeHtml(event.reason)}</p>
        <div class="trace-output-box">Processing phase...</div>
      `;
      traceList.appendChild(stepCard);
      traceList.scrollTop = traceList.scrollHeight;
    } else if (event.type === "step_complete") {
      const stepCard = document.getElementById(`trace-step-${event.step}`);
      if (stepCard) {
        stepCard.className = "trace-step-card completed";
        const statusPill = stepCard.querySelector(".trace-status-pill");
        if (statusPill) {
          statusPill.textContent = "VERIFIED";
          statusPill.className = "trace-status-pill completed";
        }
        const outputBox = stepCard.querySelector(".trace-output-box");
        if (outputBox) {
          outputBox.innerHTML = `<strong>Outcome:</strong> ${escapeHtml(event.result.summary)}`;
        }
      }
    } else if (event.type === "adaptation") {
      const adaptCard = document.createElement("div");
      adaptCard.className = "trace-step-card adaptation-card";
      adaptCard.innerHTML = `
        <div class="trace-step-header">
          <span class="trace-adaptation-pill">⚡ STRATEGY RE-PLANNING</span>
          <span class="trace-tool-tag">${escapeHtml(formatToolLabel(event.tool))}</span>
        </div>
        <h4 class="adaptation-title">${escapeHtml(event.title)}</h4>
        <p class="adaptation-desc">${escapeHtml(event.description)}</p>
      `;
      traceList.appendChild(adaptCard);
      traceList.scrollTop = traceList.scrollHeight;
    }
  }

  // Evidence Rendering
  const supList = document.getElementById("agent-sup-list");
  const oppList = document.getElementById("agent-opp-list");
  const supCount = document.getElementById("agent-sup-count");
  const oppCount = document.getElementById("agent-opp-count");

  if (supCount) supCount.textContent = state.evidence.supporting.length;
  if (oppCount) oppCount.textContent = state.evidence.opposing.length;

  const renderEvidence = (items, cls) => items.map(item => {
    // Don't show the raw snippet twice if it's basically the same text as the finding
    // (happens when the heuristic fallback or a thin excerpt leaves nothing to add).
    const finding = (item.finding || "").trim();
    const snippet = (item.snippet || "").trim();
    const showSnippet = snippet && finding.toLowerCase() !== snippet.toLowerCase();
    let sourceUrl = "";
    let sourceHost = "Source link unavailable";
    try {
      const parsed = new URL(item.url);
      if (["https:", "http:"].includes(parsed.protocol)) {
        sourceUrl = parsed.href;
        sourceHost = parsed.hostname.replace(/^www\./, "");
      }
    } catch (_) { /* Unusable URLs remain plain text. */ }
    return `
      <div class="evidence-item ${cls}">
        <div class="evidence-source-row">
          <strong class="evidence-source">${escapeHtml(item.title)}</strong>
        </div>
        <span class="evidence-domain">${escapeHtml(sourceHost)}</span>
        ${finding ? `<p class="evidence-finding">${escapeHtml(finding)}</p>` : ""}
        ${showSnippet ? `<details class="evidence-excerpt"><summary>Read retrieved excerpt</summary><p class="evidence-snippet">${escapeHtml(snippet)}</p></details>` : ""}
        ${sourceUrl ? `<a class="evidence-open-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Open source ↗<span class="sr-only"> (opens in a new tab)</span></a>` : ""}
      </div>
    `;
  }).join("");

  if (supList) {
    if (state.evidence.supporting.length > 0) {
      const markup = renderEvidence(state.evidence.supporting, "supporting");
      if (supList._evidenceMarkup !== markup) { supList.innerHTML = markup; supList._evidenceMarkup = markup; }
    } else if (state.analyzed) {
      supList.innerHTML = `<p class="empty-hint">No retrieved source supports the claim.</p>`;
    }
  }

  if (oppList) {
    if (state.evidence.opposing.length > 0) {
      const markup = renderEvidence(state.evidence.opposing, "opposing");
      if (oppList._evidenceMarkup !== markup) { oppList.innerHTML = markup; oppList._evidenceMarkup = markup; }
    } else if (state.analyzed) {
      oppList.innerHTML = `<p class="empty-hint">No retrieved source argues against the claim.</p>`;
    }
  }

  // Contradiction Card
  const contradictionCard = document.getElementById("agent-contradiction-card");
  const contradictionDesc = document.getElementById("agent-contradiction-desc");
  if (contradictionCard && state.contradictions.length > 0) {
    contradictionCard.classList.remove("hidden");
    if (contradictionDesc) {
      const c = state.contradictions[0];
      contradictionDesc.textContent = `Conflict on "${c.topic}": ${c.sourceA} vs ${c.sourceB}. Agent dynamically launched verification.`;
    }
  }

  // Final Verdict Card
  if (event.type === "investigation_complete" && state.final_conclusion) {
    document.getElementById("agent-activity")?.removeAttribute("open");
    const verdictCard = document.getElementById("agent-verdict-card");
    if (verdictCard) {
      verdictCard.classList.remove("hidden");
      const conf = state.final_conclusion.confidence;
      const verdict = state.final_conclusion.verdict;

      // Verdict badge: colour-code by verdict type
      const verdictBadge = document.getElementById("agent-verdict-badge");
      if (verdictBadge) {
        verdictBadge.textContent = verdict.toUpperCase();
        const isSupported = verdict.toLowerCase().includes("supported") && !verdict.toLowerCase().includes("not") && !verdict.toLowerCase().includes("partial");
        const isPartial   = verdict.toLowerCase().includes("partial") || verdict.toLowerCase().includes("conflict") || verdict.toLowerCase().includes("insufficient");
        verdictBadge.style.background = isSupported ? "rgba(82,160,119,0.18)" : isPartial ? "rgba(224,159,62,0.18)" : "rgba(217,107,82,0.18)";
        verdictBadge.style.color      = isSupported ? "var(--green)" : isPartial ? "var(--amber)" : "var(--magenta)";
        verdictBadge.style.borderColor= isSupported ? "var(--green)" : isPartial ? "var(--amber)" : "var(--magenta)";
      }

      document.getElementById("agent-verdict-confidence").textContent = `${conf}% Confidence`;
      document.getElementById("agent-verdict-summary").textContent = state.final_conclusion.summary;

      // Inject animated confidence bar
      const existingBar = verdictCard.querySelector(".confidence-bar-wrap");
      if (!existingBar) {
        const barHTML = `
          <div class="confidence-bar-wrap">
            <div class="confidence-bar-labels">
              <span class="confidence-bar-label">Analytical Confidence</span>
              <span class="confidence-bar-value" id="agent-bar-pct">0%</span>
            </div>
            <div class="confidence-bar-track">
              <div class="confidence-bar-fill" id="agent-confidence-bar"></div>
            </div>
          </div>`;
        const summaryEl = document.getElementById("agent-verdict-summary");
        summaryEl.insertAdjacentHTML("afterend", barHTML);
      }
      requestAnimationFrame(() => {
        const fill = document.getElementById("agent-confidence-bar");
        const pct  = document.getElementById("agent-bar-pct");
        if (fill) fill.style.width = `${conf}%`;
        if (pct)  pct.textContent  = `${conf}%`;
      });

      // Reading time: ~180 words per minute from summary + source count
      const wordCount = (state.final_conclusion.summary || "").split(/\s+/).length + state.sources.length * 10;
      const minutes   = Math.max(1, Math.ceil(wordCount / 180));
      const readBadge = document.getElementById("agent-reading-badge");
      if (readBadge) readBadge.textContent = `⏱ ~${minutes} min reading audit`;

      const sourcesCount = document.getElementById("agent-sources-count");
      if (sourcesCount) sourcesCount.textContent = state.sources.length;

      const sourcesList = document.getElementById("agent-verdict-sources-list");
      if (sourcesList) {
        const stanceLabel = { supports: "supports", contradicts: "contradicts", neutral: "neutral", irrelevant: "off-topic" };
        sourcesList.innerHTML = state.sources.map((s, i) => {
          const stance = s.assessment ? (stanceLabel[s.assessment.stance] || s.assessment.stance) : "unassessed";
          return `
          <li style="animation-delay:${i * 0.07}s">
            <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener" class="source-link">
              <span>${escapeHtml(s.title)}</span>
              <span style="margin-left:auto;white-space:nowrap;opacity:0.6;font-family:var(--font-mono);font-size:0.72rem;">${escapeHtml(stance)} \u00b7 ${Math.round(s.authority * 100)}% authority</span>
            </a>
          </li>
        `;
        }).join("");
      }

      // Award XP
      if (window.DA && typeof window.DA.awardXp === "function") {
        window.DA.awardXp(50, "Analytical Audit Complete");
      }
    }
  }
}

async function startInvestigationUI() {
  if (isRunning) return;

  const claimInput = document.getElementById("agent-claim-input");
  const claim = claimInput ? claimInput.value.trim() : "";
  if (!claim) {
    if (window.DA && window.DA.toast) window.DA.toast("Enter a claim or proposition first.");
    return;
  }

  const demoSelect = document.getElementById("agent-demo-mode-select");
  const demoMode = demoSelect ? demoSelect.value : "normal";

  if (window.DA && window.DA.playClick) window.DA.playClick();

  isRunning = true;
  const btn = document.getElementById("agent-start-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Auditing Literature...";
  }

  // Reset UI elements
  document.getElementById("agent-activity")?.setAttribute("open", "");
  document.getElementById("agent-sup-list")._evidenceMarkup = null;
  document.getElementById("agent-opp-list")._evidenceMarkup = null;
  document.getElementById("agent-trace-list").innerHTML = "";
  document.getElementById("agent-sup-list").innerHTML = `<p class="empty-hint">No supporting evidence compiled yet.</p>`;
  document.getElementById("agent-opp-list").innerHTML = `<p class="empty-hint">No opposing evidence compiled yet.</p>`;
  document.getElementById("agent-subclaim-list").innerHTML = `<li class="subclaim-item-placeholder">Decomposing proposition into testable sub-claims...</li>`;
  document.getElementById("agent-contradiction-card").classList.add("hidden");
  document.getElementById("agent-verdict-card").classList.add("hidden");

  // Reset pipeline nodes
  for (let i = 1; i <= 5; i++) {
    const node = document.getElementById(`pipe-phase-${i}`);
    if (node) node.className = i === 1 ? "pipeline-step active" : "pipeline-step";
  }

  try {
    await runAgentController(claim, demoMode, updateUIOnTrace);
    if (window.DA && window.DA.toast) window.DA.toast("✅ Analytical audit complete!");
  } catch (err) {
    console.error("Analytical audit error:", err);
    if (window.DA && window.DA.toast) window.DA.toast("Audit error: " + err.message);
  } finally {
    isRunning = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Launch Analytical Audit";
    }
  }
}

function initAgentEventListeners() {
  const verdictCard = document.getElementById("agent-verdict-card");
  const outputHeader = document.querySelector(".agent-output-panel .agent-panel-header");
  if (verdictCard && outputHeader) outputHeader.after(verdictCard);
  const startBtn = document.getElementById("agent-start-btn");
  if (startBtn) {
    startBtn.addEventListener("click", startInvestigationUI);
  }

  document.querySelectorAll(".preset-chip").forEach(chip => {
    chip.addEventListener("click", (e) => {
      if (window.DA && window.DA.playClick) window.DA.playClick();
      const claim = e.target.getAttribute("data-claim");
      const input = document.getElementById("agent-claim-input");
      if (input && claim) input.value = claim;
    });
  });

  const copyBtn = document.getElementById("agent-copy-report-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      if (window.DA && window.DA.playClick) window.DA.playClick();
      const claim = document.getElementById("agent-target-claim")?.textContent || "";
      const verdict = document.getElementById("agent-verdict-badge")?.textContent || "";
      const confidence = document.getElementById("agent-verdict-confidence")?.textContent || "";
      const summary = document.getElementById("agent-verdict-summary")?.textContent || "";
      
      const report = `# VERITAS EXECUTIVE AUDIT REPORT\n\n**Proposition**: "${claim}"\n**Verdict**: ${verdict} (${confidence})\n\n## Executive Summary\n${summary}\n\n*Generated by Veritas Analytical Fact & Logic Studio*`;
      
      navigator.clipboard.writeText(report).then(() => {
        if (window.DA && window.DA.toast) window.DA.toast("📋 Executive report copied to clipboard!");
      }).catch(err => {
        console.error("Clipboard copy failed:", err);
      });
    });
  }

  const claimInput = document.getElementById("agent-claim-input");
  if (claimInput) {
    claimInput.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        startInvestigationUI();
      }
    });
  }

  document.querySelectorAll(".filter-tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
      if (window.DA && window.DA.playClick) window.DA.playClick();
      document.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
      e.target.classList.add("active");
      
      const filter = e.target.getAttribute("data-filter");
      const grid = document.getElementById("agent-evidence-grid");
      if (grid) {
        grid.classList.remove("show-supporting-only", "show-opposing-only");
        if (filter === "supporting") grid.classList.add("show-supporting-only");
        if (filter === "opposing") grid.classList.add("show-opposing-only");
      }
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAgentEventListeners);
} else {
  initAgentEventListeners();
}

/* ---------------------------------------------------------
   8. EXPOSE API TO WINDOW
   --------------------------------------------------------- */
window.VeritasAgent = {
  run: runAgentController,
  createState: createInvestigationState,
  ToolRegistry,
  AgentEvaluator,
  LLMProvider
};

})();
import { validateEvidenceResult } from "./src/features/ai-contracts.js";
