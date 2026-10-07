#!/usr/bin/env python3
"""Nimmt alle Sätze der App mit der gewählten Stimme auf (offline auf dem Rechner des Inhabers).

    python3 werkzeuge/aufnahmen.py

Stimme: im Admin-Bereich unter „Einstellungen“ gewählt (config.js settings.stimme: Programm, Stimme, Tempo); ohne
Angabe Piper „Thorsten“, etwas langsamer (Wahl des Inhabers „A2“, Oktober 2026). Die Programme und Stimmen stehen in
werkzeuge/stimmen.json, gesprochen wird mit werkzeuge/sprecher.py in der Python-Umgebung des Programms.

Ablauf (so schnell wie möglich, Wunsch des Inhabers):
- Die Sätze kommen aus der App selbst: Chromium lädt phasen.js, texte.js, config.js und zustand.js und gibt
  alle Sprüche und die Einstellungen aus (Fassung des Inhabers aus dem Admin-Bereich, auch deaktivierte Sprüche).
- Jeder Satz wird einmal gesprochen und als Rohaufnahme zwischengespeichert (~/.local/share/meditation-app/
  rohaufnahmen/<programm>-<stimme>/). Neu gesprochen wird nur, was es für diese Stimme noch nicht gibt: ein neuer
  oder geänderter Satz, oder eine Stimme, die noch nie benutzt wurde. Zurück zu einer früheren Stimme geht schnell.
- Aus der Rohaufnahme wird die MP3 für die App: Tempo (tonhöhenerhaltend, ohne neu zu sprechen), Stille am Anfang
  und Ende entfernt, Lautstärke angeglichen, nach stimme/<prüfsumme>.mp3. Der Name hängt an Text, Stimme und Tempo.
- Die Pause zwischen den Sätzen setzt die App beim Abspielen ein; dafür muss nichts neu aufgenommen werden.
- Erst wenn alles fertig ist, wird die Liste ausgetauscht und alte Aufnahmen gelöscht: Bis dahin spricht die App
  mit der bisherigen Stimme weiter. Bricht ein Durchgang ab, geht der nächste dort weiter (Zwischenspeicher).
- js/aufnahmen.js bekommt die Liste (Spruch → seine Sätze mit Datei und Länge), sw.js die Dateien für die Offline-Kopie.
"""
import hashlib
import json
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
ROH = Path.home() / ".local/share/meditation-app/rohaufnahmen"
PROTOKOLL = Path.home() / ".local/share/meditation-app/sprecher.log"
STANDARD = {"programm": "piper", "stimme": "thorsten", "tempo": 1.0}
# Bisherige Dateinamen der ersten Stimme (Piper Thorsten A2), damit vorhandene Aufnahmen gültig bleiben
ALT_SETTINGS = "thorsten-high|1.25|0.7|v1"


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


class Stimme:
    """Die gewählte Stimme: wo ihre Rohaufnahmen liegen und wie die MP3-Dateien heißen."""

    def __init__(self, wahl):
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

    def roh(self, satz):
        return self.roh_ordner / (hashlib.sha1(f"{self.kennung}|{satz}".encode()).hexdigest()[:16] + ".wav")

    def mp3(self, satz):
        if self.alt:
            schluessel = f"{ALT_SETTINGS}|{satz}"
        else:
            schluessel = f"{self.kennung}|{self.tempo:.2f}|v2|{satz}"
        return OUT / (hashlib.sha1(schluessel.encode()).hexdigest()[:12] + ".mp3")


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

    def sprechen(self, satz, ziel):
        ziel.parent.mkdir(parents=True, exist_ok=True)
        self.p.stdin.write(json.dumps({"text": satz, "ziel": str(ziel)}, ensure_ascii=False) + "\n")
        self.antwort("OK")

    def ende(self):
        self.p.stdin.close()
        self.p.wait(timeout=60)


