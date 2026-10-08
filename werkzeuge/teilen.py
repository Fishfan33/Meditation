#!/usr/bin/env python3
"""Teilt eine am Stück erzeugte Aufnahme (z. B. ein Export aus ElevenLabs Studio) in einzelne Sätze.

    python3 werkzeuge/teilen.py <aufnahme.mp3> <texte.txt> <zielordner> [name]

texte.txt: ein Satz je Absatz (Leerzeile dazwischen), in der Reihenfolge der Aufnahme. Geschnitten wird in der Mitte
von Pausen, gewählt so, dass jeder Teil zur Länge seines Satzes passt (siehe ausrichten); die Tonspur selbst wird nicht neu kodiert (ffmpeg -c copy), also ohne
Qualitätsverlust. Zur Kontrolle: Je Satz wird die gesprochene Zeit (ohne Pausen) mit dem Anteil seiner Buchstaben verglichen; passt ein Teil
gar nicht (mehr als doppelt oder weniger als halb so lang wie erwartet), steht eine Warnung da. Ohne Zusatzpakete.
"""
import array, math, subprocess, sys
from pathlib import Path


def pegel(datei, sr=16000):
    roh = subprocess.run(["ffmpeg", "-v", "error", "-i", str(datei), "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"],
                         check=True, capture_output=True).stdout
    werte = array.array("h", roh)
    fr = sr // 100   # 10 ms
    return [math.sqrt(sum(x * x for x in werte[i:i + fr]) / fr) for i in range(0, len(werte) - fr + 1, fr)]


def ausrichten(still, luecken, saetze):
    """Wählt aus allen Pausen die n − 1 Schnitte so, dass jeder Teil zur Länge seines Satzes passt (Sprechzeit
    ungefähr proportional zu den Buchstaben) und lange Pausen bevorzugt werden – für alle Sätze gemeinsam
    (dynamische Programmierung). So verschiebt eine Komma-Pause, die zufällig lang ist, nicht alle folgenden Sätze."""
    n, sp = len(saetze), [0]
    for x in still:
        sp.append(sp[-1] + (0 if x else 1))
    rede = lambda a, b: (sp[min(int(b * 100), len(still))] - sp[min(int(a * 100), len(still))]) / 100
    ende = len(still) / 100
    pos = [0.0] + [t for _, t in luecken] + [ende]               # Kandidaten, 0 = Anfang, letzter = Ende
    bonus = [0.0] + [math.log(1 + l / 15) for l, _ in luecken] + [0.0]
    rate = rede(0, ende) / sum(len(x) for x in saetze)
    erwartet = [max(0.25, rate * len(x)) for x in saetze]
    m, INF = len(pos), float("inf")
    kosten = [[INF] * m for _ in range(n + 1)]
    zurueck = [[-1] * m for _ in range(n + 1)]
    kosten[0][0] = 0.0
    for k in range(1, n + 1):
        e = erwartet[k - 1]
        for i in range(1, m):
            if k < n and i == m - 1 or k == n and i != m - 1:
                continue
            best, arg = INF, -1
            for j in range(i - 1, -1, -1):
                if kosten[k - 1][j] == INF:
                    continue
                d = rede(pos[j], pos[i])
                if d > e * 4:
                    break
                if d < e * 0.25:
                    continue
                c = kosten[k - 1][j] + math.log(d / e) ** 2 - 0.3 * bonus[i]
                if c < best:
                    best, arg = c, j
            kosten[k][i], zurueck[k][i] = best, arg
    if kosten[n][m - 1] == INF:
        sys.exit("Keine passende Aufteilung gefunden. Stimmen Text und Aufnahme überein?")
    schnitte, i = [], m - 1
    for k in range(n, 0, -1):
        i = zurueck[k][i]
        if k > 1:
            schnitte.append(pos[i])
    return sorted(schnitte)


def main():
    aufnahme, texte, ziel = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    name = sys.argv[4] if len(sys.argv) > 4 else aufnahme.stem
    saetze = [s.strip() for s in texte.read_text(encoding="utf-8").split("\n\n") if s.strip()]
    n = len(saetze)
    p = pegel(aufnahme)
    spitze = max(p) or 1
    still = [20 * math.log10(x / spitze) < -40 if x > 0 else True for x in p]
    luecken, i = [], 0
    while i < len(still):
        if still[i]:
            j = i
            while j < len(still) and still[j]:
                j += 1
            if i > 0 and j < len(still) and j - i >= 15:   # mindestens 150 ms Pause, nicht am Rand
                luecken.append((j - i, (i + j) / 2 / 100))
            i = j
        else:
            i += 1
    if len(luecken) < n - 1:
        sys.exit(f"Nur {len(luecken)} Pausen gefunden, gebraucht werden {n - 1}. Bitte die Absätze im Text prüfen.")
    schnitte = ausrichten(still, luecken, saetze)
    grenzen = [0] + schnitte + [len(p) / 100]
    ziel.mkdir(parents=True, exist_ok=True)
    buchstaben = sum(len(s) for s in saetze)
    sprechzeit = lambda a, b: sum(1 for k in range(int(a * 100), int(b * 100)) if k < len(still) and not still[k]) / 100
    gesamt = sprechzeit(0, grenzen[-1])
    for k, (a, b, s) in enumerate(zip(grenzen, grenzen[1:], saetze), 1):
        out = ziel / f"{name}-{k:02d}{aufnahme.suffix}"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{a:.3f}", "-to", f"{b:.3f}", "-i", str(aufnahme),
                        "-c", "copy", str(out)], check=True)
        erwartet, gesprochen = gesamt * len(s) / buchstaben, sprechzeit(a, b)
        warn = "  ⚠ Länge passt nicht zum Text" if not 0.5 < gesprochen / erwartet < 2 else ""
        print(f"{out.name}: {gesprochen:4.1f} s gesprochen – {s}{warn}")


if __name__ == "__main__":
    main()
