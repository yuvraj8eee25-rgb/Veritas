export const DRILL_MODES = { fallacy: 'Fallacy Practice', rebuttal: 'Rebuttal Practice', speed: 'Quick Drills', steelman: 'Steelman Challenge' };
export function trainingSettings(raw = {}) {
  const settings = raw && typeof raw === 'object' ? raw : {};
  const speechSeconds = [60, 90, 180].includes(Number(settings.speech_seconds)) ? Number(settings.speech_seconds) : 90;
  const mode = settings.mode === 'speech' ? 'speech' : 'written';
  return {
    mode, speech_seconds: speechSeconds,
    turn_seconds: mode === 'speech' ? speechSeconds + 180 : 180,
    turns: Number(settings.turns) === 5 ? 5 : 3,
    topic: String(settings.topic || '').trim().slice(0, 200),
    drill_mode: Object.hasOwn(DRILL_MODES, settings.drill_mode) ? settings.drill_mode : 'fallacy',
    difficulty: ['all', 'easy', 'medium', 'hard'].includes(settings.difficulty) ? settings.difficulty : 'all'
  };
}
export function activityKind(assignmentKind) {
  return assignmentKind === 'private_debate' ? 'private_debate' : assignmentKind;
}
export function canSubmitActivity(expected, received) { return !!expected && expected === received; }
