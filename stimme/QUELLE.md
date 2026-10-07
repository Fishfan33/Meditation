# Sprachaufnahmen

Die MP3-Dateien in diesem Ordner sind vorab auf dem Rechner des Inhabers erzeugt (offline), je Satz eine Datei.
Erzeugt von `werkzeuge/aufnahmen.py`; welche Stimme gilt, steht in `config.js` (`settings.stimme`, gewählt im
Admin-Bereich). Die App liest die Liste aus `js/aufnahmen.js`. Nicht von Hand bearbeiten.

| Stimme | Herkunft |
|---|---|
| **Chatterbox „Karlsson“** (Wahl des Inhabers, 7. Oktober 2026) | Programm **Chatterbox** 0.1.7 von Resemble AI, **MIT-Lizenz** (https://github.com/resemble-ai/chatterbox), mehrsprachiges Modell (`t3_mtl23ls_v2.safetensors`, SHA-256 `b1237586…6c75`), auf der CPU. Klangvorlage: eine 10,7 s lange Sprechprobe eines eigenen Probetexts, erzeugt mit der Piper-Stimme **de_DE-karlsson-low** (SHA-256 `f9793bf7…e8fe`, Länge ×1,15); diese ist laut Modellkarte auf dem **M-AILABS Speech Dataset** trainiert (https://www.caito.de/2019/01/03/the-m-ailabs-speech-dataset/, BSD-artige Lizenz). Vorlage `karlsson.wav` nur auf dem Rechner des Inhabers (`~/.local/share/meditation-app/vorlagen/`, SHA-256 `1f8fba87…e9e8`). Jede Aufnahme trägt das unhörbare Wasserzeichen von Chatterbox (Resemble Perth), das sie als computererzeugt kennzeichnet. |
| **Piper „Thorsten“** (Ersatzstimme, vorher Wahl „A2“) | Programm **Piper** 1.8.0 (GPL-3.0, betrifft nur das Programm, nicht die erzeugten Aufnahmen), Stimme **de_DE-thorsten-high** (SHA-256 `9df1c43c…a4f1`), trainiert auf dem Thorsten-Voice-Datensatz, **gemeinfrei (CC0)**. |

Keine Stimme einer realen Privatperson wird nachgeahmt; es werden nur Stimmen verwendet, die für Sprachsynthese
freigegeben sind. Namensnennung in `datenschutz.html`.
