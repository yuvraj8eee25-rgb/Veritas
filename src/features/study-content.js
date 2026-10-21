export const studyPaths = [
  {
    id: "argument",
    title: "Build an argument",
    eyebrow: "MAKE YOUR CASE",
    description: "Connect a clear claim to evidence and reasoning that supports it.",
    icon: "A",
    color: "violet",
    lessons: ["arg-claim", "arg-evidence", "arg-counter"]
  },
  {
    id: "sources",
    title: "Check a source",
    eyebrow: "FOLLOW THE EVIDENCE",
    description: "Investigate who is behind a claim and what its sources can show.",
    icon: "S",
    color: "blue",
    lessons: ["source-lateral"]
  },
  {
    id: "reasoning",
    title: "Test the reasoning",
    eyebrow: "LOOK FOR THE LINK",
    description: "Find assumptions, consider other explanations, and calibrate conclusions.",
    icon: "R",
    color: "amber",
    lessons: ["reasoning-cause"]
  },
  {
    id: "other-side",
    title: "Answer the other side",
    eyebrow: "LISTEN AND RESPOND",
    description: "Represent another view fairly, then answer its strongest point.",
    icon: "O",
    color: "coral",
    lessons: ["other-steelman"]
  }
];

export const studySources = {
  criticalThinking: {
    label: "Abrami et al. (2015), meta-analysis of critical-thinking instruction",
    url: "https://doi.org/10.3102/0034654314551063",
    note: "Across 341 effect sizes, average effects were positive but varied across studies. Dialogue and authentic problems were among the approaches associated with better outcomes."
  },
  retrieval: {
    label: "Agarwal, Nunes & Blunt (2021), classroom retrieval-practice review",
    url: "https://doi.org/10.1007/s10648-021-09595-9",
    note: "The review found benefits across many school and classroom studies, while calling for more evidence from a wider range of countries and settings."
  },
  sources: {
    label: "McGrew & Breakstone (2023), Civic Online Reasoning curriculum study",
    url: "https://doi.org/10.1177/23328584231176451",
    note: "Students improved on source-evaluation measures after curriculum-embedded lessons; post-test performance still left room for improvement, and the study was not randomized."
  },
  feedback: {
    label: "Wisniewski, Zierer & Hattie (2020), feedback meta-analysis",
    url: "https://doi.org/10.3389/fpsyg.2019.03087",
    note: "The average effect of feedback was positive, with substantial differences by the information feedback provided."
  },
  argument: {
    label: "McNeill & Krajcik, Claim–Evidence–Reasoning–Rebuttal framework overview",
    url: "https://www.katherinelmcneill.com/uploads/1/6/8/7/1687518/knightmcneill_narst2011.pdf",
    note: "A teaching scaffold that helps learners make claims, select evidence, explain the connection, and address alternative claims."
  }
};

