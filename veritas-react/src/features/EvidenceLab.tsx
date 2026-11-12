import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Check, CircleAlert, CircleHelp, LoaderCircle, Scale, Search } from "lucide-react";
import { auth } from "../lib/supabase";
import { invokeVeritasFunction, VeritasConnectionError } from "../lib/supabase-functions";
import type { View } from "../components/AppShell";

type Assessment = { stance: "supports" | "contradicts" | "neutral" | "irrelevant"; strength: "strong" | "moderate" | "weak"; finding: string };
type SearchHit = { url: string; title?: unknown; text?: unknown; publishedDate?: unknown; author?: unknown };
type Source = { id: number; title: string; url: string; text: string; publishedDate?: string | null; author?: string; authority: number; assessment?: Assessment };
type CrossExamination = { agreement: string; disagreement: string; conflict_dimensions: string[]; limitations: string[] };
type Verdict = "Supported" | "Refuted" | "Partially Supported" | "Insufficient Evidence";
type TraceStep = { id: number; title: string; notes: string[] };
type Investigation = { claim: string; subclaims: string[]; verdict: Verdict; summary: string; heuristicUsed: boolean; providerSummary: boolean; sources: Source[]; caveats: string[]; comparison: CrossExamination | null };

const MAX_AGENT_STEPS = 10;
const MAX_SEARCHES = 5;
const MAX_SOURCES = 12;
const MAX_ASSESSMENT_CALLS = 8;

function authorityOf(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (/\.(gov|edu)(\.[a-z]{2})?$/.test(host) || host.endsWith(".ac.uk")) return 0.9;
    if (/pubmed|who\.int|cdc\.gov|nih\.gov|nature\.com|science\.org|cochranelibrary/.test(host)) return 0.92;
    if (/reuters\.com|apnews\.com|bbc\.com|bbc\.co\.uk/.test(host)) return 0.8;
    if (host.endsWith(".org")) return 0.7;
    return 0.5;
  } catch { return 0.5; }
}
function makeSource(item: SearchHit, id: number): Source {
  return {
    id,
    title: String(item.title || item.url).slice(0, 200),
    url: item.url,
    text: String(item.text || "").replace(/\s+/g, " ").trim().slice(0, 1500),
    publishedDate: typeof item.publishedDate === "string" ? item.publishedDate : null,
    author: typeof item.author === "string" ? item.author.trim().slice(0, 200) || undefined : undefined,
    authority: authorityOf(item.url),
  };
}

function fallbackSummary(verdict: string, sources: Source[]) {
  const positioned = sources.filter(s => s.assessment?.stance === "supports" || s.assessment?.stance === "contradicts");
  const supports = positioned.filter(s => s.assessment?.stance === "supports");
  const against = positioned.filter(s => s.assessment?.stance === "contradicts");
  const parts = [`${supports.length} of ${positioned.length} sources that took a position support the claim; ${against.length} contradict it.`];
  const strongest = (stance: string) => positioned.filter(s => s.assessment?.stance === stance).sort((a,b)=>b.authority-a.authority)[0];
  const positive = strongest("supports"), negative = strongest("contradicts");
  if (positive) parts.push(`Strongest support: ${positive.assessment!.finding}`);
  if (negative) parts.push(`Strongest counter-evidence: ${negative.assessment!.finding}`);
  if (!positioned.length) parts.push("The retrieved sources did not give enough clear evidence to resolve the claim.");
  return `${verdict}. ${parts.join(" ")}`;
}

function searchHits(data: unknown): SearchHit[] {
  if (!data || typeof data !== "object" || !("results" in data) || !Array.isArray(data.results)) return [];
  return data.results.filter((item: unknown): item is SearchHit =>
    Boolean(item && typeof item === "object" && "url" in item && typeof item.url === "string" && safeSourceUrl(item.url))
  );
}

function mergeSearchResults(searches: { data: unknown }[], limit: number) {
  const groups = searches.map(search => searchHits(search.data));
  const merged: SearchHit[] = [];
  const seen = new Set<string>();
  for (let row = 0; merged.length < limit && groups.some(group => row < group.length); row++) {
    for (const group of groups) {
      const item = group[row];
      if (item?.url && !seen.has(item.url)) { seen.add(item.url); merged.push(item); }
      if (merged.length >= limit) break;
    }
  }
  return merged;
}

