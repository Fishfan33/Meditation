// Meditation – Stimme und Ton.
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
// Je Spruch seine Sätze als einzelne Aufnahmen [[Datei, Sekunden], …]; zwischen den Sätzen liegt dieselbe Pause wie
// zwischen den Sprüchen (settings.pause, im Admin-Bereich einstellbar: eine Einstellung für alle Pausen).
// Ältere Listen hatten je Spruch nur [Datei, Sekunden]; das wird hier in die neue Form gebracht.
const recordingOf = text => {
  const r = self.RECORDINGS?.[text];
  return !r ? null : typeof r[0] === "string" ? [r] : r;
};
const voiceBuffers = new Map();   // Datei → dekodierter Ton (einmal laden, dann aus dem Speicher)
// Schlägt das Laden fehl (am iPhone z. B., wenn zu viele Aufnahmen gleichzeitig entpackt werden), wird es nicht als
// „keine Aufnahme“ gemerkt, sondern beim nächsten Mal erneut versucht.
function loadFile(file) {
  if (!voiceBuffers.has(file)) {
    const p = fetch(file).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(b => new Promise((ok, fail) => audioCtx.decodeAudioData(b, ok, fail)))
      .catch(() => { voiceBuffers.delete(file); return null; });
    voiceBuffers.set(file, p);
  }
  return voiceBuffers.get(file);
}
function loadRecording(text) {
  const parts = recordingOf(text);
  if (!parts || !audioCtx) return Promise.resolve(null);
  return Promise.all(parts.map(([file]) => loadFile(file))).then(bufs => bufs.every(Boolean) ? bufs : null);
}
// Vorab laden, z. B. alle Sätze einer Meditation gleich beim Starten
// Nacheinander statt alle auf einmal: das iPhone verkraftet viele gleichzeitige Entpackungen nicht
function preloadRecordings(texts) {
  texts.reduce((kette, t) => kette.then(() => loadRecording(t)), Promise.resolve());
}
let voiceSources = [], speakToken = 0;

// Spruch vorlesen; `done` läuft, wenn er fertig ist (oder abgebrochen wurde). Die Sätze werden auf der Zeitachse des
// Tons genau hintereinander gelegt, jeweils mit der eingestellten Pause dazwischen.
function speak(text, done) {
  const token = ++speakToken;
  if (recordingOf(text) && audioCtx) {
    loadRecording(text).then(bufs => {
      if (token !== speakToken) return;   // inzwischen abgebrochen oder ein anderer Spruch
      if (!bufs) { speakFiles(recordingOf(text), token, () => speakSynth(text, done), done); return; }
      let t = audioCtx.currentTime + .02;
      voiceSources = bufs.map((buf, k) => {
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        src.connect(audioCtx.destination);
        src.start(t);
        t += buf.duration + settings.pause;
        if (k === bufs.length - 1) src.onended = () => { if (voiceSources.includes(src)) voiceSources = []; done?.(); };
        return src;
      });
    });
    return;
  }
  speakSynth(text, done);
}
// Zweiter Weg ohne Entpacken: die Aufnahmen direkt als Tondatei abspielen (Satz für Satz, mit der Pause dazwischen).
// Erst wenn auch das nicht geht, liest die Stimme des Browsers.
let fileAudio = null;
function speakFiles(parts, token, fallback, done) {
  const next = k => {
    if (token !== speakToken) return;
    if (k >= parts.length) { fileAudio = null; done?.(); return; }
    const a = new Audio(parts[k][0]);
    fileAudio = a;
    a.onended = () => setTimeout(() => next(k + 1), k < parts.length - 1 ? settings.pause * 1000 : 0);
    a.play().catch(() => { if (k === 0) { fileAudio = null; fallback(); } else next(k + 1); });
  };
  next(0);
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
  const srcs = voiceSources;
  voiceSources = [];
  srcs.forEach(src => { src.onended = null; try { src.stop(); } catch {} });
  if (fileAudio) { fileAudio.onended = null; fileAudio.pause(); fileAudio = null; }
  synth?.cancel();
}

// Sprechdauer eines Spruchs in Sekunden: seine Sätze plus die Pausen dazwischen; ohne Aufnahme geschätzt
function speechSeconds(text) {
  const parts = recordingOf(text);
  return parts ? parts.reduce((a, [, sek]) => a + sek, 0) + (parts.length - 1) * settings.pause : text.length / 12.5 + .6;
}

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
