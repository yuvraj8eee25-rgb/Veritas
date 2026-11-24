import type { Metadata } from "next";
import SampleLesson from "./sample-lesson";
export const metadata: Metadata = { title: "Free reasoning lesson · Veritas", description: "Practise distinguishing a claim, evidence and a warranted conclusion. No account required." };
export default function LearnPage() {
  return <main className="public-learning" style={{ maxWidth: 760, margin: "4rem auto", padding: "1.5rem" }}>
    <a href="/">Veritas</a><h1>Make a claim your evidence can support</h1>
    <p>A claim is the conclusion you want someone to accept. Evidence is what a reader can inspect. Reasoning explains the connection.</p>
    <h2>Keep the scope of your evidence</h2>
    <p>In this fictional example, students who joined a reading club had higher exam scores. That observation alone does not show that joining the club caused higher scores: prior motivation, study time or other differences could explain the result.</p>
    <SampleLesson />
    <h2>Try it with your own argument</h2>
    <p>Write your claim, identify the observation supporting it, and name one alternative explanation. Change words such as “proves” or “always” if the evidence does not justify them.</p>
    <p><a href="/workspace/setup">Practise reasoning skills</a> · <a href="/workspace/study">Open Study paths</a> · <a href="/help">How Veritas works</a></p>
  </main>;
}
