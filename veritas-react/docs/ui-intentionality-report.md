# Making a website feel intentional

**Research and interface review for Veritas**  
Prepared November 11, 2026

## Executive summary

“Looks AI-generated” is not a formal usability category. In practice, people use it to describe interfaces that combine familiar, polished components without showing why those choices belong to this product: vague copy, decorative gradients, repeated cards, interchangeable illustrations, overly even visual emphasis, and made-up product proof. The remedy is not to add visual quirks. It is to make each design choice answer a real user need, reinforce a coherent point of view, and behave consistently.

Veritas already has a specific product idea to build around: practice debate and reasoning, see progress, then use AI or live debate for deeper practice. Its strongest distinctive material is the actual practice content, assessment feedback, investigation trace, classroom workflow, and skill progression. Put those experiences in the foreground. Treat brand color and effects as supporting structure.

Recommended order:

1. Make the home screen tell the truth about what a learner can do next and what their progress means.
2. Reduce competing panels, decoration, tiny labels, and repeated card treatments.
3. Give each practice mode a consistent but recognizable visual and verbal identity tied to its task.
4. Audit seeded or sample data so it is clearly labelled as sample, or replace it with a useful empty state.
5. Validate contrast, responsive behavior, and important flows with real learners.

## What the research supports

### 1. Hierarchy should reflect importance

