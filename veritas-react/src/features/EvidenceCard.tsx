import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MAX_CARD_NOTE, MAX_EVIDENCE_QUOTE } from "../../../app/supabase/functions/_shared/evidence-practice.ts";
import type { EvidenceCard, ResearchTopic } from "../../../app/supabase/functions/_shared/evidence-practice.ts";
import type { Page } from "../../../app/supabase/functions/_shared/evidence-verification.ts";
import { buildEvidenceCard } from "../lib/evidence-cards.ts";

export function EvidenceCardDetails({ card }: { card: EvidenceCard }) {
  const byline = [card.authors.join(", "), card.year].filter(Boolean).join(" · ");
  return <>
    <p className="workspace-meta">{card.textType === "abstract" ? "Abstract excerpt" : "Web excerpt"}{byline && ` · ${byline}`}</p>
    <a className="workspace-text-action" href={card.url} target="_blank" rel="noopener noreferrer">
      {card.title} <ArrowUpRight size={15} aria-hidden="true" />
    </a>
    <blockquote>{card.quote}</blockquote>
    {(card.interpretation || card.limitation) && <dl className="evidence-card-notes">
      {card.interpretation && <div><dt>My notes</dt><dd>{card.interpretation}</dd></div>}
      {card.limitation && <div><dt>Limitation</dt><dd>{card.limitation}</dd></div>}
    </dl>}
  </>;
}

export function EvidenceCardEditor({ page, topic, prefill, onSave, onPractice, onCancel }: {
  page: Page; topic: ResearchTopic; prefill: string; onSave: (card: EvidenceCard) => void;
  onPractice: (card: EvidenceCard) => void; onCancel: () => void;
}) {
  const [quote, setQuote] = useState(prefill);
  const [interpretation, setInterpretation] = useState("");
  const [limitation, setLimitation] = useState("");
  const [error, setError] = useState("");
  const id = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  function useQuote(action: "practice" | "save") {
    id.current ??= crypto.randomUUID();
    const card = buildEvidenceCard(topic, page, { quote, interpretation, limitation }, id.current);
    if (!card) {
      setError("Choose an exact quotation of at least 12 characters from the excerpt.");
      return;
    }
    if (action === "practice") {
      onPractice(card);
      return;
    }
    try { onSave(card); setError(""); }
    catch { setError("This tab couldn’t save your card. Your draft is still here. Try again."); }
  }
  return <form className="research-form evidence-card-editor" onSubmit={event => {
    event.preventDefault();
    useQuote("practice");
  }}>
    <h3 tabIndex={-1} ref={heading}>Your quote</h3>
    <p className="workspace-meta">{page.passage.scope === "abstract" ? "Abstract excerpt" : "Web excerpt"} · {page.paper?.title ?? page.title}</p>
    <blockquote className="evidence-selected-quote">{quote}</blockquote>
    <details className="research-passage">
      <summary>Choose a different quote</summary>
      <div>
        <blockquote className="evidence-selected-quote">{page.passage.text}</blockquote>
        <label className="workspace-field">Exact quotation
          <textarea maxLength={MAX_EVIDENCE_QUOTE} rows={3} value={quote} onChange={event => { setQuote(event.target.value); setError(""); }} />
        </label>
      </div>
    </details>
    <details className="research-passage">
      <summary>Add notes (optional)</summary>
      <div>
        <label className="workspace-field">What does this quotation support?
          <textarea maxLength={MAX_CARD_NOTE} rows={2} value={interpretation} onChange={event => setInterpretation(event.target.value)} />
        </label>
        <label className="workspace-field">What is one limitation?
          <textarea maxLength={MAX_CARD_NOTE} rows={2} value={limitation} onChange={event => setLimitation(event.target.value)} />
        </label>
      </div>
    </details>
    {error && <p className="workspace-error" role="alert">{error}</p>}
    <div className="evidence-card-actions">
      <button type="submit" className="workspace-primary">Practice with this quote</button>
      <button type="button" className="workspace-secondary" onClick={() => useQuote("save")}>Save for later</button>
      <button type="button" className="workspace-text-action" onClick={onCancel}>Cancel</button>
    </div>
  </form>;
}
