#!/usr/bin/env python3
"""Spricht Sätze mit einem Sprachprogramm (Piper oder Chatterbox) – Hilfsprogramm für werkzeuge/aufnahmen.py.

    <ordner>/venv/bin/python werkzeuge/sprecher.py <programm> <stimme>

Läuft in der Python-Umgebung des jeweiligen Programms (~/.local/share/<ordner>/venv, siehe werkzeuge/stimmen.json),
lädt das Modell einmal und liest dann je Zeile einen Auftrag {"text": …, "ziel": …, "variante": n} von der
Standardeingabe (variante > 0: „Neu sprechen“ im Admin-Bereich, anderer Zufall). Für jeden
Satz schreibt es eine WAV-Datei (mono, 16 bit, Abtastrate des Modells) und antwortet mit einer Zeile „OK“; nach dem
Laden kommt „BEREIT“. Keine Netzverbindung: Modelle und Vorlagen liegen auf diesem Rechner.
"""
import hashlib
import json
import os
import sys
import wave
from pathlib import Path

# Nie etwas nachladen (Chatterbox fragt sonst bei Hugging Face nach)
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

KATALOG = Path(__file__).resolve().parent / "stimmen.json"
DATEN = Path.home() / ".local/share"
VORLAGEN = DATEN / "meditation-app/vorlagen"
# Rechenkerne: nur die echten Kerne (bei Hyperthreading die Hälfte), sonst bremsen sich die Rechenschritte gegenseitig
THREADS = int(os.environ.get("MEDITATION_THREADS") or max(1, (os.cpu_count() or 2) // 2))

# Feste Einstellungen je Programm (ruhig, etwas langsamer). Ändert sich hier etwas, die Versionsnummer erhöhen:
# Dann werden die Sätze neu gesprochen (sie steckt im Namen des Zwischenspeichers).
PARAMETER = {
    "piper": {"v": 1, "satzpause": 0.7},
    "chatterbox": {"v": 1, "exaggeration": 0.4, "cfg_weight": 0.3, "temperature": 0.7},
    "elevenlabs": {"v": 1},   # spricht nicht selbst: Aufnahmen kommen über werkzeuge/elevenlabs_import.py
}


def katalog():
    return {k: v for k, v in json.loads(KATALOG.read_text(encoding="utf-8")).items() if not k.startswith("_")}


def python_fuer(programm):
    return DATEN / katalog()[programm]["ordner"] / "venv/bin/python"


def samen(text, variante=0):
    """Gleicher Satz, gleicher Zufall: Ein neu gesprochener Satz klingt wie zuvor. Eine neue Variante („Neu sprechen“)
    nimmt einen anderen Zufall."""
    return int(hashlib.sha1((f"{text}|{variante}" if variante else text).encode()).hexdigest()[:8], 16)


def wav_schreiben(ziel, daten, sr):
    tmp = Path(str(ziel) + ".tmp")
    with wave.open(str(tmp), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(daten)
    tmp.replace(ziel)


def float_zu_int16(y):
    import numpy as np
    y = np.asarray(y, dtype=np.float32)
    return (np.clip(y / max(1e-6, float(np.abs(y).max())) * 0.9, -1, 1) * 32767).astype(np.int16).tobytes()


def piper(stimme, ordner):
    from piper import PiperVoice, SynthesisConfig
    voice = PiperVoice.load(str(ordner / "stimmen" / f"{stimme['modell']}.onnx"))
    sid = voice.config.speaker_id_map[stimme["sprecher"]] if stimme.get("sprecher") else None
    cfg = SynthesisConfig(length_scale=stimme.get("length_scale", 1.0), speaker_id=sid)
    pause = PARAMETER["piper"]["satzpause"]

    def sprechen(text, ziel, variante=0):   # Piper klingt immer gleich, die Variante ändert nichts
        teile, sr = [], 22050
        for chunk in voice.synthesize(text, syn_config=cfg):
            if teile:   # Piper teilt selbst noch einmal (z. B. nach „z. B.“): kurze Pause dazwischen
                teile.append(b"\0\0" * int(chunk.sample_rate * pause))
            teile.append(chunk.audio_int16_bytes)
            sr = chunk.sample_rate
        wav_schreiben(ziel, b"".join(teile), sr)
    return sprechen


def chatterbox(stimme, ordner):
    import warnings
    warnings.filterwarnings("ignore")
    import torch
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    torch.set_num_threads(THREADS)
    m = ChatterboxMultilingualTTS.from_local(ordner / "modell", "cpu")
    p = {k: v for k, v in PARAMETER["chatterbox"].items() if k != "v"}
    m.prepare_conditionals(str(VORLAGEN / stimme["vorlage"]), exaggeration=p["exaggeration"])

    def sprechen(text, ziel, variante=0):
        torch.manual_seed(samen(text, variante))
        # Gedankenstrich „ – “ macht Chatterbox zu „ - “; ein Komma gibt eine sauberere Atempause (nur beim Sprechen,
        # der Text und damit der Name der Aufnahme bleiben gleich)
        y = m.generate(text.replace(" – ", ", "), language_id="de", **p).squeeze().numpy()
        wav_schreiben(ziel, float_zu_int16(y), m.sr)
    return sprechen


def main():
    # Antworten („BEREIT“, „OK“) über einen eigenen Kanal; was die Programme selbst ausgeben (z. B. Chatterbox beim
    # Laden), landet im Protokoll statt dazwischen
    antwort = os.fdopen(os.dup(1), "w", buffering=1)
    os.dup2(2, 1)
    sys.stdout = sys.stderr
    programm, name = sys.argv[1], sys.argv[2]
    eintrag = katalog()[programm]
    sprechen = {"piper": piper, "chatterbox": chatterbox}[programm](
        eintrag["stimmen"][name], DATEN / eintrag["ordner"])
    print("BEREIT", file=antwort, flush=True)
    for zeile in sys.stdin:
        if zeile.strip():
            auftrag = json.loads(zeile)
            sprechen(auftrag["text"], Path(auftrag["ziel"]), int(auftrag.get("variante") or 0))
            print("OK", file=antwort, flush=True)


if __name__ == "__main__":
    main()
