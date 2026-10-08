// Meditation – Admin-Bereich (nur lokal): Sprüche je Phase und Hintergrundklänge verwalten.
// Teil der App in js/: klassische Skripte, die sich einen gemeinsamen Gültigkeitsbereich teilen und in der
// Reihenfolge aus index.html geladen werden (Phasen zuerst, Start zuletzt). Übersicht: CLAUDE.md, „Aufbau“.
//
// Aufbau wie „Methoden verwalten“ im Retro-Cockpit (Wahl des Inhabers dort): links Reiter (fünf Phasen und „Klänge“),
// rechts die Einträge. Je Phase eine Liste aus Sprüchen und optionalen Gruppen, die als Karten erscheinen
// (Wahl B des Inhabers): auf- und zuklappbar, mit Name, Zahl, Dauer, Schalter, Umbenennen, Auflösen. Je Spruch: Griff ⠿ zum
// Verschieben (Ziehen, auch in und aus Gruppen und auf einen anderen Phasen-Reiter, oder Pfeiltasten), Anhören,
// Schalter (aktiv), Bleistift (bearbeiten, mit Phase und Gruppe), Papierkorb (mit Rückgängig). Die Reihenfolge
// ist die Standard-Reihenfolge beim Vorlesen (Inhaber). Jede Änderung gilt sofort und wird über den Admin-Helfer in
// config.js gespeichert (werkzeuge/admin_helfer.py); ohne Helfer nur bis zum Neuladen.
// Ablauf (Inhaber, Oktober 2026): ändern → von selbst speichern → der Helfer vertont von selbst, was fehlt → mit einem
// Klick veröffentlichen; online geht nur der gespeicherte und vollständig vertonte Stand. Eine Statuszeile oben zeigt
// alle drei Schritte (Variante A des Inhabers).

// ---------- Umgebung ----------
// Nur lokal: als Datei oder über localhost. In der veröffentlichten Version bleibt der Knopf unsichtbar.
const IS_ADMIN = IS_LOCAL;
const adminDlg = document.getElementById("adminDlg");
const admPanel = document.getElementById("admPanel");
const admStatus = document.getElementById("admStatus");
let admTab = PHASES[0].id;      // gewählter Reiter, nur im Speicher
let admEditing = null;          // id des Spruchs, der gerade bearbeitet wird
let admRenaming = null;         // id der Gruppe, die gerade umbenannt wird
const admCollapsed = new Set(); // zugeklappte Gruppen (nur im Speicher; anfangs ist alles offen)

// ---------- Daten: Sprüche und Gruppen finden ----------
// Wo steht ein Spruch? { list (das Feld, in dem er steht), index, item, group (oder null) }
function findSaying(pid, id) {
  const top = sayings[pid];
  for (let k = 0; k < top.length; k++) {
    const e = top[k];
    if (isGroup(e)) {
      const j = e.items.findIndex(x => x.id === id);
      if (j >= 0) return { list: e.items, index: j, item: e.items[j], group: e };
    } else if (e.id === id) return { list: top, index: k, item: e, group: null };
  }
  return null;
}
const groupsOf = pid => sayings[pid].filter(isGroup);
const findGroup = (pid, gid) => sayings[pid].find(e => isGroup(e) && e.id === gid);
const phaseName = pid => PHASES.find(p => p.id === pid).name;
const newId = prefix => `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 2).toString(36)}`;
// Spruch oder ganze Gruppe in eine andere Phase verschieben, dort ans Ende
function moveToPhase(id, from, to) {
  if (from === to) return;
  const k = sayings[from].findIndex(e => e.id === id && isGroup(e));
  if (k >= 0) { sayings[to].push(...sayings[from].splice(k, 1)); return; }
  const f = findSaying(from, id);
  if (f) sayings[to].push(...f.list.splice(f.index, 1));
}

// ---------- Speichern über den Admin-Helfer ----------
let helperOk = null;   // null = noch nicht geprüft
async function checkHelper() {
  if (location.protocol === "file:") return (helperOk = false);
  try {
    const r = await fetch("manifest.json", { method: "HEAD", cache: "no-store" });
    helperOk = r.headers.get("X-Meditation-Helfer") === "1";
  } catch { helperOk = false; }
  return helperOk;
}
let saveTimer;
function scheduleSave() {
  admStatus.textContent = "Speichert …";
  admStatus.className = "adm-status";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}
// Rückfall im Browser: Jede Änderung liegt zuerst im Speicher dieses Browsers (nur im Admin-Bereich, nur lokal) und
// wird erst nach erfolgreichem Speichern über den Helfer wieder entfernt. Klappt das Speichern nicht, bleibt sie dort,
// ein roter Hinweis sagt es, und beim nächsten Öffnen wird sie zum Wiederherstellen angeboten. Anlass: Überarbeitete
// Texte gingen am 6. Oktober 2026 verloren.
const DRAFT_KEY = "meditation:admin-entwurf";
// Fingerabdruck des gespeicherten Stands, auf dem diese Seite beruht (vom Helfer). Wird mitgeschickt; hat sich der
// Stand inzwischen anderswo geändert, lehnt der Helfer ab, statt den neueren Stand zu überschreiben.
let configStand = null;
if (IS_ADMIN && location.protocol !== "file:") {
  fetch("api/stand", { method: "POST", headers: { "Content-Type": "application/json", "X-Meditation": "1" }, body: "{}" })
    .then(r => r.json()).then(r => { if (r.ok) configStand = r.stand; }).catch(() => {});
}
let unsaved = false;
function keepDraft() {
  unsaved = true;
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), sayings, soundsOn, settings })); } catch {}
}
function dropDraft() {
  unsaved = false;
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}
function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; }
}
window.addEventListener("beforeunload", e => { if (unsaved) { e.preventDefault(); e.returnValue = ""; } });
function showAlert(text, withRestore = false, withReload = false) {
  document.getElementById("admAlert").hidden = !text;
  document.getElementById("admAlertText").textContent = text || "";
  document.getElementById("admAlertRestore").hidden = !withRestore;
  document.getElementById("admAlertDrop").hidden = !withRestore;
  document.getElementById("admAlertReload").hidden = !withReload;
}
function saveFailed(reason) {
  admStatus.textContent = "Nicht gespeichert";
  admStatus.className = "adm-status warn";
  showAlert(`Nicht gespeichert: ${reason} Deine Änderungen sind vorerst nur in diesem Browser aufbewahrt. Seite nicht schließen,
    bis hier wieder „Gespeichert“ steht.`);
}
async function saveNow() {
  if (helperOk === null || helperOk === false) await checkHelper();
  if (!helperOk) {
    saveFailed(location.protocol === "file:" ? "Die App ist als Datei geöffnet (bitte http://localhost:8766/ nehmen)."
      : "Der Admin-Helfer läuft nicht.");
    return;
  }
  try {
    const r = await fetch("api/speichern", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Meditation": "1" },
      body: JSON.stringify({ sayings, sounds: soundsOn, settings, basis: configStand }),
    }).then(r => r.json());
    if (!r.ok && /^KONFLIKT/.test(r.fehler)) {
      admStatus.textContent = "Nicht gespeichert";
      admStatus.className = "adm-status warn";
      showAlert("Nicht gespeichert: Die Sprüche wurden inzwischen woanders geändert (anderes Fenster oder Claude). " +
        "Bitte die Seite neu laden. Deine letzte Änderung bleibt im Browser aufbewahrt.", false, true);
      return;
    }
    if (!r.ok) { saveFailed(r.fehler); return; }
    configStand = r.stand;
    admStatus.textContent = "✓ Gespeichert";
    admStatus.className = "adm-status ok";
    dropDraft();
    showAlert("");
    refreshStatus();   // der Helfer vertont jetzt, was fehlt; der Knopf zählt die offenen Änderungen
  } catch {
    saveFailed("Der Admin-Helfer antwortet nicht.");
  }
}
// Änderung ausführen, Startseite und Liste neu zeichnen, speichern
function changed() {
  keepDraft();
  if (!soundEnabled(state.sound)) { state.sound = "aus"; stopAmbience(1); }
  render();
  renderAdmin();
  scheduleSave();
}
// Mit Rückgängig: Stand vorher merken, Änderung ausführen, Meldung anbieten (`danger`: rot, nach dem Löschen)
function withUndo(msg, action, opts) {
  const before = JSON.stringify({ sayings, soundsOn, settings });
  action();
  changed();
  showToast(msg, () => {
    const b = JSON.parse(before);
    sayings = b.sayings;
    soundsOn = b.soundsOn;
    settings = b.settings;
    changed();
    showToast("Rückgängig gemacht.");
  }, opts);
}

