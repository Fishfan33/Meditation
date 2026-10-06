// Meditation – Stimme und Gong.
// Teil der App in js/: klassische Skripte, die sich einen gemeinsamen Gültigkeitsbereich teilen und in der
// Reihenfolge aus index.html geladen werden (Phasen zuerst, Start zuletzt). Übersicht: CLAUDE.md, „Aufbau“.

// ---------- Stimme ----------
// Es liest Thorsten (Wahl A2 des Inhabers): vorab aufgenommen mit Piper, Liste in js/aufnahmen.js (RECORDINGS: Satz →
// [Datei, Sekunden]). Fehlt für einen Satz die Aufnahme (neu oder geändert, noch nicht vertont), liest die
// Stimme des Browsers vor (Web Speech); gesucht wird dafür eine deutsche, möglichst männliche Stimme.
const SPEECH_RATE = .88;   // etwas langsamer als normal: ruhig
const SPEECH_PITCH = .92;
const synth = window.speechSynthesis || null;
let chosenVoice = null;

function chooseVoice() {
  if (!synth) return;
  const german = synth.getVoices().filter(v => /^de([-_]|$)/i.test(v.lang));
  const male = /conrad|killian|florian|markus|yannick|viktor|martin|hans|stefan|ralf|jonas|bernd|thorsten|männlich|\bmale\b/i;
  const natural = /natural|enhanced|premium|neural|online/i;
  const score = v => (male.test(v.name) ? 4 : 0) + (natural.test(v.name) ? 2 : 0) + (/^de-DE$/i.test(v.lang) ? 1 : 0);
  chosenVoice = german.sort((a, b) => score(b) - score(a))[0] || null;
  updateVoiceNote();
}

// ---------- Aufnahmen ----------
const recordingOf = text => self.RECORDINGS?.[text] || null;
const voiceBuffers = new Map();   // Datei → dekodierter Ton (einmal laden, dann aus dem Speicher)
function loadRecording(text) {
  const rec = recordingOf(text);
  if (!rec || !audioCtx) return Promise.resolve(null);
  if (!voiceBuffers.has(rec[0])) {
    voiceBuffers.set(rec[0], fetch(rec[0]).then(r => r.arrayBuffer()).then(b => audioCtx.decodeAudioData(b)).catch(() => null));
  }
  return voiceBuffers.get(rec[0]);
}
// Vorab laden, z. B. alle Sätze einer Meditation, während der Gong klingt
const preloadRecordings = texts => texts.forEach(loadRecording);
let voiceSource = null, speakToken = 0;

// Satz vorlesen; `done` läuft, wenn er fertig ist (oder abgebrochen wurde)
function speak(text, done) {
  const token = ++speakToken;
  if (recordingOf(text) && audioCtx) {
    loadRecording(text).then(buf => {
      if (token !== speakToken) return;   // inzwischen abgebrochen oder ein anderer Satz
      if (!buf) { speakSynth(text, done); return; }
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(audioCtx.destination);
      src.onended = () => { if (voiceSource === src) voiceSource = null; done?.(); };
      voiceSource = src;
      src.start();
    });
    return;
  }
  speakSynth(text, done);
}
function speakSynth(text, done) {
  if (!synth) { done?.(); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "de-DE";
  if (chosenVoice) u.voice = chosenVoice;
  u.rate = SPEECH_RATE;
  u.pitch = SPEECH_PITCH;
  if (done) { u.onend = done; u.onerror = done; }
  synth.speak(u);
}
function stopSpeaking() {
  speakToken++;
  if (voiceSource) { const s = voiceSource; voiceSource = null; s.onended = null; try { s.stop(); } catch {} }
  synth?.cancel();
}

// Sprechdauer in Sekunden: genau aus der Aufnahme, sonst geschätzt (Browser-Stimme)
const speechSeconds = text => recordingOf(text)?.[1] ?? text.length / 12.5 + .6;

// ---------- Ton (Web Audio) ----------
// Erst nach einem Tipp erlaubt (Browser spielen sonst nichts ab): audioUnlock() beim Starten aufrufen.
let audioCtx = null;
function audioUnlock() {
  // iPhone: auch bei stummgeschaltetem Gerät hörbar, wie ein Musikplayer (Safari 17+)
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!audioCtx && Ctx) audioCtx = new Ctx();
  audioCtx?.resume?.().catch(() => {});
  // Die Sprachausgabe einmal im Tipp anstoßen, sonst bleibt sie auf dem iPhone stumm
  if (synth && !audioUnlock.done) { synth.speak(new SpeechSynthesisUtterance(" ")); audioUnlock.done = true; }
}

