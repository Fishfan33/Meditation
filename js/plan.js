// Meditation – Darstellung der Startseite: Dauer, Hintergrundklang, Phasen-Schalter, Zeitbalken.
// Teil der App in js/: klassische Skripte, die sich einen gemeinsamen Gültigkeitsbereich teilen und in der
// Reihenfolge aus index.html geladen werden (Phasen zuerst, Start zuletzt). Übersicht: CLAUDE.md, „Aufbau“.

// ---------- Hilfen ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const iconSvg = name => document.getElementById("soundIcons").content.querySelector(`[data-icon="${name}"]`).innerHTML;
const soundOf = id => SOUNDS.find(s => s.id === id);

// ---------- Zeitbalken ----------
// Ein Abschnitt je aktiver Phase, Breite nach Minuten; zwischen zwei Abschnitten ein Griff (ARIA-Separator)
function timelineMarkup() {
  const idx = activeIdx();
  return `<div class="tl-bar">` + idx.map((i, k) => {
    const s = state.plan[i];
    const seg = `<div class="tl-seg" data-seg="${i}" style="flex:${s.minutes};--ph:var(--p${i + 1})">
      <span class="tl-name">${esc(PHASES[i].short)}</span><span class="tl-min">${fmtMin(s.minutes)}</span></div>`;
    const next = idx[k + 1];
    const grip = next === undefined ? "" :
      `<div class="tl-grip" role="separator" tabindex="0" aria-orientation="vertical" data-grip="${i}:${next}"
        aria-label="Grenze zwischen ${esc(PHASES[i].name)} und ${esc(PHASES[next].name)}"
        aria-valuemin="${PHASE_MIN}" aria-valuemax="${s.minutes + state.plan[next].minutes - PHASE_MIN}"
        aria-valuenow="${s.minutes}" aria-valuetext="${esc(PHASES[i].short)} ${fmtMin(s.minutes)}, ${esc(PHASES[next].short)} ${fmtMin(state.plan[next].minutes)}"></div>`;
    return seg + grip;
  }).join("") + `</div>`;
}
// Beim Ziehen nur Breiten und Minuten anpassen (flüssig am Handy), nicht alles neu bauen
function updateTimeline() {
  document.querySelectorAll("#timeline .tl-seg").forEach(el => {
    const s = state.plan[Number(el.dataset.seg)];
    el.style.flex = s.minutes;
    el.querySelector(".tl-min").textContent = fmtMin(s.minutes);
  });
  document.querySelectorAll("#timeline .tl-grip").forEach(g => {
    const [a, b] = g.dataset.grip.split(":").map(Number);
    g.setAttribute("aria-valuenow", state.plan[a].minutes);
    g.setAttribute("aria-valuetext", `${PHASES[a].short} ${fmtMin(state.plan[a].minutes)}, ${PHASES[b].short} ${fmtMin(state.plan[b].minutes)}`);
  });
}

// ---------- Skala für die Gesamtdauer ----------
// Ein Strich je Minute, längere Striche alle 5, beschriftet alle 10 Minuten. Die Skala ist ein waagrecht scrollender Streifen:
// So wischt man auf dem iPhone mit dem gewohnten Schwung, und sie rastet per Scroll-Snap auf jedem Strich ein.
const rulerEl = document.getElementById("ruler");
const RULER_VALUES = Array.from({ length: (DURATION_MAX - DURATION_MIN) / STEP + 1 }, (_, k) => DURATION_MIN + k * STEP);
document.getElementById("rulerTrack").innerHTML = RULER_VALUES.map(v =>
  `<span class="tick${v % 10 === 0 ? " major" : v % 5 === 0 ? " mid" : ""}" data-v="${v}">${v % 10 === 0 ? `<b>${v}</b>` : ""}</span>`).join("");
const tickWidth = () => rulerEl.querySelector(".tick").getBoundingClientRect().width;
const rulerValueAt = () => RULER_VALUES[Math.min(RULER_VALUES.length - 1, Math.max(0, Math.round(rulerEl.scrollLeft / tickWidth())))];
// Anzeige und Lage der Skala auf einen Wert setzen (nicht während der Finger noch wischt)
function setRuler(v, smooth = false) {
  document.getElementById("durValue").textContent = fmtMin(v);
  rulerEl.setAttribute("aria-valuenow", v);
  rulerEl.setAttribute("aria-valuetext", `${String(v).replace(".", ",")} Minuten`);
  if (!rulerEl.classList.contains("big")) {
    rulerEl.scrollTo({ left: RULER_VALUES.indexOf(v) * tickWidth(), behavior: smooth ? "smooth" : "instant" });
  }
}

