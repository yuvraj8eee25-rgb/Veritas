export type DebateTopic = { text: string; tag: string; newsUrl?: string; newsSource?: string };

export const aiTopicSamples: DebateTopic[] = [
  { text: "Should college be free for everyone?", tag: "Education" },
  { text: "Should social media platforms verify every user's real identity?", tag: "Technology" },
  { text: "Should artificial intelligence be granted any form of legal personhood?", tag: "Technology" },
  { text: "Should the four-day work week become the standard?", tag: "Work" },
  { text: "Should genetic engineering of human embryos be allowed to prevent disease?", tag: "Science" },
  { text: "Should billionaires be allowed to exist, or should wealth be capped?", tag: "Economics" },
  { text: "Should voting be mandatory for all eligible citizens?", tag: "Society" },
  { text: "Is it ethical to eat meat when viable alternatives exist?", tag: "Ethics" },
  { text: "Should the voting age be lowered to 16?", tag: "Society" },
  { text: "Should zoos exist, or do they do more harm than good?", tag: "Environment" },
  { text: "Should nuclear energy be the primary solution to the climate crisis?", tag: "Environment" },
  { text: "Should schools ban homework entirely?", tag: "Education" },
  { text: "Should countries adopt a universal basic income?", tag: "Economics" },
  { text: "Is remote work better for productivity than working in an office?", tag: "Work" },
  { text: "Should companies disclose how their algorithms work?", tag: "Technology" },
  { text: "Should the death penalty be abolished everywhere?", tag: "Justice" },
  { text: "Should parents be allowed to genetically select traits in their children?", tag: "Ethics" },
  { text: "Is space exploration a good use of public funding right now?", tag: "Science" },
  { text: "Should facial recognition be banned from public spaces?", tag: "Privacy" },
  { text: "Should cities make public transport free?", tag: "Policy" },
];
