import { fallacyQuestions, type Difficulty, type FallacyQuestion } from "./fallacy-questions";

export type PracticeMode = "fallacy" | "rebuttal" | "speed" | "steelman";
export type PracticeModeInfo = { id: PracticeMode; name: string; description: string; skill: string; xp: number; timed?: boolean };
type BankQuestion = { id: string; difficulty: Difficulty; prompt: string; options?: string[]; correct?: number; answer?: boolean; explain: string; tip: string };

const rebuttalBank: BankQuestion[] = [
  { id: "r1", difficulty: "easy",
    prompt: "Weak argument: \u201cWe shouldn't recycle because some recycling plants use energy too.\u201d Pick the strongest counter.",
    options: [
      "Recycling plants use less energy overall than producing new materials from raw resources, so net energy use still drops.",
      "Recycling is a nice thing to do and makes people feel good.",
      "Everyone should recycle because it's the law in most places.",
      "The person who said this probably doesn't recycle themselves."
    ],
    correct: 0,
    explain: "This directly compares total energy costs, addressing the actual claim with a concrete mechanism instead of appealing to feelings or authority.",
    tip: "The strongest rebuttal engages the specific mechanism in the weak claim, not just its conclusion." },
  { id: "r2", difficulty: "easy",
    prompt: "Weak argument: \u201cRemote work can't be productive because you can't see your coworkers.\u201d Pick the strongest counter.",
    options: [
      "Multiple large-scale studies show output per hour is comparable or higher for many remote roles when tools support collaboration.",
      "Remote work is more comfortable, so it must be better.",
      "Offices are outdated and everyone knows it.",
      "The person saying this just doesn't like their coworkers."
    ],
    correct: 0,
    explain: "Citing measurable output data rebuts the productivity claim directly, rather than substituting comfort or opinion.",
    tip: "Look for the option that offers evidence tied to the specific claim (productivity), not a tangential benefit." },
  { id: "r3", difficulty: "medium",
    prompt: "Weak argument: \u201cRaising the minimum wage always causes mass unemployment.\u201d Pick the strongest counter.",
    options: [
      "Multiple regional studies comparing similar labor markets show employment effects are often small or statistically insignificant at moderate increases.",
      "Workers deserve more money no matter what happens to jobs.",
      "Any economist who disagrees is paid by big business.",
      "Minimum wage laws have existed for decades, so they must be fine."
    ],
    correct: 0,
    explain: "This challenges the 'always' claim with comparative empirical evidence, which is the actual weak point in the original statement.",
    tip: "When a claim uses an absolute word like 'always,' the sharpest rebuttal usually finds a documented exception." },
  { id: "r4", difficulty: "medium",
    prompt: "Weak argument: \u201cSocial media makes all teenagers depressed.\u201d Pick the strongest counter.",
    options: [
      "Research shows effects vary widely by usage pattern and content type, with passive scrolling linked to worse outcomes than active social use.",
      "Teenagers today are just more dramatic than before.",
      "My teenager uses social media and seems fine.",
      "Depression has always existed, so social media isn't the cause."
    ],
    correct: 0,
    explain: "This introduces the nuance the blanket claim ignores \u2014 that effects depend on how the platform is used, not just whether it's used.",
    tip: "A single personal anecdote is weaker evidence than a pattern shown across research; pick the option backed by broader data." },
  { id: "r5", difficulty: "hard",
    prompt: "Weak argument: \u201cAI will inevitably replace all human jobs, so there's no point training for a career.\u201d Pick the strongest counter.",
    options: [
      "Historically, automation has shifted the types of jobs available more than it has eliminated total employment, and new skill categories tend to emerge alongside new tools.",
      "AI is just hype and will fade away soon.",
      "Only people who don't understand technology say things like that.",
      "Jobs have always existed and always will, end of story."
    ],
    correct: 0,
    explain: "This responds with the actual historical pattern of technological shifts, addressing the inevitability claim with evidence rather than dismissal.",
    tip: "The best rebuttal to a sweeping prediction is usually a relevant historical pattern, not a flat denial." },
  { id: "r6", difficulty: "hard",
    prompt: "Weak argument: \u201cSince the ancient philosophers didn't need calculators, modern students shouldn't use them either.\u201d Pick the strongest counter.",
    options: [
      "Tools evolve alongside the problems people need to solve; the relevant question is whether calculators help students reach deeper mathematical understanding faster, not whether ancient thinkers had them.",
      "Ancient philosophers were smarter than us anyway.",
      "Calculators are required by most modern school curricula.",
      "That's a silly, outdated way of thinking."
    ],
    correct: 0,
    explain: "This exposes the actual logical gap \u2014 that historical absence of a tool says nothing about its present-day educational value.",
    tip: "When an argument leans on 'how things used to be,' the sharpest rebuttal asks whether that historical fact is actually relevant to today's goal." },
  { id: "r7", difficulty: "hard",
    prompt: "Weak argument: \u201cIf we allow one exception to the dress code, the whole policy becomes meaningless.\u201d Pick the strongest counter.",
    options: [
      "Well-defined exceptions with clear criteria (like medical or religious accommodations) can coexist with a policy's core purpose without undermining it, as seen in many existing institutional codes.",
      "Dress codes are old-fashioned and should be scrapped entirely.",
      "Rules are meant to be broken sometimes.",
      "The people who wrote the dress code don't even follow it."
    ],
    correct: 0,
    explain: "This directly challenges the slippery-slope assumption by pointing to real examples where bounded exceptions don't erode a policy's intent.",
    tip: "The strongest counter to a slippery-slope claim shows a real case where the predicted collapse didn't happen." }
];

