#!/usr/bin/env python3
"""Nimmt alle Sätze aus js/texte.js mit der gewählten Stimme auf (Piper, offline auf Rechner des Inhabers).

    ~/.local/share/meditation-stimme/venv/bin/python werkzeuge/aufnahmen.py

Stimme: Thorsten (de_DE-thorsten-high), etwas langsamer (Wahl des Inhabers „A2“, Oktober 2026). Piper und die Stimme
liegen außerhalb des Projekts in ~/.local/share/meditation-stimme (Herkunft und Prüfsummen: stimme/QUELLE.md).

Ablauf:
- Die Sätze kommen aus der App selbst: Chromium lädt phasen.js, texte.js, config.js und zustand.js und gibt
  alle Sprüche aus (Fassung des Inhabers aus dem Admin-Bereich, auch deaktivierte).
- Jeder Satz wird einmal aufgenommen, Lautstärke angeglichen, Stille am Anfang und Ende entfernt,
  als MP3 nach stimme/<prüfsumme>.mp3. Der Dateiname hängt an Text und Stimm-Einstellungen: Gleicher Satz,
  gleiche Datei; geänderter Satz, neue Datei. Schon vorhandene Aufnahmen werden nicht neu erzeugt.
- Aufnahmen, die zu keinem Satz mehr gehören, werden gelöscht.
- js/aufnahmen.js bekommt die Liste (Satz → Datei und Länge in Sekunden), sw.js die Dateien für die Offline-Kopie.
"""
import hashlib
import json
import re
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "stimme"
BASE = Path.home() / ".local/share/meditation-stimme"
MODEL = BASE / "stimmen/de_DE-thorsten-high.onnx"
LENGTH_SCALE = 1.25        # etwas langsamer als normal (A2)
SENTENCE_SILENCE = 0.7     # Sekunden Pause zwischen zwei Sätzen innerhalb einer Zeile
SETTINGS = f"thorsten-high|{LENGTH_SCALE}|{SENTENCE_SILENCE}|v1"


def texts_from_app():
    """Alle Sprüche, so wie die App sie kennt: Fassung des Inhabers aus config.js (sonst der Grundbestand aus texte.js),
    geprüft mit derselben Funktion wie in der App (cleanSayings in js/zustand.js). Auch deaktivierte Sprüche, damit
    späteres Einschalten keine neue Aufnahme braucht. Reihenfolge wie in der App, ohne Doppelte."""
    skripte = "".join(f'<script src="{(ROOT / f).as_uri()}"></script>'
                      for f in ["js/phasen.js", "js/texte.js", "config.js", "js/zustand.js"])
    page = (f'<!doctype html><meta charset="utf-8">{skripte}<pre id="o"></pre>'
            '<script>o.textContent = JSON.stringify(PHASES.flatMap(p => allSayings(p.id).map(s => s.text)))</script>')
    with tempfile.TemporaryDirectory() as tmp:
        f = Path(tmp, "t.html")
        f.write_text(page)
        dom = subprocess.run(["chromium", "--headless=new", "--disable-gpu", "--allow-file-access-from-files",
                              "--dump-dom", f.as_uri()], check=True, capture_output=True, text=True).stdout
    raw = re.search(r'<pre id="o">(.*?)</pre>', dom, re.S).group(1)
    raw = raw.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&amp;", "&")
    texte = list(dict.fromkeys(json.loads(raw)))
    if not texte:
        sys.exit("Keine Sprüche gefunden – lädt die App ihre Texte?")
    return texte


def file_for(text):
    return OUT / (hashlib.sha1(f"{SETTINGS}|{text}".encode()).hexdigest()[:12] + ".mp3")


def record(voice, cfg, text, target, melden=None):
    from piper import SynthesisConfig  # noqa: F401 (nur im Piper-Ordner vorhanden)
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp, "s.wav")
        with wave.open(str(wav), "wb") as w:
            first = True
            for chunk in voice.synthesize(text, syn_config=cfg):
                if first:
                    w.setnchannels(1); w.setsampwidth(2); w.setframerate(chunk.sample_rate)
                    first = False
                else:   # Pause zwischen zwei Sätzen
                    w.writeframes(b"\0\0" * int(chunk.sample_rate * SENTENCE_SILENCE))
                w.writeframes(chunk.audio_int16_bytes)
        if melden:
            melden()   # Teilschritt: gesprochen, jetzt umwandeln
        # Stille vorn und hinten weg, Lautstärke angleichen, MP3 mono 64 kbit/s
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), "-af",
                        "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
                        "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
                        "loudnorm=I=-18:TP=-2:LRA=7,apad=pad_dur=0.15",
                        "-ar", "22050", "-ac", "1", "-b:a", "64k", str(target)], check=True)


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
    # Fortschritt für den Admin-Helfer (Ladebalken mit Prozent im Admin-Bereich), je eine Zeile:
    #   PHASE lesen | PHASE stimme | GESAMT n | [k/n] Satz (beginnt) | TEIL k/n (gesprochen) | FERTIG k/n
    #   PHASE liste | LISTE i/m (Länge neuer Aufnahmen messen) | ENDE
    print("PHASE lesen", flush=True)
    texts = texts_from_app()
    todo = [t for t in texts if not file_for(t).exists()]
    print(f"GESAMT {len(todo)}", flush=True)
    if todo:
        print("PHASE stimme", flush=True)
        from piper import PiperVoice, SynthesisConfig
        voice = PiperVoice.load(str(MODEL))
        cfg = SynthesisConfig(length_scale=LENGTH_SCALE)
        for k, t in enumerate(todo, 1):
            print(f"[{k - 1}/{len(todo)}] {t}", flush=True)
            record(voice, cfg, t, file_for(t), lambda: print(f"TEIL {k - 1}/{len(todo)}", flush=True))
            print(f"FERTIG {k}/{len(todo)}", flush=True)
    keep = {file_for(t).name for t in texts}
    for f in OUT.glob("*.mp3"):
        if f.name not in keep:
            print("gelöscht (Satz gibt es nicht mehr):", f.name)
            f.unlink()

    # Längen: aus der bisherigen Liste übernehmen, nur neue Aufnahmen messen (schneller als alle 100 neu)
    print("PHASE liste", flush=True)
    bekannt = {}
    try:
        alt = json.loads(re.search(r"self\.RECORDINGS\s*=\s*(.*);\s*$", (ROOT / "js/aufnahmen.js").read_text(), re.S).group(1))
        bekannt = {datei: sek for datei, sek in alt.values()}
    except (OSError, AttributeError, ValueError):
        pass
    neu = [t for t in texts if f"stimme/{file_for(t).name}" not in bekannt]
    for i, t in enumerate(neu, 1):
        bekannt[f"stimme/{file_for(t).name}"] = duration(file_for(t))
        print(f"LISTE {i}/{len(neu)}", flush=True)
    rec = {t: [f"stimme/{file_for(t).name}", bekannt[f"stimme/{file_for(t).name}"]] for t in texts}
    # Erst in eine Nachbardatei, dann austauschen: Die App liest nie eine halb geschriebene Liste
    ziel = ROOT / "js/aufnahmen.js"
    tmp = ziel.with_suffix(".tmp")
    tmp.write_text(
        "// Meditation – Liste der Sprachaufnahmen: Satz → [Datei, Länge in Sekunden].\n"
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
    print(f"{len(texts)} Sätze, {len(todo)} neu aufgenommen, zusammen {size / 1e6:.1f} MB")
    print("ENDE", flush=True)


if __name__ == "__main__":
    main()
