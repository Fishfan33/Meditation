#!/usr/bin/env python3
"""Erzeugt das App-Symbol in allen benötigten Größen (Vorlage: werkzeuge/symbole.py im Retro-Cockpit).

    python3 werkzeuge/symbole.py

Braucht Chromium (zeichnet die SVG-Vorlage) und Pillow (verkleinert sauber). Ergebnis in icons/:
- icon.svg               Vorlage und Symbol im Browser-Tab (abgerundetes Quadrat)
- icon-192.png, -512.png Installation (Android, Computer), abgerundet mit durchsichtigen Ecken
- icon-maskable-512.png  Android schneidet selbst eine Form aus: volle Fläche, Motiv kleiner in der Mitte
- apple-touch-icon.png   iPhone/iPad (180 px), volle Fläche, iOS rundet die Ecken selbst
Motiv: Variante C des Inhabers (7. Oktober 2026): schlichter Nadelbaum im Profil aus drei weichen Ebenen in Dunkelgrün,
dahinter ein blassgrüner Mond, Stamm und Boden in Erdtönen, heller Creme-Grund (Farben der App).
"""
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "icons"
GRUND, MOND, BAUM, STAMM, BODEN = "#fffaf3", "#dfe6d4", "#2f4a3a", "#8a6246", "#c9a487"


def svg(scale, rounded):
    """Motiv auf 512 × 512 (gezeichnet auf 100 × 100, dann vergrößert)."""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
            f'<rect width="512" height="512" rx="{112 if rounded else 0}" fill="{GRUND}"/>'
            f'<g transform="translate(256 256) scale({scale}) translate(-256 -256) scale(5.12)">'
            f'<circle cx="50" cy="46" r="30" fill="{MOND}"/>'
            f'<rect x="48.5" y="66" width="3" height="16" rx="1.5" fill="{STAMM}"/>'
            f'<path d="M50 16 L62 36 Q50 33 38 36 Z" fill="{BAUM}"/>'
            f'<path d="M50 28 L66 52 Q50 48 34 52 Z" fill="{BAUM}"/>'
            f'<path d="M50 42 L70 69 Q50 64 30 69 Z" fill="{BAUM}"/>'
            f'<path d="M22 82 H78" stroke="{BODEN}" stroke-width="2.5" stroke-linecap="round"/></g></svg>\n')


def render(svg_text, size, path):
    """In 1024 px zeichnen und mit Lanczos verkleinern: weiche Kanten auch bei 180 px."""
    with tempfile.TemporaryDirectory() as tmp:
        src, png = Path(tmp, "s.svg"), Path(tmp, "s.png")
        src.write_text(svg_text.replace('viewBox="0 0 512 512"', 'viewBox="0 0 512 512" width="1024" height="1024"'))
        subprocess.run(["chromium", "--headless=new", "--disable-gpu", "--hide-scrollbars",
                        "--default-background-color=00000000", "--window-size=1024,1024",
                        f"--screenshot={png}", src.as_uri()], check=True, capture_output=True)
        im = Image.open(png).convert("RGBA").resize((size, size), Image.LANCZOS)
        if im.getextrema()[3][0] == 255:   # nichts durchsichtig (volle Fläche): ohne Alphakanal, kleiner
            im = im.convert("RGB")
        im.save(path, optimize=True)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    (OUT / "icon.svg").write_text(svg(0.95, rounded=True))
    render(svg(0.95, rounded=True), 192, OUT / "icon-192.png")
    render(svg(0.95, rounded=True), 512, OUT / "icon-512.png")
    render(svg(0.75, rounded=False), 512, OUT / "icon-maskable-512.png")   # Motiv im sicheren Kreis (80 %)
    render(svg(0.95, rounded=False), 180, OUT / "apple-touch-icon.png")
    for f in sorted(OUT.iterdir()):
        print(f"{f.name}: {f.stat().st_size // 1024 or 1} KB")