const speedBank: BankQuestion[] = [
  { id: "s1", difficulty: "easy", prompt: "\u201cAll swans are white\u201d is a valid universal claim as long as you've seen a few swans.", answer: false,
    explain: "A handful of observations can't establish a universal law \u2014 black swans exist and disprove the claim.",
    tip: "Universal claims need either exhaustive evidence or a logical guarantee, not just a sample." },
  { id: "s2", difficulty: "easy", prompt: "Correlation between two events is enough on its own to prove one causes the other.", answer: false,
    explain: "Correlation can result from coincidence or a shared underlying cause \u2014 causation needs more evidence.",
    tip: "Always ask: could a third factor explain both things happening together?" },
  { id: "s3", difficulty: "easy", prompt: "An argument can have true premises and still reach a false conclusion if the logic connecting them is flawed.", answer: true,
    explain: "Validity depends on the logical structure, not just the truth of the premises \u2014 bad structure can break a good argument.",
    tip: "Check the link between premises and conclusion separately from checking whether the premises are true." },
  { id: "s4", difficulty: "medium", prompt: "Attacking the messenger is a valid way to disprove their argument's content.", answer: false,
    explain: "The credibility of a speaker doesn't determine whether their claim is logically or factually correct.",
    tip: "Separate 'is this person trustworthy' from 'is this specific claim true' \u2014 they're different questions." },
  { id: "s5", difficulty: "medium", prompt: "A single well-documented counterexample can be enough to disprove an 'always' or 'never' claim.", answer: true,
    explain: "Absolute claims only need one solid counterexample to be logically disproven.",
    tip: "Absolute language is fragile \u2014 it invites you to search for just one exception." },
  { id: "s6", difficulty: "medium", prompt: "If an expert in one field endorses a claim in a completely different field, that endorsement carries strong evidential weight.", answer: false,
    explain: "Expertise doesn't transfer across unrelated domains, so the endorsement adds little genuine support.",
    tip: "Match the expert's actual specialty to the specific claim being made before weighing their opinion." },
  { id: "s7", difficulty: "hard", prompt: "Restating an opponent's position in its strongest possible form before rebutting it makes your own argument weaker.", answer: false,
    explain: "Steelmanning actually strengthens your position \u2014 defeating the strongest version of an argument is far more persuasive than defeating a weak one.",
    tip: "Audiences trust arguments more when they see you've engaged with the best version of the opposing view." },
  { id: "s8", difficulty: "hard", prompt: "A conclusion can be logically valid even if one of its premises turns out to be false.", answer: true,
    explain: "Validity is about the structure of the reasoning; an argument can be valid in form while still being unsound because a premise is false.",
    tip: "Validity (structure) and soundness (true premises + valid structure) are separate tests \u2014 don't conflate them." },
  { id: "s9", difficulty: "hard", prompt: "Bringing up an unrelated scandal to avoid answering a direct question is a legitimate debate tactic if it's entertaining.", answer: false,
    explain: "This is a textbook red herring \u2014 entertainment value doesn't make an evasive, off-topic pivot logically legitimate.",
    tip: "A tactic that avoids the question is a deflection, regardless of how engaging it is to an audience." }
];