function heuristicAssessment(source: Source): Assessment {
  const text = `${source.title} ${source.text}`.toLowerCase();
  const contrary = /\b(no effect|not effective|failed to|fails to|lack of evidence|did not|does not|cannot|increased risk|harm|worsen|decline|contradict)\b/.test(text);
  return {
    stance: contrary ? "contradicts" : "supports",
    strength: "weak",
    finding: `Keyword estimate only: the source wording was read as ${contrary ? "challenging" : "supporting"} the claim. AI assessment was unavailable.`,
  };
}

async function functionFailureMessage(error: unknown, data: unknown, fallback: string) {
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
    return data.error;
  }

  if (error && typeof error === "object") {
    const details = error as { message?: unknown; context?: unknown };
    if (details.context instanceof Response) {
      const body = await details.context.clone().json().catch(() => null) as { error?: unknown } | null;
      if (typeof body?.error === "string") return body.error;
    }
    if (typeof details.message === "string" && details.message) return details.message;
  }

  return fallback;
}

const stanceLabels = {
  supports: "Supports",
  contradicts: "Challenges",
  neutral: "Neutral",
  irrelevant: "Not relevant",
};

function safeSourceUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch { return null; }
}

function sourceDate(value?: string | null) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? `Estimated date ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`
    : "Date unavailable";
}

const outcomes = {
  Supported: { label: "Evidence supports the claim", tone: "supports", icon: Check, context: "The stronger evidence retrieved in this search leans in favor of the claim." },
  Refuted: { label: "Evidence challenges the claim", tone: "contradicts", icon: ArrowDownRight, context: "The stronger evidence retrieved in this search leans against the claim." },
  "Partially Supported": { label: "Evidence is mixed", tone: "mixed", icon: Scale, context: "The evidence points in different directions. Compare the findings to see where they disagree." },
  "Insufficient Evidence": { label: "Not enough evidence", tone: "uncertain", icon: CircleHelp, context: "The retrieved sources do not provide enough direct, strong evidence to draw a conclusion." },
} as const;

function EvidenceFindings({ stance, sources }: {
  stance: "supports" | "contradicts";
  sources: Source[];
}) {
  const supports = stance === "supports";
  const Icon = supports ? Check : ArrowDownRight;
  return (
    <section className="research-evidence-side" id={`evidence-${stance}`} data-stance={stance} aria-labelledby={`heading-${stance}`}>
      <header className="research-evidence-heading">
        <Icon size={19} aria-hidden="true" />
        <h3 id={`heading-${stance}`}>{supports ? "Supports the claim" : "Challenges the claim"}</h3>
      </header>
      {sources.length ? (
        <ul className="research-findings">{sources.map(source => (
          <li key={source.id}>
            <a href={`#source-${source.id + 1}`} className="research-citation" aria-label={`Source ${source.id + 1}: ${source.title}`}>[{source.id + 1}]</a>
            <div>
              <strong>{source.title}</strong>
              {source.assessment && <span className="research-finding-strength">{source.assessment.strength} evidence</span>}
              <p>{source.assessment?.finding || "The assessment returned no explanation for this source."}</p>
            </div>
          </li>
        ))}</ul>
      ) : <p className="workspace-meta">This search found no assessed sources {supports ? "supporting" : "challenging"} the claim.</p>}
    </section>
  );
}

function InvestigationTimeline({ steps, busy, interrupted }: {
  steps: TraceStep[];
  busy: boolean;
  interrupted: boolean;
}) {
  return <ol className="research-timeline" aria-label="Search and review steps">
    {steps.map((step, index) => {
      const isLast = index === steps.length - 1;
      const state = isLast && busy ? "running" : isLast && interrupted ? "interrupted" : "finished";
      const Icon = state === "running" ? LoaderCircle : state === "interrupted" ? CircleAlert : Check;
      return (
        <li key={step.id} className="research-step" data-state={state} aria-current={state === "running" ? "step" : undefined}>
          <span className="research-step-marker"><Icon size={15} aria-hidden="true" /></span>
          <div className="research-step-body">
            <div className="research-step-heading">
              <strong>{step.title}</strong>
              <span>{state === "running" ? "Running" : state === "interrupted" ? "Interrupted" : "Finished"}</span>
            </div>
            {step.notes.length > 0 && <ul className="research-step-notes">
              {step.notes.map((note, noteIndex) => <li key={noteIndex}>{note}</li>)}
            </ul>}
          </div>
        </li>
      );
    })}
  </ol>;
}

