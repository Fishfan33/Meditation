// Meditation – Bedienung der Startseite: Dauer, Hintergrundklang, Phasen, Griffe im Zeitbalken.
// Teil der App in js/: klassische Skripte, die sich einen gemeinsamen Gültigkeitsbereich teilen und in der
// Reihenfolge aus index.html geladen werden (Phasen zuerst, Start zuletzt). Übersicht: CLAUDE.md, „Aufbau“.

// ---------- Dauer ----------
// Skala: beim Berühren groß, beim Loslassen (sobald sie ausgerollt ist) wieder klein; übernommen wird der Wert,
// auf dem sie einrastet. Unter der Mindestdauer für die gewählten Phasen springt sie zurück.
let rulerTouching = false, rulerTimer;
function rulerSettle() {
  clearTimeout(rulerTimer);
  rulerTimer = setTimeout(() => {
    if (rulerTouching) return;
    const v = rulerValueAt();
    setDuration(v);
    rulerEl.classList.remove("big");
    render();
    if (state.duration !== v) {
      setRuler(state.duration, true);
      showToast(`Für ${activeIdx().length} Phasen braucht es mindestens ${fmtMin(state.duration)}.`);
    }
  }, 260);
}
// Schon beim Ziehen gleich mitverteilen: Phasen und Zeitbalken zeigen sofort die neue Aufteilung (Inhaber)
rulerEl.addEventListener("scroll", () => {
  if (!rulerEl.classList.contains("big")) return;
  const v = rulerValueAt();
  if (v !== state.duration && v >= minDuration()) { setDuration(v); render(); }
  document.getElementById("durValue").textContent = fmtMin(v);
  if (!rulerTouching) rulerSettle();
}, { passive: true });
rulerEl.addEventListener("pointerdown", e => {
  rulerTouching = true;
  rulerEl.classList.add("big");
  clearTimeout(rulerTimer);
  // Mit der Maus (Rechner) gibt es kein Wischen: Ziehen schiebt die Skala von Hand
  if (e.pointerType === "mouse") {
    const x0 = e.clientX, s0 = rulerEl.scrollLeft;
    rulerEl.setPointerCapture(e.pointerId);
    const move = ev => { rulerEl.scrollLeft = s0 - (ev.clientX - x0); };
    rulerEl.addEventListener("pointermove", move);
    rulerEl.addEventListener("pointerup", () => rulerEl.removeEventListener("pointermove", move), { once: true });
  }
});
const rulerRelease = () => { if (!rulerTouching) return; rulerTouching = false; rulerSettle(); };
// Am iPhone übernimmt beim Wischen der Browser das Scrollen (pointercancel); losgelassen ist erst bei touchend
["pointerup", "touchend", "touchcancel"].forEach(t => rulerEl.addEventListener(t, rulerRelease));
rulerEl.addEventListener("keydown", e => {
  const d = { ArrowRight: STEP, ArrowUp: STEP, ArrowLeft: -STEP, ArrowDown: -STEP }[e.key];
  if (!d) return;
  e.preventDefault();
  setDuration(state.duration + d);
  render();
});
document.getElementById("startBtn").addEventListener("click", startSession);

// ---------- Phasen an- und abwählen ----------
document.getElementById("chips").addEventListener("click", e => {
  const chip = e.target.closest("[data-chip]");
  if (!chip) return;
  const i = Number(chip.dataset.chip);
  if (state.plan[i].active && activeIdx().length === 1) { showToast("Eine Phase bleibt mindestens dabei."); return; }
  const before = state.duration;
  setActive(i, !state.plan[i].active);
  render();
  if (state.duration !== before) showToast(`Für alle Phasen braucht es mindestens ${fmtMin(state.duration)}.`);
});