// ---------- Statuszeile: gespeichert, vertont, veröffentlicht ----------
// Variante A des Inhabers (Oktober 2026): eine Zeile oben sagt alles. Der Admin-Helfer vertont nach dem Speichern von
// selbst, was fehlt (neuer oder geänderter Text, andere Stimme, anderes Tempo, „Neu sprechen“), kurz nach der letzten
// Änderung; Pause, Reihenfolge, An/Aus und Klänge brauchen keine Vertonung. Solange etwas läuft, fragt die Seite nach
// dem Fortschritt (feiner Balken mit Prozent und Restzeit, Wunsch des Inhabers); danach lädt sie die Liste der Aufnahmen
// neu. „Veröffentlichen (n)“ zählt, was noch nicht online ist. Veröffentlicht wird nur vollständig Vertontes (Inhaber):
// Läuft noch eine Vertonung, wartet der Auftrag im Helfer und geht danach von selbst online.
let recState = { laeuft: false, geplant: false, fertig: 0, gesamt: 0, aktuell: "", fehler: "", stand: 0, rest: null,
  stimme: "", fehlend: 0, offen: null, angehalten: false, veroeffentlichen: { zustand: "" } };
// Je Spruch: mit welcher Stimme die gültige Aufnahme entstand (Inhaber, Oktober 2026), vom Helfer aus den Dateinamen
let recOrigin = {};
async function loadOrigins() {
  try { const r = await recCall("api/herkunft"); if (r.ok) recOrigin = r.herkunft; } catch {}
}
const fmtWhen = sec => new Date(sec * 1000).toLocaleString("de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const originText = text => {
  const o = recordingOf(text) && recOrigin[text];
  return o ? ` · ${o.wer}${o.zeit ? `, ${fmtWhen(o.zeit)}` : ""}` : "";
};
let recTimer = null, recSeen = null, pubSeen = null, elSeen = null;
const recCall = (path, body = {}) => fetch(path, { method: "POST",
  headers: { "Content-Type": "application/json", "X-Meditation": "1" }, body: JSON.stringify(body) }).then(r => r.json());
async function reloadRecordings() {
  try {
    const js = await fetch(`js/aufnahmen.js?t=${Date.now()}`, { cache: "no-store" }).then(r => r.text());
    const m = /self\.RECORDINGS\s*=\s*([\s\S]*);\s*$/.exec(js);
    if (m) self.RECORDINGS = JSON.parse(m[1]);
  } catch {}
}
const recBusy = () => recState.laeuft || recState.geplant;
const pubBusy = () => ["wartet", "laeuft"].includes(recState.veroeffentlichen?.zustand);
const nSayings = n => n === 1 ? "Ein Spruch" : `${n} Sprüche`;
function paintStatus() {
  const text = document.getElementById("admRecText"), btn = document.getElementById("admRecBtn");
  const bar = document.getElementById("admRecBar"), fill = document.getElementById("admRecFill");
  const n = recState.fehlend || 0, werden = n === 1 ? "wird" : "werden";
  text.classList.toggle("warn", !!recState.fehler && !recBusy());
  bar.hidden = !recState.laeuft;
  btn.hidden = recBusy() || !n;
  btn.textContent = recState.angehalten ? "Fortsetzen" : recState.fehler ? "Nochmal versuchen" : "Jetzt vertonen";
  document.getElementById("admRecStop").hidden = !recBusy();
  // ElevenLabs (Import-Stimme): fehlende Sätze als Text zum Herunterladen; den Export übernimmt der Knopf daneben
  const el = recState.elevenlabs || {}, elLink = document.getElementById("admElText");
  elLink.hidden = recBusy() || !el.text || !el.fehlt;
  if (el.text) { elLink.href = el.text; elLink.download = el.text.split("/").pop(); }
  document.getElementById("admElSearch").hidden = elLink.hidden;
  text.title = "";
  if (recState.laeuft) {
    const p = Math.max(0, Math.min(100, recState.prozent || 0));
    fill.style.width = `${p}%`;
    bar.setAttribute("aria-valuenow", p);
    const rest = recState.rest ? ` · noch ${fmtWait(recState.rest)}` : "";
    const was = ["Sätze werden umgewandelt", "Liste wird geschrieben"].includes(recState.schritt) ? "umgerechnet" : "vertont";
    text.textContent = `${n ? `${nSayings(n)} ${werden} ${was}` : "Aufnahmen werden aktualisiert"} · ${p} %${rest}`;
    // Genauer beim Darüberfahren: Stimme, Schritt, gerade gesprochener Satz
    const k = Math.min(recState.fertig + 1, recState.gesamt);
    text.title = [recState.stimme, recState.schritt === "Satz wird gesprochen" && recState.gesamt
      ? `Satz ${k} von ${recState.gesamt}: „${recState.aktuell}“` : recState.schritt].filter(Boolean).join(" · ");
  } else if (recState.geplant) text.textContent = `${nSayings(n)} ${werden} gleich vertont`;
  else if (el.fehlt && el.text) {
    text.textContent = `${el.fehlt === 1 ? "Ein Satz fehlt" : `${el.fehlt} Sätze fehlen`} bei ElevenLabs`;
    btn.hidden = true;
  }
  else if (recState.angehalten) text.textContent = n ? `Vertonung abgebrochen · ${nSayings(n)} noch nicht vertont` : "✓ Alles vertont";
  else if (recState.fehler) text.textContent = `Vertonung abgebrochen: ${recState.fehler}`;
  else text.textContent = n ? `${nSayings(n)} noch nicht vertont` : "✓ Alles vertont";
  // Knopf: Zahl der offenen Änderungen; „✓ Alles online“, wenn es nichts gibt
  const pub = document.getElementById("publishBtn"), z = recState.veroeffentlichen?.zustand, offen = recState.offen;
  pub.classList.toggle("done", !pubBusy() && offen === 0);
  pub.textContent = z === "wartet" ? "Wartet auf Vertonung …" : z === "laeuft" ? "Wird veröffentlicht …"
    : offen === 0 ? "✓ Alles online" : `Veröffentlichen${offen ? ` (${offen})` : ""}`;
}
// Liste neu zeichnen, um „wird vertont …“ zu zeigen oder auszublenden: nur, wo es Sprüche gibt, und nie beim
// Bearbeiten, Umbenennen oder auf „Einstellungen“ (sonst nähme es dort den Regler aus der Hand)
function redrawForRecording() {
  if (!adminDlg.open) return;
  if (admEditing || admRenaming || !PHASES.some(p => p.id === admTab)) renderAdminTabs();
  else renderAdmin();
}
async function refreshStatus() {
  clearTimeout(recTimer);
  const wasBusy = recBusy();
  try { recState = await recCall("api/status"); } catch { return; }
  if (recBusy() !== wasBusy) redrawForRecording();   // „wird vertont …“ an den Sprüchen
  if (recSeen !== null && recState.stand !== recSeen) {   // ein Durchgang ist fertig: neue Aufnahmen holen
    await reloadRecordings();
    await loadOrigins();
    if (adminDlg.open && !recState.fehler && !recState.fehlend) showToast("✓ Vertonung fertig. Alle Sprüche sind aufgenommen.");
    redrawForRecording();
    render();
    updateVoiceNote();
  }
  recSeen = recState.stand;
  // Ein ElevenLabs-Export wurde übernommen (oder ging nicht): einmal melden
  const elMeldung = recState.elevenlabs?.meldung || "";
  if (elSeen !== null && elMeldung && elMeldung !== elSeen) showToast(elMeldung, null, { long: true, danger: /ging nicht/.test(elMeldung) });
  elSeen = elMeldung;
  // Veröffentlichen, das in dieser Sitzung angestoßen wurde: Ergebnis melden
  const pub = recState.veroeffentlichen || {};
  if (["wartet", "laeuft"].includes(pubSeen) && pub.zustand === "fertig") {
    showToast(pub.aenderungen?.length ? `✓ Veröffentlicht (Stand ${pub.stand}). Online in 1 bis 10 Minuten; auf dem iPhone ` +
      "erscheint dann „Neue Version verfügbar“." : "Alles war schon veröffentlicht.", null, { long: true });
  }
  if (["wartet", "laeuft"].includes(pubSeen) && pub.zustand === "fehler") showAlert(pub.meldung);
  pubSeen = pub.zustand;
  paintStatus();
  if (adminDlg.open && (recBusy() || pubBusy())) recTimer = setTimeout(refreshStatus, recState.laeuft ? 500 : 1000);
  else if (adminDlg.open && recState.elevenlabs?.fehlt) recTimer = setTimeout(refreshStatus, 5000);   // wartet auf den Export
}
// „Vertonung abbrechen“ (Inhaber): Laufendes endet, nichts Neues beginnt, bis „Fortsetzen“. Gesprochene Sätze bleiben.
document.getElementById("admRecStop").addEventListener("click", async () => {
  try { recState = await recCall("api/vertonung-anhalten"); } catch { return; }
  paintStatus();
  redrawForRecording();
  showToast("Vertonung abgebrochen. Fertige Sätze bleiben gespeichert; mit „Fortsetzen“ geht es dort weiter.", async () => {
    try { recState = await recCall("api/vertonen"); } catch { return; }
    paintStatus();
    setTimeout(refreshStatus, 500);
  }, { long: true });
  setTimeout(refreshStatus, 800);
});
// „Nach ElevenLabs-Downloads suchen“ (Inhaber): übernimmt den Export aus dem Download-Ordner, auch mit anderem Namen
document.getElementById("admElSearch").addEventListener("click", async () => {
  const b = document.getElementById("admElSearch");
  b.disabled = true; b.textContent = "Sucht …";
  try {
    const r = await recCall("api/elevenlabs-suchen");
    if (!r.ok) showToast(r.fehler, null, { danger: true, long: true });
    else { recState = r; paintStatus(); }
  } catch { showToast("Der Admin-Helfer antwortet nicht.", null, { danger: true }); }
  b.disabled = false; b.textContent = "Nach ElevenLabs-Downloads suchen";
  setTimeout(refreshStatus, 500);
});
document.getElementById("admRecBtn").addEventListener("click", async () => {
  try { recState = await recCall("api/vertonen"); } catch { return; }
  paintStatus();
  setTimeout(refreshStatus, 500);
});

