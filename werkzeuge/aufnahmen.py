#!/usr/bin/env python3
"""Nimmt alle Sätze der App mit der gewählten Stimme auf (offline auf dem Rechner des Inhabers).

    python3 werkzeuge/aufnahmen.py

Stimme: im Admin-Bereich unter „Einstellungen“ gewählt (config.js settings.stimme: Programm, Stimme, Tempo); ohne
Angabe Piper „Thorsten“, etwas langsamer (Wahl des Inhabers „A2“, Oktober 2026). Die Programme und Stimmen stehen in
werkzeuge/stimmen.json, gesprochen wird mit werkzeuge/sprecher.py in der Python-Umgebung des Programms.

Ablauf (so schnell wie möglich, Wunsch des Inhabers):
- Die Sätze kommen aus config.js (Fassung des Inhabers aus dem Admin-Bereich, auch deaktivierte Sprüche; der
  Admin-Helfer hat sie mit denselben Regeln wie die App geprüft). Nur ohne config.js lädt Chromium den Grundbestand
  aus der App selbst (phasen.js, texte.js, zustand.js).
- Jeder Satz wird einmal gesprochen und als Rohaufnahme zwischengespeichert (~/.local/share/meditation-app/
  rohaufnahmen/<programm>-<stimme>/). Neu gesprochen wird nur, was es für diese Stimme noch nicht gibt: ein neuer
  oder geänderter Satz, oder eine Stimme, die noch nie benutzt wurde. Zurück zu einer früheren Stimme geht schnell.
  Rohaufnahmen werden nie gelöscht: Rückgängig oder ein früherer Stand brauchen so keine neue Vertonung (bei
  Chatterbox kostet jeder Satz etwa eine Minute).
- Vor jedem Satz liest das Werkzeug die Texte neu (Admin-Bereich, Oktober 2026): Was inzwischen geändert oder
  gelöscht wurde, wird nicht mehr gesprochen, Neues kommt gleich dran. Sätze aktiver Sprüche zuerst.
- „Neu sprechen“ (Admin-Bereich, bei Chatterbox): In neu.json im Ordner der Rohaufnahmen zählt je Satz eine Variante
  hoch. Sie steckt im Zufall des Sprachprogramms und in den Dateinamen, also entsteht eine neue Aufnahme.
- Aus der Rohaufnahme wird die MP3 für die App: Tempo (tonhöhenerhaltend, ohne neu zu sprechen), Stille am Anfang
  und Ende entfernt, Lautstärke angeglichen, nach stimme/<prüfsumme>.mp3. Der Name hängt an Text, Stimme und Tempo.
- Die Pause zwischen den Sätzen setzt die App beim Abspielen ein; dafür muss nichts neu aufgenommen werden.
- Erst wenn alles fertig ist, wird die Liste ausgetauscht und alte Aufnahmen gelöscht: Bis dahin spricht die App
  mit der bisherigen Stimme weiter. Bricht ein Durchgang ab, geht der nächste dort weiter (Zwischenspeicher).
- js/aufnahmen.js bekommt die Liste (Spruch → seine Sätze mit Datei und Länge), sw.js die Dateien für die Offline-Kopie.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sprecher import PARAMETER, katalog, python_fuer  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "stimme"
# Für Tests ein eigener Zwischenspeicher (MEDITATION_ROH), damit sie den echten nicht füllen
ROH = Path(os.environ.get("MEDITATION_ROH") or Path.home() / ".local/share/meditation-app/rohaufnahmen")
PHASEN = ["einstimmung", "bodyscan", "kraftort", "unterbewusst", "rueckkehr"]   # wie PHASES in js/phasen.js
TEMPO_MIN, TEMPO_MAX = 0.8, 1.2   # wie in js/zustand.js
PROTOKOLL = Path.home() / ".local/share/meditation-app/sprecher.log"
STANDARD = {"programm": "piper", "stimme": "thorsten", "tempo": 1.0}
# Bisherige Dateinamen der ersten Stimme (Piper Thorsten A2), damit vorhandene Aufnahmen gültig bleiben
ALT_SETTINGS = "thorsten-high|1.25|0.7|v1"


def texte_lesen(root=None):
    """Alle Sprüche in der Reihenfolge der App, ohne Doppelte, als [(Text, aktiv)], und die gewählte Stimme. Aus
    config.js (schnell, wird vor jedem Satz neu gelesen); ohne config.js der Grundbestand über Chromium."""
    root = Path(root or ROOT)
    daten = None
    try:
        m = re.search(r"window\.MEDITATION_CONFIG\s*=\s*(.*);\s*$", (root / "config.js").read_text(encoding="utf-8"), re.S)
        daten = json.loads(m.group(1)) if m else None
    except (OSError, ValueError):
        pass
    if not isinstance(daten, dict) or not isinstance(daten.get("sayings"), dict):
        texte, wahl = texts_from_app()
        return [(t, True) for t in texte], wahl
    eintraege = {}
    for p in PHASEN:
        for e in daten["sayings"].get(p) or []:
            gruppe = isinstance(e, dict) and isinstance(e.get("items"), list)
            for x in e["items"] if gruppe else [e]:
                if isinstance(x, dict) and isinstance(x.get("text"), str) and x["text"].strip():
                    aktiv = x.get("active") is not False and (not gruppe or e.get("active") is not False)
                    eintraege[x["text"]] = eintraege.get(x["text"], False) or aktiv
    return list(eintraege.items()), {**STANDARD, **(((daten.get("settings") or {}).get("stimme")) or {})}


def texts_from_app():
    """Alle Sprüche und die Einstellungen, so wie die App sie kennt: Fassung des Inhabers aus config.js (sonst der
    Grundbestand aus texte.js), geprüft mit denselben Funktionen wie in der App (cleanSayings, cleanSettings in
    js/zustand.js). Auch deaktivierte Sprüche, damit späteres Einschalten keine neue Aufnahme braucht. Reihenfolge wie
    in der App, ohne Doppelte."""
    skripte = "".join(f'<script src="{(ROOT / f).as_uri()}"></script>'
                      for f in ["js/phasen.js", "js/texte.js", "config.js", "js/zustand.js"])
    page = (f'<!doctype html><meta charset="utf-8">{skripte}<pre id="o"></pre>'
            '<script>o.textContent = JSON.stringify({ texte: PHASES.flatMap(p => allSayings(p.id).map(s => s.text)),'
            ' stimme: settings.stimme })</script>')
    with tempfile.TemporaryDirectory() as tmp:
        f = Path(tmp, "t.html")
        f.write_text(page)
        dom = subprocess.run(["chromium", "--headless=new", "--disable-gpu", "--allow-file-access-from-files",
                              "--dump-dom", f.as_uri()], check=True, capture_output=True, text=True).stdout
    raw = re.search(r'<pre id="o">(.*?)</pre>', dom, re.S).group(1)
    raw = raw.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&amp;", "&")
    daten = json.loads(raw)
    texte = list(dict.fromkeys(daten["texte"]))
    if not texte:
        sys.exit("Keine Sprüche gefunden – lädt die App ihre Texte?")
    return texte, {**STANDARD, **(daten.get("stimme") or {})}


# Jeder Satz wird einzeln aufgenommen; die App setzt die Sätze eines Spruchs beim Abspielen mit der im Admin-Bereich
# eingestellten Pause zusammen (eine Einstellung für alle Pausen, Wunsch des Inhabers, Oktober 2026). So wirkt eine
# geänderte Pause sofort, ohne neue Aufnahmen. Getrennt wird nach . ! ? …, wenn danach ein Großbuchstabe, eine Ziffer
# oder ein Anführungszeichen kommt; nach Abkürzungen wie „z. B.“ nicht.
SATZENDE = re.compile(r"(?<=[.!?…])\s+(?=[A-ZÄÖÜ0-9„\"'(])")
ABKUERZUNGEN = ("z.", "d.", "u.", "bzw.", "ca.", "Nr.", "vgl.", "usw.", "etc.", "Dr.", "St.")


def saetze(text):
    teile = []
    for t in SATZENDE.split(text):
        if teile and teile[-1].endswith(ABKUERZUNGEN):
            teile[-1] += " " + t
        else:
            teile.append(t)
    return teile


def satz_kennung(satz):
    return hashlib.sha1(satz.encode()).hexdigest()[:16]


def neu_sprechen(text, root=None):
    """„Neu sprechen“ für einen Spruch mit der gewählten Stimme: je Satz die nächste Variante (neu.json)."""
    _, wahl = texte_lesen(root)
    stimme = Stimme(wahl, root)
    stimme.roh_ordner.mkdir(parents=True, exist_ok=True)
    for z in saetze(text):
        stimme.varianten[satz_kennung(z)] = stimme.variante(z) + 1
    datei = stimme.roh_ordner / "neu.json"
    tmp = datei.with_suffix(".tmp")
    tmp.write_text(json.dumps(stimme.varianten), encoding="utf-8")
    tmp.replace(datei)


def aufnahmen_lesen(root=None):
    """Liste aus js/aufnahmen.js: Spruch → [[Datei, Sekunden], …] (ältere Form [Datei, Sekunden] umgeformt)."""
    try:
        roh = re.search(r"self\.RECORDINGS\s*=\s*(.*);\s*$", (Path(root or ROOT) / "js/aufnahmen.js").read_text(encoding="utf-8"), re.S)
        liste = json.loads(roh.group(1))
        return {t: ([w] if isinstance(w[0], str) else w) for t, w in liste.items()}
    except (OSError, AttributeError, ValueError, IndexError, TypeError):
        return {}


def vertont(root=None):
    """Ist alles vertont? Für den Admin-Helfer: Vertonung nur starten, wenn etwas fehlt, und nur veröffentlichen, was
    vollständig vertont ist. Ein Spruch gilt als vertont, wenn die Liste für jeden seiner Sätze genau die Aufnahme der
    gewählten Stimme (mit Tempo und Variante) nennt und die Datei da ist. Liefert die Texte, denen etwas fehlt."""
    root = Path(root or ROOT)
    eintraege, wahl = texte_lesen(root)
    try:
        stimme = Stimme(wahl, root)
    except SystemExit as e:
        return {"fehlend": [t for t, _ in eintraege], "gesamt": len(eintraege), "fehler": str(e)}
    liste = aufnahmen_lesen(root)
    fehlend = []
    for t, _ in eintraege:
        soll = [f"stimme/{stimme.mp3(z).name}" for z in saetze(t)]
        ist = [d for d, _ in liste.get(t, [])]
        if ist != soll or not all((root / d).is_file() for d in soll):
            fehlend.append(t)
    return {"fehlend": fehlend, "gesamt": len(eintraege)}


def herkunft(root=None):
    """Für den Admin-Bereich: Mit welcher Stimme ist jeder Spruch aufgenommen, der in der gültigen Liste steht
    (js/aufnahmen.js, also erfolgreich vertont und gespeichert)? Aus dem Dateinamen erkannt: Er hängt an Programm,
    Stimme, Tempo und Variante, also wird für jede bekannte Stimme und jedes Tempo nachgerechnet. Liefert je Text
    {programm, stimme, tempo, zeit} (zeit: Unix-Sekunden der jüngsten Datei) oder {gemischt: True}."""
    root = Path(root or ROOT)
    liste = aufnahmen_lesen(root)
    saetze_alle = {z for t in liste for z in saetze(t)}
    namen = {}
    for programm, eintrag in katalog().items():
        for name in eintrag["stimmen"]:
            for k in range(int(round(TEMPO_MIN * 20)), int(round(TEMPO_MAX * 20)) + 1):
                st = Stimme({"programm": programm, "stimme": name, "tempo": k / 20}, root)
                for z in saetze_alle:
                    v_jetzt = st.variante(z)
                    for v in range(v_jetzt + 1):
                        st.varianten[satz_kennung(z)] = v
                        namen.setdefault(f"stimme/{st.mp3(z).name}", (programm, name, k / 20))
                    st.varianten[satz_kennung(z)] = v_jetzt
    ergebnis = {}
    for t, teile in liste.items():
        wer = {namen.get(d) for d, _ in teile}
        dateien = [root / d for d, _ in teile if (root / d).is_file()]
        if len(wer) != 1 or None in wer or len(dateien) != len(teile):
            ergebnis[t] = {"gemischt": True}
            continue
        programm, name, tempo = wer.pop()
        ergebnis[t] = {"programm": programm, "stimme": name, "tempo": tempo,
                       "zeit": int(max(f.stat().st_mtime for f in dateien))}
    return ergebnis


class Stimme:
    """Die gewählte Stimme: wo ihre Rohaufnahmen liegen und wie die MP3-Dateien heißen."""

    def __init__(self, wahl, root=None):
        programme = katalog()
        if wahl["programm"] not in programme or wahl["stimme"] not in programme[wahl["programm"]]["stimmen"]:
            sys.exit(f"Unbekannte Stimme {wahl['programm']}/{wahl['stimme']} (werkzeuge/stimmen.json)")
        self.programm, self.name, self.tempo = wahl["programm"], wahl["stimme"], float(wahl["tempo"])
        self.titel = programme[self.programm]["name"] + " – " + programme[self.programm]["stimmen"][self.name]["name"]
        eintrag = programme[self.programm]["stimmen"][self.name]
        # Alles, was den Klang der Rohaufnahme bestimmt; die Hörprobe gehört nicht dazu
        self.kennung = json.dumps([self.programm, {k: v for k, v in eintrag.items() if k not in ("name", "probe")},
                                   PARAMETER[self.programm]], sort_keys=True)
        self.roh_ordner = ROH / f"{self.programm}-{self.name}"
        self.alt = (self.programm, self.name, self.tempo) == ("piper", "thorsten", 1.0)
        self.out = Path(root or ROOT) / "stimme"
        self.varianten_laden()

    def varianten_laden(self):
        """neu.json: je Satz (Kurzname) die wievielte Variante gilt; fehlt = 0 (die erste Aufnahme)."""
        try:
            self.varianten = json.loads((self.roh_ordner / "neu.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self.varianten = {}

    def variante(self, satz):
        return int(self.varianten.get(satz_kennung(satz), 0))

    def roh(self, satz):
        v = self.variante(satz)
        return self.roh_ordner / (hashlib.sha1(f"{self.kennung}|{satz}{f'|{v}' if v else ''}".encode()).hexdigest()[:16] + ".wav")

    def mp3(self, satz):
        if self.alt:
            schluessel = f"{ALT_SETTINGS}|{satz}"
        else:   # v3: MP3 in der Abtastrate der Rohaufnahme mit 96 kbit/s (vorher 22 kHz, 64 kbit/s)
            schluessel = f"{self.kennung}|{self.tempo:.2f}|v3|{satz}"
        v = self.variante(satz)
        return self.out / (hashlib.sha1(f"{schluessel}{f'|{v}' if v else ''}".encode()).hexdigest()[:12] + ".mp3")


class Sprecher:
    """Das Sprachprogramm in seiner eigenen Python-Umgebung, einmal geladen für alle Sätze."""

    def __init__(self, stimme):
        python = python_fuer(stimme.programm)
        if not python.exists():
            sys.exit(f"{katalog()[stimme.programm]['name']} ist auf diesem Rechner nicht eingerichtet ({python.parent.parent})")
        PROTOKOLL.parent.mkdir(parents=True, exist_ok=True)
        self.log = open(PROTOKOLL, "a")
        self.log.write(f"\n--- {time.strftime('%Y-%m-%d %H:%M:%S')} {stimme.titel}\n"); self.log.flush()
        self.p = subprocess.Popen([str(python), str(Path(__file__).with_name("sprecher.py")), stimme.programm, stimme.name],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.log, text=True, bufsize=1)
        self.antwort("BEREIT")

    def antwort(self, erwartet):
        zeile = self.p.stdout.readline().strip()
        if zeile != erwartet:
            self.p.kill()
            sys.exit(f"Das Sprachprogramm ist abgebrochen (Einzelheiten: {PROTOKOLL})")

    def sprechen(self, satz, ziel, variante=0):
        ziel.parent.mkdir(parents=True, exist_ok=True)
        self.p.stdin.write(json.dumps({"text": satz, "ziel": str(ziel), "variante": variante}, ensure_ascii=False) + "\n")
        self.antwort("OK")

    def ende(self):
        self.p.stdin.close()
        self.p.wait(timeout=60)


def umwandeln(roh, ziel, tempo, alt=False):
    """Rohaufnahme → MP3 für die App. Tempo mit Rubber Band (Tonhöhe bleibt), Stille vorn und hinten weg, Lautstärke
    angleichen, mono. Abtastrate wie die Rohaufnahme (Chatterbox 24 kHz, Piper 22,05 kHz) mit 96 kbit/s, damit keine
    Höhen verloren gehen (Oktober 2026, vorher fest 22,05 kHz und 64 kbit/s; alt=True für die alten Piper-Dateinamen).
    Erst in eine Nachbardatei, dann umbenennen: nie eine halbe Datei in stimme/."""
    import wave
    with wave.open(str(roh)) as w:
        rate = w.getframerate()
    filter_ = ([f"rubberband=tempo={tempo:.2f}:pitchq=quality"] if tempo != 1.0 else []) + [
        "silenceremove=start_periods=1:start_threshold=-50dB", "areverse",
        "silenceremove=start_periods=1:start_threshold=-50dB", "areverse",
        "loudnorm=I=-18:TP=-2:LRA=7", "apad=pad_dur=0.15"]
    tmp = ziel.with_name(ziel.stem + ".tmp.mp3")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(roh), "-af", ",".join(filter_),
                    "-ar", "22050" if alt else str(rate), "-ac", "1", "-b:a", "64k" if alt else "96k", str(tmp)], check=True)
    tmp.replace(ziel)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         check=True, capture_output=True, text=True).stdout
    return round(float(out), 2)


def reihenfolge(eintraege):
    """Alle Sätze ohne Doppelte: erst die aktiver Sprüche (in der Reihenfolge der App), dann die übrigen."""
    return list(dict.fromkeys([z for t, a in eintraege if a for z in saetze(t)] + [z for t, _ in eintraege for z in saetze(t)]))


def main():
    OUT.mkdir(exist_ok=True)
    # Nie zwei Vertonungen gleichzeitig (z. B. nach einem Neustart des Admin-Helfers): die zweite wartet
    import fcntl
    sperre = open(OUT / ".sperre", "w")
    fcntl.flock(sperre, fcntl.LOCK_EX)
    # Fortschritt für den Admin-Helfer (Ladebalken mit Prozent und Restzeit im Admin-Bereich), je eine Zeile:
    #   PHASE lesen | STIMME Name | GESAMT n (MP3 zu erzeugen) | SPRECHEN m (davon neu zu sprechen)
    #   PHASE stimme (Programm lädt) | [k/m] Satz (wird gesprochen) | FERTIG k/m
    #   PHASE umwandeln | UMWANDELN i/n | PHASE liste | LISTE i/j | ENDE
    # m kann sich unterwegs ändern: Vor jedem Satz werden die Texte neu gelesen.
    print("PHASE lesen", flush=True)
    eintraege, wahl = texte_lesen()
    stimme = Stimme(wahl)
    print(f"STIMME {stimme.titel}", flush=True)

    def offen():
        alle = reihenfolge(eintraege)
        return [z for z in alle if not stimme.mp3(z).exists() and not stimme.roh(z).exists()]

    todo = [z for z in reihenfolge(eintraege) if not stimme.mp3(z).exists()]
    sprechen = offen()
    print(f"GESAMT {len(todo)}", flush=True)
    print(f"SPRECHEN {len(sprechen)}", flush=True)
    sprecher, gesprochen = None, 0
    while sprechen:
        if sprecher is None:
            print("PHASE stimme", flush=True)
            sprecher = Sprecher(stimme)
        z = sprechen[0]
        n = gesprochen + len(sprechen)
        print(f"[{gesprochen}/{n}] {z}", flush=True)
        sprecher.sprechen(z, stimme.roh(z), stimme.variante(z))
        gesprochen += 1
        # Texte und Varianten neu lesen: Geändertes fällt weg, Neues kommt dazu. Wechselt die Stimme, bricht der
        # Admin-Helfer diesen Lauf ab und beginnt neu.
        eintraege, _ = texte_lesen()
        stimme.varianten_laden()
        sprechen = offen()
        print(f"FERTIG {gesprochen}/{gesprochen + len(sprechen)}", flush=True)
    if sprecher:
        sprecher.ende()
    alle_saetze = reihenfolge(eintraege)
    todo = [z for z in alle_saetze if not stimme.mp3(z).exists()]
    if todo:
        print("PHASE umwandeln", flush=True)
        with ThreadPoolExecutor(4) as pool:   # ffmpeg je Satz, vier gleichzeitig
            for i, _ in enumerate(pool.map(lambda z: umwandeln(stimme.roh(z), stimme.mp3(z), stimme.tempo, stimme.alt), todo), 1):
                print(f"UMWANDELN {i}/{len(todo)}", flush=True)
    keep = {stimme.mp3(z).name for z in alle_saetze}
    for f in OUT.glob("*.mp3"):
        if f.name not in keep:
            f.unlink()

    # Längen: aus der bisherigen Liste übernehmen, nur neue Aufnahmen messen
    print("PHASE liste", flush=True)
    bekannt = {datei: sek for wert in aufnahmen_lesen().values() for datei, sek in wert}
    name = lambda z: f"stimme/{stimme.mp3(z).name}"   # noqa: E731
    neu = [z for z in alle_saetze if name(z) not in bekannt]
    with ThreadPoolExecutor(4) as pool:
        for i, (z, sek) in enumerate(zip(neu, pool.map(lambda z: duration(stimme.mp3(z)), neu)), 1):
            bekannt[name(z)] = sek
            print(f"LISTE {i}/{len(neu)}", flush=True)
    # Je Spruch die Sätze in Reihenfolge: [[Datei, Sekunden], …]
    texts = [t for t, _ in eintraege]
    rec = {t: [[name(z), bekannt[name(z)]] for z in saetze(t)] for t in texts}
    # Erst in eine Nachbardatei, dann austauschen: Die App liest nie eine halb geschriebene Liste
    ziel = ROOT / "js/aufnahmen.js"
    tmp = ziel.with_suffix(".tmp")
    tmp.write_text(
        "// Meditation – Liste der Sprachaufnahmen: Spruch → seine Sätze [[Datei, Länge in Sekunden], …].\n"
        "// Erzeugt von werkzeuge/aufnahmen.py, nicht von Hand bearbeiten. Fehlt ein Satz hier (Text geändert,\n"
        "// noch nicht neu aufgenommen), liest für ihn die Stimme des Browsers vor.\n"
        "self.RECORDINGS = " + json.dumps(rec, ensure_ascii=False, indent=1) + ";\n")
    tmp.replace(ziel)

    sw = (ROOT / "sw.js").read_text()
    block = "".join(f'  "stimme/{n}",\n' for n in sorted(keep))
    sw, n = re.subn(r"(  // Aufnahmen \(setzt werkzeuge/aufnahmen\.py\)\n).*?(  // Ende Aufnahmen\n)",
                    lambda m: m.group(1) + block + m.group(2), sw, flags=re.S)
    if not n:
        sys.exit("sw.js: Abschnitt „// Aufnahmen …“ nicht gefunden")
    (ROOT / "sw.js").write_text(sw)
    size = sum(f.stat().st_size for f in OUT.glob("*.mp3"))
    print(f"{stimme.titel}, Tempo {stimme.tempo:.2f}: {len(texts)} Sprüche, {len(alle_saetze)} Sätze, "
          f"{gesprochen} neu gesprochen, {len(todo)} umgewandelt, zusammen {size / 1e6:.1f} MB")
    print("ENDE", flush=True)


if __name__ == "__main__":
    main()
