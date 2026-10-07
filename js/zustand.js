// Meditation – Zustand, Dauer und Zeitverteilung.
// Teil der App in js/: klassische Skripte, die sich einen gemeinsamen Gültigkeitsbereich teilen und in der
// Reihenfolge aus index.html geladen werden (Phasen zuerst, Start zuletzt). Übersicht: CLAUDE.md, „Aufbau“.

// ---------- Umgebung ----------
// Lokal (als Datei oder über localhost) ohne Offline-Kopie, damit jede Änderung sofort sichtbar ist.
// 127.0.0.2 zählt bewusst nicht dazu: Dort verhält sich die App wie die veröffentlichte Version.
const IS_LOCAL = location.protocol === "file:" || ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

// ---------- Zustand ----------
// Die App speichert nichts (Inhaber, Oktober 2026). Welche Sprüche kommen, wird erst beim Starten gemischt.
// plan[i] gehört immer zu PHASES[i]: { active, minutes }
let state = { duration: DURATION_DEFAULT, plan: PHASES.map(() => ({ active: true, minutes: 0 })), sound: "aus", volume: .55 };

// ---------- Sprüche und Klänge ----------
// Grundbestand aus js/texte.js; hat der Inhaber im Admin-Bereich etwas geändert, gilt seine Fassung aus config.js.
// Je Phase eine geordnete Liste aus Sprüchen { id, text, active } und Gruppen { id, name, active, items: [Sprüche] }.
// config.js läuft bei allen Besuchern, deshalb alles daraus prüfen (gleiche Regeln wie werkzeuge/admin_helfer.py):
// bekannte Phasen, id aus a–z, 0–9 und Bindestrich, Text 1–400 Zeichen ohne Steuerzeichen, Gruppenname bis
// 60 Zeichen, keine Gruppe in einer Gruppe, jede id nur einmal, höchstens 300 Sprüche je Phase.
const SAYING_ID = /^[a-z0-9-]{1,40}$/;
const SAYING_MAX = 400, GROUP_NAME_MAX = 60;
const cleanText = (t, max = SAYING_MAX) => typeof t === "string" ? t.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
function cleanSayings(raw) {
  const out = {}, seen = new Set();
  const okId = id => typeof id === "string" && SAYING_ID.test(id) && !seen.has(id) && seen.add(id);
  for (const p of PHASES) {
    let count = 0;
    const saying = x => {
      const text = cleanText(x?.text);
      if (!text || count >= 300 || !okId(x.id)) return null;
      count++;
      return { id: x.id, text, active: x.active !== false };
    };
    const list = Array.isArray(raw?.[p.id]) ? raw[p.id] : [];
    out[p.id] = list.flatMap(x => {
      if (Array.isArray(x?.items)) {
        if (!okId(x.id)) return [];
        const name = cleanText(x.name, GROUP_NAME_MAX) || "Gruppe";
        return [{ id: x.id, name, active: x.active !== false, items: x.items.map(saying).filter(Boolean) }];
      }
      const s = saying(x);
      return s ? [s] : [];
    });
  }
  return out;
}
const isGroup = e => Array.isArray(e.items);
// Alle Sprüche einer Phase in Reihenfolge (auch aus Gruppen) bzw. nur die, die vorgelesen werden
const allSayings = pid => sayings[pid].flatMap(e => isGroup(e) ? e.items : [e]);
const spokenSayings = pid => sayings[pid].flatMap(e => isGroup(e) ? (e.active ? e.items.filter(s => s.active) : []) : e.active ? [e] : []);
function cleanSounds(raw) {
  return Object.fromEntries(SOUNDS.filter(s => s.id !== "aus").map(s => [s.id, raw?.[s.id] !== false]));
}
// Einstellungen aus dem Admin-Bereich. Sprechpause zwischen zwei Sätzen in Sekunden (Inhaber, Oktober 2026: etwas
// länger als zuvor 1,1 s, im Admin-Bereich einstellbar), 0,5 bis 10 s in Zehntelsekunden.
const PAUSE_MIN = .5, PAUSE_MAX = 10, PAUSE_DEFAULT = 2;
// Stimme für die Aufnahmen (nur Admin-Bereich und werkzeuge/aufnahmen.py, die App spielt einfach die Aufnahmen):
// Programm und Stimme aus werkzeuge/stimmen.json, Sprechtempo 80–120 % in 5-%-Schritten. null = Standard
// (Piper „Thorsten“, Tempo 100 %).
const TEMPO_MIN = .8, TEMPO_MAX = 1.2;
const VOICE_DEFAULT = { programm: "piper", stimme: "thorsten", tempo: 1 };
function cleanVoice(raw) {
  const id = v => typeof v === "string" && /^[a-z0-9-]{1,40}$/.test(v);
  if (!raw || typeof raw !== "object" || !id(raw.programm) || !id(raw.stimme)) return null;
  const t = Number(raw.tempo);
  const tempo = Number.isFinite(t) ? Math.round(Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, t)) * 20) / 20 : 1;
  const v = { programm: raw.programm, stimme: raw.stimme, tempo };
  return Object.keys(v).every(k => v[k] === VOICE_DEFAULT[k]) ? null : v;
}
function cleanSettings(raw) {
  const p = Number(raw?.pause);
  return { pause: Number.isFinite(p) ? Math.round(Math.min(PAUSE_MAX, Math.max(PAUSE_MIN, p)) * 10) / 10 : PAUSE_DEFAULT,
    stimme: cleanVoice(raw?.stimme) };
}
const CONFIG = window.MEDITATION_CONFIG && typeof window.MEDITATION_CONFIG === "object" ? window.MEDITATION_CONFIG : null;
let sayings = cleanSayings(CONFIG?.sayings ?? DEFAULT_SAYINGS);
let soundsOn = cleanSounds(CONFIG?.sounds);
let settings = cleanSettings(CONFIG?.settings);
const activeSayings = phaseId => spokenSayings(phaseId).map(s => s.text);
const soundEnabled = id => id === "aus" || soundsOn[id] !== false;