// ---------- Hintergrundklang ----------
// Auswahl gilt sofort: Der Klang läuft schon auf der Startseite und spielt beim Starten ohne Unterbrechung weiter.
// Die Auswahl bleibt offen, damit man gleich die Lautstärke einstellen kann; zu mit Tipp daneben oder Escape.
const wrapOf = el => el.closest(".sound-wrap");
function toggleSoundMenu(wrap, open) {
  const menu = wrap.querySelector(".sound-menu"), btn = wrap.querySelector(".sound-btn");
  open ??= menu.hidden;
  menu.hidden = !open;
  btn.setAttribute("aria-expanded", open);
  if (open) menu.querySelector('[aria-checked="true"]')?.focus();
}
const closeSoundMenus = except => document.querySelectorAll(".sound-wrap").forEach(w => {
  if (w !== except && !w.querySelector(".sound-menu").hidden) toggleSoundMenu(w, false);
});
document.addEventListener("click", e => {
  const btn = e.target.closest(".sound-btn");
  if (btn) { closeSoundMenus(wrapOf(btn)); toggleSoundMenu(wrapOf(btn)); return; }
  const item = e.target.closest(".sound-menu [data-sound]");
  if (!item) return;
  audioUnlock();   // im Tipp: erst dann darf der Browser Ton abspielen
  state.sound = item.dataset.sound;
  renderSound();
  if (state.sound === "aus") stopAmbience(1.5);
  else if (ambience?.id !== state.sound) startAmbience(state.sound, 1.5);
});
document.addEventListener("input", e => {
  if (!e.target.closest(".sound-menu .vol")) return;
  state.volume = Number(e.target.value) / 100;
  setAmbienceVolume();
  renderSound();
});
document.addEventListener("keydown", e => {
  const menu = e.target.closest?.(".sound-menu");
  if (!menu) return;
  const items = [...menu.querySelectorAll("[data-sound], .vol input")];
  const k = items.indexOf(document.activeElement);
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !e.target.matches("input")) {
    e.preventDefault();
    items[(k + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
  } else if (e.key === "Escape") {
    e.preventDefault(); e.stopPropagation();   // in der Meditation nicht zugleich Pause auslösen
    toggleSoundMenu(wrapOf(menu), false);
    wrapOf(menu).querySelector(".sound-btn").focus();
  }
}, true);
// Tipp daneben schließt die Auswahl
document.addEventListener("pointerdown", e => closeSoundMenus(e.target.closest?.(".sound-wrap")));

// ---------- Griffe im Zeitbalken ----------
// Ziehen verschiebt Minuten zwischen genau den beiden benachbarten Phasen, je 1 Min; die Summe bleibt gleich.
const timelineEl = document.getElementById("timeline");
timelineEl.addEventListener("keydown", e => {
  const g = e.target.closest("[data-grip]");
  if (!g || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
  e.preventDefault();
  const [a, b] = g.dataset.grip.split(":").map(Number);
  if (shiftBoundary(a, b, e.key === "ArrowRight" ? 1 : -1)) render();
});
timelineEl.addEventListener("pointerdown", e => {
  const g = e.target.closest("[data-grip]");
  if (!g) return;
  e.preventDefault();
  g.setPointerCapture(e.pointerId);
  g.classList.add("dragging");
  const [a, b] = g.dataset.grip.split(":").map(Number);
  const bar = timelineEl.querySelector(".tl-bar");
  const pxPerMin = bar.getBoundingClientRect().width / plannedSum();
  const startX = e.clientX;
  let moved = 0;
  const move = ev => {
    const want = Math.round((ev.clientX - startX) / pxPerMin / GRIP_STEP);
    if (want !== moved) { moved += shiftBoundary(a, b, want - moved) / GRIP_STEP; updateTimeline(); }
  };
  const up = () => {
    g.removeEventListener("pointermove", move);
    g.classList.remove("dragging");
    render();
  };
  g.addEventListener("pointermove", move);
  g.addEventListener("pointerup", up, { once: true });
  g.addEventListener("pointercancel", up, { once: true });
});
