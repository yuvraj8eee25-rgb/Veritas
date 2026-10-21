const MAX_BYTES = 10 * 1024 * 1024;
export function audioExtension(mime = '') {
  if (mime.startsWith('audio/mp4')) return 'm4a';
  if (mime.startsWith('audio/ogg')) return 'ogg';
  return 'webm';
}
export function checkRecording(blob) {
  if (!blob?.size || blob.size > MAX_BYTES || !/^audio\/(webm|ogg|mp4)(;|$)/.test(blob.type)) throw Error('Record a speech smaller than 10 MB in a supported audio format.');
}
function base64(blob) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob); });
}
export class SpeechPractice {
  constructor(composer, input, prefix) {
    this.input = input; this.prefix = prefix; this.generation = 0; this.mode = 'written'; this.busy = false;
    this.root = document.createElement('section'); this.root.className = 'speech-practice hidden'; this.root.setAttribute('aria-label', 'Recorded speech practice');
    this.root.innerHTML = `<p class="speech-help">Prepare your point, then record your speech. Review the transcript before sending. The judge scores argument content; your coach can listen to delivery.</p><div class="cw-actions"><button type="button" class="ghost-btn" data-speech-record>Record speech</button><button type="button" class="ghost-btn hidden" data-speech-stop>Stop recording</button><button type="button" class="ghost-btn hidden" data-speech-discard>Discard recording</button></div><p role="status" aria-live="polite" data-speech-status></p><audio controls class="hidden" data-speech-audio></audio><a class="hidden" data-speech-download>Download recording</a>`;
    composer.prepend(this.root);
    this.recordBtn = this.root.querySelector('[data-speech-record]'); this.stopBtn = this.root.querySelector('[data-speech-stop]'); this.discardBtn = this.root.querySelector('[data-speech-discard]'); this.status = this.root.querySelector('[data-speech-status]'); this.audio = this.root.querySelector('audio'); this.download = this.root.querySelector('a');
    this.recordBtn.onclick = () => this.record(); this.stopBtn.onclick = () => this.stop(); this.discardBtn.onclick = () => { this.reset(); this.input.value = ''; this.input.dispatchEvent(new Event('input', { bubbles: true })); };
  }
  configure(mode, seconds = 90) {
    if (mode !== this.mode) this.reset();
    this.mode = mode; this.seconds = seconds; this.root.classList.toggle('hidden', mode !== 'speech');
    this.input.maxLength = mode === 'speech' ? 8000 : 4000;
    this.input.placeholder = mode === 'speech' ? 'Your speech transcript will appear here. Review it before sending…' : 'Write your argument…';
  }
  async record() {
    if (this.busy || this.recorder?.state === 'recording') return;
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) { this.status.textContent = 'This browser cannot record audio. Use a supported browser or choose written practice.'; return; }
    this.reset(); this.input.value = ''; this.input.dispatchEvent(new Event('input', { bubbles: true })); const generation = this.generation;
    this.busy = true; this.recordBtn.disabled = true; this.status.textContent = 'Requesting microphone access…';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t));
      if (!mimeType) throw Error('No supported recording format. Choose written practice or another browser.');
      const recorder = this.recorder = new MediaRecorder(stream, { mimeType }); const chunks = []; let bytes = 0;
      recorder.ondataavailable = event => { if (event.data.size) { chunks.push(event.data); bytes += event.data.size; if (bytes > MAX_BYTES) this.stop(); } };
      recorder.onstop = async () => {
        clearInterval(this.timer); stream.getTracks().forEach(t => t.stop());
        if (generation !== this.generation) return;
        this.stopBtn.classList.add('hidden'); this.recordBtn.disabled = false;
        this.blob = new Blob(chunks, { type: mimeType });
        try {
          checkRecording(this.blob);
          this.url = URL.createObjectURL(this.blob); this.audio.src = this.url; this.audio.classList.remove('hidden');
          this.download.href = this.url; this.download.download = `veritas-speech.${audioExtension(mimeType)}`; this.download.classList.remove('hidden'); this.discardBtn.classList.remove('hidden');
          this.status.textContent = 'Transcribing your recording…';
          const result = await window.VeritasApi.edge('ai-debate', { action: 'transcribe', audio: await base64(this.blob), mimeType: mimeType.split(';')[0] }, { timeoutMs: 45000 });
          if (generation !== this.generation) return;
          if (!result?.ok || typeof result.text !== 'string' || !result.text.trim()) throw Error('No speech transcript was returned.');
          this.input.value = result.text.slice(0, 8000); this.input.dispatchEvent(new Event('input', { bubbles: true }));
          this.status.textContent = 'Recording ready. Check the transcript, then send your speech.';
        } catch (error) { if (generation === this.generation) this.status.textContent = `${error.message} You can type a transcript of your recording and send it.`; }
        finally { if (generation === this.generation) this.busy = false; }
      };
      recorder.onerror = () => { this.reset(); this.status.textContent = 'Recording failed. Please try again.'; };
      recorder.start(1000); this.startedAt = Date.now(); this.stopBtn.classList.remove('hidden');
      const tick = () => { const elapsed = Math.floor((Date.now() - this.startedAt) / 1000); this.status.textContent = `Recording: ${elapsed}s of ${this.seconds}s. Stop when you finish.`; if (elapsed >= this.seconds) this.stop(); };
      tick(); this.timer = setInterval(tick, 250);
    } catch (error) { if (generation === this.generation) { this.reset(); this.status.textContent = error.message || 'Microphone access was not granted.'; } }
  }
  stop() { if (this.recorder?.state === 'recording') this.recorder.stop(); }
  reset() {
    this.generation++; clearInterval(this.timer); this.stop(); this.stream?.getTracks().forEach(t => t.stop());
    if (this.url) URL.revokeObjectURL(this.url);
    this.blob = null; this.savedPath = null; this.url = null; this.busy = false; this.recordBtn.disabled = false;
    this.stopBtn.classList.add('hidden'); this.audio.removeAttribute('src'); this.audio.classList.add('hidden'); this.download.classList.add('hidden'); this.discardBtn.classList.add('hidden'); this.status.textContent = '';
  }
  async save({ debateId = null, assignmentId = null } = {}) {
    if (this.mode !== 'speech') return null;
    if (this.busy || !this.blob) throw Error('Finish recording and review your transcript before sending.');
    if (this.savedPath) return this.savedPath;
    checkRecording(this.blob);
    const blob = this.blob, generation = this.generation;
    const user = await window.VeritasApi.currentUser(); if (!user) throw Error('Sign in to save a recording.');
    const path = `${user.id}/${crypto.randomUUID()}.${audioExtension(blob.type)}`;
    const storage = window.mpSupabase.client.storage.from('debate-recordings');
    const { error } = await storage.upload(path, blob, { contentType: blob.type.split(';')[0], upsert: false }); if (error) throw error;
    try { await window.VeritasApi.rpc('register_debate_recording', { p_path: path, p_debate_id: debateId, p_assignment_id: assignmentId }, { timeoutMs: 15000 }); }
    catch (error) { await storage.remove([path]); throw error; }
    if (generation !== this.generation) throw Error("Recording changed before it could be sent. Please try again.");
    this.savedPath = path; return path;
  }
}
export async function recordingPlayer(path) {
  const { data, error } = await window.mpSupabase.client.storage.from('debate-recordings').createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw Error('You cannot access this recording.');
  return data.signedUrl;
}
export function appendRecording(parent, path) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'ghost-btn recording-play'; button.textContent = 'Listen to recorded speech';
  button.onclick = async () => {
    button.disabled = true;
    try { const audio = document.createElement('audio'); audio.controls = true; audio.src = await recordingPlayer(path); parent.append(audio); button.remove(); }
    catch (error) { button.disabled = false; window.DA?.toast(error.message); }
  }; parent.append(button);
}
