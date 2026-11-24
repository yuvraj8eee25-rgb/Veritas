import { downloadJson } from "../lib/download";
import { useEffect, useId, useRef, useState } from "react";
import {
  MAX_PAPER_PAGES, MAX_PAPER_TEXT,
  type PaperCitation, type PaperFlashcard, type PaperPage, type PaperPoint,
} from "../../../app/supabase/functions/assess-evidence/paper-study";
import { invokeVeritasFunction } from "../lib/supabase-functions";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const categories = { question: "Research question", method: "Method", finding: "Findings", limitation: "Limitations" };
type StudiedPaper = {
  name: string;
  pages: PaperPage[];
  totalPages: number;
  points: PaperPoint[];
  cards: PaperFlashcard[];
};

async function extractPages(file: File) {
  if (file.size > MAX_FILE_BYTES) throw new Error("Choose a PDF smaller than 10 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes("%PDF-")) {
    throw new Error("Choose a valid PDF.");
  }
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes, { isEvalSupported: false });
  try {
    if (pdf.numPages > MAX_PAPER_PAGES) throw new Error(`Choose a paper of up to ${MAX_PAPER_PAGES} pages.`);
    const { text } = await extractText(pdf);
    const pages = text.flatMap((value, index) => value.trim() ? [{ page: index + 1, text: value.trim() }] : []);
    const characters = pages.reduce((count, page) => count + page.text.length, 0);
    if (characters < 100) throw new Error("This PDF has too little readable text. Try a version with selectable text.");
    if (characters > MAX_PAPER_TEXT) throw new Error("This PDF contains too much text. Try a shorter version.");
    return { pages, totalPages: pdf.numPages };
  } finally {
    await pdf.destroy();
  }
}

function Citation({ page, quote, preview }: PaperCitation & { preview?: string }) {
  return <details className="research-passage">
    <summary>Read source passage · PDF page {page}</summary>
    <blockquote>{quote}</blockquote>
    {preview && <a href={`${preview}#page=${page}`} target="_blank" rel="noopener noreferrer">Open PDF at page {page}</a>}
  </details>;
}

function readSession(key: string): StudiedPaper | null {
  try {
    const paper = JSON.parse(localStorage.getItem(key) ?? sessionStorage.getItem(key) ?? "null");
    return typeof paper?.name === "string" && Array.isArray(paper.pages) && Array.isArray(paper.points)
      && Array.isArray(paper.cards) ? paper : null;
  } catch {
    return null;
  }
}

