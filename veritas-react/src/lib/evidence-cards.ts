import { readEvidenceCard } from "../../../app/supabase/functions/_shared/evidence-practice.ts";
import { MAX_EVIDENCE_QUOTE } from "../../../app/supabase/functions/_shared/evidence-practice.ts";
import type { EvidenceCard, ResearchTopic } from "../../../app/supabase/functions/_shared/evidence-practice.ts";
import { excerptQuote } from "../../../app/supabase/functions/_shared/evidence-verification.ts";
import type { Page } from "../../../app/supabase/functions/_shared/evidence-verification.ts";

export function buildEvidenceCard(topic: ResearchTopic, page: Page, notes: {
  quote: string; interpretation?: string; limitation?: string;
}, id: string): EvidenceCard | null {
  const quote = excerptQuote(page.passage.text, notes.quote);
  if (page.passage.scope === "metadata only" || !quote) return null;
  return readEvidenceCard({
    ...topic, ...notes, quote, id, passageId: page.passage.id,
    title: page.paper?.title ?? page.title, url: page.url,
    authors: page.paper?.authors ?? (page.author ? [page.author] : []),
    year: page.paper?.year ?? (page.date?.match(/^\d{4}(?=-|$)/) ? Number(page.date.slice(0, 4)) : null),
    textType: page.passage.scope,
  });
}

export function suggestEvidenceQuote(page: Page, preferred?: string): string {
  const { text, scope } = page.passage;
  if (scope === "metadata only") return "";
  const verified = excerptQuote(text, preferred);
  if (verified) return verified;
  const sentences = text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) ?? [];
  for (const sentence of sentences) {
    const quote = excerptQuote(text, sentence.trim());
    if (quote) return quote;
  }
  const first = text.trim();
  const end = first.length <= MAX_EVIDENCE_QUOTE ? first.length : (first.slice(0, MAX_EVIDENCE_QUOTE + 1).match(/\s\S*$/)?.index ?? -1);
  return end > 0 ? excerptQuote(text, first.slice(0, end)) ?? "" : "";
}

const storageKey = (account: string) => `veritas:evidence-cards:v1:${account}`;

export function readEvidenceCards(storage: Pick<Storage, "getItem">, account: string): EvidenceCard[] {
  try {
    const data: unknown = JSON.parse(storage.getItem(storageKey(account)) ?? "[]");
    return Array.isArray(data) ? data.map(readEvidenceCard).filter(card => card !== null) : [];
  } catch { return []; }
}

export function saveEvidenceCards(storage: Pick<Storage, "setItem">, account: string, cards: EvidenceCard[]) {
  storage.setItem(storageKey(account), JSON.stringify(cards));
}

export function compareArgumentWording(original: string, revision: string) {
  const tokenize = (text: string) => text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]|\s+/gu) ?? [];
  const before = tokenize(original);
  const after = tokenize(revision);
  const words = (tokens: string[]) => tokens.flatMap((text, index) => text.trim() ? [{ text, index }] : []);
  const first = words(before);
  const second = words(after);
  const rows = Array.from({ length: first.length + 1 }, () => new Uint16Array(second.length + 1));
  for (let i = first.length - 1; i >= 0; i--) {
    for (let j = second.length - 1; j >= 0; j--) {
      rows[i][j] = first[i].text === second[j].text ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  }
  const commonBefore = new Set<number>();
  const commonAfter = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < first.length && j < second.length) {
    if (first[i].text === second[j].text) {
      commonBefore.add(first[i++].index);
      commonAfter.add(second[j++].index);
    } else if (rows[i + 1][j] >= rows[i][j + 1]) i++;
    else j++;
  }
  function group(tokens: string[], common: Set<number>) {
    const spans: { text: string; changed: boolean }[] = [];
    for (const [index, text] of tokens.entries()) {
      const changed = text.trim() ? !common.has(index) : spans.at(-1)?.changed === true && !common.has(index + 1);
      const last = spans.at(-1);
      if (last?.changed === changed) last.text += text;
      else spans.push({ text, changed });
    }
    return spans;
  }
  return { original: group(before, commonBefore), revised: group(after, commonAfter) };
}
