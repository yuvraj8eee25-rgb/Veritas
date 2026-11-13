export type Difficulty = "easy" | "medium" | "hard";
export type FallacyQuestion = {
  id: string;
  difficulty: Difficulty;
  prompt: string;
  options: string[];
  correct: number;
  explain: string;
  tip: string;
};

export const fallacyQuestions: FallacyQuestion[] = [
  { id:"f1", difficulty:"easy", prompt:"You can't trust Maria's opinion on the new traffic law — she got a speeding ticket last year.", options:["Ad Hominem","False Dilemma","Slippery Slope","Appeal to Authority"], correct:0, explain:"This attacks Maria's character instead of addressing her actual argument about the law.", tip:"Ask whether the response engages with the claim or with the person making it." },
  { id:"f2", difficulty:"easy", prompt:"Either we ban all cars downtown, or the city stays polluted forever. There's no other option.", options:["Hasty Generalization","False Dilemma","Red Herring","Circular Reasoning"], correct:1, explain:"This presents two extreme outcomes when many middle-ground policies exist.", tip:"Words like ‘either/or’ or ‘only choice’ can hide unexplored alternatives." },
  { id:"f3", difficulty:"easy", prompt:"I asked three friends and they all hate the new phone, so clearly everyone hates it.", options:["Hasty Generalization","Appeal to Authority","Straw Man","Slippery Slope"], correct:0, explain:"Three friends are too small and non-representative a sample to conclude that everyone feels this way.", tip:"Ask how the sample was chosen before drawing a broad conclusion." },
  { id:"f4", difficulty:"medium", prompt:"If we let students redo one exam, soon they'll demand to redo every assignment, and eventually grades will mean nothing.", options:["Slippery Slope","False Dilemma","Appeal to Emotion","Ad Hominem"], correct:0, explain:"This assumes one small change inevitably cascades into an extreme outcome without justifying each step.", tip:"A slippery slope needs evidence for every link in the chain." },
  { id:"f5", difficulty:"medium", prompt:"My opponent wants to regulate social media, which basically means they want the government to control everything we think.", options:["Straw Man","Appeal to Authority","Circular Reasoning","Hasty Generalization"], correct:0, explain:"This exaggerates a specific proposal into an extreme, unrelated claim that is easier to attack.", tip:"Compare the restated position to the original. Is it more extreme?" },
  { id:"f6", difficulty:"medium", prompt:"This diet must work — a famous actor said it changed his life.", options:["Appeal to Authority","Slippery Slope","Red Herring","False Dilemma"], correct:0, explain:"Fame in an unrelated field does not validate a health claim.", tip:"Check whether the authority has expertise in the specific subject." },
  { id:"f7", difficulty:"hard", prompt:"Why worry about the budget deficit? Let's talk about how the other party mishandled last year's storm response.", options:["Red Herring","Circular Reasoning","Ad Hominem","Appeal to Emotion"], correct:0, explain:"This shifts attention to an unrelated topic to avoid engaging with the deficit question.", tip:"If a response changes the subject rather than answering it, suspect a red herring." },
  { id:"f8", difficulty:"hard", prompt:"The policy is right because it's just, and we know it's just because it's the right policy.", options:["Circular Reasoning","Straw Man","Hasty Generalization","Slippery Slope"], correct:0, explain:"The conclusion is used as its own supporting evidence, so nothing is actually proven.", tip:"If the conclusion loops back as its own premise, the reasoning is circular." },
  { id:"f9", difficulty:"hard", prompt:"Think of the children — anyone who opposes this curfew clearly doesn't care if kids get hurt.", options:["Appeal to Emotion","False Dilemma","Ad Hominem","Appeal to Authority"], correct:0, explain:"This leans on fear and guilt rather than presenting evidence that the curfew reduces harm.", tip:"Watch for emotion replacing evidence instead of supporting it." },
];