// ---------- Gruppe abspielen ----------
// ▶ im Kopf einer Gruppe (Inhaber): alle aktiven Sprüche der Gruppe nacheinander, mit der kurzen Sprechpause wie in der
// Meditation; ■ hält an. Auch beim Schließen des Fensters und bei „Anhören“ eines einzelnen Spruchs ist Schluss.
let playingGroup = null, groupRun = 0;
function stopGroup() {
  if (!playingGroup) return;
  playingGroup = null;
  groupRun++;
  stopSpeaking();
  if (adminDlg.open && !admEditing && !admRenaming) renderAdmin();
}
function playGroup(g) {
  if (playingGroup === g.id) { stopGroup(); return; }
  stopGroup();
  const lines = g.items.filter(s => s.active).map(s => s.text);
  if (!lines.length) { showToast("In dieser Gruppe ist kein Spruch aktiv."); return; }
  audioUnlock();
  stopSpeaking();
  playingGroup = g.id;
  const run = ++groupRun;
  renderAdmin();
  const next = k => {
    if (run !== groupRun) return;
    if (k >= lines.length) { stopGroup(); return; }
    speak(lines[k], () => setTimeout(() => next(k + 1), settings.pause * 1000));
  };
  next(0);
}

// ---------- Sprechdauer ----------
// Wie lange die Stimme braucht, um alle aktiven Sprüche einer Phase einmal vorzulesen, mit der kurzen Sprechpause
// danach (wie beim Abspielen). Vorläufig geschätzt (Browser-Stimme); mit den Aufnahmen später auf die Sekunde.
const sayingSeconds = text => speechSeconds(text) + settings.pause;
const phaseSeconds = pid => spokenSayings(pid).reduce((a, s) => a + sayingSeconds(s.text), 0);
const groupSeconds = g => g.items.filter(s => s.active).reduce((a, s) => a + sayingSeconds(s.text), 0);
const fmtDur = sec => { const s = Math.round(sec); return s < 60 ? `${s} Sek` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} Min`; };

// ---------- Darstellung ----------
function renderAdmin() {
  renderAdminTabs();
  admPanel.innerHTML = admTab === "klang" ? soundsMarkup() : admTab === "einst" ? settingsMarkup() : phaseMarkup(admTab);
  if (admEditing) admPanel.querySelector(".adm-edit textarea")?.focus();
  if (admRenaming) { const f = admPanel.querySelector(".adm-rename input"); f?.focus(); f?.select(); }
}
function renderAdminTabs() {
  const tabs = [...PHASES.map((p, i) => ({ id: p.id, label: p.name, no: i + 1, count: spokenSayings(p.id).length })),
    { id: "klang", label: "Klänge", no: "♪", count: SOUNDS.filter(s => s.id !== "aus" && soundsOn[s.id]).length },
    { id: "einst", label: "Einstellungen", no: "⚙", count: "" }];
  document.getElementById("admTabs").innerHTML = tabs.map(t =>
    `<button role="tab" class="adm-tab" data-tab="${t.id}" aria-selected="${t.id === admTab}" style="--ph:var(--p${t.no}, var(--accent-soft))">
      <span class="adm-tab-no" aria-hidden="true">${t.no}</span><span class="adm-tab-name">${esc(t.label)}</span>
      <span class="adm-count" title="aktiv">${t.count}</span>
      ${PHASES.some(p => p.id === t.id) ? `<span class="adm-tab-dur" title="So lange dauert es, alle aktiven Sprüche einmal vorzulesen">${fmtDur(phaseSeconds(t.id))}</span>` : ""}</button>`).join("") +
    // Summe aller Phasen (Inhaber): so lange läuft die Meditation, ohne dass sich ein Spruch wiederholt
    `<div class="adm-total" title="Alle aktiven Sprüche aller Phasen einmal nacheinander vorgelesen">
      <span>Ohne Wiederholung</span><b>${fmtDur(PHASES.reduce((a, p) => a + phaseSeconds(p.id), 0))}</b>
      <span class="adm-total-note">alle aktiven Sprüche aller Phasen einmal nacheinander</span></div>`;
}

function sayingRow(s, no, pid, group) {
  if (admEditing === s.id) {
    const groups = groupsOf(pid);
    return `<li class="adm-row editing" data-id="${s.id}">
      <span class="adm-no" aria-hidden="true">${no}</span>
      <div class="adm-edit"><textarea rows="3" maxlength="${SAYING_MAX}" aria-label="Spruch bearbeiten">${esc(s.text)}</textarea>
        <div class="adm-edit-btns">
          <label class="adm-phase-pick">Phase <select data-act="phase">${PHASES.map(p =>
            `<option value="${p.id}"${p.id === pid ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
          <label class="adm-phase-pick">Gruppe <select data-act="group"><option value="">ohne Gruppe</option>${groups.map(g =>
            `<option value="${g.id}"${g === group ? " selected" : ""}>${esc(g.name)}</option>`).join("")}</select></label>
          <button class="btn sm primary" data-act="save">Speichern</button>
          <button class="btn sm" data-act="cancel">Abbrechen</button>
          ${voiceVaries() && recordingOf(s.text) ? `<button class="btn sm" data-act="retake" title="Die Stimme spricht diesen Spruch noch einmal, etwas anders betont">↻ Neu sprechen</button>` : ""}</div></div></li>`;
  }
  return `<li class="adm-row${s.active ? "" : " off"}" data-id="${s.id}">
    <button class="adm-drag" data-act="drag" aria-label="Verschieben: ${esc(s.text.slice(0, 40))} (Pfeiltasten hoch und runter)" title="Ziehen zum Verschieben">⠿</button>
    <span class="adm-no" aria-hidden="true">${no}</span>
    <span class="adm-text">${esc(s.text)}<span class="adm-dur">${fmtDur(sayingSeconds(s.text))}${esc(originText(s.text))}${recordingOf(s.text) ? ""
      : `<span class="adm-norec">${recBusy() ? "wird vertont …" : "noch nicht vertont"}</span>`}</span></span>
    <span class="adm-actions">
      <button class="adm-icon" data-act="listen" aria-label="Anhören" title="Anhören">▶</button>
      <label class="switch" title="${s.active ? "Aktiv: wird vorgelesen" : "Deaktiviert: wird nicht vorgelesen"}">
        <input type="checkbox" role="switch" data-act="toggle"${s.active ? " checked" : ""} aria-label="Aktiv"><span aria-hidden="true"></span></label>
      <button class="adm-icon" data-act="edit" aria-label="Bearbeiten" title="Bearbeiten">✏️</button>
      <button class="adm-icon" data-act="delete" aria-label="Löschen" title="Löschen">🗑</button>
    </span></li>`;
}

function groupCard(g, pid, firstNo) {
  const open = !admCollapsed.has(g.id);
  const active = g.items.filter(s => s.active).length;
  const name = admRenaming === g.id
    ? `<form class="adm-rename" data-gid="${g.id}"><input value="${esc(g.name)}" maxlength="${GROUP_NAME_MAX}" aria-label="Name der Gruppe">
        <button class="btn sm primary" type="submit">OK</button></form>`
    : `<button class="adm-group-name" data-act="gfold" aria-expanded="${open}">
        <span class="chev" aria-hidden="true">▾</span><span>${esc(g.name)}</span></button>`;
  let no = firstNo;
  const rows = g.items.map(s => sayingRow(s, no++, pid, g)).join("");
  return `<li class="adm-group${g.active ? "" : " off"}${open ? "" : " collapsed"}" data-gid="${g.id}">
    <div class="adm-group-head">
      <button class="adm-drag" data-act="gdrag" aria-label="Gruppe ${esc(g.name)} verschieben (Pfeiltasten hoch und runter)" title="Ziehen zum Verschieben">⠿</button>
      ${name}
      <span class="adm-group-info">${active} von ${g.items.length} · ${fmtDur(groupSeconds(g))}</span>
      <span class="adm-actions">
        <button class="adm-icon" data-act="gplay" aria-pressed="${playingGroup === g.id}"
          aria-label="${playingGroup === g.id ? "Abspielen anhalten" : `Gruppe ${esc(g.name)} abspielen`}"
          title="${playingGroup === g.id ? "Anhalten" : "Ganze Gruppe abspielen"}">${playingGroup === g.id ? "■" : "▶"}</button>
        <label class="switch" title="${g.active ? "Gruppe aktiv" : "Gruppe deaktiviert: keiner ihrer Sprüche wird vorgelesen"}">
          <input type="checkbox" role="switch" data-act="gtoggle"${g.active ? " checked" : ""} aria-label="Gruppe ${esc(g.name)} aktiv"><span aria-hidden="true"></span></label>
        <button class="adm-icon" data-act="grename" aria-label="Gruppe umbenennen" title="Umbenennen">✏️</button>
        <button class="adm-icon" data-act="gdelete" aria-label="Gruppe löschen" title="Gruppe löschen (mit Rückfrage)">🗑</button>
      </span>
    </div>
    <ol class="adm-group-list" data-gid="${g.id}">${rows || `<li class="adm-drop-hint">Leer: Sprüche hierher ziehen oder beim Bearbeiten diese Gruppe wählen</li>`}</ol>
  </li>`;
}

