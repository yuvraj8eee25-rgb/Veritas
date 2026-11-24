import { compareArgumentWording } from "../lib/evidence-cards";
export default function WorkedExample({ example }: { example: {question:string;weak:string;strong:string;takeaway:string} }) {
  const wording = compareArgumentWording(example.weak,example.strong);
  return <section className="study-react-example worked-example" aria-label="Worked example">
    <p className="example-question">{example.question}</p>
    <div className="example-comparison"><div><span className="example-version">Before · less effective</span><p>{wording.original.map((span,index) => span.changed ? <del key={index}>{span.text}</del> : span.text)}</p></div>
      <div><span className="example-version">After · stronger</span><p>{wording.revised.map((span,index) => span.changed ? <mark key={index}>{span.text}</mark> : span.text)}</p></div></div>
    <p className="example-change-note">Marked wording changed. Here’s why the revision works:</p><blockquote>{example.takeaway}</blockquote>
  </section>;
}
