# Schrift: Atkinson Hyperlegible

Vom Braille Institute für gute Lesbarkeit entwickelt. Lizenz: SIL Open Font License 1.1 (`OFL.txt`).

Übernommen aus dem Retro-Cockpit (gleiche Dateien, Prüfsummen unten). Die Dateien werden mit der App ausgeliefert, nicht von Google oder einem anderen Server geladen
(CSP: `font-src 'self'`).

## Herkunft

- Quelle: offizielles Google-Fonts-Repository, https://github.com/google/fonts
- Pfad: `ofl/atkinsonhyperlegible/`
- Fester Stand: Commit `95f4904fc8bcf26d3420fe315560c96417c6dec7` (3. März 2026)
- Geladen am 5. Oktober 2026 über HTTPS; jede Datei per `git hash-object` gegen die Blob-ID im
  Repository geprüft (Byte für Byte identisch)

| Datei | SHA-256 |
|---|---|
| `AtkinsonHyperlegible-Regular.ttf` | `7fb917c89019896d0b52ee84b7cbb3304c18cb90b19a62f5e32712bd23e97669` |
| `AtkinsonHyperlegible-Bold.ttf` | `5a3b0c8cc8ca545155150b4512a1fa248298df121c50d6557e651e61fbdab92f` |
| `OFL.txt` | `f32d22b3908fcad2c86a74000614ec22e6a7f66ea7e867e616026a27aebdc143` |

Prüfen: `sha256sum -c` mit den Werten oben, oder `git hash-object <datei>` mit der Liste unter
`https://api.github.com/repos/google/fonts/contents/ofl/atkinsonhyperlegible?ref=95f4904`.

## Ausgelieferte Dateien: WOFF2

Seit Oktober 2026 liefert die App die Schrift als WOFF2 aus (53 → 22 KB je Schnitt). Die WOFF2-Dateien
sind verlustfrei aus den TTF-Dateien oben erzeugt (die TTF-Dateien liegen nicht mehr im Repository,
die Prüfsummen bleiben als Nachweis der Herkunft):

    python3 -m fontTools.ttLib.woff2 compress -o AtkinsonHyperlegible-Regular.woff2 AtkinsonHyperlegible-Regular.ttf

Werkzeug: fontTools 4.66.1 (Wheel von PyPI, SHA-256 `7234ae9e28db64273fbbfa72caebd0a97e3bdba6b05064114741b9539ef339d0`).
Geprüft: alle 369 Zeichen mit identischen Umrissen und Breiten, gleiche Zeichenzuordnung (cmap),
gleiche Abstände (GPOS) und Namen.

| Datei | SHA-256 |
|---|---|
| `AtkinsonHyperlegible-Regular.woff2` | `2df4ba17804bc7a36f123127966075d8427bff2df58d0d76820c1130bb1a4150` |
| `AtkinsonHyperlegible-Bold.woff2` | `da8fce41a04f8498fbf79076f92d304b12e70c76f71b143c5dcfb6536c93c075` |

# Ziffern: Inter (nur 0–9 , . : –)

Seit Oktober 2026 kommen die Ziffern aus Inter (klare Null ohne Schrägstrich, Wahl des Inhabers), alle übrigen
Zeichen weiter aus Atkinson Hyperlegible (CSS `unicode-range`). Lizenz: SIL Open Font License 1.1 (`OFL-Inter.txt`).

- Quelle: https://github.com/google/fonts, Pfad `ofl/inter/Inter[opsz,wght].ttf`, Commit
  `9710da1eacb3be272583c3224dcb70f9da6eadbb`, Blob-ID `047c92f6e2212473dc436020afed689527076d44` (geprüft)
- Erzeugt mit fontTools 4.66.1: Gewicht 400 bzw. 700 und opsz 14 fest eingestellt (`varLib.instancer`),
  dann auf die Zeichen `U+0030-0039, U+002C, U+002E, U+003A, U+2013` reduziert, mit gleich breiten
  Ziffern (`tnum`) und Unterschneidung (`kern`), als WOFF2 (`fontTools.subset`)

| Datei | SHA-256 |
|---|---|
| `InterZiffern-Regular.woff2` | `184aae0bd354f91440e19de473e2b51594e24c8b21acd3a63be2b5b3fc10089e` |
| `InterZiffern-Bold.woff2` | `12b93a0084ce2349f264ec90a6487c72dad6c3735104385d2173447b21596e89` |
| `OFL-Inter.txt` | `5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57` |

