// Meditation – Offline-Kopie anmelden und die App starten (läuft zuletzt).
// Teil der App in js/: klassische Skripte, die sich einen gemeinsamen Gültigkeitsbereich teilen und in der
// Reihenfolge aus index.html geladen werden (Phasen zuerst, Start zuletzt). Übersicht: CLAUDE.md, „Aufbau“.

// ---------- Offline-Kopie (Service Worker, siehe sw.js) ----------
// Veröffentlicht: Die App legt ihre Dateien auf dem Gerät ab und ist so installierbar und offline nutzbar.
// Eine neue Version wird nie automatisch geladen (das könnte eine laufende Meditation unterbrechen):
// Die App zeigt „Neue Version verfügbar“, erst „Neu laden“ übernimmt sie.
// Lokal bewusst ohne Offline-Kopie, damit jede Änderung sofort sichtbar ist.
const updateBar = document.getElementById("updateBar");
document.getElementById("updateLater").addEventListener("click", () => { updateBar.hidden = true; });
if ("serviceWorker" in navigator) {
  if (IS_LOCAL) {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
  } else {
    let wantReload = false;   // nur nach Klick neu laden, nicht schon beim allerersten Einrichten
    const offer = worker => {
      updateBar.hidden = false;
      document.getElementById("updateReload").onclick = () => { wantReload = true; worker.postMessage("aktivieren"); };
    };
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (wantReload) location.reload(); });
    navigator.serviceWorker.register("sw.js").then(reg => {
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) offer(w);
        });
      });
      // Bleibt die App lange offen: beim Zurückkehren nach einer neuen Version schauen
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
    }).catch(() => {});   // z. B. im privaten Modus mancher Browser: dann eben ohne Offline-Kopie
  }
}

// Zeit nach Anteilen verteilen und anzeigen; gemischt wird erst beim Starten
distribute();
render();
updateVoiceNote();