// Gong zu Beginn: tiefe Klangschale „1b“ (Wahl des Inhabers, Oktober 2026), 110 Hz, etwa 4 Sekunden. Mehrere Teiltöne,
// die unterschiedlich lang ausklingen, leicht gegeneinander verstimmt (das sanfte Schweben). Selbst erzeugt,
// keine Tondatei nötig; Vorlage zum Anhören: werkzeuge/gong.py.
const GONG_SECONDS = 4;
function gong(strength = 1) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime + .03;
  const out = audioCtx.createGain();
  out.gain.setValueAtTime(.3 * strength, t);
  out.gain.setValueAtTime(.3 * strength, t + GONG_SECONDS - .8);
  out.gain.linearRampToValueAtTime(.0001, t + GONG_SECONDS);   // sanft auf 4 Sekunden ausblenden
  out.connect(audioCtx.destination);
  const base = 110;
  // [Verhältnis zum Grundton, Lautstärke, Zeitkonstante des Ausklingens in Sekunden]
  [[1, 1, 1.9], [2.71, .45, 1.2], [5.15, .18, .7], [8.3, .06, .4]].forEach(([r, a, d]) => {
    for (const detune of [-.45, .45]) {
      const osc = audioCtx.createOscillator();
      osc.frequency.value = base * r + detune;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(a / 2, t + .012);
      g.gain.setTargetAtTime(.0001, t + .012, d);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + GONG_SECONDS + .1);
    }
  });
}

// ---------- Hintergrundklang ----------
// Leise Natur unter der Stimme (Inhaber): Datei einmal laden, nahtlos in Schleife, sanft ein- und ausblenden.
// Pause hält den ganzen Ton an (audioCtx.suspend in sitzung.js).
const ambienceBuffers = {};
let ambience = null;   // { id, src, gain }
// Lautstärke 0–1 vom Regler (state.volume); quadratisch, damit der Regler sich gleichmäßig anfühlt
const ambienceLevel = () => Math.max(.0001, state.volume ** 2 * 1.2);
async function startAmbience(id, fadeIn = 4) {
  stopAmbience(1);
  if (!audioCtx || id === "aus") return;
  try {
    ambienceBuffers[id] ??= await fetch(`klang/${id}.mp3`).then(r => r.arrayBuffer()).then(b => audioCtx.decodeAudioData(b));
  } catch { return; }   // ohne Klang weiter, die Meditation läuft trotzdem
  const src = audioCtx.createBufferSource();
  src.buffer = ambienceBuffers[id];
  src.loop = true;
  const gain = audioCtx.createGain();
  const t = audioCtx.currentTime;
  gain.gain.setValueAtTime(.0001, t);
  gain.gain.linearRampToValueAtTime(ambienceLevel(), t + fadeIn);
  src.connect(gain).connect(audioCtx.destination);
  src.start();
  ambience = { id, src, gain };
}
function setAmbienceVolume() {
  if (!ambience || !audioCtx) return;
  ambience.gain.gain.cancelScheduledValues(audioCtx.currentTime);
  ambience.gain.gain.setTargetAtTime(ambienceLevel(), audioCtx.currentTime, .05);
}
function stopAmbience(fadeOut = 3) {
  if (!ambience || !audioCtx) return;
  const { src, gain } = ambience;
  ambience = null;
  const t = audioCtx.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(gain.gain.value, t);
  gain.gain.linearRampToValueAtTime(.0001, t + fadeOut);
  src.stop(t + fadeOut + .05);
}

// Hinweis unten auf der Startseite: welche Stimme gerade vorliest
function updateVoiceNote() {
  const el = document.getElementById("voiceNote");
  if (!el) return;
  const all = PHASES.flatMap(p => spokenSayings(p.id));
  const missing = all.filter(s => !recordingOf(s.text)).length;
  el.textContent = missing === 0 ? "Es liest Thorsten vor (Aufnahmen, auch ohne Internet)."
    : missing < all.length ? `Es liest Thorsten vor; ${missing === 1 ? "ein Spruch ist" : `${missing} Sprüche sind`} noch nicht vertont und kommen von der Stimme des Browsers.`
    : !synth ? "Dieser Browser kann nicht vorlesen. Die Texte erscheinen während der Meditation auf dem Bildschirm."
    : chosenVoice ? `Vorläufig liest die Stimme des Browsers vor: ${chosenVoice.name}.`
    : "Vorläufig liest die Stimme des Browsers vor.";
}

// Erst hier am Ende: chooseVoice() ruft updateVoiceNote() auf, und die braucht alles oben (recordingOf …).
// Weiter oben aufgerufen, brach das Laden der ganzen App ab (Oktober 2026).
if (synth) {
  chooseVoice();
  synth.addEventListener?.("voiceschanged", chooseVoice);
}