Visual hierarchy helps people understand what to look at first. Scale, contrast, placement, and spacing should reinforce the order of importance rather than compete with one another. NN/g recommends using scale and contrast deliberately and warns that when every item is emphasized, the page becomes harder to parse. [NN/g: 5 Principles of Visual Design in UX](https://www.nngroup.com/articles/principles-visual-design/) and [NN/g: Visual Hierarchy in UX](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/)

**Practical implication:** give each screen one primary task, one clear next action, and a quieter treatment for supporting information. A dashboard should not make the welcome panel, every metric, every badge, and every section title equally prominent.

### 2. Consistency means predictable behavior, not identical screens

Users benefit when familiar controls look and act as expected. Consistent visual treatment, language, and interaction behavior reduce the need to relearn the interface. At the same time, government design guidance explicitly distinguishes consistency from uniformity: patterns should fit their context and user need. [NN/g: Maintain Consistency and Adhere to Standards](https://www.nngroup.com/articles/consistency-and-standards/) and [Home Office design principles](https://design.homeoffice.gov.uk/design-and-content/professional-standards/designer-role-standard)

**Practical implication:** standardize navigation, buttons, field labels, feedback, spacing, and status colors. Let a debate transcript, a timed drill, and a mastery overview use different layouts where their tasks differ.

### 3. A real empty state is part of the product

An empty panel can leave people unsure whether the system is loading, broken, or waiting for them. NN/g recommends using empty states to communicate status, teach the feature, and offer a direct path to the next task. [NN/g: Designing Empty States in Complex Applications](https://www.nngroup.com/articles/empty-state-interface-design/)

**Practical implication:** when there is no saved practice history, explain how progress will be measured and offer the first drill. Do not fill the gap with invented activity or decorative placeholder metrics.

### 4. Accessibility is part of visual quality

WCAG 2.2 AA requires a contrast ratio of at least 4.5:1 for normal text and 3:1 for large text, subject to the documented exceptions. Contrast is based on luminance, so a pleasing hue combination alone does not prove readability. [W3C: Understanding Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)

**Practical implication:** test actual foreground/background pairs, including muted labels, badges, disabled states, and text placed over gradients. Check keyboard focus and zoom as well as the visual palette.

### 5. Typography and layout need a deliberate system

Design systems use a limited set of typographic roles, spacing rules, and repeatable layout structures so the interface communicates importance and remains coherent across screens. Material describes typography roles such as display, headline, title, label, and body; its layout principles connect grids, space, scale, color, and imagery to hierarchy and focus. [Material 3: Applying Typography](https://m3.material.io/styles/typography/applying-type) and [Material: Layout Principles](https://m1.material.io/layout/principles.html)

**Practical implication:** define a compact type scale and spacing scale, then apply them consistently. Do not let each new panel introduce its own radius, shadow, label size, and gradient.

## What “intentional” means in practice

Use this decision test for each visible element:

- **Purpose:** What user task or question does it serve?
- **Priority:** Why is it this size, position, and contrast level?
- **Evidence:** Is its content real, computed, or clearly identified as a sample?
- **Belonging:** Does its visual treatment connect to Veritas’s subject and tone?
- **Behavior:** Does it respond clearly to click, keyboard, loading, success, empty, and error states?
- **Restraint:** If removed, would users lose meaning, orientation, or a useful action?

If an element has no clear answer, simplify it or remove it. Distinctiveness should come from the product’s real content, language, and feedback—not arbitrary asymmetry or extra effects.

## Review of the current Veritas Next.js interface

This is a source-level review of the current `veritas-react` implementation; it is not a substitute for observing learners using the site.

### Strong material to keep and emphasize

- The product has concrete, differentiated tasks: fallacy spotting, rebuttal selection, steelmanning, timed drills, Evidence Lab, study paths, and debate practice.
- The home screen includes a recommended skill, a mastery overview, daily challenge, progress, and recent/favorite practice. These can make the dashboard specific to the learner rather than a generic SaaS shell.
- Evidence Lab has a visible investigation trace. Showing the actual stages and sources gives the AI feature a concrete, inspectable interaction instead of an abstract “AI magic” promise.
- The dark navy and mint palette can support a composed, focused identity if accent color is reserved for actions and meaningful state.

### Risks worth addressing

- **Too many surfaces:** the home screen appears to use a hero, multiple metric cards, progress cards, activity cards, mastery panels, and practice cards. If they all use bordered dark surfaces, the page can read as a generic dashboard template.
- **Decorative gradient emphasis:** the hero uses radial and linear gradients. Keep an effect only if it supports the main action or creates meaningful grouping; avoid repeating it on ordinary content panels.
- **Micro-label density:** uppercase, letter-spaced labels are used across navigation and cards. They can create a polished admin-template feel and become hard to read when too small. Use sentence case for most labels and reserve compact uppercase text for short metadata.
- **Sample leaderboard:** the leaderboard rows are generated from a fixed list and deterministic random scores in the client code. The Next.js README says XP standings are sample data. Make the sample status visible at the point of use, or replace the preview with a clear empty state until real standings are available.
- **Progress interpretation:** mastery values and skill recommendations are estimates from fresh drill assessments, not validated measures of general debate ability. Keep the explanation near the metric and avoid presenting a precise-looking percentage as a broad ability score.
- **Navigation breadth:** the sidebar exposes ten destinations. For first-time learners, that can make it unclear whether to practice, study, investigate evidence, or debate. Prioritize the learner’s next action and visually group secondary destinations.
- **Guest/connected states:** the app can be used in guest mode, but some destinations require an account or backend. Each should make the limitation and next step clear before the user invests effort.

These observations are based on the current source in `src/App.tsx` and `src/styles.css`, including the home view model, sidebar navigation, leaderboard sample generation, hero, and panel styling.

## Recommended design direction for Veritas

### 1. Anchor the interface in a clear product promise

Use plain, specific language around practice and reasoning. Describe the learner’s next action, not a generalized promise about becoming a better thinker. For example:

- Prefer: “Try a 5-question fallacy drill” or “Your next practice: rebuttals.”
- Avoid: broad claims such as “Unlock your potential with intelligent learning.”

Keep feature names stable across navigation, headings, and buttons. Explain “mastery” where it appears, because the current score is an estimate from practice activity.

### 2. Make the home screen action-led

Suggested order:

1. **One next step:** a recommended drill with the reason, duration, and a single primary button.
2. **Progress that answers a question:** show a small number of real measures, with clear definitions and time period.
3. **Continue or explore:** recent practice and the four core modes.
4. **Secondary destinations:** study, Evidence Lab, Classroom, AI debate, and live 1v1 grouped by purpose or surfaced contextually.

For a new learner, replace blank or zero-filled charts with an invitation to complete one practice. For returning learners, make continuation more prominent than a second generic welcome message.

### 3. Use fewer, more meaningful visual layers

- Reserve the strongest mint contrast for the primary action, selected navigation, and actual success/progress states.
- Use one neutral panel style for ordinary grouped content; introduce distinct surfaces only to communicate a real difference such as selected, warning, result, or interactive.
- Keep the hero gradient only if it makes the next action easier to find. Remove it from repeated content cards.
- Replace redundant icons with meaningful task cues. Use illustrations only when they explain a concept or provide a recognizable Veritas motif.
- Increase small metadata text to a comfortable size and avoid relying on letter spacing and all caps to create hierarchy.

### 4. Give each mode a task-specific rhythm

- **Timed drills:** clear question, visible timer, answer controls, and concise rationale after submission.
- **Steelman:** distinguish the opposing position from the learner’s response; make the “strongest fair version” goal explicit.
- **Evidence Lab:** show claim, search progress, source quality, opposing/supporting evidence, and uncertainty in a stable sequence.
- **AI debate:** keep turn-taking and the learner’s current obligation visible; separate local estimate from AI referee results.
- **Classroom:** use familiar assignment, submission, feedback, and due-date patterns. Prefer clear lists and status labels over dashboard decoration.

These differences make the interface more coherent because the layout follows the job, while shared controls remain predictable.

### 5. Make all product claims and states credible

- Label sample leaderboard data on the leaderboard itself, including a clear explanation that it is illustrative.
- Label estimated progress as an estimate and explain what activity informs it.
- Use real, dated activity only. Never imply that a user completed a task they did not do.
- For unavailable features or missing backend configuration, say what is unavailable and what the user can do next.
- Give loading, empty, error, and success states distinct wording and behavior. Do not make an empty state look like a failed load.

## Action plan

### Priority 0: trust and clarity

- Label or suppress simulated leaderboard standings.
- Explain mastery estimates beside their first display.
- Audit all user-visible scores and badges for truthful labels and understandable criteria.
- Make guest-only and account-required capabilities clear at the point where the user encounters them.

### Priority 1: hierarchy and product voice

- Redesign the home screen around one recommended action and a short explanation of why it is recommended.
- Reduce the number of equally weighted cards and hero-like regions.
- Replace generic welcome copy with action-oriented copy specific to debate practice.
- Group or progressively reveal secondary destinations without hiding common navigation conventions.

### Priority 2: visual system and accessibility

- Create documented tokens for spacing, type, borders, radii, and semantic colors.
- Use mint as a purposeful accent; remove decorative color that does not communicate state or focus.
- Test all text/background pairs against WCAG 2.2 AA contrast thresholds.
- Test keyboard navigation, visible focus, narrow screens, and 200–400% zoom.
- Ensure reduced-motion settings are respected and motion communicates state rather than decoration.

### Priority 3: validate with learners

Ask 5–7 learners who resemble the intended audience to complete a short set of tasks: start a drill, understand a result, find their next practice, and distinguish an estimate from a verified outcome. Observe hesitation and errors; do not lead them to the intended interpretation. Revise the most repeated point of confusion and repeat the tasks. Treat this small sample as formative feedback, not statistical proof.

## Review checklist

- Can a first-time visitor explain what Veritas helps them do after a quick glance?
- Is there one obvious primary action on the home screen?
- Does every metric explain what it measures and where the data comes from?
- Are examples, estimates, and live data visibly distinguishable?
- Do empty, loading, error, and success states explain what happened and what to do next?
- Do spacing, typography, button behavior, and navigation remain consistent across screens?
- Does each screen’s layout fit its specific task?
- Is color used to communicate hierarchy or state, rather than simply to decorate?
- Do normal-size text combinations meet at least 4.5:1 contrast, and large text at least 3:1?
- Can the important flows be completed with a keyboard and at narrow viewport widths?
- Does every animation have a purpose and respect reduced-motion preferences?

## Sources

- Nielsen Norman Group, [5 Principles of Visual Design in UX](https://www.nngroup.com/articles/principles-visual-design/)
- Nielsen Norman Group, [Visual Hierarchy in UX: Definition](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/)
- Nielsen Norman Group, [Maintain Consistency and Adhere to Standards](https://www.nngroup.com/articles/consistency-and-standards/)
- Nielsen Norman Group, [Designing Empty States in Complex Applications](https://www.nngroup.com/articles/empty-state-interface-design/)
- Home Office User-Centred Design Manual, [Professional standards and design principles](https://design.homeoffice.gov.uk/design-and-content/professional-standards/designer-role-standard)
- W3C Web Accessibility Initiative, [Understanding WCAG 2.2 SC 1.4.3: Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)
- Material Design 3, [Applying typography](https://m3.material.io/styles/typography/applying-type)
- Material Design, [Layout principles](https://m1.material.io/layout/principles.html)

## Scope and limits

The report combines published usability and accessibility guidance with a source-level review of the current Veritas Next.js interface. The phrase “AI-looking” is used as a practical design critique, not as a research-defined visual category. The recommendations should be validated with learners and checked against the rendered interface before implementation.
