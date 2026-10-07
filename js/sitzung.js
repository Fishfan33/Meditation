// Meditation – die laufende Meditation: Ablauf berechnen, abspielen, Pause, nächste Phase, Beenden.
// Teil der App in js/: klassische Skripte, die sich einen gemeinsamen Gültigkeitsbereich teilen und in der
// Reihenfolge aus index.html geladen werden (Phasen zuerst, Start zuletzt). Übersicht: CLAUDE.md, „Aufbau“.

// ---------- Ablauf berechnen ----------
// Aus dem Plan wird beim Starten eine Zeitleiste von Ereignissen (Sekunden ab Start): je Phase ihre Sätze fast nahtlos
// nacheinander, nur mit einer kurzen Sprechpause (Inhaber, Oktober 2026). Kein Gong (gestrichen, Inhaber, 7. Oktober 2026).
// Sind alle Sätze einer Phase gesagt und ist noch Zeit, geht es von vorn los.
const LEAD = 2;                    // kurze Ruhe vor dem ersten Satz (darin lädt auch seine Aufnahme)
const PHASE_LEAD = 1.5;            // kurze Pause beim Übergang in die nächste Phase
// Sprechpause nach jedem Satz: settings.pause (im Admin-Bereich einstellbar, Standard 2 s)

// Sätze einer Phase für `avail` Sekunden: die aktiven Sprüche der Phase in ihrer Reihenfolge aus dem Admin-Bereich,
// danach wieder von vorn. Ein Satz darf anfangen, solange die Zeit der Phase noch läuft, und wird dann zu Ende
// gesprochen, auch wenn er etwas darüber hinausgeht; danach kommt keiner mehr (Inhaber, Oktober 2026).
// Zufall: wird festgelegt, wenn die Texte fertig sind (Inhaber); bis dahin gilt die Standard-Reihenfolge.
function phaseLines(i, avail) {
  const pool = activeSayings(PHASES[i].id);
  const lines = [];
  for (let k = 0, used = 0; pool.length && used < avail; k++) {
    const l = pool[k % pool.length];
    lines.push(l);
    used += speechSeconds(l) + settings.pause;
  }
  return { name: null, lines };
}

// Ereignisse der ganzen Meditation. Läuft der letzte Satz einer Phase über ihr Ende, beginnt die nächste Phase
// erst danach (mit kurzer Pause), damit nie zwei Sätze übereinander liegen.
function buildSession() {
  const phases = [], events = [];
  let t = 0, free = 0;   // free: ab wann die Stimme wieder frei ist
  state.plan.forEach((s, i) => {
    if (!s.active) return;
    const len = s.minutes * 60;
    const start = Math.max(t, free - PHASE_LEAD);
    const lead = phases.length ? PHASE_LEAD : LEAD;
    const { name, lines } = phaseLines(i, len - lead);
    phases.push({ i, start, end: start + len, name });
    let at = start + lead;
    for (const text of lines) {
      events.push({ t: at, kind: "say", text, i, d: speechSeconds(text) });
      at += speechSeconds(text) + settings.pause;
    }
    free = at;
    t = start + len;
  });
  const total = Math.max(t, free);
  phases.at(-1).end = total;
  events.push({ t: total, kind: "end" });
  return { total, phases, events };
}

// ---------- Abspielen ----------
// Die Zeit kommt immer aus der Uhr (performance.now), nie aus mitgezählten Takten: Browser bremsen Zeitgeber,
// wenn die Seite im Hintergrund ist. Verpasste Sätze werden dann nur angezeigt, nicht nachgeholt.
let session = null;
let wakeLock = null;
const sessionDlg = document.getElementById("session");
const $s = id => document.getElementById(id);

const elapsed = () => session.paused ? session.pausedAt : (performance.now() - session.t0) / 1000;
const clockText = sec => { const s = Math.max(0, Math.ceil(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { wakeLock = null; }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && session && !session.done) keepAwake();
});

function startSession() {
  if (!state.plan.some(isOn)) return;
  audioUnlock();
  session = { ...buildSession(), t0: performance.now(), next: 0, paused: false, pausedAt: 0, lastSay: null, done: false };
  // Aufnahmen der Sätze gleich beim Starten laden (vor dem ersten Satz liegen 2 Sekunden Ruhe)
  preloadRecordings([...new Set(session.events.filter(e => e.kind === "say").map(e => e.text))]);
  $s("sBar").innerHTML = session.phases.map(ph =>
    `<span class="s-seg" style="flex:${ph.end - ph.start};--ct:var(--p${ph.i + 1}-dark)"><span class="s-fill"></span></span>`).join("");
  $s("sLine").textContent = "";
  $s("sHint").textContent = "";
  $s("sControls").hidden = false;
  $s("sDone").hidden = true;
  sessionDlg.classList.remove("paused", "done");
  setPauseButton(false);
  sessionDlg.showModal();
  if (state.sound !== "aus" && ambience?.id !== state.sound) startAmbience(state.sound);
  $s("sPause").focus();
  keepAwake();
  session.timer = setInterval(tick, 200);
  tick();
}

