// Meditation – Phasen der Meditation (reine Daten).
// Teil der App in js/: klassische Skripte, die sich einen gemeinsamen Gültigkeitsbereich teilen und in der
// Reihenfolge aus index.html geladen werden (Phasen zuerst, Start zuletzt). Übersicht: CLAUDE.md, „Aufbau“.

// ---------- Phasen ----------
// Reihenfolge = Ablauf der Meditation, immer gleich (Inhaber). Jede Phase lässt sich an- und abwählen.
//   share  Anteil an der Gesamtdauer beim automatischen Verteilen
const PHASES = [
  { id: "einstimmung", name: "Einstimmung", short: "Einstimmung", share: .15 },
  { id: "bodyscan", name: "Bodyscan", short: "Bodyscan", share: .25 },
  { id: "kraftort", name: "Kraftort", short: "Kraftort", share: .2 },
  { id: "unterbewusst", name: "Die Arbeit im Unterbewussten", short: "Unterbewusstes", share: .3 },
  { id: "rueckkehr", name: "Rückkehr", short: "Rückkehr", share: .1 },
];

// Alles in 1-Minuten-Schritten (Inhaber, Oktober 2026): Skala für die Gesamtdauer, automatische Verteilung und die
// Griffe im Zeitbalken; jede Phase, die dabei ist, mindestens 1 Minute.
const STEP = 1;
const GRIP_STEP = 1;
const DURATION_MIN = 5, DURATION_MAX = 90, DURATION_DEFAULT = 20;
const PHASE_MIN = 1;

// Hintergrundklang (leise Natur), Auswahl über den Knopf neben den Minuten
const SOUNDS = [
  { id: "regen", name: "Regen", icon: "regen" },
  { id: "wald", name: "Wald", icon: "wald" },
  { id: "wind", name: "Wind", icon: "wind" },
  { id: "meer", name: "Meer", icon: "meer" },
  { id: "aus", name: "Aus", icon: "aus" },
];
