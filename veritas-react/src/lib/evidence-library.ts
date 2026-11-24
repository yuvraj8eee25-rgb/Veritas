import type { EvidenceCard } from "../../../app/supabase/functions/_shared/evidence-practice.ts";
export type CardTags = Record<string, string[]>;
export function parseTags(text: string) { return [...new Set(text.split(",").map(tag => tag.trim().slice(0, 40)).filter(Boolean))].slice(0, 8); }
export function readCardTags(raw: string | null): CardTags {
  try {
    const value = JSON.parse(raw ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([key, tags]) => key.length <= 64 && Array.isArray(tags)).map(([key, tags]) => [key, parseTags((tags as unknown[]).filter((tag): tag is string => typeof tag === "string").join(","))]));
  } catch { return {}; }
}
export function filterCards(cards: EvidenceCard[], query: string, tags: CardTags, type: string) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return cards.filter(card => (type === "all" || card.textType === type) && words.every(word => [card.title, card.motion, card.claim, card.quote, card.interpretation, card.limitation, ...card.authors, ...(tags[card.id] ?? [])].join(" ").toLocaleLowerCase().includes(word)));
}
export function cardCitation(card: EvidenceCard) {
  return `${card.authors.join(", ") || "Author not available"}${card.year ? ` (${card.year})` : " (date not available)"}. ${card.title}. ${card.url}\n${card.textType === "abstract" ? "Abstract excerpt" : "Retrieved web excerpt"}: “${card.quote}”${card.limitation ? `\nLimitation: ${card.limitation}` : ""}`;
}
export function cardsAsRis(cards: EvidenceCard[]) {
  const line = (text: string) => text.replace(/[\r\n\u0000-\u001f]+/g, " ");
  return cards.map(card => ["TY  - GEN", ...card.authors.map(author => `AU  - ${line(author)}`), `TI  - ${line(card.title)}`, ...(card.year ? [`PY  - ${card.year}`] : []), `UR  - ${line(card.url)}`, `N1  - ${line(card.textType === "abstract" ? "Abstract excerpt; full paper not reviewed." : "Retrieved web excerpt; full source not reviewed.")}`, `N1  - Quotation: ${line(card.quote)}`, ...(card.limitation ? [`N1  - Limitation: ${line(card.limitation)}`] : []), "ER  -", ""].join("\r\n")).join("\r\n");
}
