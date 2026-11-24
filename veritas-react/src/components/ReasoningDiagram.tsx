import { FileText, GitBranch, Lightbulb, MessageSquareText, Quote, ScanSearch, Search, UsersRound } from "lucide-react";
const diagrams = {
  argument: {title:"Follow the reasoning",caption:"A stronger argument makes the connections clear.",nodes:[{label:"Claim",text:"What are you asking us to accept?",icon:Lightbulb},{label:"Reasoning",text:"Explain why the support fits.",icon:FileText},{label:"Evidence",text:"Give the reader something to inspect.",icon:Quote}]},
  sources: {title:"Follow the source trail",caption:"Several pages can repeat the same original source.",nodes:[{label:"Publisher",text:"Who is behind the claim?",icon:UsersRound},{label:"Original record",text:"Find the evidence it refers to.",icon:FileText},{label:"Independent check",text:"Look beyond copies of the same account.",icon:Search}]},
  reasoning: {title:"Test the connection",caption:"Match the strength of a conclusion to its support.",nodes:[{label:"Observation",text:"Identify what was actually measured.",icon:ScanSearch},{label:"Alternatives",text:"Ask what else could explain it.",icon:GitBranch},{label:"Conclusion",text:"Keep the population and limits in view.",icon:Lightbulb}]},
  "other-side": {title:"Understand, then respond",caption:"A useful response addresses the strongest relevant point.",nodes:[{label:"Listen",text:"State the other view fairly.",icon:MessageSquareText},{label:"Consider",text:"Acknowledge what the point gets right.",icon:UsersRound},{label:"Respond",text:"Explain where you agree or differ, and why.",icon:Quote}]},
};
/** Original, text-accessible illustration: no external image requests. */
export default function ReasoningDiagram({ compact = false, variant = "argument" }: { compact?: boolean; variant?: string }) {
  const diagram = diagrams[variant as keyof typeof diagrams] ?? diagrams.argument;
  return <figure className={`reasoning-diagram ${compact ? "reasoning-diagram-compact" : ""}`}>
    <div className="reasoning-diagram-heading"><span className="diagram-orbit" aria-hidden="true"><ScanSearch size={19} /></span><span>{diagram.title}</span><span className="diagram-dots" aria-hidden="true">···</span></div>
    <ol className="reasoning-nodes">{diagram.nodes.map(({label,text,icon:Icon}) => <li className="reasoning-node" key={label}><span className="reasoning-node-icon" aria-hidden="true"><Icon size={19} /></span><div><span className="reasoning-node-label">{label}</span><strong>{text}</strong></div></li>)}</ol>
    <figcaption>{diagram.caption}</figcaption>
  </figure>;
}