function phaseMarkup(pid) {
  let no = 1;
  const items = sayings[pid].map(e => {
    if (!isGroup(e)) return sayingRow(e, no++, pid, null);
    const card = groupCard(e, pid, no);
    no += e.items.length;
    return card;
  }).join("");
  const groups = groupsOf(pid);
  return `<p class="adm-hint">Die Reihenfolge ist die Standard-Reihenfolge beim Vorlesen. Zum Verschieben den Griff ⠿ ziehen, auch in
      eine Gruppe hinein oder heraus. Gruppen halten zusammengehörige Sprüche in ihrer Reihenfolge zusammen.</p>
    <ol class="adm-list" id="admList">${items || `<li class="adm-empty">Noch keine Sprüche. Ohne aktive Sprüche bleibt diese Phase still.</li>`}</ol>
    <form class="adm-add" id="admAdd">
      <textarea id="admNew" rows="2" maxlength="${SAYING_MAX}" placeholder="Neuer Spruch für ${esc(phaseName(pid))} …" aria-label="Neuer Spruch"></textarea>
      <div class="adm-add-btns">
        ${groups.length ? `<label class="adm-phase-pick">in <select id="admNewGroup"><option value="">ohne Gruppe</option>${groups.map(g =>
          `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select></label>` : ""}
        <button class="btn primary" type="submit">Hinzufügen</button>
        <button class="btn" type="button" data-act="gadd">+ Gruppe</button>
      </div>
    </form>`;
}

function soundsMarkup() {
  return `<p class="adm-hint">Deaktivierte Klänge erscheinen nicht in der Auswahl auf der Startseite und in der Meditation.</p>
    <ul class="adm-list">${SOUNDS.filter(s => s.id !== "aus").map(s => `
      <li class="adm-row${soundsOn[s.id] ? "" : " off"}" data-sound-id="${s.id}">
        <span class="adm-sound-icon" aria-hidden="true">${iconSvg(s.icon)}</span>
        <span class="adm-text">${esc(s.name)}</span>
        <span class="adm-actions">
          <button class="adm-icon" data-act="sound-listen" aria-label="${esc(s.name)} anhören" title="Anhören">▶</button>
          <label class="switch"><input type="checkbox" role="switch" data-act="sound-toggle"${soundsOn[s.id] ? " checked" : ""}
            aria-label="${esc(s.name)} aktiv"><span aria-hidden="true"></span></label>
        </span></li>`).join("")}</ul>`;
}

// ---------- Einstellungen ----------
// Stimm-Einstellungen (Inhaber, Oktober 2026): Stimme (Programm und Sprecher aus werkzeuge/stimmen.json, mit Hörprobe),
// Sprechtempo und Pause. Möglichst ohne Warten: Die Pause setzt die App beim Abspielen ein, das Tempo rechnet der Helfer
// aus den zwischengespeicherten Aufnahmen um (etwa eine Minute), nur eine neue Stimme muss alle Sätze einmal sprechen.
// Sprechpause zwischen zwei Sätzen: in Sekunden mit einer Nachkommastelle, wie bei Audio- und Meditations-Apps
// üblich; Regler und Zahlenfeld, „Probe hören“ liest zwei Sätze mit dieser Pause.
const fmtSec = v => `${v.toFixed(1).replace(".", ",")} s`;
const fmtWait = sec => {
  if (sec < 90) return "etwa eine Minute";
  if (sec < 3600) return `etwa ${Math.round(sec / 60)} Minuten`;
  const h = Math.floor(sec / 3600), m = Math.round(sec % 3600 / 600) * 10;   // auf 10 Minuten gerundet
  return `etwa ${h === 1 ? "eine Stunde" : `${h} Stunden`}${m && m < 60 ? ` ${m} Minuten` : ""}`;
};
let voiceCatalog = null, voiceProg = null, probeAudio = null;
const currentVoice = () => settings.stimme || VOICE_DEFAULT;
// Klingt das gewählte Programm bei jedem Sprechen etwas anders (Chatterbox)? Dann gibt es „Neu sprechen“.
const voiceVaries = () => !!voiceCatalog?.programme?.find(p => p.id === currentVoice().programm)?.variiert;
async function loadVoices() {
  try {
    const r = await recCall("api/stimmen");
    voiceCatalog = r.ok ? r : { fehler: r.fehler };
  } catch { voiceCatalog = { fehler: "Der Admin-Helfer antwortet nicht." }; }
  if (adminDlg.open && (admTab === "einst" || admEditing)) renderAdmin();
}
function stopProbe() {
  if (probeAudio) { probeAudio.pause(); probeAudio = null; }
  document.querySelectorAll("[data-probe].playing").forEach(b => { b.classList.remove("playing"); b.textContent = "▶"; });
}
// Hörprobe der Stimme, im gewählten Tempo (der Browser hält die Tonhöhe, wie später die Aufnahmen)
function playProbe(src, btn) {
  const again = btn?.classList.contains("playing");
  stopProbe(); stopGroup(); stopSpeaking();
  if (again || !src) return;
  probeAudio = new Audio(src);
  probeAudio.preservesPitch = true;
  probeAudio.playbackRate = tempoDraft ?? currentVoice().tempo;
  probeAudio.onended = stopProbe;
  probeAudio.play().catch(stopProbe);
  if (btn) { btn.classList.add("playing"); btn.textContent = "■"; }
}
function voiceMarkup() {
  if (!voiceCatalog) {
    if (voiceCatalog === null) { voiceCatalog = false; loadVoices(); }
    return `<p class="adm-hint">Stimmen werden geladen …</p>`;
  }
  if (voiceCatalog.fehler) {   // beim nächsten Öffnen neu versuchen
    const msg = voiceCatalog.fehler;
    voiceCatalog = null;
    return `<p class="adm-hint">Stimmen nicht verfügbar: ${esc(msg)}</p>`;
  }
  const cur = currentVoice();
  const progs = voiceCatalog.programme.filter(p => p.eingerichtet);
  const prog = progs.find(p => p.id === (voiceProg || cur.programm)) || progs[0];
  if (!prog) return `<p class="adm-hint">Kein Sprachprogramm eingerichtet.</p>`;
  const n = voiceCatalog.saetze;
  return `${progs.length > 1 ? `<div class="adm-seg" role="tablist" aria-label="Sprachprogramm">${progs.map(p => `
      <button class="adm-seg-btn${p.id === prog.id ? " on" : ""}" role="tab" aria-selected="${p.id === prog.id}"
        data-act="voice-prog" data-prog="${p.id}">${esc(p.name)}</button>`).join("")}</div>` : ""}
    <ul class="adm-list adm-voices">${prog.stimmen.map(v => {
      const on = cur.programm === prog.id && cur.stimme === v.id;
      return `<li class="adm-row${on ? " chosen" : ""}">
        <button class="adm-icon" data-probe="${esc(v.probe || "")}"${v.probe ? "" : " disabled"}
          aria-label="Hörprobe ${esc(v.name)}" title="Hörprobe">▶</button>
        <span class="adm-text">${esc(v.name)}</span>
        <span class="adm-actions">${on ? `<span class="adm-chosen">✓ Gewählt</span>`
          : `<button class="btn sm" data-act="voice-pick" data-prog="${prog.id}" data-voice="${v.id}">Wählen</button>`}</span></li>`;
    }).join("")}</ul>
    <p class="adm-hint">Eine neue Stimme spricht alle ${n || ""} Sätze einmal: mit ${esc(prog.name)} ${fmtWait(prog.sekundenJeSatz * (n || 200))}.
      So lange liest die bisherige Stimme weiter. Zurück zu einer schon benutzten Stimme geht schnell.</p>`;
}
function settingsMarkup() {
  const tempo = Math.round((tempoDraft ?? currentVoice().tempo) * 100);
  return `<h3 class="adm-set-title">Stimme</h3>
    ${voiceMarkup()}
    <h3 class="adm-set-title">Sprechtempo</h3>
    <p class="adm-hint">Wie schnell die Stimme spricht; 100 % wie aufgenommen, die Tonhöhe bleibt gleich. Beim Schieben hörst du
      die Probe gleich im neuen Tempo. „Übernehmen“ rechnet danach alle Aufnahmen um (etwa 1 bis 2 Minuten, neu sprechen ist
      nicht nötig); bis dahin bleibt das bisherige Tempo.</p>
    <div class="adm-set-row">
      <input type="range" id="setTempo" min="${TEMPO_MIN * 100}" max="${TEMPO_MAX * 100}" step="5" value="${tempo}" aria-label="Sprechtempo in Prozent">
      <output class="adm-set-out" id="setTempoOut">${tempo} %</output>
      <button class="btn sm" id="setTempoTry">▶ Probe hören</button>
      <button class="btn sm primary" id="setTempoApply"${tempoDraft === null ? " hidden" : ""}>Übernehmen</button>
    </div>
    <h3 class="adm-set-title">Pause zwischen den Sätzen</h3>
    <p class="adm-hint">So lange ist es still, bevor der nächste Satz beginnt: zwischen zwei Sprüchen und ebenso zwischen den
      Sätzen innerhalb eines Spruchs. Gilt in der Meditation und beim Anhören; neu aufnehmen ist dafür nicht nötig.</p>
    <div class="adm-set-row">
      <input type="range" id="setPause" min="${PAUSE_MIN}" max="${PAUSE_MAX}" step="0.1" value="${settings.pause}" aria-label="Pause zwischen den Sätzen in Sekunden">
      <label class="adm-set-num"><input type="number" id="setPauseNum" min="${PAUSE_MIN}" max="${PAUSE_MAX}" step="0.1" value="${settings.pause}"
        inputmode="decimal" aria-label="Pause in Sekunden"><span>s</span></label>
      <button class="btn sm" id="setPauseTry">▶ Probe hören</button>
    </div>
    <p class="adm-hint">Standard: ${fmtSec(PAUSE_DEFAULT)}. Bereich ${fmtSec(PAUSE_MIN)} bis ${fmtSec(PAUSE_MAX)}.</p>
    <h3 class="adm-set-title">Frühere Stände</h3>
    <p class="adm-hint">Bei jedem Speichern wird der bisherige Stand gesichert. Hier lässt sich ein früherer zurückholen.</p>
    <button class="btn sm" id="backupBtn">Frühere Stände ansehen</button>`;
}
const voiceName = v => {
  const p = voiceCatalog?.programme.find(p => p.id === v.programm);
  return `${p?.name || v.programm} „${p?.stimmen.find(s => s.id === v.stimme)?.name || v.stimme}“`;
};
function pickVoice(programm, stimme) {
  stopProbe();
  const prog = voiceCatalog.programme.find(p => p.id === programm);
  const wait = fmtWait(prog.sekundenJeSatz * (voiceCatalog.saetze || 200));
  withUndo(`Stimme gewechselt: ${voiceName({ programm, stimme })}. Die Sätze werden jetzt neu gesprochen (${wait}, oder schneller, ` +
    `wenn es sie schon gab); bis dahin liest die bisherige Stimme.`, () => {
    settings.stimme = cleanVoice({ ...currentVoice(), programm, stimme });
  }, { long: true });
}
// Tempo: Der Regler ändert erst nur die Probe (sofort, im Browser); „Übernehmen“ speichert, dann rechnet der Helfer alle
// Aufnahmen um. So entstehen nicht bei jedem Schieben neue Dateien (die beim Veröffentlichen alle neu hochgehen).
let tempoDraft = null;   // geschoben, aber noch nicht übernommen
function setTempo(v) {
  const tempo = (cleanVoice({ ...VOICE_DEFAULT, ...currentVoice(), tempo: Number(v) / 100 }) || VOICE_DEFAULT).tempo;
  document.getElementById("setTempoOut").textContent = `${Math.round(tempo * 100)} %`;
  if (probeAudio) probeAudio.playbackRate = tempo;
  tempoDraft = tempo === currentVoice().tempo ? null : tempo;
  document.getElementById("setTempoApply").hidden = tempoDraft === null;
}
function applyTempo() {
  if (tempoDraft === null) return;
  const tempo = tempoDraft;
  tempoDraft = null;
  withUndo(`Sprechtempo ${Math.round(tempo * 100)} % übernommen. Die Aufnahmen werden jetzt umgerechnet ` +
    "(etwa 1 bis 2 Minuten); bis dahin spricht das bisherige Tempo.", () => {
    settings.stimme = cleanVoice({ ...currentVoice(), tempo });
  }, { long: true });
}
let pauseSaveTimer;
function setPause(v, final) {
  const clean = cleanSettings({ pause: Number(String(v).replace(",", ".")) }).pause;
  document.getElementById("setPause").value = clean;
  if (final) document.getElementById("setPauseNum").value = clean;
  if (clean === settings.pause) return;
  settings.pause = clean;
  // Nur speichern, nicht neu zeichnen: sonst nähme das Neuzeichnen den Regler mitten im Ziehen aus der Hand.
  // Beim Ziehen nicht bei jedem Zehntel speichern, sondern kurz nach dem letzten (gemerkt ist es sofort).
  renderAdminTabs();   // Dauern in den Reitern und „Ohne Wiederholung“ gleich mit
  render();
  keepDraft();
  clearTimeout(pauseSaveTimer);
  pauseSaveTimer = setTimeout(scheduleSave, 500);
}
admPanel.addEventListener("input", e => {
  if (e.target.id === "setPause") { setPause(e.target.value); document.getElementById("setPauseNum").value = settings.pause; }
  if (e.target.id === "setTempo") setTempo(e.target.value);
});
admPanel.addEventListener("change", e => { if (e.target.id === "setPauseNum") setPause(e.target.value, true); });
admPanel.addEventListener("click", e => {
  const probe = e.target.closest("[data-probe]");
  if (probe) playProbe(probe.dataset.probe, probe);
  const act = e.target.closest("[data-act]");
  if (act?.dataset.act === "voice-prog") { stopProbe(); voiceProg = act.dataset.prog; renderAdmin(); }
  if (act?.dataset.act === "voice-pick") pickVoice(act.dataset.prog, act.dataset.voice);
  if (e.target.closest("#setTempoApply")) applyTempo();
  if (e.target.closest("#backupBtn")) openBackups();
  if (e.target.closest("#setTempoTry")) {
    const cur = currentVoice();
    const v = voiceCatalog?.programme.find(p => p.id === cur.programm)?.stimmen.find(s => s.id === cur.stimme);
    playProbe(v?.probe, null);
  }
  if (e.target.closest("#setPauseTry")) {
    // Ein Spruch mit mehreren Sätzen und der nächste: so hört man beide Arten von Pause
    const all = PHASES.flatMap(p => spokenSayings(p.id)).map(s => s.text);
    const k = Math.max(0, all.findIndex(t => (recordingOf(t)?.length || 0) > 1));
    const lines = all.slice(k, k + 2);
    stopGroup(); audioUnlock(); stopSpeaking();
    const run = ++groupRun;
    speak(lines[0], () => setTimeout(() => { if (run === groupRun) speak(lines[1]); }, settings.pause * 1000));
  }
});

// ---------- Öffnen und Schließen ----------
const adminBtn = document.getElementById("adminBtn");
adminBtn.hidden = !IS_ADMIN;
adminBtn.addEventListener("click", async () => {
  admEditing = admRenaming = null;
  renderAdmin();
  adminDlg.showModal();
  adminDlg.querySelector('[aria-selected="true"]')?.focus();
  admStatus.textContent = "";
  offerDraft();
  if (await checkHelper()) {
    admStatus.textContent = "✓ Gespeichert";
    admStatus.className = "adm-status ok";
    recCall("api/abgleich", { defaults: DEFAULT_SAYINGS }).catch(() => {});   // Stand von GitHub, für die Zahl am Knopf
    if (!voiceCatalog) { voiceCatalog = false; loadVoices(); }                // für „Neu sprechen“
    loadOrigins().then(() => { if (adminDlg.open && !admEditing && !admRenaming) redrawForRecording(); });
    refreshStatus();
    setTimeout(refreshStatus, 4000);   // nachdem der Stand von GitHub da ist
  } else {
    admStatus.textContent = location.protocol === "file:"
      ? "Als Datei geöffnet: Änderungen werden nicht gespeichert. Bitte über http://localhost:8766/ öffnen."
      : "Admin-Helfer läuft nicht: Änderungen gelten nur bis zum Neuladen.";
    admStatus.className = "adm-status warn";
  }
});
document.getElementById("admClose").addEventListener("click", () => adminDlg.close());
adminDlg.addEventListener("close", () => {
  stopGroup();
  stopSpeaking();
  if (state.sound === "aus") stopAmbience(.5);
  setTimeout(() => adminBtn.focus({ preventScroll: true }));
});
// Escape beim Bearbeiten oder Umbenennen bricht nur das ab, statt das Fenster zu schließen
adminDlg.addEventListener("cancel", e => {
  if (admEditing || admRenaming) { e.preventDefault(); admEditing = admRenaming = null; renderAdmin(); }
});

// ---------- Bedienung ----------
document.getElementById("admTabs").addEventListener("click", e => {
  const t = e.target.closest("[data-tab]");
  if (!t) return;
  admTab = t.dataset.tab;
  admEditing = admRenaming = null;
  tempoDraft = null;
  renderAdmin();
  document.querySelector(`[data-tab="${admTab}"]`)?.focus();
});

const rowOf = el => el.closest("[data-id]");
const cardOf = el => el.closest("[data-gid]");
const short = t => `„${t.length > 40 ? t.slice(0, 40) + " …" : t}“`;

admPanel.addEventListener("click", e => {
  const btn = e.target.closest("[data-act]");
  if (!btn || ["drag", "gdrag"].includes(btn.dataset.act) || /toggle$/.test(btn.dataset.act) || btn.tagName === "SELECT") return;
  const act = btn.dataset.act;
  if (act === "sound-listen") {
    audioUnlock();
    startAmbience(btn.closest("[data-sound-id]").dataset.soundId, 1);
    showToast("Läuft zur Probe. Auf der Startseite wählst du den Klang für die Meditation.");
    return;
  }
  if (act === "gadd") {
    const g = { id: newId("g"), name: "Neue Gruppe", active: true, items: [] };
    sayings[admTab].push(g);
    admRenaming = g.id;
    changed();
    admPanel.querySelector(`[data-gid="${g.id}"]`)?.scrollIntoView({ block: "nearest" });
    return;
  }
  const card = cardOf(btn);
  if (act === "gplay") { playGroup(findGroup(admTab, card.dataset.gid)); return; }
  if (["gfold", "grename", "gdelete"].includes(act)) {
    const g = findGroup(admTab, card.dataset.gid);
    if (act === "gfold") { admCollapsed.has(g.id) ? admCollapsed.delete(g.id) : admCollapsed.add(g.id); renderAdmin();
      admPanel.querySelector(`[data-gid="${g.id}"] [data-act="gfold"]`)?.focus(); }
    else if (act === "grename") { admRenaming = g.id; renderAdmin(); }
    else confirmGroupDelete(g);
    return;
  }
  const row = rowOf(btn);
  if (!row) return;
  const f = findSaying(admTab, row.dataset.id);
  if (act === "listen") { stopGroup(); audioUnlock(); stopSpeaking(); speak(f.item.text); }
  else if (act === "edit") { admEditing = f.item.id; admRenaming = null; renderAdmin(); }
  else if (act === "cancel") { admEditing = null; renderAdmin(); }
  else if (act === "save") saveEdit(row);
  else if (act === "retake") retake(f.item.text);
  else if (act === "delete") withUndo(`Gelöscht: ${short(f.item.text)}`, () => f.list.splice(f.index, 1), { danger: true });
});

// Gruppe löschen: erst rote Rückfrage (Inhaber), „Abbrechen“ ist vorausgewählt. Zur Wahl: nur auflösen (Sprüche bleiben
// ohne Gruppe stehen) oder die Gruppe mit allen Sprüchen löschen. Beides danach noch mit Rückgängig.
const confirmDlg = document.getElementById("confirmDlg");
let confirmGroup = null;
function confirmGroupDelete(g) {
  confirmGroup = g;
  const n = g.items.length;
  document.getElementById("cfTitle").textContent = `Gruppe „${g.name}“ wirklich löschen?`;
  document.getElementById("cfText").textContent = n
    ? `Die Gruppe enthält ${n === 1 ? "einen Spruch" : `${n} Sprüche`}. Gelöschte Sprüche werden nicht mehr vorgelesen.`
    : "Die Gruppe ist leer.";
  document.getElementById("cfDelete").textContent = n ? `Gruppe und ${n === 1 ? "den Spruch" : `alle ${n} Sprüche`} löschen` : "Gruppe löschen";
  document.getElementById("cfKeep").hidden = !n;
  confirmDlg.showModal();
  document.getElementById("cfCancel").focus();
}
document.getElementById("cfCancel").addEventListener("click", () => confirmDlg.close());
confirmDlg.addEventListener("close", () => {
  const g = confirmGroup;
  confirmGroup = null;
  if (g && findGroup(admTab, g.id)) setTimeout(() => admPanel.querySelector(`[data-gid="${g.id}"] [data-act="gdelete"]`)?.focus());
});
document.getElementById("cfKeep").addEventListener("click", () => {
  const g = confirmGroup;
  confirmDlg.close();
  withUndo(`Gruppe „${g.name}“ aufgelöst, ihre Sprüche stehen jetzt ohne Gruppe.`, () => {
    const top = sayings[admTab];
    top.splice(top.indexOf(g), 1, ...g.items);
  });
});
document.getElementById("cfDelete").addEventListener("click", () => {
  const g = confirmGroup;
  confirmDlg.close();
  withUndo(`Gruppe „${g.name}“ mit ${g.items.length === 1 ? "einem Spruch" : `${g.items.length} Sprüchen`} gelöscht.`, () => {
    const top = sayings[admTab];
    top.splice(top.indexOf(g), 1);
  }, { danger: true });
});

// Speichern beim Bearbeiten: Text, und falls gewählt eine andere Phase (dort ans Ende) oder eine andere Gruppe
function saveEdit(row) {
  const text = cleanText(row.querySelector("textarea").value);
  if (!text) { showToast("Ein leerer Spruch geht nicht. Zum Entfernen den Papierkorb nehmen."); return; }
  const f = findSaying(admTab, row.dataset.id);
  const toPhase = row.querySelector('[data-act="phase"]').value;
  const toGroup = row.querySelector('[data-act="group"]').value;
  admEditing = null;
  const sameGroup = (f.group?.id ?? "") === toGroup;
  if (text === f.item.text && toPhase === admTab && sameGroup) { renderAdmin(); return; }
  const msg = toPhase !== admTab ? `Verschoben nach „${phaseName(toPhase)}“.`
    : !sameGroup ? (toGroup ? `In Gruppe „${findGroup(admTab, toGroup).name}“ verschoben.` : "Aus der Gruppe genommen.") : "Spruch geändert.";
  withUndo(msg, () => {
    f.item.text = text;
    if (toPhase !== admTab) moveToPhase(f.item.id, admTab, toPhase);
    else if (!sameGroup) {
      const [item] = f.list.splice(f.index, 1);
      if (toGroup) findGroup(admTab, toGroup).items.push(item);
      else {   // aus der Gruppe heraus: direkt hinter die Gruppe
        const top = sayings[admTab];
        top.splice(top.indexOf(f.group) + 1, 0, item);
      }
    }
  });
}
admPanel.addEventListener("submit", e => {
  e.preventDefault();
  const rename = e.target.closest(".adm-rename");
  if (rename) {
    const g = findGroup(admTab, rename.dataset.gid);
    const name = cleanText(rename.querySelector("input").value, GROUP_NAME_MAX);
    admRenaming = null;
    if (!name || name === g.name) { renderAdmin(); return; }
    withUndo(`Gruppe umbenannt in „${name}“.`, () => { g.name = name; });
    admPanel.querySelector(`[data-gid="${g.id}"] [data-act="gfold"]`)?.focus();
    return;
  }
  const field = document.getElementById("admNew");
  const text = cleanText(field.value);
  if (!text) { showToast("Bitte zuerst einen Spruch eingeben."); field.focus(); return; }
  const gid = document.getElementById("admNewGroup")?.value;
  const item = { id: newId(admTab.slice(0, 3)), text, active: true };
  (gid ? findGroup(admTab, gid).items : sayings[admTab]).push(item);
  if (gid) admCollapsed.delete(gid);
  changed();
  if (gid) document.getElementById("admNewGroup").value = gid;
  document.getElementById("admNew").focus();
  admPanel.querySelector(`[data-id="${item.id}"]`)?.scrollIntoView({ block: "nearest" });
  showToast(gid ? `Hinzugefügt, am Ende der Gruppe „${findGroup(admTab, gid).name}“.` : "Hinzugefügt, am Ende der Liste.");
});
admPanel.addEventListener("keydown", e => {
  const ta = e.target.closest(".adm-edit textarea");
  if (ta && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(rowOf(ta)); }
  const nw = e.target.closest("#admNew");
  if (nw && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); nw.form.requestSubmit(); }
});
admPanel.addEventListener("change", e => {
  const act = e.target.dataset.act;
  if (act === "toggle") {
    const f = findSaying(admTab, rowOf(e.target).dataset.id);
    f.item.active = e.target.checked;
    changed();
    admPanel.querySelector(`[data-id="${f.item.id}"] [data-act="toggle"]`)?.focus();
  } else if (act === "gtoggle") {
    const g = findGroup(admTab, cardOf(e.target).dataset.gid);
    g.active = e.target.checked;
    changed();
    admPanel.querySelector(`[data-gid="${g.id}"] [data-act="gtoggle"]`)?.focus();
  } else if (act === "sound-toggle") {
    const id = e.target.closest("[data-sound-id]").dataset.soundId;
    soundsOn[id] = e.target.checked;
    if (!e.target.checked && ambience?.id === id && state.sound !== id) stopAmbience(.5);
    changed();
    admPanel.querySelector(`[data-sound-id="${id}"] [data-act="sound-toggle"]`)?.focus();
  }
});

// ---------- Verschieben ----------
// Pfeiltasten auf dem Griff: eine Stelle hoch oder runter. Ein Spruch am Rand seiner Gruppe verlässt sie
// (landet direkt davor bzw. dahinter); in eine Gruppe hinein geht es per Ziehen oder beim Bearbeiten.
// Eine Gruppe springt an Sprüchen und anderen Gruppen vorbei.
admPanel.addEventListener("keydown", e => {
  const h = e.target.closest('[data-act="drag"], [data-act="gdrag"]');
  if (!h || !["ArrowUp", "ArrowDown"].includes(e.key)) return;
  e.preventDefault();
  const up = e.key === "ArrowUp", top = sayings[admTab];
  let focusSel;
  if (h.dataset.act === "gdrag") {
    const g = findGroup(admTab, cardOf(h).dataset.gid), k = top.indexOf(g), j = k + (up ? -1 : 1);
    if (j < 0 || j >= top.length) return;
    [top[k], top[j]] = [top[j], top[k]];
    focusSel = `[data-gid="${g.id}"] [data-act="gdrag"]`;
  } else {
    const f = findSaying(admTab, rowOf(h).dataset.id), j = f.index + (up ? -1 : 1);
    if (j >= 0 && j < f.list.length) [f.list[f.index], f.list[j]] = [f.list[j], f.list[f.index]];
    else if (f.group) { f.list.splice(f.index, 1); top.splice(top.indexOf(f.group) + (up ? 0 : 1), 0, f.item); }
    else return;
    focusSel = `[data-id="${f.item.id}"] [data-act="drag"]`;
  }
  changed();
  admPanel.querySelector(focusSel)?.focus();
});

// Ziehen mit Maus oder Finger. Die Zeile bzw. Karte wandert in der Liste mit, sobald sie über die Mitte eines
// Nachbarn kommt; ein Spruch kann so auch in eine Gruppe hinein (über ihrem Kopf oder ihren Sprüchen) und wieder
// heraus. Am Rand rollt die Liste mit. Auf einen anderen Phasen-Reiter gezogen (er leuchtet auf), wandert der Spruch
// oder die ganze Gruppe ans Ende jener Phase (Inhaber). Losgelassen wird die neue Anordnung aus der Liste übernommen.
// Bewegungen und Loslassen kommen von der ganzen Seite, nicht vom Griff: Beim Umhängen der Zeile in der Liste löst
// der Browser sie kurz heraus und vergisst dabei, dass der Zeiger am Griff „festgehalten“ war (Fehler, den der Inhaber
// bemerkt hat: mit echter Maus oder echtem Finger ging die Reihenfolge nicht zu ändern).
// Das eingebaute Ziehen & Ablegen des Browsers (Text oder Zeile greifen) bräche unser Ziehen mit „pointercancel“
// ab; im Admin-Bereich gibt es nur unser eigenes Ziehen. mousedown am Griff: sonst markiert der Browser Text.
admPanel.addEventListener("dragstart", e => e.preventDefault());
admPanel.addEventListener("mousedown", e => { if (e.target.closest('[data-act="drag"], [data-act="gdrag"]')) e.preventDefault(); });
admPanel.addEventListener("pointerdown", e => {
  if (e.button > 0) return;   // nur linke Maustaste bzw. Finger
  const h = e.target.closest('[data-act="drag"], [data-act="gdrag"]');
  if (!h) return;
  e.preventDefault();
  const isCard = h.dataset.act === "gdrag";
  const el = isCard ? cardOf(h) : rowOf(h);
  const list = document.getElementById("admList");
  const pid = e.pointerId;
  el.classList.add("dragging");
  document.body.classList.add("adm-dragging");   // kein Markieren von Text während des Ziehens
  let lastX = e.clientX, lastY = e.clientY, scroller = null, dropTab = null;
  const mid = n => { const b = n.getBoundingClientRect(); return b.top + b.height / 2; };
  const place = (target, after) => target.parentElement.insertBefore(el, after ? target.nextSibling : target);
  const move = ev => {
    lastX = ev.clientX ?? lastX;
    lastY = ev.clientY;
    const hit = document.elementFromPoint(lastX, lastY);
    const tab = hit?.closest?.("[data-tab]");
    const target = tab && PHASES.some(p => p.id === tab.dataset.tab) && tab.dataset.tab !== admTab ? tab : null;
    if (target !== dropTab) { dropTab?.classList.remove("drop"); target?.classList.add("drop"); dropTab = target; }
    el.classList.toggle("over-tab", !!dropTab);
    clearInterval(scroller);
    if (tab) return;   // über den Reitern: Liste nicht umsortieren
    if (hit && !el.contains(hit) && admPanel.contains(hit)) {
      if (isCard) {
        const other = hit.closest("#admList > li");
        if (other && other !== el) place(other, lastY > mid(other));
      } else {
        const row = hit.closest(".adm-row[data-id]");
        const head = hit.closest(".adm-group-head");
        const hint = hit.closest(".adm-drop-hint");
        if (row && row !== el) place(row, lastY > mid(row));
        else if (hint) hint.replaceWith(el);
        else if (head) {   // auf den Kopf einer Gruppe: aufklappen und als ersten Spruch hinein
          const card = head.parentElement;
          if (admCollapsed.delete(card.dataset.gid)) card.classList.remove("collapsed");
          const inner = card.querySelector(".adm-group-list");
          inner.querySelector(".adm-drop-hint")?.remove();
          if (lastY < mid(head) && card.parentElement === list) place(card, false);   // obere Hälfte: vor die Gruppe
          else inner.prepend(el);
        }
      }
      const last = list.lastElementChild;
      if (last && last !== el && lastY > last.getBoundingClientRect().bottom) list.append(el);
    }
    const box = admPanel.getBoundingClientRect();
    const dir = lastY < box.top + 40 ? -1 : lastY > box.bottom - 40 ? 1 : 0;
    if (dir) scroller = setInterval(() => { admPanel.scrollBy(0, dir * 8); move({ clientX: lastX, clientY: lastY }); }, 30);
  };
  const onMove = ev => { if (ev.pointerId === pid) { ev.preventDefault(); move(ev); } };
  const up = ev => {
    if (ev.pointerId !== pid) return;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", up);
    if (ev.type === "pointerup") move(ev);   // die Stelle beim Loslassen zählt
    clearInterval(scroller);
    document.body.classList.remove("adm-dragging");
    el.classList.remove("dragging", "over-tab");
    const id = isCard ? el.dataset.gid : el.dataset.id;
    if (dropTab) {
      const to = dropTab.dataset.tab;
      dropTab.classList.remove("drop");
      withUndo(`${isCard ? "Gruppe" : "Spruch"} verschoben nach „${phaseName(to)}“.`, () => moveToPhase(id, admTab, to));
      return;
    }
    // Neue Anordnung aus der Liste lesen
    const byId = Object.fromEntries(allSayings(admTab).map(s => [s.id, s]));
    const groups = Object.fromEntries(groupsOf(admTab).map(g => [g.id, g]));
    const next = [...list.children].flatMap(li => li.dataset.gid
      ? [{ ...groups[li.dataset.gid], items: [...li.querySelectorAll(".adm-group-list > [data-id]")].map(r => byId[r.dataset.id]) }]
      : li.dataset.id ? [byId[li.dataset.id]] : []);
    const ids = l => JSON.stringify(l.map(x => isGroup(x) ? [x.id, x.items.map(i => i.id)] : x.id));
    if (ids(next) !== ids(sayings[admTab])) withUndo("Reihenfolge geändert.", () => { sayings[admTab] = next; });
    else renderAdmin();
    admPanel.querySelector(isCard ? `[data-gid="${id}"] [data-act="gdrag"]` : `[data-id="${id}"] [data-act="drag"]`)?.focus({ preventScroll: true });
  };
  document.addEventListener("pointermove", onMove, { passive: false });
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", up);
});

// ---------- Für alle veröffentlichen ----------
// Wie im Retro-Cockpit: Der Admin-Helfer zeigt erst, was sich gegenüber der veröffentlichten Fassung ändert; nach
// „Ja“ prüft er, speichert in seiner eigenen Kopie des Originals und lädt hoch (werkzeuge/admin_helfer.py).
// Während des Hochladens bleibt das Fenster offen (busy).
const publishDlg = document.getElementById("publishDlg");
const pubBody = document.getElementById("pubBody");
const pubYes = document.getElementById("pubYes"), pubNo = document.getElementById("pubNo");
const changeList = list => `<ul class="pub-list">${list.map(z => `<li>${esc(z)}</li>`).join("")}</ul>`;
// Erst alles speichern, was noch in der Warteschlange steht: veröffentlicht wird der gespeicherte Stand
async function flushSave() {
  if (!unsaved) return true;
  clearTimeout(saveTimer);
  clearTimeout(pauseSaveTimer);
  await saveNow();
  return !unsaved;
}
function pubMessage(html, close = "Schließen") {
  pubBody.innerHTML = html;
  pubYes.hidden = true;
  pubNo.textContent = close;
}
document.getElementById("publishBtn").addEventListener("click", async () => {
  if (recState.veroeffentlichen?.zustand === "laeuft") { showToast("Wird gerade veröffentlicht …"); return; }
  publishDlg.showModal();
  if (recState.veroeffentlichen?.zustand === "wartet") {   // Auftrag wartet auf die Vertonung: abbrechen?
    pubMessage(`<p>Wird veröffentlicht, sobald die Vertonung fertig ist${recState.rest ? ` (noch ${fmtWait(recState.rest)})` : ""}.
      Du kannst den Admin-Bereich schließen; der Helfer erledigt es auch dann.</p>`, "Weiter warten");
    pubYes.textContent = "Nicht veröffentlichen";
    pubYes.dataset.mode = "cancel";
    pubYes.hidden = false;
    return;
  }
  pubMessage("<p>Ich vergleiche mit der veröffentlichten Fassung …</p>", "Abbrechen");
  if (!(await checkHelper())) {
    pubMessage(`<p class="pub-warn">Der Admin-Helfer läuft nicht. Er startet beim Anmelden von selbst; bitte über
      <b>http://localhost:8766/</b> öffnen.</p>`);
    return;
  }
  if (!(await flushSave())) {
    pubMessage(`<p class="pub-warn">Die letzte Änderung ist noch nicht gespeichert (siehe roter Hinweis). Veröffentlicht wird nur
      der gespeicherte Stand.</p>`);
    return;
  }
  try {
    const r = await recCall("api/vorschau", { defaults: DEFAULT_SAYINGS });
    if (!r.ok) { pubMessage(`<p class="pub-warn">${esc(r.fehler)}</p>`); return; }
    if (!r.aenderungen.length) { pubMessage("<p>Alles ist schon veröffentlicht, es gibt nichts Neues.</p>"); return; }
    const wait = r.fehlend > 0 || r.vertonung;
    pubBody.innerHTML = `<p>Diese Änderungen gehen an alle (online; GitHub Pages zeigt sie nach 1 bis 10 Minuten):</p>
      ${changeList(r.aenderungen)}${wait ? `<p class="pub-note">${r.fehlend ? `${nSayings(r.fehlend)} ${r.fehlend === 1 ? "ist" : "sind"}
      noch nicht vertont.` : "Die Vertonung läuft noch."} Veröffentlicht wird erst, wenn alles vertont ist, dann von selbst. Kommen bis
      dahin weitere Änderungen dazu, gehen sie mit.</p>` : ""}`;
    pubYes.textContent = wait ? "Veröffentlichen, sobald vertont" : "Ja, für alle veröffentlichen";
    pubYes.dataset.mode = "go";
    pubYes.hidden = false;
    pubYes.focus();
  } catch {
    pubMessage(`<p class="pub-warn">Der Admin-Helfer antwortet nicht.</p>`);
  }
});
pubYes.addEventListener("click", async () => {
  pubYes.hidden = true;
  try {
    if (pubYes.dataset.mode === "cancel") {
      await recCall("api/veroeffentlichen-abbrechen");
      publishDlg.close();
      showToast("Nicht veröffentlicht. Gespeichert ist alles; du kannst es später veröffentlichen.");
    } else {
      const r = await recCall("api/veroeffentlichen", { defaults: DEFAULT_SAYINGS });
      if (!r.ok) throw new Error(r.fehler);
      publishDlg.close();
      pubSeen = "wartet";   // das Ergebnis meldet die Statuszeile
    }
    refreshStatus();
  } catch (e) {
    pubMessage(`<p class="pub-warn">${esc(e.message || "Der Admin-Helfer antwortet nicht.")}</p>`);
  }
});
pubNo.addEventListener("click", () => publishDlg.close());

