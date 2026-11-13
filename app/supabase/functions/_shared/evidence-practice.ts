import { object, safeSourceUrl } from "./evidence-verification.ts";

export const MAX_EVIDENCE_ARGUMENT = 2000;
export const MAX_EVIDENCE_QUOTE = 650;
export const MAX_CARD_NOTE = 500;

export type EvidenceTopic = { motion: string; side: "for" | "against"; claim: string };
export type ResearchTopic = Pick<EvidenceTopic, "motion" | "claim">;
export type EvidenceCard = ResearchTopic & {
  side: EvidenceTopic["side"] | null;
  id: string;
  passageId: string;
  title: string;
  url: string;
  authors: string[];
  year: number | null;
  textType: "abstract" | "retrieved excerpt";
  quote: string;
  interpretation: string;
  limitation: string;
};

export type EvidenceChallenge = { question: string; studentSpan: string; sourceSpan: string };
const citationStatuses = ["accurate", "overstated", "unclear", "source_not_used"] as const;
export type CitationAssessment = {
  status: typeof citationStatuses[number];
  explanation: string;
  studentSpan: string | null;
  sourceSpan: string | null;
};
export type EvidenceFeedback = { original: CitationAssessment; revised: CitationAssessment; nextStep: string };

function bounded(value: unknown, min: number, max: number): string | null {
  return typeof value === "string" && value.length <= max && value.trim().length >= min ? value.trim() : null;
}

export function readResearchTopic(value: unknown): ResearchTopic | null {
  const topic = object(value);
  const motion = bounded(topic?.motion, 8, 200);
  const claim = bounded(topic?.claim, 8, 500);
  return motion && claim ? { motion, claim } : null;
}

export function readEvidenceCard(value: unknown): EvidenceCard | null {
  const card = object(value);
  const topic = readResearchTopic(card);
  if (!card || !topic) return null;
  const id = bounded(card.id, 1, 64);
  const passageId = bounded(card.passageId, 1, 2600);
  const title = bounded(card.title, 1, 2000);
  const url = safeSourceUrl(card.url);
  const quote = bounded(card.quote, 12, MAX_EVIDENCE_QUOTE);
  const interpretation = bounded(card.interpretation ?? "", 0, MAX_CARD_NOTE);
  const limitation = bounded(card.limitation ?? "", 0, MAX_CARD_NOTE);
  const side = card.side ?? null;
  if (!id || !passageId || !title || !url || !quote || interpretation === null || limitation === null
    || (side !== null && side !== "for" && side !== "against")
    || (card.textType !== "abstract" && card.textType !== "retrieved excerpt") || !Array.isArray(card.authors)
    || card.authors.length > 100 || !card.authors.every(author => bounded(author, 1, 200))) return null;
  const year = typeof card.year === "number" && Number.isInteger(card.year) && card.year > 0 && card.year <= 9999
    ? card.year : null;
  return { ...topic, side, id, passageId, title, url: url.href, authors: card.authors, year, textType: card.textType, quote, interpretation, limitation };
}

export function readEvidenceArgument(value: unknown): string | null {
  return bounded(value, 12, MAX_EVIDENCE_ARGUMENT);
}

function exactSpan(text: string, value: unknown): string | null {
  const span = bounded(value, 4, MAX_EVIDENCE_QUOTE);
  return span && text.includes(span) ? span : null;
}

export function readEvidenceChallenge(value: unknown, argument: string, quote: string): EvidenceChallenge | null {
  const data = object(value);
  const question = bounded(data?.question, 12, 400);
  const studentSpan = exactSpan(argument, data?.studentSpan);
  const sourceSpan = exactSpan(quote, data?.sourceSpan);
  return question?.endsWith("?") && studentSpan && sourceSpan ? { question, studentSpan, sourceSpan } : null;
}

function readCitationAssessment(value: unknown, argument: string, quote: string): CitationAssessment | null {
  const data = object(value);
  const status = citationStatuses.find(candidate => candidate === data?.status);
  const explanation = bounded(data?.explanation, 1, 500);
  if (!status || !explanation) return null;
  if (status === "source_not_used") {
    return data?.studentSpan === null && data.sourceSpan === null ? { status, explanation, studentSpan: null, sourceSpan: null } : null;
  }
  const studentSpan = exactSpan(argument, data?.studentSpan);
  const sourceSpan = exactSpan(quote, data?.sourceSpan);
  return studentSpan && sourceSpan ? { status, explanation, studentSpan, sourceSpan } : null;
}

export function readEvidenceFeedback(value: unknown, original: string, revision: string, quote: string): EvidenceFeedback | null {
  const data = object(value);
  const first = readCitationAssessment(data?.original, original, quote);
  const revised = readCitationAssessment(data?.revised, revision, quote);
  const nextStep = bounded(data?.nextStep, 1, 400);
  return first && revised && nextStep ? { original: first, revised, nextStep } : null;
}