function currentPhase(t) {
  return session.phases.find(ph => t < ph.end) || session.phases.at(-1);
}

function tick() {
  if (!session || session.paused) return;
  const t = elapsed();
  while (session.next < session.events.length && session.events[session.next].t <= t) {
    fire(session.events[session.next], t - session.events[session.next].t);
    session.next++;
  }
  if (!session.done) paint(t);
}

function fire(ev, late) {
  if (ev.kind === "say") {
    session.lastSay = ev;
    showLine(ev.text);
    if (late < 2) speak(ev.text);
  }
  else if (ev.kind === "end") finish();
}

function showLine(text) {
  const el = $s("sLine");
  el.classList.remove("in");
  void el.offsetWidth;   // Einblenden neu starten
  el.textContent = text;
  el.classList.add("in");
}

function paint(t) {
  const ph = currentPhase(t);
  const no = phaseNo(ph.i);
  $s("sPhase").textContent = `${no} ${PHASES[ph.i].name}`;
  sessionDlg.style.setProperty("--ct", `var(--p${ph.i + 1}-dark)`);
  $s("sLeft").textContent = `noch ${clockText(session.total - t)}`;
  sessionDlg.querySelectorAll(".s-fill").forEach((f, k) => {
    const p = session.phases[k];
    f.style.width = `${Math.min(100, Math.max(0, (t - p.start) / (p.end - p.start) * 100))}%`;
  });
}

function setPauseButton(paused) {
  const b = $s("sPause");
  b.setAttribute("aria-label", paused ? "Weiter" : "Pause");
  b.title = paused ? "Weiter" : "Pause";
  sessionDlg.classList.toggle("paused", paused);
}

function togglePause() {
  if (!session || session.done) return;
  if (!session.paused) {
    session.pausedAt = elapsed();
    session.paused = true;
    stopSpeaking();
    audioCtx?.suspend().catch(() => {});
    $s("sHint").textContent = "Pausiert.";
  } else {
    session.t0 = performance.now() - session.pausedAt * 1000;
    session.paused = false;
    audioCtx?.resume().catch(() => {});
    $s("sHint").textContent = "";
    // Wurde ein Satz durch die Pause abgeschnitten, ihn noch einmal sprechen
    const ls = session.lastSay;
    if (ls && session.pausedAt - ls.t < ls.d) speak(ls.text);
  }
  setPauseButton(session.paused);
  tick();
}

// Zur nächsten Phase springen; in der letzten Phase zum Ende
function nextPhase() {
  if (!session || session.done) return;
  const t = elapsed();
  const nxt = session.phases.find(ph => ph.start > t);
  const target = nxt ? nxt.start : session.total;
  stopSpeaking();
  if (session.paused) { session.pausedAt = target; session.paused = false; audioCtx?.resume().catch(() => {}); setPauseButton(false); $s("sHint").textContent = ""; }
  session.t0 = performance.now() - target * 1000;
  session.next = session.events.findIndex(ev => ev.t >= target);
  $s("sLine").textContent = "";
  tick();
}

// Beenden braucht zwei Tipps: Mit geschlossenen Augen tippt man leicht daneben
function endPressed() {
  const b = $s("sEnd");
  if (b.classList.contains("armed")) { closeSession(); return; }
  b.classList.add("armed");
  $s("sHint").textContent = "Zum Beenden noch einmal tippen.";
  clearTimeout(endPressed.timer);
  endPressed.timer = setTimeout(() => {
    b.classList.remove("armed");
    if ($s("sHint").textContent.startsWith("Zum Beenden")) $s("sHint").textContent = session?.paused ? "Pausiert." : "";
  }, 4000);
}

function finish() {
  session.done = true;
  paint(session.total);
  sessionDlg.classList.add("done");
  showLine(END_LINE);
  stopAmbience(6);
  $s("sLeft").textContent = "";
  $s("sControls").hidden = true;
  $s("sDone").hidden = false;
  $s("sDone").focus();
  releaseAwake();
}

function releaseAwake() { wakeLock?.release?.().catch(() => {}); wakeLock = null; }

function closeSession() {
  if (!session) return;
  clearInterval(session.timer);
  stopSpeaking();
  audioCtx?.resume().catch(() => {});
  stopAmbience(.6);
  releaseAwake();
  session = null;
  $s("sEnd").classList.remove("armed");
  if (sessionDlg.open) sessionDlg.close();
  document.getElementById("startBtn").focus({ preventScroll: true });
}

// Escape schließt das Fenster nicht einfach (mitten in der Meditation): erst Pause, nach dem Ende schließen
sessionDlg.addEventListener("cancel", e => {
  e.preventDefault();
  if (!session || session.done) closeSession();
  else if (!session.paused) togglePause();
});
$s("sPause").addEventListener("click", togglePause);
$s("sNext").addEventListener("click", nextPhase);
$s("sEnd").addEventListener("click", endPressed);
$s("sDone").addEventListener("click", closeSession);
