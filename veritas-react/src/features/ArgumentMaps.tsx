import { useState } from "react";
import type { EvidenceCard } from "../../../app/supabase/functions/_shared/evidence-practice.ts";
import { descendants, mapAsText, moveArgumentPoint, readArgumentMap, readArgumentMaps, removeArgumentPoint } from "../lib/argument-map";
import type { ArgumentMap, ArgumentPoint, PointKind } from "../lib/argument-map";
import { downloadFile, downloadJson } from "../lib/download";

const labels = { claim: "Main claim", reason: "Supporting reason", evidence: "Evidence", objection: "Objection", reply: "Response" };
export default function ArgumentMaps({ owner, cards, motion, onDebate }: { owner: string; cards: EvidenceCard[]; motion: string; onDebate?: (motion: string, outline: string) => void }) {
  const key = `veritas:argument-maps:${owner}`;
  const [maps, setMaps] = useState<ArgumentMap[]>(() => { try { return readArgumentMaps(localStorage.getItem(key)); } catch { return []; } });
  const [selected, setSelected] = useState(maps[0]?.id ?? "");
  const [title, setTitle] = useState(motion);
  const [parent, setParent] = useState("");
  const [kind, setKind] = useState<PointKind>("reason");
  const [text, setText] = useState("");
  const [cardId, setCardId] = useState("");
  const [editing, setEditing] = useState("");
  const [status, setStatus] = useState("");
  const map = maps.find(item => item.id === selected);
  const root = map?.points.find(point => point.parentId === null);

  function store(next: ArgumentMap[]) {
    setMaps(next);
    try { localStorage.setItem(key, JSON.stringify(next)); setStatus("Argument maps saved on this device."); }
    catch { setStatus("Device storage is unavailable. Your current map is available here; export it to keep a copy."); }
  }
  function save(next: ArgumentMap) {
    const checked = readArgumentMap({ ...next, updatedAt: new Date().toISOString() });
    if (!checked) { setStatus("Keep maps within 50 points and eight levels, with one main claim."); return false; }
    store(maps.map(item => item.id === checked.id ? checked : item));
    return true;
  }
  function clearEditor() { setEditing(""); setText(""); setCardId(""); setKind("reason"); }
  function renderBranch(parentId: string | null): React.ReactNode {
    return <ol className="argument-branches">{map?.points.filter(point => point.parentId === parentId).map(point => <li key={point.id} data-kind={point.kind}>
      <article className="argument-point"><p className="workspace-caption">{labels[point.kind]}</p><p>{point.text}</p>
        {point.card && <details><summary>Attached source · {point.card.textType}</summary><blockquote>{point.card.quote}</blockquote><a href={point.card.url} target="_blank" rel="noreferrer">{point.card.title}</a><p>{point.card.limitation}</p></details>}
        <div className="argument-point-actions"><button className="workspace-text-action" onClick={() => { clearEditor(); setParent(point.id); }}>Add a response here</button>
          <button className="workspace-text-action" onClick={() => { setEditing(point.id); setText(point.text); setKind(point.kind); setParent(point.parentId ?? ""); setCardId(point.card?.id ?? ""); }}>Edit</button>
          {point.parentId !== null && <button className="workspace-text-action" onClick={() => {
            const count = descendants(map!, point.id).size;
            if (!window.confirm(`Remove this point and its ${count - 1} descendant points? Export the map first if you need a copy.`)) return;
            save(removeArgumentPoint(map!, point.id)); setParent(root!.id); clearEditor();
          }}>Remove branch</button>}
        </div>
      </article>{renderBranch(point.id)}
    </li>)}</ol>;
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!map || !text.trim()) return;
    try {
      const previous = map.points.find(point => point.id === editing);
      const point: ArgumentPoint = { id: editing || crypto.randomUUID(), parentId: previous?.parentId === null ? null : parent || root!.id, kind: previous?.parentId === null ? "claim" : kind, text: text.trim(), card: kind === "evidence" && cardId ? cards.find(card => card.id === cardId) ?? (previous?.card?.id === cardId ? previous.card : null) : null };
      let next = editing ? { ...map, points: map.points.map(item => item.id === editing ? point : item) } : { ...map, points: [...map.points, point] };
      if (previous?.parentId && previous.parentId !== point.parentId) next = moveArgumentPoint({ ...next, points: next.points.map(item => item.id === point.id ? { ...point, parentId: previous.parentId } : item) }, point.id, point.parentId!);
      if (save({ ...next, title: point.parentId === null ? point.text.slice(0,200) : next.title })) clearEditor();
    } catch (error) { setStatus(error instanceof Error ? error.message : "This change could not be saved."); }
  }
  return <details className="workspace-note argument-map-tool"><summary>Plan an argument map</summary>
    <p>Connect your main claim to reasons, evidence, objections and responses. Maps are private to this device unless you export or explicitly back them up in Profile.</p>
    <form onSubmit={event => {
      event.preventDefault(); if (!title.trim() || maps.length >= 20) return;
      const id = crypto.randomUUID(); const pointId = crypto.randomUUID();
      store([...maps, { id, title: title.trim(), updatedAt: new Date().toISOString(), points: [{ id: pointId, parentId: null, kind: "claim", text: title.trim(), card: null }] }]);
      setSelected(id); setParent(pointId); clearEditor();
    }}><label className="workspace-field">New map’s main claim<input maxLength={200} required value={title} onChange={event => setTitle(event.target.value)} /></label>
      <button type="button" className="workspace-text-action" disabled={!motion.trim()} onClick={() => setTitle(motion)}>Use current debate motion</button> <button className="workspace-secondary" disabled={!title.trim() || maps.length >= 20}>Create map</button></form>
    <label className="workspace-field">Import an exported map (JSON)
      <input type="file" accept=".json,application/json" onChange={async event => {
        const input = event.currentTarget; const file = input.files?.[0]; if (!file) return;
        try {
          if (file.size > 1024 * 1024) throw new Error("Choose a map JSON smaller than 1 MB.");
          if (maps.length >= 20) throw new Error("Export or remove an existing map before importing another.");
          const imported = readArgumentMap(JSON.parse(await file.text()));
          if (!imported) throw new Error("This file does not contain a valid argument map.");
          const next = { ...imported, id: crypto.randomUUID(), updatedAt: new Date().toISOString() };
          store([...maps, next]); setSelected(next.id); setParent(""); clearEditor();
          setStatus("Map imported as a separate copy. Attached quotations are stored source notes, not a new verification of their source.");
        } catch (error) { setStatus(error instanceof Error ? error.message : "Could not import this map."); }
        finally { input.value = ""; }
      }} />
    </label>
    {maps.length > 0 && <label className="workspace-field">Saved map<select value={selected} onChange={event => { setSelected(event.target.value); setParent(""); clearEditor(); }}>{maps.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
    {map && <><h2>{map.title}</h2>{renderBranch(null)}
      <form onSubmit={submit} className="argument-point-form"><h3>{editing ? "Edit point" : "Add a point"}</h3>
        {map.points.find(point => point.id === editing)?.parentId !== null && <>
          <label className="workspace-field">Connect to<select value={parent || root!.id} onChange={event => setParent(event.target.value)}>{map.points.filter(point => !editing || !descendants(map, editing).has(point.id)).map(point => <option key={point.id} value={point.id}>{labels[point.kind]} · {point.text.slice(0, 70)}</option>)}</select></label>
          <label className="workspace-field">Point type<select value={kind} onChange={event => setKind(event.target.value as PointKind)}>{(["reason", "evidence", "objection", "reply"] as const).map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label>
        </>}
        <label className="workspace-field">Your point<textarea required maxLength={map.points.find(point => point.id === editing)?.parentId === null ? 200 : 1500} value={text} onChange={event => setText(event.target.value)} /></label>
        {kind === "evidence" && <label className="workspace-field">Attach a saved quotation<select value={cardId} onChange={event => setCardId(event.target.value)}><option value="">No saved quotation</option>{cards.map(card => <option key={card.id} value={card.id}>{card.title}</option>)}</select></label>}
        <button className="workspace-secondary" disabled={!text.trim() || (!editing && map.points.length >= 50)}>{editing ? "Save point" : "Add point"}</button>{editing && <button type="button" className="workspace-text-action" onClick={clearEditor}>Cancel edit</button>}
      </form>
      <div className="argument-point-actions">{onDebate && <button className="workspace-primary" disabled={map.title.trim().length < 8} onClick={() => onDebate(map.title, mapAsText(map))}>Practise this plan in Debate AI</button>}<button className="workspace-secondary" onClick={() => downloadJson("veritas-argument-map.json", map)}>Export map JSON</button><button className="workspace-secondary" onClick={() => downloadFile("veritas-argument-map.txt", mapAsText(map))}>Export argument outline</button>
      <button className="workspace-text-action" onClick={() => { if (window.confirm("Remove this entire argument map from this device?")) { store(maps.filter(item => item.id !== map.id)); setSelected(maps.find(item => item.id !== map.id)?.id ?? ""); setParent(""); clearEditor(); } }}>Remove map</button></div>
    </>}
    {status && <p role="status">{status}</p>}
  </details>;
}