// ---------- Phasen-Schalter ----------
function chipsMarkup() {
  return PHASES.map((p, i) => {
    const s = state.plan[i];
    const orte = p.id === "kraftort" ? placeGroups() : [];
    if (orte.length) return placeChip(p, i, s, orte);
    return `<button class="chip${s.active ? "" : " off"}" data-chip="${i}" aria-pressed="${s.active}" style="--ph:var(--p${i + 1})"
      title="${s.active ? "Antippen zum Auslassen" : "Antippen zum Aufnehmen"}">
      <span class="chip-no" aria-hidden="true">${phaseNo(i) ?? ""}</span><span class="chip-name">${esc(p.name)}</span>
      <span class="chip-min">${s.active ? fmtMin(s.minutes) : "nicht dabei"}</span></button>`;
  }).join("");
}
// Kraftort mit Orten (Variante C des Inhabers): Antippen klappt die Orte auf; „Nicht dabei“ lässt die Phase aus.
// Standard „Zufällig“; ist nur ein Ort aktiv, steht nur er da.
function placeChip(p, i, s, orte) {
  const gewaehlt = chosenPlace();
  const name = gewaehlt ? gewaehlt.name : "Zufällig";
  const chip = `<button class="chip${s.active ? "" : " off"}" data-chip="${i}" data-place-toggle aria-expanded="${s.active && state.ortOffen}"
      aria-controls="placeOptions" style="--ph:var(--p${i + 1})" title="${s.active ? "Antippen, um den Ort zu wählen" : "Antippen zum Aufnehmen"}">
      <span class="chip-no" aria-hidden="true">${phaseNo(i) ?? ""}</span>
      <span class="chip-name">${esc(p.name)}${s.active ? ` <span class="chip-place">· ${esc(name)}</span>` : ""}</span>
      <span class="chip-min">${s.active ? fmtMin(s.minutes) : "nicht dabei"}</span></button>`;
  if (!s.active || !state.ortOffen) return chip;
  const wahl = [...(orte.length > 1 ? [{ id: "zufall", name: "Zufällig" }] : []), ...orte];
  const an = id => (orte.length === 1 || state.kraftort === id || (id === "zufall" && !gewaehlt));
  return chip + `<div class="places" id="placeOptions" role="radiogroup" aria-label="Kraftort wählen">${wahl.map(o =>
    `<button class="place${an(o.id) ? " on" : ""}" role="radio" aria-checked="${an(o.id)}" data-place="${esc(o.id)}">${esc(o.name)}</button>`).join("")}
    <button class="place place-off" data-place-off>Nicht dabei</button></div>`;
}

// ---------- Hintergrundklang ----------
// Zwei gleiche Auswahlen: auf der Startseite und in der Meditations-Ansicht (je .sound-wrap). Einmal aufgebaut,
// danach nur Häkchen, Symbol und Regler setzen; sonst risse das Neuzeichnen den Regler aus dem Finger.
document.querySelectorAll(".sound-menu").forEach(menu => {
  menu.innerHTML = SOUNDS.map(s =>
    `<button role="menuitemradio" aria-checked="false" data-sound="${s.id}">${iconSvg(s.icon)}<span>${esc(s.name)}</span></button>`).join("") +
    `<label class="vol">${iconSvg("leise")}<input type="range" min="0" max="100" step="1" aria-label="Lautstärke des Hintergrundklangs">${iconSvg("klang")}</label>`;
});
function renderSound() {
  const cur = soundOf(state.sound);
  document.querySelectorAll(".sound-btn").forEach(btn => {
    btn.innerHTML = iconSvg(cur.id === "aus" ? "klang" : cur.icon);
    btn.classList.toggle("on", cur.id !== "aus");
    btn.setAttribute("aria-label", `Hintergrundklang: ${cur.name}`);
    btn.title = `Hintergrundklang: ${cur.name}`;
  });
  document.querySelectorAll(".sound-menu [data-sound]").forEach(b => {
    b.setAttribute("aria-checked", b.dataset.sound === state.sound);
    b.hidden = !soundEnabled(b.dataset.sound);   // im Admin-Bereich deaktivierte Klänge nicht anbieten
  });
  document.querySelectorAll(".sound-menu .vol input").forEach(r => {
    if (document.activeElement !== r) r.value = Math.round(state.volume * 100);
    r.disabled = state.sound === "aus";
  });
}

// ---------- Neu zeichnen ----------
// Fokus bleibt auf demselben Bedienelement (sonst springt er am Handy weg)
function render() {
  const key = document.activeElement?.closest?.("#chips, #timeline") &&
    [...document.activeElement.attributes].find(a => /^data-(chip|grip)$/.test(a.name));
  document.getElementById("durValue").textContent = fmtMin(state.duration);
  setRuler(state.duration);
  document.getElementById("startSub").textContent = `${fmtMin(plannedSum())}, ${activeIdx().length} Phasen`;
  document.getElementById("chips").innerHTML = chipsMarkup();
  document.getElementById("timeline").innerHTML = timelineMarkup();
  renderSound();
  if (key) document.querySelector(`[${key.name}="${key.value}"]`)?.focus({ preventScroll: true });
}
