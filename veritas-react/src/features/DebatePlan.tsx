export type DebatePlanData = { motion: string; outline: string };
export default function DebatePlan({ plan }: { plan: DebatePlanData | null }) {
  if (!plan) return null;
  return <details className="workspace-note"><summary>Your argument plan</summary>
    <p>Use this outline to prepare each turn. Only arguments you submit are sent to the AI opponent.</p>
    <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 400, overflow: "auto" }}>{plan.outline}</pre>
  </details>;
}
