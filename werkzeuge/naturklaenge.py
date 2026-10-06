#!/usr/bin/env python3
"""Erzeugt die Hintergrundklänge Regen, Wald, Wind und Meer selbst (kein Download, keine fremden Aufnahmen).

    ~/.local/share/meditation-stimme/venv/bin/python werkzeuge/naturklaenge.py [Zielordner]

Braucht numpy (im Piper-Ordner) und ffmpeg. Jeder Klang ist eine nahtlose Schleife von 60 Sekunden in Stereo:
64 Sekunden werden erzeugt, die letzten 4 Sekunden in den Anfang überblendet. Zufall mit festem Startwert,
damit jeder Lauf dieselben Dateien ergibt. Standard-Ziel: hoerproben/natur/ (zum Probehören).
"""
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
LEN, FADE = 64, 4
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "hoerproben/natur"
N = SR * LEN
t = np.arange(N) / SR


def band(noise, lo, hi):
    """Rauschen auf einen Frequenzbereich begrenzen (weiche Kanten)."""
    f = np.fft.rfftfreq(len(noise), 1 / SR)
    spec = np.fft.rfft(noise)
    g = 1 / (1 + (lo / np.maximum(f, 1)) ** 4) / (1 + (f / hi) ** 4)
    return np.fft.irfft(spec * g, len(noise))


def pink(rng):
    w = rng.standard_normal(N)
    f = np.fft.rfftfreq(N, 1 / SR)
    return np.fft.irfft(np.fft.rfft(w) / np.sqrt(np.maximum(f, 20)), N)


def slow(rng, rate, lo=0.0, hi=1.0):
    """Langsam schwankende Hüllkurve (geglättetes Zufallssignal)."""
    pts = rng.random(int(LEN * rate) + 3)
    pos = t * rate
    i = pos.astype(int)
    frac = (1 - np.cos(np.pi * (pos - i))) / 2   # weich von Punkt zu Punkt (Kosinus), ohne Knicke
    x = pts[i] * (1 - frac) + pts[i + 1] * frac
    return lo + (hi - lo) * (x - x.min()) / (np.ptp(x) + 1e-9)


def norm(x):
    return x / (np.max(np.abs(x)) + 1e-9)


def tropfen(rng, n, f_lo, f_hi, a_lo, a_hi, laenge):
    """Viele einzelne Wassertropfen: kurzer Ton, der beim Aufprall in der Höhe nach oben gleitet und schnell
    verklingt (so klingt ein „Plip“), dazu ein winziger weicher Anschlag."""
    x = np.zeros(N)
    for _ in range(n):
        k = rng.integers(int(SR * laenge[0]), int(SR * laenge[1]))
        i = rng.integers(0, N - k)
        tt = np.arange(k) / SR
        f = rng.uniform(f_lo, f_hi) * (1 + rng.uniform(.2, .8) * tt / tt[-1])
        ton = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / (tt[-1] / 4))
        x[i:i + k] += rng.uniform(a_lo, a_hi) * ton * np.minimum(1, tt / .002)
    return x


def regen(rng):
    # Wie bei „Rainy Mood“: weiches, dichtes Plätschern auf einem warmen, tiefen Grund, kaum Zischen
    grund = norm(band(pink(rng), 120, 1400)) * slow(rng, .1, .75, 1) * .55
    fern = band(tropfen(rng, int(LEN * 160), 700, 1800, .02, .08, (.008, .02)), 400, 3500)   # dichter Regen in der Ferne
    nah = band(tropfen(rng, int(LEN * 7), 500, 1300, .12, .4, (.02, .05)), 300, 3000)        # einzelne nahe Tropfen
    rinne = band(tropfen(rng, int(LEN * 2), 350, 700, .1, .25, (.04, .08)), 250, 2000)       # Tropfen aus der Regenrinne
    return grund + norm(fern) * .55 + norm(nah) * .45 + norm(rinne) * .25


def wind(rng):
    bands = [(150, 400), (300, 800), (600, 1500), (1200, 3000)]
    x = sum(norm(band(pink(rng), lo, hi)) * slow(rng, rate, .05, 1) ** 2
            for (lo, hi), rate in zip(bands, [.08, .11, .14, .2]))
    return x * slow(rng, .05, .4, 1)


def meer(rng):
    # Wellen alle 7–12 Sekunden: Anschwellen, Brechen, Auslaufen; das Zischen der Gischt kommt etwas später
    env, gisch = np.zeros(N), np.zeros(N)
    pos = 0.0
    while pos < LEN:
        dur = rng.uniform(7, 12)
        a = rng.uniform(.6, 1)
        tt = t - pos
        m = (tt >= 0) & (tt < dur + 6)
        rise, fall = dur * .35, dur * .65
        e = np.where(tt < rise, (tt / rise) ** 2, np.exp(-(tt - rise) / (fall / 2.5)))
        env[m] += a * e[m]
        tg = tt - .8
        eg = np.where((tg >= 0) & (tg < rise), (tg / rise) ** 3, np.where(tg >= rise, np.exp(-(tg - rise) / (fall / 3.5)), 0))
        gisch[m] += a * eg[m]
        pos += dur
    tief = norm(band(pink(rng), 80, 900)) * (.15 + env)
    hoch = norm(band(rng.standard_normal(N), 1500, 9000)) * gisch * .5
    return tief + hoch


