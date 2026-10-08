#!/usr/bin/env python3
"""Übernimmt einen ElevenLabs-Studio-Export in die App (Wahl des Inhabers, Oktober 2026: ElevenLabs „Helmut“).

    python3 werkzeuge/elevenlabs_import.py <export.mp3> <texte.txt> [stimme]

texte.txt ist die hochgeladene Datei (ein Satz je Absatz), z. B. hoerproben/elevenlabs-alle/meditation-alle-saetze.txt
oder hoerproben/elevenlabs-fehlend.txt (die Sätze, die noch fehlen). Der Export wird mit werkzeuge/teilen.py an den
Satzpausen geteilt; jeder Satz kommt als Rohaufnahme (WAV) in den Zwischenspeicher der Stimme
(~/.local/share/meditation-app/rohaufnahmen/elevenlabs-<stimme>/). Danach macht die Vertonung im Admin-Helfer daraus
wie bei jeder Stimme die MP3-Dateien (Satzende ohne Atemrest, Lautstärke angeglichen) und die Liste der App.
Gibt es einen Satz schon und klingt die neue Aufnahme anders („Neu sprechen“ von Hand in Studio), bekommt er eine neue
Variante (neuer Dateiname), damit Browser und Offline-Kopie die neue Fassung laden.
"""
import filecmp, json, subprocess, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aufnahmen as A  # noqa: E402


def main():
    export, texte = Path(sys.argv[1]), Path(sys.argv[2])
    name = sys.argv[3] if len(sys.argv) > 3 else "helmut"
    saetze = [s.strip() for s in texte.read_text(encoding="utf-8").split("\n\n") if s.strip()]
    stimme = A.Stimme({"programm": "elevenlabs", "stimme": name, "tempo": 1.0})
    stimme.roh_ordner.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([sys.executable, str(Path(__file__).with_name("teilen.py")), str(export), str(texte), tmp, "s"],
                       check=True)
        neu, gleich, varianten = 0, 0, 0
        for k, z in enumerate(saetze, 1):
            wav = Path(tmp) / f"s-{k:02d}.wav"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(Path(tmp) / f"s-{k:02d}{export.suffix}"),
                            "-ac", "1", "-c:a", "pcm_s16le", str(wav)], check=True)
            ziel = stimme.roh(z)
            if ziel.exists():
                if filecmp.cmp(ziel, wav, shallow=False):
                    gleich += 1
                    continue
                stimme.varianten[A.satz_kennung(z)] = stimme.variante(z) + 1   # neue Fassung: neue Variante
                (stimme.roh_ordner / "neu.json").write_text(json.dumps(stimme.varianten), encoding="utf-8")
                ziel, varianten = stimme.roh(z), varianten + 1
            wav.replace(ziel)
            neu += 1
    print(f"{len(saetze)} Sätze übernommen: {neu} neu ({varianten} davon als neue Fassung), {gleich} unverändert.")


if __name__ == "__main__":
    main()