export default function EvidenceLab({ sessionEmail, onSignIn, onNavigate }: {
  sessionEmail: string | null;
  onSignIn: () => void;
  onNavigate: (view: View) => void;
}) {
  const signedIn = Boolean(sessionEmail);
  const draftKey = `veritas:evidence-draft:${sessionEmail ?? "guest"}`;
  const [claim, setClaim] = useState(() => {
    try { return sessionStorage.getItem(draftKey)?.slice(0, 500) ?? ""; }
    catch { return ""; }
  });
  const [investigation, setInvestigation] = useState<Investigation|null>(null);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [phase, setPhase] = useState("");
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [traceRun, setTraceRun] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, [busy]);

  function updateClaim(value: string) {
    setClaim(value);
    setError("");
    try {
      if (value) sessionStorage.setItem(draftKey, value);
      else sessionStorage.removeItem(draftKey);
    } catch {
      // The draft stays in memory when browser storage is unavailable.
    }
  }

  function logPhase(message: string) {
    setTrace(current => current.map((step, index) =>
      index === current.length - 1 ? { ...step, notes: [...step.notes, message] } : step
    ));
  }

  async function investigate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !auth || !signedIn) return;
    if (!navigator.onLine) { setError("You’re offline. Reconnect to investigate this claim."); return; }
    const normalized = claim.trim();
    if (normalized.length < 8) { setError("Enter a clear, testable claim (at least 8 characters)."); return; }
    setBusy(true);
    setError("");
    setInvestigation(null);
    setTraceRun(run => run + 1);
    setTrace([{ id: 0, title: "Checking your account", notes: [] }]);
    setTraceOpen(true);
    setPhase("Checking your account");
    let stepCount = 0;
    let searchCount = 0;
    let assessmentCallCount = 0;
    let heuristicUsed = false;
    const caveats: string[] = [];
    const beginStep = (label: string) => {
      if (stepCount >= MAX_AGENT_STEPS) {
        logPhase(`Investigation step limit (${MAX_AGENT_STEPS}) reached; finalizing with the evidence collected so far.`);
        return false;
      }
      stepCount += 1;
      const stepId = stepCount;
      setPhase(label);
      setTrace(current => [...current, { id: stepId, title: label, notes: [] }]);
      return true;
    };
    const assess = (body: Record<string, unknown>) => {
      if (assessmentCallCount >= MAX_ASSESSMENT_CALLS) throw new Error(`AI assessment call limit (${MAX_ASSESSMENT_CALLS}) reached.`);
      assessmentCallCount += 1;
      return invokeVeritasFunction("assess-evidence", body);
    };
    const search = async (query: string) => {
      if (searchCount >= MAX_SEARCHES) return { data: { ok: false, error: `Search limit (${MAX_SEARCHES}) reached.` }, error: null as unknown };
      searchCount += 1;
      try { return { data: await invokeVeritasFunction("exa-search", { query }), error: null as unknown }; }
      catch (cause) { return { data: null, error: cause as unknown }; }
    };
    try {
      const { data: userData, error: accountError } = await auth.auth.getUser();
      if (accountError || !userData.user) throw new Error("Sign in again before investigating a claim.");
      beginStep("Planning two-sided searches and testable dimensions");
      let planned: any = null;
      try {
        planned = await assess({ action: "plan_queries", claim: normalized });
      } catch {
        planned = null;
      }
      const hasPlan = planned?.ok && Array.isArray(planned.queries) && planned.queries.length === 2;
      const plannedSubclaims: string[] = hasPlan && Array.isArray(planned.subclaims) ? Array.from(new Set<string>((planned.subclaims as unknown[]).filter((item):item is string=>typeof item==="string"&&item.trim().length>0).map(item=>item.trim().slice(0,200)))).slice(0,3) : [];
      if(plannedSubclaims.length)logPhase(`Testable claim dimensions: ${plannedSubclaims.join(" · ")}`);
      const sideQueries: string[] = hasPlan ? planned.queries : [normalized, `research findings that challenge or contradict ${normalized}`];
      // Keep two of the five search calls available for recovery or verification.
      const subclaimQuery = plannedSubclaims.length ? `research evidence ${plannedSubclaims.join(" OR ")}`.slice(0,200) : "";
      const queries = [...sideQueries, ...(subclaimQuery ? [subclaimQuery] : [])].slice(0, MAX_SEARCHES);
      beginStep(plannedSubclaims.length ? `Searching both sides and ${plannedSubclaims.length} testable dimensions` : "Searching for sources on both sides");
      let searches = await Promise.all(queries.map(search));
      logPhase(`Search coverage: ${searches.map((search,index)=>`${index<2?index===0?"Support":"Counter":"Subclaim"} (${queries[index]}): ${search.data?.ok&&Array.isArray(search.data.results)?search.data.results.length:0} result${search.data?.results?.length===1?"":"s"}`).join(" | ")}`);
      let unique = mergeSearchResults(searches.filter(search=>search.data?.ok),MAX_SOURCES);
      const missingDirections = searches.map((search,index)=>({search,index})).filter(({search,index})=>index<2&&(search.error||!search.data?.ok||!Array.isArray(search.data.results)||search.data.results.length===0));
      const proxyUnavailable = searches.every(result => result.error instanceof VeritasConnectionError);
      if (missingDirections.length && !proxyUnavailable) {
        beginStep(unique.length ? "Replanning a missing search side" : "Adapting failed search queries");
        const beforeRetry=unique.length;
        const terms = normalized.split(/\s+/).filter(word => word.length > 3).slice(0, 8).join(" ");
        const shortClaim = terms || normalized.slice(0, 80);
        const retryQueries = missingDirections.map(({index})=>index===0?shortClaim:`research findings that challenge ${shortClaim}`);
        const retryCount = Math.min(retryQueries.length, MAX_SEARCHES-searchCount);
        const retries = await Promise.all(retryQueries.slice(0,retryCount).map(search));
        retries.forEach((result,retryIndex)=>{searches[missingDirections[retryIndex].index]=result;});
        unique = mergeSearchResults(searches.filter(search=>search.data?.ok),MAX_SOURCES);
        logPhase(`Search recovery added ${Math.max(0,unique.length-beforeRetry)} distinct sources after retrying ${retryCount} primary direction${retryCount===1?"":"s"}.`);
        if (retryCount < missingDirections.length) caveats.push("The search budget allowed only a partial retry of failed primary directions.");
      }
      if (!unique.length) {
        const failedSearch = searches.find(({error, data}) => error || !data?.ok);
        if (failedSearch) {
          const message = await functionFailureMessage(failedSearch.error, failedSearch.data, "Evidence search failed. Check the Exa Edge Function configuration.");
          throw new Error(`Evidence search failed: ${message}`);
        }
        throw new Error("Search completed, but returned no sources. Try a more specific claim or different wording.");
      }
      const sources: Source[] = unique.slice(0, MAX_SOURCES).map(makeSource);
      beginStep(`Assessing ${sources.length} retrieved sources`);
      let classify: any = null;
      try { classify = await assess({ action: "classify", claim: normalized, sources: sources.map(({id,title,text})=>({id,title,text})) }); }
      catch (cause) { caveats.push(`AI classification was unavailable: ${cause instanceof Error ? cause.message : "assessment service unavailable"}`); }
      if (!classify?.ok || !Array.isArray(classify.assessments)) {
        heuristicUsed = true;
        for (const source of sources) source.assessment = heuristicAssessment(source);
        caveats.push("Source stances use a weak keyword estimate because the AI classifier was unavailable.");
        classify = { ok: true, assessments: sources.map(source => ({ id: source.id, ...source.assessment })) };
      }
      const firstStances = new Set(classify.assessments.map((item:any)=>item.stance));
      if ((!firstStances.has("supports") || !firstStances.has("contradicts")) && !heuristicUsed && searchCount < MAX_SEARCHES && stepCount < MAX_AGENT_STEPS) {
        const missingStance = firstStances.has("supports") ? "contradicts" : "supports";
        beginStep(`Evaluating one-sided evidence and replanning toward ${missingStance} sources`);
        const targetedQuery = missingStance === "contradicts"
          ? `research studies finding no effect or harm from ${normalized}`
          : `research studies showing benefits or evidence for ${normalized}`;
        try {
          const followup = await search(targetedQuery);
          const extra = (followup.data?.ok ? searchHits(followup.data) : [])
            .filter(item => !sources.some(source => source.url === item.url)).slice(0, Math.max(0,12-sources.length));
          if (extra.length) {
            for (const item of extra) sources.push(makeSource(item, sources.length));
            logPhase(`Added ${extra.length} sources from the targeted follow-up search.`);
            classify = await assess({ action: "classify", claim: normalized, sources: sources.map(({id,title,text})=>({id,title,text})) });
            if (!classify?.ok || !Array.isArray(classify.assessments)) throw new Error(classify?.error || "Follow-up evidence assessment failed.");
          } else logPhase("The targeted follow-up search returned no additional sources.");
        } catch (followupError) {
          logPhase(`The targeted follow-up could not complete: ${followupError instanceof Error ? followupError.message : "search unavailable"}`);
        }
      } else if (!firstStances.has("supports") || !firstStances.has("contradicts")) {
        caveats.push(heuristicUsed ? "One-sided search recovery was skipped because AI source assessment was unavailable." : "The investigation could not run its one-sided evidence recovery within the remaining step or search budget.");
      }
      for (const assessment of classify.assessments) {
        const source=sources.find(item=>item.id===assessment.id);
        if(source)source.assessment={stance:assessment.stance,strength:assessment.strength,finding:assessment.finding};
      }
      const classifiedCounts=sources.reduce((counts,source)=>{const stance=source.assessment?.stance||"unassessed";counts[stance]=(counts[stance]||0)+1;return counts;},{} as Record<string,number>);
      logPhase(`Classification complete: ${Object.entries(classifiedCounts).map(([stance,count])=>`${stance} ${count}`).join(", ")}.`);
      const averageAuthority=sources.length?sources.reduce((sum,source)=>sum+source.authority,0)/sources.length:1;
      if(sources.length>0&&averageAuthority<.6&&sources.length<MAX_SOURCES&&searchCount<MAX_SEARCHES&&stepCount<MAX_AGENT_STEPS){
        beginStep("Low source authority detected; adapting toward empirical research");
        try{
          const query=`peer reviewed empirical research systematic review meta analysis ${normalized}`.slice(0,200);
          const deeper=await search(query);
          const extra=(deeper.data?.ok ? searchHits(deeper.data) : []).filter(item => !sources.some(source => source.url === item.url)).slice(0,Math.min(4,MAX_SOURCES-sources.length));
          if(extra.length){
            const additions:Source[]=extra.map((item, index) => makeSource(item, sources.length + index));
            const expanded=[...sources,...additions];
            sources.splice(0,sources.length,...expanded);
            if(heuristicUsed){for(const source of additions)source.assessment=heuristicAssessment(source);}
            else {
              const reassessed:any=await assess({action:"classify",claim:normalized,sources:expanded.map(({id,title,text})=>({id,title,text}))});
              if(!reassessed?.ok||!Array.isArray(reassessed.assessments))throw new Error(reassessed?.error||"Higher-quality sources could not be assessed.");
              for(const assessment of reassessed.assessments){const source=sources.find(item=>item.id===assessment.id);if(source)source.assessment={stance:assessment.stance,strength:assessment.strength,finding:assessment.finding};}
            }
            logPhase(`Added and assessed ${additions.length} sources from the higher-quality search.`);
          }else logPhase("The higher-quality search returned no additional sources.");
        }catch(deepError){caveats.push(`The higher-quality evidence search could not complete: ${deepError instanceof Error?deepError.message:"search unavailable"}`);}
      }
      else if(sources.length>0&&averageAuthority<.6)caveats.push("Higher-quality research recovery was skipped because the search or step budget was exhausted.");
      let comparison:CrossExamination|null=null;
      const hasBothSides=sources.some(source=>source.assessment?.stance==="supports")&&sources.some(source=>source.assessment?.stance==="contradicts");
      if(hasBothSides&&stepCount<MAX_AGENT_STEPS&&!heuristicUsed){
        beginStep("Comparing evidence for and against");
        const strengthWeight:Record<Assessment["strength"],number>={strong:1,moderate:.6,weak:.3};
        const weightOf=(source:Source)=>(source.authority||.5)*strengthWeight[source.assessment?.strength||"weak"];
        try{
          const comparisonSources=[...sources.filter(source=>source.assessment?.stance==="supports").sort((a,b)=>weightOf(b)-weightOf(a)).slice(0,3),...sources.filter(source=>source.assessment?.stance==="contradicts").sort((a,b)=>weightOf(b)-weightOf(a)).slice(0,3)];
          const cross:any=await assess({action:"cross_examine",claim:normalized,sources:comparisonSources.map(source=>({title:source.title,text:source.text,stance:source.assessment!.stance,strength:source.assessment!.strength,finding:source.assessment!.finding}))});
          if(!cross?.ok||typeof cross.agreement!=="string"||typeof cross.disagreement!=="string")throw new Error(cross?.error||"Cross-examination returned an incomplete result.");
          comparison={agreement:cross.agreement,disagreement:cross.disagreement,conflict_dimensions:Array.isArray(cross.conflict_dimensions)?cross.conflict_dimensions.filter((item:any)=>typeof item==="string").slice(0,3):[],limitations:Array.isArray(cross.limitations)?cross.limitations.filter((item:any)=>typeof item==="string").slice(0,3):[]};
          logPhase(`Cross-examination: ${comparison.agreement} Difference: ${comparison.disagreement}`);
          const verificationQuery=typeof cross.verification_query==="string"?cross.verification_query.trim().slice(0,200):"";
          if(verificationQuery&&sources.length<MAX_SOURCES&&searchCount<MAX_SEARCHES&&stepCount<MAX_AGENT_STEPS){
            beginStep("Replanning once for independent verification of the disagreement");
            try{
              const verification=await search(verificationQuery);
              const extra=(verification.data?.ok ? searchHits(verification.data) : []).filter(item => !sources.some(source => source.url === item.url)).slice(0,Math.min(4,MAX_SOURCES-sources.length));
              if(extra.length){
                const additions:Source[]=extra.map((item, index) => makeSource(item, sources.length + index));
                const expanded=[...sources,...additions];
                const reassessed:any=await assess({action:"classify",claim:normalized,sources:expanded.map(({id,title,text})=>({id,title,text}))});
                if(!reassessed?.ok||!Array.isArray(reassessed.assessments))throw new Error(reassessed?.error||"Verification sources could not be assessed.");
                sources.splice(0,sources.length,...expanded);
                for(const assessment of reassessed.assessments){const source=sources.find(item=>item.id===assessment.id);if(source)source.assessment={stance:assessment.stance,strength:assessment.strength,finding:assessment.finding};}
                logPhase(`Added and reassessed ${additions.length} source${additions.length===1?"":"s"} from the verification search.`);
              }else logPhase("The verification search found no new independent sources.");
            }catch(verificationError){caveats.push(`The targeted verification search could not complete: ${verificationError instanceof Error?verificationError.message:"search unavailable"}`);}
          } else if(verificationQuery) caveats.push("The step or search budget prevented targeted verification of the source disagreement.");
        }catch(crossError){
          comparison={agreement:"The retrieved sources examine the same claim.",disagreement:"The strongest support and counter-evidence point in different directions, but their difference could not be compared.",conflict_dimensions:[],limitations:["AI cross-examination was unavailable; no targeted verification search was run."]};
          caveats.push(`Cross-examination was unavailable: ${crossError instanceof Error?crossError.message:"comparison service unavailable"}`);
        }
      } else if(hasBothSides&&heuristicUsed) caveats.push("Cross-examination was skipped because AI source assessment was unavailable.");
      else if(!hasBothSides) caveats.push("Cross-examination needs at least one source on each side; this search did not produce both.");
      const positioned=sources.filter(s=>s.assessment&&(s.assessment.stance==="supports"||s.assessment.stance==="contradicts"));
      const strengthWeight={strong:1,moderate:.6,weak:.3};
      const weight=(s:Source)=>(s.authority||.5)*(strengthWeight[s.assessment!.strength]||.3);
      const sup=positioned.filter(s=>s.assessment!.stance==="supports"),against=positioned.filter(s=>s.assessment!.stance==="contradicts");
      const supWeight=sup.reduce((sum,s)=>sum+weight(s),0),oppWeight=against.reduce((sum,s)=>sum+weight(s),0),total=supWeight+oppWeight;
      let verdict: Verdict = "Insufficient Evidence";
      let confidence = 30;
      if(positioned.length>=2&&total>=1){const share=supWeight/total;verdict=share>=.75?"Supported":share<=.25?"Refuted":"Partially Supported";const clarity=Math.abs(share-.5)*2,coverage=Math.min(1,positioned.length/4),avgAuthority=positioned.reduce((sum,s)=>sum+(s.authority||.5),0)/positioned.length;confidence=Math.round(100*(.1+.4*clarity+.2*coverage+.15*avgAuthority));if(!sup.length||!against.length)confidence=Math.min(confidence,78);confidence=Math.max(20,Math.min(90,confidence));}
      if(heuristicUsed)confidence=Math.min(confidence,50);
      if(!hasPlan)caveats.push("The AI could not plan a targeted opposing search, so the counter-search may be less precise.");
      if(searches.slice(0,2).some(item=>item.error||!item.data?.ok))caveats.push("One primary search direction was unavailable; the evidence may not represent both sides fully.");
      if(searches.slice(2).some(item=>item.error||!item.data?.ok))caveats.push("At least one planned subclaim search was unavailable; some dimensions may be underrepresented.");
      if((!sup.length||!against.length)&&positioned.length)caveats.push("All sources that took a position lean the same way. This can reflect search coverage rather than consensus.");
      if(!positioned.length)caveats.push("No retrieved source took a clear position, so the evidence is insufficient.");
      logPhase(`Compared ${sup.length} supporting and ${against.length} challenging sources using relevance, strength, and domain signals.`);
      beginStep("Writing the evidence summary");
      let summaryCall: any = null;
      try {
        const strongestSupport = [...sup].sort((a,b)=>weight(b)-weight(a))[0];
        const strongestCounter = [...against].sort((a,b)=>weight(b)-weight(a))[0];
        const contradictions = strongestSupport && strongestCounter ? [{ sourceA: strongestSupport.title, sourceB: strongestCounter.title }] : [];
        const comparisonText = comparison ? `${comparison.agreement} Disagreement: ${comparison.disagreement} ${comparison.conflict_dimensions.join(" ")} ${comparison.limitations.join(" ")}` : "";
        summaryCall = await assess({ action: "summarize", claim: normalized, verdict, confidence, assessments: sources.filter(s => s.assessment).map(s => ({ title: s.title, stance: s.assessment!.stance, strength: s.assessment!.strength, finding: s.assessment!.finding })), contradictions, comparison: comparisonText });
      } catch {
        summaryCall = null;
      }
      const providerSummary = !heuristicUsed && summaryCall?.ok === true && typeof summaryCall.summary === "string" && Boolean(summaryCall.summary.trim());
      const summary = heuristicUsed
        ? "Source assessment was unavailable. The evidence groups below are based on keyword matches and are provisional."
        : providerSummary ? summaryCall.summary : fallbackSummary(verdict, sources);
      logPhase(`Reviewed ${sources.length} sources across ${searchCount} searches and ${assessmentCallCount} AI calls.`);
      setInvestigation({ claim: normalized, subclaims: plannedSubclaims, verdict, summary, sources, caveats, comparison, heuristicUsed, providerSummary });
      setTraceOpen(false);
    } catch(cause) { setError(cause instanceof Error?cause.message:"The investigation could not be completed."); }
    finally { setBusy(false); setPhase(""); }
  }

  const support = investigation?.sources.filter(source => source.assessment?.stance === "supports") ?? [];
  const opposition = investigation?.sources.filter(source => source.assessment?.stance === "contradicts") ?? [];
  const otherCount = investigation ? investigation.sources.length - support.length - opposition.length : 0;
  const outcome = investigation?.heuristicUsed
    ? { label: "No reliable verdict yet", tone: "uncertain", icon: CircleHelp, context: "Open the original sources before drawing a conclusion." }
    : outcomes[investigation?.verdict ?? "Insufficient Evidence"];
  const OutcomeIcon = outcome.icon;

  return (
    <section className="workspace-flow research-workspace">
      <h1 className="workspace-page-title">Evidence Lab</h1>
      <p className="workspace-lead">Examine a claim, compare evidence from both sides, and read the original sources.</p>
      <form className="research-form" onSubmit={investigate}>
        <label className="workspace-field">Claim to investigate
          <textarea rows={3} value={claim} onChange={event => updateClaim(event.target.value)} maxLength={500}
            placeholder="For example, more urban trees reduce heat-related illness during summer." />
        </label>
        <div className="research-form-actions">
          <span className="workspace-meta">{claim.length}/500 characters</span>
          <button type="submit" className="workspace-primary" disabled={busy || !auth || !signedIn || claim.trim().length < 8}>
            {busy ? <LoaderCircle className="spinner" size={16} aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
            {busy ? "Investigating…" : error ? "Retry investigation" : "Investigate claim"}
          </button>
        </div>
      </form>
      {(!auth || !signedIn) && <div className="workspace-note">
        <strong>{auth ? "Account required" : "Research service unavailable"}</strong>
        <p>{auth ? "Sign in to run searches and compare source findings." : "Search and AI assessment require a connected backend."}</p>
        <button className="workspace-text-action" onClick={auth ? onSignIn : () => onNavigate("study")}>{auth ? "Go to sign in" : "Study how to assess evidence"}</button>
      </div>}
      {!trace.length && auth && signedIn && <div className="workspace-empty">
        <strong>Start with a specific claim</strong>
        <p>Use a claim that a source can support or challenge. The results will include excerpts, links, and gaps in the search.</p>
      </div>}
      <p className="research-phase workspace-meta" role="status">{busy ? `${phase}${slow ? " · This is taking longer than usual." : ""}` : investigation ? "Investigation complete. Review the evidence below." : ""}</p>
      {trace.length > 0 && <details className="research-trace" key={traceRun} open={traceOpen} onToggle={event => setTraceOpen(event.currentTarget.open)}>
        <summary>Investigation plan and activity <span>{busy ? "In progress" : investigation ? "Complete" : "Interrupted"}</span></summary>
        {Boolean(investigation?.subclaims.length) && <><h3>Claim dimensions</h3><ul>{investigation?.subclaims.map(item => <li key={item}>{item}</li>)}</ul></>}
        <InvestigationTimeline steps={trace} busy={busy} interrupted={Boolean(error)} />
      </details>}
      {error && <p className="workspace-error" role="alert">{error} Your claim is still available above.</p>}
      {investigation && <section className="research-results" aria-label="Investigation results">
        <header className="research-conclusion" data-outcome={outcome.tone}>
          <div className="research-verdict-heading">
            <span className="research-verdict-icon"><OutcomeIcon size={23} aria-hidden="true" /></span>
            <div>
              <p className="workspace-caption">{investigation.heuristicUsed ? "Preliminary keyword review" : "Verdict from retrieved evidence"}</p>
              <h2>{outcome.label}</h2>
            </div>
          </div>
          <blockquote>{investigation.claim}</blockquote>
          <p className="research-verdict-context">{outcome.context}</p>
          <p className="research-verdict-summary">{investigation.summary}</p>
          <p className="workspace-meta">{investigation.providerSummary ? "AI summary of the source assessments." : investigation.heuristicUsed ? "Local keyword estimate." : "Summary computed from the source assessments."} The verdict can change if relevant evidence is missing.</p>
        </header>
        <div className="research-breakdown">
          <dl aria-label={investigation.heuristicUsed ? "Provisional source counts" : "Source counts by assessment"}>
            <div data-stance="supports"><dt><a href="#evidence-supports">Supporting</a></dt><dd>{support.length}</dd></div>
            <div data-stance="contradicts"><dt><a href="#evidence-contradicts">Challenging</a></dt><dd>{opposition.length}</dd></div>
            <div><dt><a href="#research-sources-title">Other or unassessed</a></dt><dd>{otherCount}</dd></div>
          </dl>
          <p className="workspace-meta">{investigation.heuristicUsed
            ? "These counts are based on provisional keyword matches."
            : "Counts show how sources were classified. The verdict also weighs excerpt strength and source signals."}</p>
        </div>
        <div className="research-evidence-grid">
          <EvidenceFindings stance="supports" sources={support} />
          <EvidenceFindings stance="contradicts" sources={opposition} />
        </div>
        <div className="research-columns">
          <div>
            <section className="research-section">
              <h3>Contradictions and gaps</h3>
              {investigation.comparison ? <>
                <h4>Where sources agree</h4><p>{investigation.comparison.agreement}</p>
                <h4>Where they differ</h4><p>{investigation.comparison.disagreement}</p>
                {Boolean(investigation.comparison.conflict_dimensions.length) && <ul>{investigation.comparison.conflict_dimensions.map((item, index) => <li key={index}>{item}</li>)}</ul>}
              </> : <p className="workspace-meta">A cross-source comparison is unavailable for this search.</p>}
              <h4>Limitations</h4>
              <ul>{[...investigation.caveats, ...(investigation.comparison?.limitations ?? []), "Assessments use the retrieved excerpts. Read the original sources to verify context and methods."].map((item, index) => <li key={index}>{item}</li>)}</ul>
            </section>
          </div>
          <aside className="research-sources" aria-labelledby="research-sources-title">
            <h3 id="research-sources-title">Sources · {investigation.sources.length}</h3>
            <p className="workspace-meta">Strength describes how directly the excerpt addresses the claim. The site identifies where the excerpt was found. Dates are estimates from the search provider. Publication type is unavailable.</p>
            <ol>{investigation.sources.map(source => {
              const url = safeSourceUrl(source.url);
              return <li key={source.id} id={`source-${source.id + 1}`} tabIndex={-1}>
                <span className="research-source-number">[{source.id + 1}]</span>
                <h4>{source.title}</h4>
                <p className="workspace-meta">{url?.hostname || "Source site unavailable"} · {sourceDate(source.publishedDate)}</p>
                {source.author && <p className="workspace-meta">By {source.author}</p>}
                <p className="research-source-status" data-stance={source.assessment?.stance}>{source.assessment ? `${stanceLabels[source.assessment.stance]} · ${source.assessment.strength} excerpt` : "Assessment unavailable"}</p>
                {url && <a className="workspace-text-action" href={url.href} target="_blank" rel="noreferrer">Read source <ArrowUpRight size={15} /></a>}
                {source.text && <details><summary>Source excerpt</summary><p>{source.text}</p></details>}
              </li>;
            })}</ol>
          </aside>
        </div>
      </section>}
    </section>
  );
}