def umwandeln(roh, ziel, tempo):
    """Rohaufnahme → MP3 für die App. Tempo mit Rubber Band (Tonhöhe bleibt), Stille vorn und hinten weg, Lautstärke
    angleichen, mono 64 kbit/s. Erst in eine Nachbardatei, dann umbenennen: nie eine halbe Datei in stimme/."""
    filter_ = ([f"rubberband=tempo={tempo:.2f}:pitchq=quality"] if tempo != 1.0 else []) + [
        "silenceremove=start_periods=1:start_threshold=-50dB", "areverse",
        "silenceremove=start_periods=1:start_threshold=-50dB", "areverse",
        "loudnorm=I=-18:TP=-2:LRA=7", "apad=pad_dur=0.15"]
    tmp = ziel.with_name(ziel.stem + ".tmp.mp3")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(roh), "-af", ",".join(filter_),
                    "-ar", "22050", "-ac", "1", "-b:a", "64k", str(tmp)], check=True)
    tmp.replace(ziel)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         check=True, capture_output=True, text=True).stdout
    return round(float(out), 2)


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
    print("PHASE lesen", flush=True)
    texts, wahl = texts_from_app()
    stimme = Stimme(wahl)
    print(f"STIMME {stimme.titel}", flush=True)
    alle_saetze = list(dict.fromkeys(z for t in texts for z in saetze(t)))
    todo = [z for z in alle_saetze if not stimme.mp3(z).exists()]
    sprechen = [z for z in todo if not stimme.roh(z).exists()]
    print(f"GESAMT {len(todo)}", flush=True)
    print(f"SPRECHEN {len(sprechen)}", flush=True)
    if sprechen:
        print("PHASE stimme", flush=True)
        sprecher = Sprecher(stimme)
        for k, z in enumerate(sprechen, 1):
            print(f"[{k - 1}/{len(sprechen)}] {z}", flush=True)
            sprecher.sprechen(z, stimme.roh(z))
            print(f"FERTIG {k}/{len(sprechen)}", flush=True)
        sprecher.ende()
    if todo:
        print("PHASE umwandeln", flush=True)
        with ThreadPoolExecutor(4) as pool:   # ffmpeg je Satz, vier gleichzeitig
            for i, _ in enumerate(pool.map(lambda z: umwandeln(stimme.roh(z), stimme.mp3(z), stimme.tempo), todo), 1):
                print(f"UMWANDELN {i}/{len(todo)}", flush=True)
    keep = {stimme.mp3(z).name for z in alle_saetze}
    for f in OUT.glob("*.mp3"):
        if f.name not in keep:
            f.unlink()
    # Rohaufnahmen dieser Stimme zu Sätzen, die es nicht mehr gibt, weg; andere Stimmen bleiben (schneller zurück)
    roh_keep = {stimme.roh(z).name for z in alle_saetze}
    for f in stimme.roh_ordner.glob("*.wav"):
        if f.name not in roh_keep:
            f.unlink()

    # Längen: aus der bisherigen Liste übernehmen, nur neue Aufnahmen messen
    print("PHASE liste", flush=True)
    bekannt = {}
    try:
        alt = json.loads(re.search(r"self\.RECORDINGS\s*=\s*(.*);\s*$", (ROOT / "js/aufnahmen.js").read_text(), re.S).group(1))
        for wert in alt.values():   # alte Liste: [Datei, Sek]; neue: [[Datei, Sek], …]
            for datei, sek in ([wert] if isinstance(wert[0], str) else wert):
                bekannt[datei] = sek
    except (OSError, AttributeError, ValueError, IndexError, TypeError):
        pass
    name = lambda z: f"stimme/{stimme.mp3(z).name}"   # noqa: E731
    neu = [z for z in alle_saetze if name(z) not in bekannt]
    with ThreadPoolExecutor(4) as pool:
        for i, (z, sek) in enumerate(zip(neu, pool.map(lambda z: duration(stimme.mp3(z)), neu)), 1):
            bekannt[name(z)] = sek
            print(f"LISTE {i}/{len(neu)}", flush=True)
    # Je Spruch die Sätze in Reihenfolge: [[Datei, Sekunden], …]
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
          f"{len(sprechen)} neu gesprochen, {len(todo)} umgewandelt, zusammen {size / 1e6:.1f} MB")
    print("ENDE", flush=True)


if __name__ == "__main__":
    main()