def wald(rng):
    # Nur Vögel, ohne Rauschen (Inhaber): verschiedene Arten, nah und fern, mit Pausen dazwischen
    voegel = np.zeros(N)
    pos = 0.5
    arten = [  # (Grundfrequenz, Spannweite, Tonlänge, Töne je Ruf, Lautstärke)
        (3200, 900, .09, (3, 6), .5), (4200, 1200, .05, (5, 10), .35), (2400, 500, .18, (2, 3), .45),
    ]
    while pos < LEN - 2:
        f0, span, tl, (k1, k2), amp = arten[rng.integers(len(arten))]
        amp *= rng.uniform(.3, 1)   # nah und fern
        for _ in range(rng.integers(k1, k2 + 1)):
            n = int(tl * SR * rng.uniform(.8, 1.2))
            i = int(pos * SR)
            if i + n >= N:
                break
            tt = np.arange(n) / SR
            f = f0 + span * np.sin(np.pi * tt / tl * rng.uniform(.5, 1.5)) * rng.choice([-1, 1])
            ph = 2 * np.pi * np.cumsum(f) / SR
            voegel[i:i + n] += amp * np.sin(ph) * np.sin(np.pi * tt / tt[-1]) ** 2
            pos += tl * rng.uniform(1.2, 1.8)
        pos += rng.uniform(1.0, 4.5)
    return band(voegel, 1500, 9000)


def loop(x):
    """Letzte FADE Sekunden in den Anfang überblenden: nahtlose Schleife."""
    n = FADE * SR
    w = np.linspace(0, 1, n)
    head = x[:n] * w + x[-n:] * (1 - w)
    return np.concatenate([head, x[n:-n]])


def save(name, left, right):
    stereo = np.stack([loop(left), loop(right)], 1)
    stereo = stereo / np.max(np.abs(stereo)) * .7
    OUT.mkdir(parents=True, exist_ok=True)
    w = OUT / f"{name}.wav"
    with wave.open(str(w), "wb") as f:
        f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR)
        f.writeframes((stereo * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(w), "-af", "loudnorm=I=-26:TP=-6",
                    "-ar", str(SR), "-b:a", "96k", str(OUT / f"{name}.mp3")], check=True)
    w.unlink()
    print(name, (OUT / f"{name}.mp3").stat().st_size // 1000, "KB")


def regen_prasseln(rng):
    """Regen B: nur weiches Prasseln ohne Tonhöhe (viele winzige, gefilterte Rausch-Stöße) auf warmem Grund."""
    grund = norm(band(pink(rng), 150, 2500)) * slow(rng, .08, .85, 1)
    knistern = np.zeros(N)
    for _ in range(int(LEN * 900)):
        k = rng.integers(40, 220)
        i = rng.integers(0, N - k)
        knistern[i:i + k] += rng.standard_normal(k) * np.exp(-np.arange(k) / (k / 4)) * rng.uniform(.02, .2) ** 2
    return grund * .7 + norm(band(knistern, 900, 6000)) * .45


# Regen C: echte Aufnahme, gemeinfrei (CC0): „Light Rain Distant Thunder July 5th 2016“ von kvgarlic,
# Wikimedia Commons (ursprünglich Freesound 349454), Wald im Mittleren Westen der USA. Geladen nach
# ~/.local/share/meditation-stimme/natur-quellen/regen-kvgarlic.wav, SHA-1 f01eb449e15f0a7647ba37ea3b54713ebb82d71c
# (wie von Wikimedia angegeben), SHA-256 aa85a4aa26b261b8d8d9da52df3cb1c7f09aa86f5253e835ff5e15513e2451cb.
# Verwendet: Sekunde 33 bis 97 (der Donner liegt bei 23–30), tiefes Grollen unter 160 Hz herausgefiltert.
QUELLE_REGEN = Path.home() / ".local/share/meditation-stimme/natur-quellen/regen-kvgarlic.wav"


def regen_echt():
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", "33", "-t", str(LEN), "-i", str(QUELLE_REGEN),
                          "-af", "highpass=f=160:poles=2,highpass=f=160:poles=2", "-ar", str(SR), "-ac", "2",
                          "-f", "f32le", "-"], check=True, capture_output=True).stdout
    x = np.frombuffer(raw, np.float32).reshape(-1, 2).astype(float)
    return x[:, 0], x[:, 1]


if __name__ == "__main__":
    for k, (name, fn) in enumerate([("regen", regen), ("wald", wald), ("wind", wind), ("meer", meer)]):
        # Links und rechts leicht verschieden (räumlich), aber mit gemeinsamem Grundzug
        base = fn(np.random.default_rng(100 + k))
        other = fn(np.random.default_rng(200 + k))
        save(name, base * .75 + other * .25, base * .25 + other * .75)
    a, b = regen_prasseln(np.random.default_rng(110)), regen_prasseln(np.random.default_rng(210))
    save("regen-b-prasseln", a * .75 + b * .25, a * .25 + b * .75)
    if QUELLE_REGEN.exists():
        save("regen-c-echt", *regen_echt())
