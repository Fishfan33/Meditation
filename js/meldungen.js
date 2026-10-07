// Meditation – kurze Meldungen.
// Teil der App in js/: klassische Skripte, die sich einen gemeinsamen Gültigkeitsbereich teilen und in der
// Reihenfolge aus index.html geladen werden (Phasen zuerst, Start zuletzt). Übersicht: CLAUDE.md, „Aufbau“.

// ---------- Meldungen ----------
// Die Meldung sitzt im offenen Fenster, sonst auf der Seite: Ein offenes <dialog> verdeckt alles außerhalb.
// Statt „Bist du sicher?“: sofort ausführen und kurz „Rückgängig“ anbieten (wie im Retro-Cockpit).
// Nach dem Löschen (`danger`) ist die Meldung rot und bleibt länger stehen, damit „Rückgängig“ auffällt (Inhaber).
let toastTimer, undoFn = null;
function showToast(msg, undo = null, { danger = false, long = false } = {}) {
  const t = document.getElementById("toast");
  const host = [...document.querySelectorAll("dialog[open]")].at(-1) || document.body;
  if (t.parentElement !== host) host.append(t);
  document.getElementById("toastMsg").textContent = msg;
  document.getElementById("toastUndo").hidden = !undo;
  undoFn = undo;
  t.classList.toggle("danger", danger);
  t.setAttribute("role", danger ? "alert" : "status");
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove("show"); undoFn = null; }, danger || long ? 10000 : undo ? 8000 : 5000);
}
document.getElementById("toastUndo").addEventListener("click", () => {
  const fn = undoFn;
  undoFn = null;
  document.getElementById("toast").classList.remove("show");
  fn?.();
});
