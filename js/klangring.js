// Meditation – Klangring: eine feine Kreislinie in der Meditations-Ansicht, die sich mit der Stimme verformt
// (Wahl des Inhabers, Variante B, Oktober 2026). Tiefe Töne wölben sie unten, hohe oben, lauter heißt stärker.
// Teil der App in js/: klassische Skripte, die sich einen gemeinsamen Gültigkeitsbereich teilen und in der
// Reihenfolge aus index.html geladen werden. Übersicht: CLAUDE.md, „Aufbau“.
//
// Schonend: Gezeichnet wird nur, solange die Stimme klingt (requestAnimationFrame, im gesperrten Bildschirm und im
// Hintergrund hält der Browser das an). In der Stille bleibt ein ruhiger Ring stehen, der wie bisher atmet (CSS).
// Gemessen wird nur die Stimme (voiceAnalyser in js/stimme.js), in drei Lagen: tief 80–300 Hz, mittel 300–1200 Hz,
// hoch 1200–4000 Hz. Bei „Bewegung reduzieren“ bleibt der bisherige ruhige Kreis (.s-orb).
const ringCanvas = document.getElementById("sRing");
const ringMotion = !matchMedia("(prefers-reduced-motion: reduce)").matches && !!ringCanvas?.getContext;
const ringLevel = { v: 0, lo: 0, mi: 0, hi: 0 };
let ringFrame = 0, ringStill = 0, ringBins = null, ringColor = "#d9b47a";
if (ringMotion) sessionDlg.classList.add("has-ring");

function ringSize() {
  const css = ringCanvas.getBoundingClientRect().width || 300;
  const px = Math.round(css * Math.min(2, window.devicePixelRatio || 1));
  if (ringCanvas.width !== px) { ringCanvas.width = ringCanvas.height = px; }
  return px;
}
function ringBands() {
  if (!voiceAnalyser || audioCtx?.state !== "running") return { v: 0, lo: 0, mi: 0, hi: 0 };
  ringBins ??= new Uint8Array(voiceAnalyser.frequencyBinCount);
  voiceAnalyser.getByteFrequencyData(ringBins);
  const hz = audioCtx.sampleRate / voiceAnalyser.fftSize;
  // Je Lage eigener Grundpegel und Spielraum (gemessen an „Helmut“, Oktober 2026: tief meist 210/255, mittel 130,
  // hoch 115), damit jede Lage etwa gleich ausschlägt; leise Reste fallen weg
  const band = (a, b, boden, spanne) => {
    let sum = 0, n = 0;
    for (let k = Math.max(1, Math.round(a / hz)); k <= Math.round(b / hz); k++) { sum += ringBins[k]; n++; }
    return Math.max(0, Math.min(1, (sum / Math.max(1, n) - boden) / spanne));
  };
  const lo = band(80, 300, 100, 180), mi = band(300, 1200, 50, 140), hi = band(1200, 4000, 45, 120);
  return { v: Math.max(lo, mi, hi), lo, mi, hi };
}
function ringDraw() {
  const px = ringSize(), x = ringCanvas.getContext("2d"), c = px / 2, base = px * .36, t = performance.now() / 1000;
  x.clearRect(0, 0, px, px);
  x.beginPath();
  for (let i = 0; i <= 72; i++) {
    const a = i / 72 * Math.PI * 2, oben = (1 - Math.cos(a)) / 2;
    const lage = ringLevel.lo * (1 - oben) + ringLevel.hi * oben;
    const welle = Math.sin(a * 6 + t * 2) * .5 + Math.sin(a * 3 - t * 1.3) * .5;
    const r = base + px * (.065 * lage * (1 + .35 * welle) + .015 * ringLevel.mi);
    i ? x.lineTo(c + Math.sin(a) * r, c + Math.cos(a) * r) : x.moveTo(c + Math.sin(a) * r, c + Math.cos(a) * r);
  }
  x.closePath();
  x.strokeStyle = x.fillStyle = x.shadowColor = ringColor;
  x.lineWidth = px * .008;
  x.shadowBlur = px * (.03 + .06 * ringLevel.v);
  x.globalAlpha = .55 + .4 * ringLevel.v;
  x.stroke();
  x.shadowBlur = 0;
  x.globalAlpha = .05 + .07 * ringLevel.v;
  x.fill();
  x.globalAlpha = 1;
}
function ringTick() {
  ringFrame = 0;
  if (!sessionDlg.open) return;
  const b = ringBands();
  for (const k in ringLevel) ringLevel[k] += (b[k] - ringLevel[k]) * .14;   // weich nachgeführt, ruhig
  ringDraw();
  ringStill = ringLevel.v < .01 && b.v === 0 ? ringStill + 1 : 0;
  if (ringStill < 45) ringFrame = requestAnimationFrame(ringTick);   // nach ~0,75 s Stille: Ring steht, nichts rechnet
}
// Aufwecken: beim Sprechen (js/stimme.js), beim Öffnen der Ansicht und wenn sich die Phasenfarbe ändert
window.klangringWecken = () => {
  if (!ringMotion || !sessionDlg.open) return;
  ringColor = getComputedStyle(sessionDlg).getPropertyValue("--ct").trim() || ringColor;
  ringStill = 0;
  if (!ringFrame) ringFrame = requestAnimationFrame(ringTick);
};
