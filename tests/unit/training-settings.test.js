import { describe, it, expect } from 'vitest';
import { trainingSettings, canSubmitActivity } from '../../src/features/training-settings.js';
import { audioExtension, checkRecording } from '../../src/features/speech-practice.js';
describe('assigned training and speech boundaries', () => {
  it('keeps private completion distinct from public multiplayer', () => {
    expect(canSubmitActivity('private_debate', 'live_debate')).toBe(false);
    expect(canSubmitActivity('private_debate', 'private_debate')).toBe(true);
    expect(canSubmitActivity('drill', 'drill')).toBe(true);
  });
  it('allocates speech time plus preparation and transcript review', () => {
    expect(trainingSettings({ mode: 'speech', speech_seconds: 180, turns: 5 }).turn_seconds).toBe(360);
    expect(trainingSettings({ mode: 'written' }).turn_seconds).toBe(180);
    expect(trainingSettings({ turns: 99, speech_seconds: 999, drill_mode: 'bogus' }).turns).toBe(3);
  });
  it('accepts supported recordings and rejects empty, oversized, and non-audio files', () => {
    expect(audioExtension('audio/mp4')).toBe('m4a');
    expect(() => checkRecording(new Blob(['audio'], { type: 'audio/webm;codecs=opus' }))).not.toThrow();
    expect(() => checkRecording(new Blob([], { type: 'audio/webm' }))).toThrow();
    expect(() => checkRecording({ size: 11 * 1024 * 1024, type: 'audio/webm' })).toThrow();
    expect(() => checkRecording(new Blob(['text'], { type: 'text/plain' }))).toThrow();
  });
});
