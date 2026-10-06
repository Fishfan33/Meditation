#!/usr/bin/env python3
"""Erzeugt das App-Symbol in allen benötigten Größen (Vorlage: werkzeuge/symbole.py im Retro-Cockpit).

    python3 werkzeuge/symbole.py

Braucht Chromium (zeichnet die SVG-Vorlage) und Pillow (verkleinert sauber). Ergebnis in icons/:
- icon.svg               Vorlage und Symbol im Browser-Tab (abgerundetes Quadrat)
- icon-192.png, -512.png Installation (Android, Computer), abgerundet mit durchsichtigen Ecken
- icon-maskable-512.png  Android schneidet selbst eine Form aus: volle Fläche, Motiv kleiner in der Mitte
- apple-touch-icon.png   iPhone/iPad (180 px), volle Fläche, iOS rundet die Ecken selbst
Motiv vorläufig (der Inhaber wählt noch aus Varianten): warmes Licht über ruhigem Wasser, Nachthimmel.
"""
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "icons"
BG_TOP, BG_BOTTOM, GLOW, WAVE = "#2a3150", "#141826", "#e8b465", "#8fb0d9"


def svg(scale, rounded):
    """Motiv auf 512 × 512: leuchtender Kreis, darunter zwei sanfte Wellen."""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
            f'<defs><linearGradient id="h" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="{BG_TOP}"/><stop offset="1" stop-color="{BG_BOTTOM}"/></linearGradient>'
            f'<radialGradient id="g"><stop offset=".55" stop-color="{GLOW}"/>'
            f'<stop offset=".7" stop-color="{GLOW}" stop-opacity=".35"/><stop offset="1" stop-color="{GLOW}" stop-opacity="0"/>'
            f'</radialGradient></defs>'
            f'<rect width="512" height="512" rx="{112 if rounded else 0}" fill="url(#h)"/>'
            f'<g transform="translate(256 256) scale({scale}) translate(-256 -256)">'
            f'<circle cx="256" cy="214" r="150" fill="url(#g)"/>'
            f'<path d="M96 346c40-22 80-22 120 0s80 22 120 0 80-22 100-11" stroke="{WAVE}" stroke-width="18" '
            f'stroke-linecap="round" fill="none"/>'
            f'<path d="M136 406c30-16 60-16 90 0s60 16 90 0 50-14 60-8" stroke="{WAVE}" stroke-opacity=".6" '
            f'stroke-width="16" stroke-linecap="round" fill="none"/></g></svg>\n')


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
