#!/usr/bin/env python3
"""Erzeugt Hörproben der Klangschale (hoerproben/gong/). Die App erzeugt den Gong selbst (js/stimme.js, gong()),
mit denselben Teiltönen wie Probe „1b“ (Wahl des Inhabers). Braucht numpy (im Piper-Ordner vorhanden)."""
import numpy as np, wave, subprocess, pathlib
SR = 44100; LEN = 4.0
out = pathlib.Path(__file__).resolve().parent.parent / "hoerproben" / "gong"
rng = np.random.default_rng(7)
t = np.arange(int(SR * LEN)) / SR
def bowl(base, beat):
    y = np.zeros_like(t)
    # Ausklingen auf 4 Sekunden abgestimmt: Grundton trägt, Obertöne verklingen früher
    for r, a, d in [(1, 1, 1.9), (2.71, .45, 1.2), (5.15, .18, .7), (8.3, .06, .4)]:
        for det in (-beat, beat):
            y += a / 2 * np.sin(2 * np.pi * (base * r + det) * t + rng.uniform(0, 6.28)) * np.exp(-t / d)
    n = rng.standard_normal(len(t)) * np.exp(-t / .03); k = int(SR / 2500)
    y += np.convolve(n, np.ones(k) / k, "same") * .05
    m = int(SR * 1.5); ir = rng.standard_normal(m) * np.exp(-np.arange(m) / (SR * .3)); ir /= np.abs(ir).sum() / 8
    y = y * .8 + np.convolve(y, ir)[:len(y)] * .2
    y /= np.max(np.abs(y)); f = int(SR * .8); y[-f:] *= np.linspace(1, 0, f) ** 2
    return y * .8
for name, base, beat in [("1a-klangschale-tiefer", 130.8, .5), ("1b-klangschale-noch-tiefer", 110, .45), ("1c-klangschale-am-tiefsten", 87.3, .4)]:
    w = out / (name + ".wav")
    with wave.open(str(w), "wb") as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes((bowl(base, beat) * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(w), "-af", "loudnorm=I=-20:TP=-3", "-b:a", "128k", str(out / (name + ".mp3"))], check=True); w.unlink()
    print(name, base, "Hz")
