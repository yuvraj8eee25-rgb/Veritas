"use client";
import { useState } from "react";
export default function SampleLesson() {
  const [answer, setAnswer] = useState<number>();
  return <section><h2>Which conclusion fits?</h2><p>Choose the most defensible interpretation of the fictional reading-club observation.</p>
    {["The reading club definitely causes higher scores.", "Club membership is associated with scores; other explanations remain possible.", "The observation tells us nothing at all about scores."].map((label, index) => <button className="workspace-secondary" style={{ display: "block", marginBlock: 12, textAlign: "left" }} aria-pressed={answer === index} key={label} onClick={() => setAnswer(index)}>{label}</button>)}
    {answer !== undefined && <p role="status">{answer === 1 ? "Correct. This describes the observation without turning it into a causal result." : "Try again. Preserve the observed association, while recognizing that the observation does not establish its cause."}</p>}
  </section>;
}