export default function PaperStudy({ ownerUid }: { ownerUid: string }) {
  const id = useId();
  const key = `veritas:paper-study:${ownerUid}`;
  const [paper, setPaper] = useState(() => readSession(key));
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [busy, setBusy] = useState<"summary" | "cards">();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deckOpen, setDeckOpen] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const request = useRef<AbortController | null>(null);
  const deckHeading = useRef<HTMLHeadingElement>(null);
  const summaryHeading = useRef<HTMLHeadingElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => { if (deckOpen) deckHeading.current?.focus(); }, [deckOpen]);

  function save(next: StudiedPaper | null) {
    setPaper(next);
    try {
      if (next) sessionStorage.setItem(key, JSON.stringify(next));
      else sessionStorage.removeItem(key);
    } catch {
      // The paper and its deck are still available while this screen is open.
    }
  }

  async function run(action: "summary" | "cards", operation: (signal: AbortSignal) => Promise<void>) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(action);
    setError("");
    try {
      await operation(controller.signal);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Try again.");
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setBusy(undefined);
      }
    }
  }

  function summarize(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    void run("summary", async signal => {
      const extracted = await extractPages(file);
      signal.throwIfAborted();
      const response = await invokeVeritasFunction("assess-evidence",
        { action: "paper_summary", pages: extracted.pages }, signal);
      signal.throwIfAborted();
      if (response?.ok !== true || !Array.isArray(response.points) || !response.points.length) {
        throw new Error("The paper summary was unavailable. Try again.");
      }
      save({ name: file.name, ...extracted, points: response.points, cards: [] });
      setPreview(URL.createObjectURL(file));
      setDeckOpen(false);
      setFile(undefined);
      if (fileInput.current) fileInput.current.value = "";
      requestAnimationFrame(() => summaryHeading.current?.focus());
    });
  }

  function showDeck() {
    if (!paper || request.current) return;
    if (paper.cards.length) {
      if (deckOpen) deckHeading.current?.focus();
      else setDeckOpen(true);
      return;
    }
    void run("cards", async signal => {
      const response = await invokeVeritasFunction("assess-evidence",
        { action: "paper_flashcards", pages: paper.pages }, signal);
      signal.throwIfAborted();
      if (response?.ok !== true || !Array.isArray(response.cards) || !response.cards.length) {
        throw new Error("Flashcards couldn’t be generated. Your summary is still available.");
      }
      save({ ...paper, cards: response.cards });
      setCardIndex(0);
      setRevealed(false);
      setDeckOpen(true);
    });
  }

  function moveCard(index: number) {
    setCardIndex(index);
    setRevealed(false);
  }

  return <section className="study-react-card study-paper" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>Study a paper</h2>
    {notice && <p role="status">{notice}</p>}
    {ownerUid === "guest" ? <p>Sign in to summarize a PDF and make flashcards.</p> : <>
      <form className="study-paper-form" onSubmit={summarize}>
        <label className="workspace-field">Research paper (PDF)
          <input ref={fileInput} type="file" accept=".pdf,application/pdf" disabled={Boolean(busy)}
            onChange={event => { setFile(event.currentTarget.files?.[0]); setError(""); }} />
        </label>
        <p className="workspace-meta">Choose a PDF with selectable text, up to 40 pages and 10 MB. Veritas sends the extracted text for AI analysis and keeps your study materials in this browser tab until you explicitly save them on this device.</p>
        <button className="workspace-primary" disabled={!file || Boolean(busy)}>
          {busy === "summary" ? "Reading your paper…" : "Summarize paper"}
        </button>
      </form>
      {paper && <article className="study-paper-result" aria-labelledby={`${id}-summary`}>
        <header className="study-paper-actions">
          <div>
            <h3 id={`${id}-summary`} tabIndex={-1} ref={summaryHeading}>Summary</h3>
            <p className="workspace-meta">{paper.name}</p>
          </div>
          <button type="button" className="workspace-secondary" onClick={() => {
            try { localStorage.setItem(key, JSON.stringify(paper)); setNotice("Saved on this device. You can export or remove it below."); }
            catch { setError("Device storage is full. Export your paper study instead."); }
          }}>Save on this device</button>
          <button type="button" className="workspace-secondary" onClick={() => downloadJson("veritas-paper-study.json", paper)}>Export summary and flashcards</button>
          <button type="button" className="workspace-secondary" onClick={() => {
            if (!window.confirm("Remove this paper’s extracted text, summary and cards from this device?")) return;
            localStorage.removeItem(key); sessionStorage.removeItem(key); setPaper(null); setPreview(undefined);
          }}>Remove paper study</button>
          <button type="button" className="workspace-secondary" disabled={Boolean(busy)} onClick={showDeck}>
            {busy === "cards" ? "Generating flashcards…" : paper.cards.length ? "Review flashcards" : "Generate flashcards"}
          </button>
        </header>
        {paper.pages.length < paper.totalPages && <p className="workspace-meta">
          Readable text was available on {paper.pages.length} of {paper.totalPages} pages.
        </p>}
        <dl>{paper.points.map((point, index) => <div key={index}>
          <dt>{categories[point.kind]}</dt>
          <dd>{point.text}<Citation {...point} preview={preview} /></dd>
        </div>)}</dl>
        {deckOpen && paper.cards[cardIndex] && <section className="study-paper-deck" aria-labelledby={`${id}-deck`}>
          <div className="study-paper-actions">
            <h4 id={`${id}-deck`} tabIndex={-1} ref={deckHeading}>Flashcards</h4>
            <button type="button" className="workspace-text-action" onClick={() => {
              setDeckOpen(false);
              summaryHeading.current?.focus();
            }}>Close flashcards</button>
          </div>
          <p className="workspace-meta">Card {cardIndex + 1} of {paper.cards.length}</p>
          <p aria-live="polite"><strong>{paper.cards[cardIndex].question}</strong></p>
          {revealed ? <div>
            <p>{paper.cards[cardIndex].answer}</p>
            <Citation {...paper.cards[cardIndex]} preview={preview} />
          </div> : <button type="button" className="workspace-primary" onClick={() => setRevealed(true)}>Show answer</button>}
          <div className="study-paper-actions">
            <button type="button" className="workspace-secondary" disabled={cardIndex === 0}
              onClick={() => moveCard(cardIndex - 1)}>Previous card</button>
            <button type="button" className="workspace-secondary" disabled={cardIndex + 1 === paper.cards.length}
              onClick={() => moveCard(cardIndex + 1)}>Next card</button>
          </div>
        </section>}
        <button type="button" className="workspace-text-action" disabled={Boolean(busy)} onClick={() => {
          save(null);
          setPreview(undefined);
          setDeckOpen(false);
          setCardIndex(0);
          setRevealed(false);
          setError("");
          fileInput.current?.focus();
        }}>Remove paper and flashcards</button>
      </article>}
      <p className="workspace-meta" role="status">{busy === "cards" ? "Making cards from your paper." : busy === "summary" ? "Preparing a summary with source passages." : ""}</p>
      {error && <p className="workspace-error" role="alert">{error}</p>}
    </>}
  </section>;
}