export const studyLessons = [
  {
    id: "arg-claim",
    pathId: "argument",
    title: "Separate a claim from its support",
    duration: 5,
    skills: ["claims", "reasoning"],
    objective: "Tell the position someone is asking you to accept apart from the evidence they use to support it.",
    recall: {
      prompt: "A claim is best described as…",
      choices: [
        { id: "position", label: "A position that could be supported or challenged", correct: true, feedback: "A claim is the point a person wants you to accept. It needs reasons or evidence." },
        { id: "source", label: "Any number or quote in an argument", correct: false, feedback: "Numbers and quotes can be evidence. A claim is the conclusion they are meant to support." },
        { id: "topic", label: "The broad topic everyone is discussing", correct: false, feedback: "A topic is broad, such as school schedules. A claim takes a position about it." }
      ]
    },
    explanation: "An argument starts with a claim: a focused answer to a question. Evidence gives the reader something to examine. Reasoning explains why that evidence supports the claim. Keep the three parts distinct so a reader can check each one.",
    example: {
      question: "Should the school library stay open later?",
      weak: "The library should stay open later because it is helpful.",
      strong: "The library should stay open until 5:30. In a student survey, 62% said they have no quiet place to study after school; keeping the library open would give those students a supervised study space.",
      takeaway: "The stronger example states a specific position, names evidence, and explains how the evidence bears on that position. The survey still has limits: we would want to know who answered and how the question was asked."
    },
    activities: [
      {
        type: "choice",
        prompt: "Which sentence is the claim in this argument?",
        context: "The science club wants a second meeting each week. Members say that one weekly meeting is too short to finish longer experiments.",
        choices: [
          { id: "c", label: "The science club should meet twice each week.", correct: true, feedback: "That is the position the club is asking the school to accept." },
          { id: "e", label: "One weekly meeting is too short to finish longer experiments.", correct: false, feedback: "This gives a reason for a position. Look for what the club wants the school to change." },
          { id: "t", label: "The science club meets after school.", correct: false, feedback: "That is background information, not a position about what should change." }
        ],
        hint: "Ask: what does the speaker want the listener to agree to or do?"
      },
      {
        type: "choice",
        prompt: "What would make the club’s reason more convincing?",
        choices: [
          { id: "d", label: "A log showing which experiments were unfinished and why", correct: true, feedback: "This evidence connects directly to the claim about meeting time and can be checked." },
          { id: "p", label: "A poster showing that science is exciting", correct: false, feedback: "It may promote the club, but it does not show that one meeting is too short." },
          { id: "f", label: "A list of the club members’ favorite subjects", correct: false, feedback: "Preferences do not establish that more meeting time is needed." }
        ],
        hint: "Choose evidence that would help answer the specific question behind the claim."
      }
    ],
    transfer: { label: "Use this structure in a debate", screen: "ai-debate", detail: "State one clear claim, then give the reason and evidence that support it." },
    sources: ["argument", "criticalThinking"],
    saveables: [{ type: "argument frame", title: "A claim with support", excerpt: "My claim is ___. One piece of evidence is ___. This supports my claim because ___." }]
  },
  {
    id: "arg-evidence",
    pathId: "argument",
    title: "Choose evidence that fits",
    duration: 5,
    skills: ["evidence", "reasoning"],
    objective: "Choose evidence that is relevant to a claim and explain what it does—and does not—show.",
    recall: {
      prompt: "What should evidence do in an argument?",
      choices: [
        { id: "connect", label: "Help answer the question raised by the claim", correct: true, feedback: "Relevant evidence bears on the claim. It should also be credible and sufficient for the point being made." },
        { id: "impress", label: "Sound technical so the argument feels authoritative", correct: false, feedback: "Technical wording can sound impressive without supporting the claim. Ask what the evidence actually establishes." },
        { id: "repeat", label: "Repeat the claim in different words", correct: false, feedback: "Repeating a claim is not evidence for it. Evidence gives the reader something to evaluate." }
      ]
    },
    explanation: "Evidence is useful when it is relevant to the claim, comes from a source fit for the question, and is strong enough for the conclusion. A single survey may suggest a pattern; it may not prove what caused that pattern or what everyone thinks.",
    example: {
      question: "Would a later bus help students get home from clubs?",
      weak: "A school website says many students join clubs.",
      strong: "A transport survey from this term reports that 38 students missed a club in the past month because the final bus left before it ended.",
      takeaway: "The second item addresses transport after clubs. We would still ask who ran the survey and whether students who left early were counted."
    },
    activities: [
      {
        type: "choice",
        prompt: "Which evidence best supports adding a later school bus?",
        context: "The claim is that a later bus would help students take part in after-school clubs.",
        choices: [
          { id: "survey", label: "A recent survey of students who attend clubs about how they get home", correct: true, feedback: "It asks the group affected about the transport problem. Check the sample and wording before deciding how widely it applies." },
          { id: "sports", label: "A national report on students’ favorite sports", correct: false, feedback: "This may say something about interests, but it does not address getting home after clubs." },
          { id: "bus", label: "A photo of a bus parked outside the school", correct: false, feedback: "The photo confirms a bus was there at one moment; it does not show route timing or student need." }
        ],
        hint: "Match the evidence to the actual problem in the claim: transport after clubs."
      },
      {
        type: "choice",
        prompt: "The survey finds that 38 club members missed the bus. What is the safest conclusion?",
        choices: [
          { id: "bounded", label: "Some surveyed club members report a transport barrier; we need more context to estimate the full effect.", correct: true, feedback: "This conclusion reflects what the survey reports without claiming it represents every student or proves a policy will work." },
          { id: "all", label: "Every student needs a later bus.", correct: false, feedback: "The survey covered club members who responded, not every student." },
          { id: "solve", label: "A later bus will solve every transport problem.", correct: false, feedback: "The survey identifies a reported barrier. It does not test whether a later route would solve it." }
        ],
        hint: "Keep the conclusion within the bounds of the sample and what was measured."
      }
    ],
    transfer: { label: "Investigate the claim in Evidence Lab", screen: "investigation", detail: "Ask what local route and attendance data could confirm or complicate the survey." },
    sources: ["argument", "feedback"],
    saveables: [{ type: "evidence checklist", title: "Check evidence fit", excerpt: "Is it relevant? Who collected it? What was measured? Who was included? How far can the conclusion safely go?" }]
  },
  {
    id: "arg-counter",
    pathId: "argument",
    title: "Answer a counterargument",
    duration: 6,
    skills: ["counterarguments", "rebuttals", "flexibility"],
    objective: "Respond to a real opposing reason instead of answering a weaker version of it.",
    recall: {
      prompt: "A fair counterargument should…",
      choices: [
        { id: "strong", label: "State a reasonable concern an informed person might actually have", correct: true, feedback: "Representing an opposing reason accurately gives you something meaningful to answer." },
        { id: "extreme", label: "Make the other side sound as extreme as possible", correct: false, feedback: "An exaggerated version is easier to attack, but it does not answer the real disagreement." },
        { id: "ignore", label: "Avoid the hardest objection so your case sounds stronger", correct: false, feedback: "Ignoring a serious objection leaves an important question unanswered." }
      ]
    },
    explanation: "A counterargument names a real reason someone might disagree. A rebuttal answers that reason with evidence or reasoning. You can also concede a valid point and narrow your claim. A fair response is often more persuasive than pretending there is no trade-off.",
    example: {
      question: "Should the school library stay open later?",
      weak: "Anyone against longer hours does not care about students.",
      strong: "Keeping the library open needs staff time. A supervised two-day trial would let the school measure attendance and cost before deciding whether to continue.",
      takeaway: "The stronger response acknowledges a practical concern and proposes a way to test it. It does not assume the plan has no cost."
    },
    activities: [
      {
        type: "choice",
        prompt: "Which is the strongest fair counterargument to later library hours?",
        context: "A student argues that the library should stay open later for students who need a quiet place to work.",
        choices: [
          { id: "cost", label: "The school may need staff and funding to keep the building open safely.", correct: true, feedback: "This names a plausible implementation concern without misrepresenting the student’s goal." },
          { id: "attack", label: "Students who want this just want to avoid going home.", correct: false, feedback: "This guesses at motives instead of addressing the proposal." },
          { id: "absolute", label: "The library must close exactly at the current time forever.", correct: false, feedback: "This states an opposing position but gives no reason for it." }
        ],
        hint: "Find a specific cost, trade-off, or risk the proposal would need to address."
      },
      {
        type: "reflect",
        prompt: "Write a two-sentence reply that takes the staffing concern seriously and still explains your position.",
        placeholder: "The school would need to… A small trial could…",
        minimum: 20,
        rubric: [
          "Names the staffing or cost concern fairly.",
          "Gives a reason or a testable next step for the proposal."
        ],
        feedback: "The school would need to plan for staff and safe supervision. A short trial with attendance and cost tracking could show whether the extra hours are useful and manageable."
      }
    ],
    transfer: { label: "Try the response in a debate", screen: "ai-debate", detail: "Listen for the strongest objection, then answer its reason rather than its speaker." },
    sources: ["argument", "criticalThinking"],
    saveables: [{ type: "response frame", title: "Fair counter and reply", excerpt: "A reasonable concern is ___. That matters because ___. One way to test/address it is ___." }]
  },
  {
    id: "source-lateral",
    pathId: "sources",
    title: "Read laterally to check a source",
    duration: 6,
    skills: ["source-evaluation", "evidence"],
    objective: "Investigate a source’s publisher and compare independent reporting before relying on a claim.",
    recall: {
      prompt: "When a website makes a surprising claim, what can you check beyond its own pages?",
      choices: [
        { id: "outside", label: "What independent sources say about the publisher and claim", correct: true, feedback: "Lateral reading means opening other sources to investigate who is behind the claim and whether it holds up." },
        { id: "design", label: "Whether the page uses professional colors and a logo", correct: false, feedback: "A polished page can still be inaccurate. Appearance alone says little about reliability." },
        { id: "about", label: "Only the website’s own About page", correct: false, feedback: "The site describes itself; independent sources can help verify that description." }
      ]
    },
    explanation: "A source’s own page cannot fully verify its credibility. Open another tab, search for the organization and author, and see what independent sources report. Then locate the original study, dataset, or document and check what it actually measured.",
    example: {
      question: "A nutrition company says its snack improves concentration by 40%.",
      weak: "The page has a scientific-looking chart and lists a researcher.",
      strong: "Search for the company and researcher outside that page. Locate the cited study, check who funded it, how concentration was measured, and whether the result appeared in other independent research.",
      takeaway: "The skill is to investigate the source and trace the underlying evidence. This example does not establish anything about a real product."
    },
    activities: [
      {
        type: "order",
        prompt: "Put these checks in a sensible order for investigating the snack claim.",
        items: [
          { id: "outside", text: "Search outside the site to learn who runs it and what independent sources report." },
          { id: "original", text: "Find the original study or data the claim refers to." },
          { id: "method", text: "Check the study’s sample, funding, and how concentration was measured." },
          { id: "conclude", text: "Decide how much the evidence supports the product claim." }
        ],
        correctOrder: ["outside", "original", "method", "conclude"],
        hint: "Start by checking beyond the source itself, then inspect the original evidence before judging the claim.",
        feedback: "This order helps you check the publisher independently, inspect the underlying study, and keep your conclusion tied to what was measured."
      },
      {
        type: "choice",
        prompt: "The company paid for a small study that measured attention for 10 minutes. Which question matters next?",
        choices: [
          { id: "limits", label: "Does that short measure support the broader claim, and do independent studies find the same result?", correct: true, feedback: "This checks both the scope of the measure and whether evidence beyond the sponsor’s study agrees." },
          { id: "logo", label: "Does the company have a recognizable logo?", correct: false, feedback: "Recognition is not evidence that the study supports the claim." },
          { id: "share", label: "How many times did the company share the result?", correct: false, feedback: "Repeating a claim does not independently confirm it." }
        ],
        hint: "Ask whether the measured outcome and study design match the strength of the claim."
      }
    ],
    transfer: { label: "Compare sources in Evidence Lab", screen: "investigation", detail: "Use the same checks on a claim from an actual source you find." },
    sources: ["sources", "criticalThinking"],
    saveables: [{ type: "source checklist", title: "Read laterally", excerpt: "Who is behind this? What do independent sources say? Where is the original evidence? What did it measure? What does it not show?" }]
  },
  {
    id: "reasoning-cause",
    pathId: "reasoning",
    title: "Look for another explanation",
    duration: 5,
    skills: ["assumptions", "reasoning", "evidence"],
    objective: "Notice when two things occurring together do not show that one caused the other.",
    recall: {
      prompt: "If two trends rise at the same time, what can you safely conclude?",
      choices: [
        { id: "relation", label: "They changed together; more evidence is needed to show why", correct: true, feedback: "A relationship between trends is worth investigating, but it does not by itself establish cause." },
        { id: "cause", label: "The first trend caused the second", correct: false, feedback: "Timing alone does not show a causal link. Look for other possible explanations." },
        { id: "coincidence", label: "There is no relationship at all", correct: false, feedback: "The trends may be related. The evidence just does not establish how." }
      ]
    },
    explanation: "Correlation means two things vary together. Causation means a change in one helps produce a change in the other. A third factor, reverse direction, or coincidence may explain a pattern. Ask what else changed and what comparison would help test the causal story.",
    example: {
      question: "A town sees more sunscreen sales and more beach rescues in July.",
      weak: "Sunscreen causes beach rescues.",
      strong: "Both may rise because more people visit the beach in summer. To test a cause, we would need evidence about exposure, conditions, and other factors.",
      takeaway: "A plausible alternative explanation helps identify what evidence is still missing; it does not prove that explanation is correct."
    },
    activities: [
      {
        type: "choice",
        prompt: "Ice-cream sales and sunburn reports both rise during a hot month. What is a plausible alternative explanation?",
        choices: [
          { id: "weather", label: "More hot, sunny days lead people to buy ice cream and spend more time outdoors.", correct: true, feedback: "Weather can influence both trends, so their correlation alone does not show ice cream caused sunburn." },
          { id: "ice", label: "Ice cream directly causes sunburn for everyone who eats it.", correct: false, feedback: "That adds a causal link without evidence and ignores other changes in the hot month." },
          { id: "none", label: "The two trends cannot be related in any way.", correct: false, feedback: "They do move together in this example. The question is what could explain the relationship." }
        ],
        hint: "Look for a third factor that could affect both trends."
      },
      {
        type: "choice",
        prompt: "A school notices that students who use a homework app earn higher grades. What should it check before claiming the app raises grades?",
        choices: [
          { id: "compare", label: "Whether app users differed beforehand and what a fair comparison group shows", correct: true, feedback: "Students who choose the app may already have different habits or support. A comparison helps test the causal claim." },
          { id: "download", label: "Whether the app has many downloads", correct: false, feedback: "Popularity does not show that the app caused higher grades." },
          { id: "color", label: "Whether students like the app’s colors", correct: false, feedback: "Preference may affect use, but it does not establish that the app improves grades." }
        ],
        hint: "A causal claim needs a fair way to compare outcomes, not just a pattern among app users."
      }
    ],
    transfer: { label: "Investigate a causal claim", screen: "investigation", detail: "Look for comparison groups, alternative causes, and what was measured." },
    sources: ["criticalThinking", "feedback"],
    saveables: [{ type: "reasoning checklist", title: "Before saying one thing caused another", excerpt: "Could a third factor explain both? Could the direction be reversed? What comparison would help test the cause?" }]
  },
  {
    id: "other-steelman",
    pathId: "other-side",
    title: "Steelman before you respond",
    duration: 6,
    skills: ["counterarguments", "flexibility", "rebuttals"],
    objective: "Restate a different view in a way its supporter would recognize before answering it.",
    recall: {
      prompt: "A useful steelman is…",
      choices: [
        { id: "fair", label: "The strongest reasonable version of another person’s view", correct: true, feedback: "A steelman helps you understand the real point before deciding how to answer it." },
        { id: "straw", label: "An exaggerated version that is easy to defeat", correct: false, feedback: "That is a straw man: it changes the other position into an easier target." },
        { id: "agree", label: "A statement that means you have changed your mind", correct: false, feedback: "Understanding a position accurately does not require agreeing with it." }
      ]
    },
    explanation: "A steelman keeps the other person’s main concern intact and avoids adding motives they did not state. Then answer the strongest reason directly. If part of their point is valid, say so and make your own claim more precise.",
    example: {
      question: "Should students be allowed to use phones during lunch?",
      weak: "People against phones want to control students all day.",
      strong: "Some students want lunch to be a chance to talk without notifications. The school could keep phone-free tables while leaving other spaces available.",
      takeaway: "The stronger version identifies a practical concern and suggests a response that addresses it, without claiming everyone shares that preference."
    },
    activities: [
      {
        type: "choice",
        prompt: "A student opposes phones at lunch because notifications make conversation harder. Which reply best steelmans that view?",
        choices: [
          { id: "strong", label: "They want at least some lunch spaces where people can talk without interruptions.", correct: true, feedback: "This captures the stated concern without exaggerating the position into a total ban." },
          { id: "extreme", label: "They want to ban phones everywhere because students cannot be trusted.", correct: false, feedback: "This adds a broader ban and a motive the student did not state." },
          { id: "dismiss", label: "They probably just dislike technology.", correct: false, feedback: "This guesses at personal motives instead of restating the argument." }
        ],
        hint: "Keep the concern the student actually named, and avoid adding an extreme position or motive."
      },
      {
        type: "reflect",
        prompt: "Write a short reply that answers the strongest version without claiming everyone wants the same thing.",
        placeholder: "I understand the concern about… One option could be…",
        minimum: 20,
        rubric: [
          "Restates or acknowledges the concern fairly.",
          "Offers a reasoned response or a practical option."
        ],
        feedback: "A fair answer could acknowledge that notifications interrupt some conversations and suggest phone-free tables alongside spaces where phones are allowed. That addresses the stated concern while keeping the proposal limited."
      }
    ],
    transfer: { label: "Try the other side in Debate the AI", screen: "ai-debate", detail: "First restate the opponent’s point as they might put it, then respond to its strongest reason." },
    sources: ["criticalThinking", "feedback"],
    saveables: [{ type: "response frame", title: "Steelman then answer", excerpt: "A fair version of the concern is ___. That matters because ___. My response is ___, while recognizing ___." }]
  }
];

export const pathForLesson = lessonId => studyPaths.find(path => path.lessons.includes(lessonId)) || studyPaths[0];
export const lessonById = lessonId => studyLessons.find(lesson => lesson.id === lessonId) || null;
