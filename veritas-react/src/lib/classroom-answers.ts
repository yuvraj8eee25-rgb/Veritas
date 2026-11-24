type Question = { id: string; options: string[] };
type Answer = { id: string; answer: number };
export function classroomAnswers(mode: string, answers: Answer[], presented: Question[], canonical: Question[]) {
  return answers.map(answer => {
    const current = presented.find(question => question.id === answer.id);
    const original = canonical.find(question => question.id === answer.id);
    const selected = current?.options[answer.answer];
    const index = selected && original ? original.options.indexOf(selected) : -1;
    if (!original || (answer.answer >= 0 && index < 0)) throw new Error("The assigned question could not be matched to the published question bank. Keep your work and contact your coach.");
    return { id: answer.id, answer: answer.answer < 0 ? null : mode === "speed" ? selected === "True" : index, timedOut: answer.answer < 0 };
  });
}