const isOn = s => s.active;
const activeIdx = () => state.plan.map((s, i) => s.active ? i : -1).filter(i => i >= 0);
const plannedSum = () => state.plan.filter(isOn).reduce((a, s) => a + s.minutes, 0);
// Nummer einer Phase: gezählt werden nur Phasen, die dabei sind (wie im Retro-Cockpit)
const phaseNo = i => state.plan[i].active ? state.plan.slice(0, i + 1).filter(isOn).length : null;
const fmtMin = m => `${String(m).replace(".", ",")} Min`;
const minDuration = () => Math.max(DURATION_MIN, activeIdx().length * STEP);

// ---------- Zeitverteilung ----------
// Gesamtdauer in ganzen Minuten (STEP) nach Anteilen auf die aktiven Phasen verteilen (größte Reste zuerst),
// jede bekommt mindestens einen Schritt. Die Summe ergibt genau die Gesamtdauer.
function distribute() {
  const idx = activeIdx();
  const units = Math.round(state.duration / STEP);
  const shareSum = idx.reduce((a, i) => a + PHASES[i].share, 0);
  const raw = idx.map(i => PHASES[i].share / shareSum * units);
  const parts = raw.map(r => Math.max(1, Math.floor(r)));
  let rest = units - parts.reduce((a, b) => a + b, 0);
  // Rest = was noch fehlt; Phasen, die schon auf einen Schritt angehoben wurden, haben keinen Rest mehr
  raw.map((r, k) => [r - parts[k], k]).sort((a, b) => b[0] - a[0])
     .slice(0, Math.max(0, rest)).forEach(([, k]) => parts[k]++);
  // Zu viel vergeben (viele Phasen mit Mindestschritt): bei den größten wieder abziehen
  for (rest = parts.reduce((a, b) => a + b, 0) - units; rest > 0; rest--) {
    const k = parts.indexOf(Math.max(...parts));
    if (parts[k] <= 1) break;
    parts[k]--;
  }
  idx.forEach((i, k) => state.plan[i].minutes = parts[k] * STEP);
}

function setDuration(d) {
  state.duration = Math.min(DURATION_MAX, Math.max(minDuration(), d));
  distribute();
}

function setActive(i, on) {
  state.plan[i].active = on;
  if (state.duration < minDuration()) state.duration = minDuration();
  distribute();
}

// Grenze zwischen zwei benachbarten aktiven Phasen a und b um `steps` Minuten verschieben (positiv: a wird
// länger, b kürzer). Die Summe bleibt gleich; keine Phase wird kürzer als PHASE_MIN. Ergebnis: tatsächlich
// verschobene Minuten.
function shiftBoundary(a, b, steps) {
  const pa = state.plan[a], pb = state.plan[b];
  const room = steps > 0 ? pb.minutes - PHASE_MIN : pa.minutes - PHASE_MIN;
  const n = Math.sign(steps) * Math.min(Math.abs(steps), Math.floor(room / GRIP_STEP + 1e-9)) * GRIP_STEP;
  pa.minutes += n;
  pb.minutes -= n;
  return n;
}
