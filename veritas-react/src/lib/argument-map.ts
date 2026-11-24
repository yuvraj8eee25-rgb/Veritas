import { readEvidenceCard } from "../../../app/supabase/functions/_shared/evidence-practice.ts";
import type { EvidenceCard } from "../../../app/supabase/functions/_shared/evidence-practice.ts";

export type PointKind = "claim" | "reason" | "evidence" | "objection" | "reply";
export type ArgumentPoint = { id: string; parentId: string | null; kind: PointKind; text: string; card: EvidenceCard | null };
export type ArgumentMap = { id: string; title: string; updatedAt: string; points: ArgumentPoint[] };
const kinds = new Set(["claim", "reason", "evidence", "objection", "reply"]);
const identifier = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value);

export function readArgumentMap(value: unknown): ArgumentMap | null {
  if (!value || typeof value !== "object") return null;
  const map = value as ArgumentMap;
  if (!identifier(map.id) || typeof map.title !== "string" || !map.title.trim() || map.title.length > 200
    || typeof map.updatedAt !== "string" || !Number.isFinite(Date.parse(map.updatedAt))
    || !Array.isArray(map.points) || !map.points.length || map.points.length > 50) return null;
  const points: ArgumentPoint[] = [];
  for (const point of map.points) {
    if (!point || !identifier(point.id) || (point.parentId !== null && !identifier(point.parentId))
      || !kinds.has(point.kind) || typeof point.text !== "string" || !point.text.trim() || point.text.length > 1500) return null;
    const card = point.card ? readEvidenceCard(point.card) : null;
    if (point.card && !card) return null;
    points.push({ id: point.id, parentId: point.parentId, kind: point.kind, text: point.text, card });
  }
  if (new Set(points.map(point => point.id)).size !== points.length) return null;
  const roots = points.filter(point => point.parentId === null);
  if (roots.length !== 1 || roots[0].kind !== "claim") return null;
  for (const point of points) {
    const seen = new Set([point.id]);
    let parentId = point.parentId;
    while (parentId !== null) {
      const parent = points.find(item => item.id === parentId);
      if (!parent || seen.has(parentId) || seen.size >= 8) return null;
      seen.add(parentId); parentId = parent.parentId;
    }
  }
  return { id: map.id, title: map.title.trim(), updatedAt: map.updatedAt, points };
}

export function readArgumentMaps(raw: string | null): ArgumentMap[] {
  try { const maps = JSON.parse(raw ?? "[]"); return Array.isArray(maps) ? maps.map(readArgumentMap).filter((map): map is ArgumentMap => map !== null).slice(0, 20) : []; }
  catch { return []; }
}

export function descendants(map: ArgumentMap, pointId: string): Set<string> {
  const ids = new Set([pointId]);
  for (let changed = true; changed;) {
    changed = false;
    for (const point of map.points) if (point.parentId && ids.has(point.parentId) && !ids.has(point.id)) { ids.add(point.id); changed = true; }
  }
  return ids;
}

export function moveArgumentPoint(map: ArgumentMap, id: string, parentId: string): ArgumentMap {
  const point = map.points.find(item => item.id === id);
  if (!point || point.parentId === null || !map.points.some(item => item.id === parentId) || descendants(map, id).has(parentId)) throw new Error("Choose a parent outside this point’s own branch.");
  const result = readArgumentMap({ ...map, points: map.points.map(item => item.id === id ? { ...item, parentId } : item) });
  if (!result) throw new Error("This move would make the map too deep.");
  return result;
}

export function removeArgumentPoint(map: ArgumentMap, id: string): ArgumentMap {
  if (map.points.find(point => point.id === id)?.parentId === null) throw new Error("Keep the main claim; remove the entire map instead.");
  const removed = descendants(map, id);
  return { ...map, points: map.points.filter(point => !removed.has(point.id)) };
}

export function mapAsText(map: ArgumentMap) {
  const lines = [map.title, `Updated: ${map.updatedAt}`, ""];
  function visit(parentId: string | null, depth: number) {
    for (const point of map.points.filter(item => item.parentId === parentId)) {
      lines.push(`${"  ".repeat(depth)}${point.kind.toUpperCase()}: ${point.text}`);
      if (point.card) lines.push(`${"  ".repeat(depth + 1)}${point.card.textType}: “${point.card.quote}”\n${"  ".repeat(depth + 1)}${point.card.title} — ${point.card.url}`);
      visit(point.id, depth + 1);
    }
  }
  visit(null, 0); return lines.join("\n");
}