// „Neu sprechen“ (beim Bearbeiten, nur Chatterbox): Die Stimme spricht den Spruch noch einmal, etwas anders betont. Bis
// die neue Aufnahme fertig ist, gilt die bisherige.
async function retake(text) {
  admEditing = null;
  renderAdmin();
  try {
    const r = await recCall("api/neu-sprechen", { text });
    if (!r.ok) throw new Error(r.fehler);
    showToast(r.angehalten ? "Vorgemerkt. Die Vertonung ist abgebrochen; mit „Fortsetzen“ oben wird er neu gesprochen."
      : "Wird neu gesprochen (etwa eine Minute je Satz). Danach mit ▶ anhören; gefällt es nicht, noch einmal.", null, { long: true });
    refreshStatus();
  } catch (e) { showToast(`Neu sprechen ging nicht: ${e.message || "Helfer antwortet nicht"}`, null, { danger: true }); }
}

// ---------- Liegengebliebener Entwurf ----------
// Liegt im Browser ein Stand, der nie gespeichert wurde (Helfer lief nicht, Seite geschlossen …), und weicht er vom
// gespeicherten ab: rot anbieten, ihn wiederherzustellen. Gleich er dem gespeicherten, ist er erledigt.
const sameContent = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function offerDraft() {
  const d = readDraft();
  if (!d || (sameContent(d.sayings, sayings) && sameContent(d.soundsOn, soundsOn) && sameContent(d.settings ?? settings, settings))) {
    if (d && !unsaved) dropDraft();
    return;
  }
  if (unsaved) return;   // gehört zur laufenden Sitzung, wird gerade gespeichert
  const when = new Date(d.at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  showAlert(`Im Browser liegt ein nicht gespeicherter Stand vom ${when}. Wiederherstellen? Er ersetzt dann den ` +
    "gespeicherten Stand (der wird vorher gesichert).", true);
}
document.getElementById("admAlertRestore").addEventListener("click", () => {
  const d = readDraft();
  if (!d) { showAlert(""); return; }
  const before = JSON.stringify({ sayings, soundsOn });
  sayings = cleanSayings(d.sayings);
  soundsOn = cleanSounds(d.soundsOn);
  if (d.settings) settings = cleanSettings(d.settings);
  showAlert("");
  changed();
  showToast("Nicht gespeicherten Stand wiederhergestellt.", () => {
    const b = JSON.parse(before); sayings = b.sayings; soundsOn = b.soundsOn; changed();
  });
});
document.getElementById("admAlertDrop").addEventListener("click", () => { dropDraft(); showAlert(""); });
document.getElementById("admAlertReload").addEventListener("click", () => { unsaved = false; location.reload(); });

// ---------- Frühere Stände ----------
// Sicherungen vom Admin-Helfer (bei jedem Speichern). Wiederherstellen schreibt config.js; danach lädt die App den
// Stand neu (gleiche Prüfung wie beim Start).
const backupDlg = document.getElementById("backupDlg");
async function reloadConfig() {
  const js = await fetch(`config.js?t=${Date.now()}`, { cache: "no-store" }).then(r => r.text());
  const m = /window\.MEDITATION_CONFIG\s*=\s*([\s\S]*);\s*$/.exec(js);
  const data = m ? JSON.parse(m[1]) : null;
  sayings = cleanSayings(data?.sayings ?? DEFAULT_SAYINGS);
  soundsOn = cleanSounds(data?.sounds);
  settings = cleanSettings(data?.settings);
  dropDraft();
  render();
  renderAdmin();
}
async function openBackups() {
  const list = document.getElementById("bkList");
  list.innerHTML = "<li>Lädt …</li>";
  backupDlg.showModal();
  try {
    const r = await recCall("api/sicherungen");
    list.innerHTML = r.sicherungen.length ? r.sicherungen.map(b =>
      `<li><span><b>${esc(b.zeit)}</b><br><span class="adm-hint">${esc(b.inhalt)}</span></span>
        <button class="btn sm" data-file="${esc(b.datei)}">Wiederherstellen</button></li>`).join("")
      : "<li>Noch keine Sicherungen. Sie entstehen ab jetzt bei jedem Speichern.</li>";
  } catch { list.innerHTML = '<li class="pub-warn">Der Admin-Helfer antwortet nicht.</li>'; }
}
document.getElementById("bkList").addEventListener("click", async e => {
  const b = e.target.closest("[data-file]");
  if (!b) return;
  b.disabled = true;
  try {
    const r = await fetch("api/wiederherstellen", { method: "POST", headers: { "Content-Type": "application/json", "X-Meditation": "1" },
      body: JSON.stringify({ datei: b.dataset.file }) }).then(x => x.json());
    if (!r.ok) throw new Error(r.fehler);
    configStand = r.stand;
    await reloadConfig();
    backupDlg.close();
    showToast("Früheren Stand wiederhergestellt. Der Stand davor ist ebenfalls gesichert.");
    refreshStatus();
  } catch (err) { b.disabled = false; showToast(`Wiederherstellen ging nicht: ${err.message || "Helfer antwortet nicht"}`, null, { danger: true }); }
});
document.getElementById("bkClose").addEventListener("click", () => backupDlg.close());