const steelmanBank: BankQuestion[] = [
  { id: "st1", difficulty: "easy",
    prompt: "You disagree: \u201cWe should ban homework in elementary school.\u201d Pick the option that best strengthens this position.",
    options: [
      "Research on younger children suggests structured, unsupervised playtime supports development at least as much as repetitive drills, so homework's marginal benefit may be small relative to its costs on family time and stress.",
      "Kids are lazy and don't want to do homework anyway.",
      "Teachers just assign homework to look busy.",
      "Homework should be banned because school is already too long."
    ],
    correct: 0,
    explain: "This grounds the opposing view in real developmental research and a genuine cost-benefit tradeoff, rather than dismissive or unsupported claims.",
    tip: "A true steelman adds the best available evidence for the other side, even points they didn't think to raise themselves." },
  { id: "st2", difficulty: "easy",
    prompt: "You disagree: \u201cCash should be phased out in favor of fully digital payments.\u201d Pick the strongest version of this position.",
    options: [
      "Digital payments create auditable trails that can reduce tax evasion and certain types of crime, and modern systems increasingly support offline verification to address access concerns.",
      "Cash is just old and inconvenient.",
      "Nobody uses cash anymore anyway, so it doesn't matter.",
      "Banks want to get rid of cash to make more money."
    ],
    correct: 0,
    explain: "This presents concrete civic benefits and preemptively addresses the strongest counterpoint (access), rather than relying on vague dismissiveness or cynicism.",
    tip: "Look for the option that anticipates and answers the obvious objection \u2014 that's a mark of genuine steelmanning." },
  { id: "st3", difficulty: "medium",
    prompt: "You disagree: \u201cCollege degrees should not be required for most jobs.\u201d Pick the strongest version of this position.",
    options: [
      "Many roles can be validated through portfolios, certifications, or apprenticeships that measure actual skill more directly and affordably than a multi-year degree, especially in rapidly changing technical fields.",
      "College is a scam designed to take your money.",
      "Nobody actually learns anything useful in college.",
      "Smart people don't need college to succeed."
    ],
    correct: 0,
    explain: "This identifies specific, credible alternatives to degrees and ties the argument to real tradeoffs (cost, relevance, speed) instead of blanket cynicism.",
    tip: "The strongest steelman names concrete alternatives, not just criticism of the current system." },
  { id: "st4", difficulty: "medium",
    prompt: "You disagree: \u201cCities should remove most street parking to add bike lanes.\u201d Pick the strongest version of this position.",
    options: [
      "Data from cities that made this shift shows increased foot traffic and local business revenue along converted corridors, alongside reduced congestion, though the transition requires careful phasing for affected businesses.",
      "Cars are bad for the planet and drivers should feel guilty.",
      "Everyone should just bike everywhere, it's not hard.",
      "Parking is a waste of space, full stop."
    ],
    correct: 0,
    explain: "This cites measurable outcomes from real transitions and honestly acknowledges the transition cost, which is what a genuinely strong version of this argument would do.",
    tip: "A steelman that ignores real downsides isn't actually the strongest version \u2014 acknowledging tradeoffs makes it more credible, not less." },
  { id: "st5", difficulty: "hard",
    prompt: "You disagree: \u201cStandardized testing should be eliminated from college admissions.\u201d Pick the strongest version of this position.",
    options: [
      "Some studies suggest standardized scores correlate with socioeconomic access to test prep more strongly than with college readiness, so removing them may reduce one systemic bias, provided admissions offices find comparably rigorous holistic measures.",
      "Tests are just numbers and don't measure anything real.",
      "Rich kids do better on tests, so tests are useless.",
      "Nobody likes taking tests, so we should get rid of them."
    ],
    correct: 0,
    explain: "This engages with the actual empirical concern (correlation with access rather than readiness) and honestly flags the condition needed for the policy to work well.",
    tip: "The best steelman states the precise mechanism of the concern (access vs. readiness) rather than a vague complaint." },
  { id: "st6", difficulty: "hard",
    prompt: "You disagree: \u201cCompanies should be required to offer a 4-day work week.\u201d Pick the strongest version of this position.",
    options: [
      "Several controlled trials across multiple industries found productivity per hour rose enough to offset the lost day in many roles, suggesting the mandate could work broadly if paired with flexibility for roles where it genuinely doesn't fit.",
      "People are tired of working and deserve more rest, obviously.",
      "Four-day weeks are trendy and every company should just do it.",
      "Working five days is outdated and needs to end now."
    ],
    correct: 0,
    explain: "This grounds the case in trial data and honestly notes the need for role-based flexibility, which is what a serious version of this argument would include.",
    tip: "Genuine steelmanning includes the caveats a thoughtful advocate would add, not just the headline claim." },
  { id: "st7", difficulty: "hard",
    prompt: "You disagree: \u201cSocial media platforms should be legally required to verify user identities.\u201d Pick the strongest version of this position.",
    options: [
      "Verified-identity systems have measurably reduced coordinated harassment and bot-driven misinformation in trial regions, though the strongest version of this policy would need robust safeguards to protect vulnerable users who rely on anonymity for safety.",
      "Anonymous people online are always trolls.",
      "If you have nothing to hide, you shouldn't mind showing your identity.",
      "The internet was better before social media existed anyway."
    ],
    correct: 0,
    explain: "This cites a real observed effect and, crucially, names the strongest counterargument (protecting vulnerable anonymous users) that a serious advocate would need to address.",
    tip: "A true steelman doesn't just support a side \u2014 it shows awareness of the position's own hardest internal tension." }
];

function normalize(bank: BankQuestion[]): FallacyQuestion[] {
  return bank.map(question => ({
    ...question,
    options: question.options ?? ["True", "False"],
    correct: question.correct ?? (question.answer ? 0 : 1),
  }));
}

export const practiceModes: PracticeModeInfo[] = [
  { id: "fallacy", name: "Fallacy Hunter", description: "Spot the reasoning error hiding in an argument.", skill: "logic", xp: 120 },
  { id: "rebuttal", name: "Rebuttal Practice", description: "Choose the strongest counter to a weak argument.", skill: "strategy", xp: 140 },
  { id: "speed", name: "Quick Drills", description: "Make a rapid true-or-false call on argument validity.", skill: "speed", xp: 100, timed: true },
  { id: "steelman", name: "Steelman Challenge", description: "Strengthen the position you disagree with.", skill: "rhetoric", xp: 160 },
];

export const practiceQuestionBanks: Record<PracticeMode, FallacyQuestion[]> = {
  fallacy: fallacyQuestions,
  rebuttal: normalize(rebuttalBank),
  speed: normalize(speedBank),
  steelman: normalize(steelmanBank),
};

export function practiceModeInfo(mode: PracticeMode) {
  return practiceModes.find(item => item.id === mode)!;
}
