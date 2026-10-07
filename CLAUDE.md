# Meditations-App

Web-App, die durch eine Meditation führt: Phasen an- oder abwählen, je Phase einen Text (Affirmationen bzw.
Sprüche) würfeln oder wählen, Gesamtdauer verteilen, dann „Starten“: Gong, Stimme liest vor, Stille, Gong.
Arbeitstitel „Meditation“, Name und Gestaltung sind noch offen (der Inhaber wählt aus Varianten).

## Aufbau

Reines HTML/CSS/JS wie im Retro-Cockpit. Klassische Skripte in `js/`, Reihenfolge aus `index.html`:
- `phasen.js` – `PHASES` (Anteil), Dauern (`STEP` = 1 Minute), `SOUNDS`
- `texte.js` – `DEFAULT_SAYINGS`: Grundbestand, je Phase eine geordnete Liste aus Sprüchen `{ id, text }` und
  optionalen Gruppen `{ id, name, items }` (Kraftort-Orte, Bodyscan- und Rückkehr-Abläufe); `id` nie ändern
- `config.js` (kein Skript in `js/`) – Fassung des Inhabers aus dem Admin-Bereich (Sprüche mit `active`, Klänge an/aus),
  geschrieben von `werkzeuge/admin_helfer.py`; `null` = Grundbestand. Nicht von Hand bearbeiten.
- `zustand.js` – `sayings`/`soundsOn` (aus config.js, geprüft mit `cleanSayings`/`cleanSounds`), `state` (nur im
  Speicher), Zeitverteilung in ganzen Minuten (`distribute`, `shiftBoundary`)
- `stimme.js` – Vorlesen: Aufnahmen (Thorsten) über Web Audio, ohne Aufnahme Browser-Stimme; Gong (Web Audio,
  Klangschale), Hintergrundklang (`startAmbience`). Start-Aufruf `chooseVoice()` steht am Dateiende (sonst bricht das Laden ab)
- `aufnahmen.js` – `self.RECORDINGS` (Satz → [Datei, Sekunden]), geschrieben von `werkzeuge/aufnahmen.py`
- `meldungen.js` – `showToast(msg, undo)` mit „Rückgängig“
- `plan.js` – `render()`: Skala, Phasen-Schalter, Zeitbalken, Klang-Auswahl
- `sitzung.js` – laufende Meditation: `buildSession()` (Gong, je Phase die aktiven Sprüche in Reihenfolge, von vorn,
  solange Zeit ist), Abspielen nach der Uhr, Pause, nächste Phase, Beenden mit zwei Tipps, Wake Lock
- `bedienung.js` – Klicks und Eingaben der Startseite
- `admin.js` – **Admin-Bereich** (nur lokal, `IS_ADMIN`): Reiter je Phase und „Klänge“; Sprüche ansehen, anhören,
  bearbeiten, hinzufügen, löschen (mit Rückgängig), aktiv/deaktiviert, per Ziehen am Griff ⠿ oder Pfeiltasten
  sortieren (Reihenfolge = Standard beim Vorlesen, Inhaber), auf einen anderen Phasen-Reiter ziehen oder beim Bearbeiten
  Phase und Gruppe wählen (Inhaber); Gruppen als Karten (anlegen, umbenennen, auf-/zuklappen, aktiv, auflösen, ziehen);
  **Löschen (Inhaber):** Gruppe nur nach roter Rückfrage (`#confirmDlg`, „Abbrechen“ vorausgewählt; nur auflösen oder mit
  allen Sprüchen löschen); nach jedem Löschen rote Meldung mit deutlichem „Rückgängig“ (`showToast(…, { danger })`, 10 s); Sprechdauer je Phase und je Spruch (Inhaber, geschätzt bis zu den Aufnahmen); Klänge
  deaktivieren; „Für alle veröffentlichen“. Speichert sofort über den Helfer. Gesamtdauer aller aktiven Sprüche unter den
  Reitern (Inhaber). Ladebalken der Vertonung, „noch nicht vertont“/„wird vertont …“ je Spruch, „Jetzt vertonen“.
  **Schutz vor Überschreiben:** Speichern schickt den Fingerabdruck (`configStand`, SHA-256 von config.js) mit; hat sich
  config.js inzwischen geändert, lehnt der Helfer ab („KONFLIKT“), die Seite zeigt rot „Seite neu laden“. Claude ändert
  Sprüche nur über `/api/speichern` mit aktuellem Fingerabdruck (Sicherung und Vertonung inklusive), nie direkt in der Datei.
  **Schutz vor Verlust:** jede Änderung zuerst im Browser (`localStorage`, nur Admin), roter Hinweis, wenn Speichern
  scheitert, Angebot zum Wiederherstellen beim nächsten Öffnen, Warnung beim Schließen; „Frühere Stände“.
- `start.js` – Offline-Kopie und Start (zuletzt)
- `werkzeuge/admin_helfer.py` – Admin-Helfer (Port 8766, nur dieser Rechner), startet beim Anmelden
  (`~/.config/autostart/meditation-admin.desktop` → `~/.local/share/meditation-app/admin-helfer-start.sh`, Protokoll
  `admin-helfer.log` daneben). Liefert die App aus; `POST /api/speichern` prüft und schreibt `config.js` (gleiche Regeln
  wie `cleanSayings`); `/api/vorschau` und `/api/veroeffentlichen` = „Für alle veröffentlichen“ wie im Retro-Cockpit:
  eigene Kopie des Originals (`git worktree`, `~/.local/share/meditation-app/veroeffentlichen-kopie`), Änderungen in
  Worten fürs Fenster, nach „Ja“ config.js dort schreiben, `versionen.sh`, Commit „Sprüche und Klänge aktualisiert“,
  `git push origin HEAD:main`. Ohne GitHub-Verbindung (noch kein `origin`) sagt er das verständlich.
  **Sicherungen:** vor jedem Speichern legt er den bisherigen Stand von config.js mit Uhrzeit in
  `~/.local/share/meditation-app/sicherungen/` ab (500 Stück); im Admin-Bereich „Frühere Stände“ zum Wiederherstellen.
  **Automatische Vertonung (Inhaber):** nach jedem Speichern im Hintergrund `aufnahmen.py` (gewählte Stimme, nur fehlende
  Sätze, Sperre gegen zwei gleichzeitige Läufe); `/api/aufnahme-status` für den Ladebalken mit Restzeit; wechseln Stimme oder
  Tempo während einer Vertonung, bricht er sie ab (Prozessgruppe) und beginnt neu; `/api/stimmen` für die Stimmenwahl; „Für alle veröffentlichen“ nimmt
  `stimme/`, `js/aufnahmen.js` und die Liste in `sw.js` mit. Optionen `--port`, `--kopie`, `--sicherungen` für Tests.
  **Vorsicht:** Der Helfer des Retro-Cockpits heißt genauso (`admin_helfer.py`); Prozesse nur über ihren Ordner
  (`/proc/<pid>/cwd`) unterscheiden, nie per `pkill -f admin_helfer`. Schutz wie im Retro-Cockpit: Host/Origin
  localhost, Kopf `X-Meditation: 1`, JSON. `http://127.0.0.2:8766/` zeigt die App wie veröffentlicht (ohne Admin).
Vorschau: Server „meditation“ in `.claude/launch.json` startet den Admin-Helfer; die Vorschau-Werkzeuge lesen derzeit
die `launch.json` des Retro-Cockpits, dort steht derselbe Eintrag (Ordner ist dort von Git ausgenommen).

Die allgemeinen Vorlieben des Inhabers (Deutsch, lokal/online kennzeichnen, Fachbegriffe übersetzen, Design in 2–3 Varianten,
Push und Übernahme-Anfragen nur nach OK) stehen in `~/.claude/CLAUDE.md`. Hier steht nur, was dieses Projekt betrifft.

## Entscheidungen

- **Der Inhaber meditiert selbst**, hauptsächlich auf einem **iPhone** (Inhaber, Oktober 2026). Die App führt durch:
  Gong, Stimme, Text groß auf dunklem Bildschirm. Jede Änderung auch in iPhone-Größe prüfen.
- Phasen (Inhaber): 1 Einstimmung, 2 Bodyscan, 3 Kraftort, 4 Die Arbeit im Unterbewussten, 5 Rückkehr; alle an- und
  abwählbar. Zeiten: Gesamtdauer (10/20/30 oder eigene) wird verteilt, je Phase änderbar (wie im Retro-Cockpit).
- Texte schreibt Claude als Vorschläge, der Inhaber streicht und ändert.
- **Aufbau (Inhaber, 6. Oktober 2026):**
  - Startseite nach Variante C (großer Startkreis, Phasen als Schalter), aber **hell in erdigen Pastelltönen**.
  - Oben die Gesamtdauer, in **1-Minuten-Schritten** verstellbar (Inhaber, 6. Oktober 2026, vorher 2,5); daneben ein kleiner Knopf mit
    Klangsymbol für den **Hintergrundklang**: Regen, Wald, Wind, Meer oder aus (leise Natur). Klänge selbst erzeugt
    (`werkzeuge/naturklaenge.py`), Regen als echte CC0-Aufnahme von Wikimedia, gefiltert („Regen C“, Wahl des Inhabers);
    Meer als echte Aufnahme im Original („Ufer Wellen“, CC BY-SA 4.0, Namensnennung in datenschutz.html, Wahl des Inhabers).
    Herkunft in `klang/QUELLE.md`. Wald und Wind vorläufig.
  - Klang-Auswahl (Inhaber): Der gewählte Klang **läuft sofort**, schon auf der Startseite, und spielt beim Starten
    ohne Unterbrechung weiter. In der Auswahl ein **waagrechter Lautstärkeregler** (`state.volume`). Dieselbe Auswahl
    mit Regler auch oben in der Meditations-Ansicht. Am Ende der Meditation blendet der Klang aus.
  - **Gong nur zu Beginn** der Meditation, nicht zwischen den Phasen. Klang: tiefe Klangschale, 4 Sekunden
    (vorläufig Probe „1b“, 110 Hz; der Inhaber hat noch nicht endgültig gewählt; Proben: `werkzeuge/gong.py`).
  - Phasen bleiben immer in derselben Reihenfolge.
  - **Sätze nacheinander mit einstellbarer Sprechpause** (Inhaber, 6. Oktober 2026): zuerst 1,1 s, dann „etwas länger“,
    Standard jetzt 2,0 s, im Admin-Bereich unter „Einstellungen“ 0,5–10 s in Zehntelsekunden (`settings.pause` in
    config.js, geprüft in `cleanSettings` und im Helfer); ist der Text einer Phase durch, geht es von vorn los.
    **Die Pause gilt auch zwischen den Sätzen innerhalb eines Spruchs** (Inhaber): `aufnahmen.py` nimmt jeden Satz einzeln
    auf (`saetze()`), `js/aufnahmen.js` hat je Spruch `[[Datei, Sek], …]`, `speak()` legt die Sätze mit `settings.pause`
    dazwischen auf die Ton-Zeitachse. Eine geänderte Pause wirkt sofort, ohne neue Aufnahmen.
  - **Zeitende einer Phase (Inhaber):** Ein Satz darf anfangen, solange die Phase läuft, und wird zu Ende gesprochen;
    danach kein neuer. Es ist in Ordnung, wenn kurze Phasen nicht alle Sätze schaffen. Läuft der letzte Satz über das
    Ende, beginnt die nächste Phase erst danach (nie zwei Sätze übereinander).
  - Gesamtdauer über eine **Skala zum Wischen** (Wahl B des Inhabers, statt Plus/Minus): klein und schmal, beim Berühren
    groß, beim Loslassen wieder klein, rastet jede Minute ein; fürs iPhone optimiert (natives Scrollen mit Snap).
    Schon beim Ziehen werden Phasen und Zeitbalken neu verteilt (Inhaber).
  - Unten ein Bereich zum Aufklappen mit dem Zeitbalken: Phasen vor dem Start gegeneinander
    verschieben, **in 1-Minuten-Schritten**, jede Phase mindestens 1 Minute (Inhaber, 6. Oktober 2026).
  - **Gruppen innerhalb einer Phase (Inhaber, 6. Oktober 2026), optional:** Sprüche, die zusammengehören (z. B. Kraftort
    „Strand“, „Wald“), bilden eine Gruppe; innerhalb einer Gruppe bleibt die Reihenfolge immer fest, nie Zufall.
    **Beim Einbau des Zufalls den Inhaber ausdrücklich darauf hinweisen: Der Zufall mischt nur die Gruppen** (der Inhaber hat darum
    gebeten). **Sprüche ohne Gruppe werden beim Zufall komplett gemischt** (Inhaber, 6. Oktober 2026), zusammen mit den
    Gruppen. Darstellung im Admin-Bereich: **Gruppen als Karten** (Wahl B des Inhabers): auf- und zuklappbar, mit Name, Zahl,
    Dauer, Schalter, Umbenennen, Löschen (Sprüche wandern dann nach „ohne Gruppe“), Sprüche zwischen Karten ziehen.
  - **Zufall zurückgestellt (Inhaber, 6. Oktober 2026), erst festlegen, wenn die Texte fertig sind.** Gewünscht:
    **Sprüche je Phase zufällig ohne Wiederholung:** Ein gesagter Spruch scheidet aus, bis alle einmal dran waren,
    dann wird neu gemischt; so lange, bis die Zeit der Phase um ist. Jede Meditation startet neu gemischt, nichts
    wird gespeichert. Vorläufig eingebaut: Einstimmung und Unterbewusstes gemischt, Bodyscan, Kraftort und
    Rückkehr als ein zufälliger Ablauf in fester Reihenfolge (Claudes Vorschlag, mit dem Inhaber noch nicht entschieden).
  - **Admin-Bereich wie im Retro-Cockpit**, nur lokal: Sprüche hinzufügen, löschen, deaktivieren, bearbeiten, per
    Ziehen sortieren (Reihenfolge = Standard beim Vorlesen), Hintergrundklänge deaktivieren (Inhaber, 6. Oktober 2026).
    Veröffentlicht wird nur die Version ohne Admin-Bereich (Knopf dort unsichtbar; beim Veröffentlichen prüfen, ob
    `js/admin.js` ganz wegbleiben soll).
- **Stimme:** männlich, natürlich, ruhig und bestimmt, vorgelesen (Text-to-Speech). **Kein Bezahldienst** (Inhaber).
  Plan: Aufnahmen vorab auf dem Rechner des Inhabers mit Piper erzeugen (kostenlos, offline), der Inhaber wählt die Stimme nach
  Hörproben. Bis dahin liest die Browser-Stimme vor.
- Web-App, die sich aufs Handy legen lässt und offline läuft; keine App-Store-App (bräuchte einen Mac) (Inhaber, Oktober 2026).
- **Speichert vorerst nichts** (Inhaber, Oktober 2026). Vielleicht später; dann nur im Browser des Geräts, Datenschutzseite
  ergänzen und alles Geladene prüfen (siehe „Daten und Datenschutz“).
- **Veröffentlicht** (6. Oktober 2026): öffentliches Projekt https://github.com/Fishfan33/Meditation, Seite
  https://fishfan33.github.io/Meditation/ (GitHub Pages aus main, HTTPS erzwungen). Ein privates Projekt mit Pages ginge
  nur mit bezahltem Konto. Einstellungen: Regelsatz „main schützen“ (nicht löschen, kein Überschreiben der Geschichte;
  direktes Hochladen auf main bleibt für den Admin-Helfer möglich), Secret Scanning und Push Protection an, Wiki aus,
  gemergte Arbeitskopien werden gelöscht. Actions bleiben an: GitHub Pages braucht sie zum Veröffentlichen.
  Erstes Hochladen als neue Geschichte mit einem Stand; die alte Geschichte liegt nur lokal in `geschichte-lokal`
  (nie hochladen, enthält den Vornamen in Commit-Nachrichten).

## Offen (Stand 5. Oktober 2026)

- Reihenfolge ursprünglich: erst Aufbau, dann Texte, dann aufnehmen. **Am 6. Oktober 2026 wollte der Inhaber die Stimme
  schon jetzt** (Aufnahmen mit A2). Unkritisch: `aufnahmen.py` nimmt später nur neue oder geänderte Sprüche auf.
- Stimme gewählt: **A2 = Thorsten (de_DE-thorsten-high), etwas langsamer** (Inhaber, Oktober 2026). Piper 1.8.0 und die
  Stimmen liegen in `~/.local/share/meditation-stimme` (geprüfte Prüfsummen). Aufnehmen mit
  `~/.local/share/meditation-stimme/venv/bin/python werkzeuge/aufnahmen.py` (schreibt `stimme/*.mp3`,
  `js/aufnahmen.js` und die Liste in `sw.js`); danach `js/aufnahmen.js` in `index.html` vor `stimme.js` eintragen,
  `media-src` um `blob:` ergänzen und die App auf die Tonspur umbauen. Herkunft der Stimme dann in `stimme/QUELLE.md`.
- iPhone mit gesperrtem Bildschirm: Safari hält dann Zeitgeber und Sprachausgabe an. Plan: Mit den Aufnahmen die
  ganze Meditation als **eine durchgehende Tonspur** abspielen (Sätze, Stille, Gong zusammengesetzt, `<audio>`),
  die läuft auch gesperrt weiter und ignoriert den Stumm-Schalter. Bis dahin bleibt der Bildschirm an (Wake Lock).
  Auf dem iPhone des Inhabers testen (als Symbol auf dem Home-Bildschirm, dann bleibt auch die Offline-Kopie dauerhaft).
- Gestaltung (Farben, Meditations-Ansicht, Symbol, Name) in Varianten vorlegen; Ton der Texte mit dem Inhaber abstimmen.
- **Audit (Inhaber, Oktober 2026):** Wenn der Aufbau fertig ist und vor den Texten ein umfassendes Audit der
  Meditations-App über alle Bereiche aus `~/.claude/CLAUDE.md` („Audits“), mit Bericht; danach das Retro-Cockpit.
- Automatische Tests (`werkzeuge/tests.py` nach Vorlage des Retro-Cockpits) fehlen noch.
- **Security-Audit (Oktober 2026), vor dem ersten Hochladen:** behoben: Helfer liefert nur der eigenen Seite aus (Host
  geprüft, keine versteckten Ordner wie `.git`, keine Ordnerlisten), Datenschutzseite auf die Aufnahmen angepasst, keine
  persönlichen Angaben in Projektdateien („der Inhaber“); erstes Hochladen als neue Geschichte (siehe oben).

## Stimmen (Stand 7. Oktober 2026)

- **Mehrere Sprachprogramme** (Wunsch des Inhabers: am Ende nur noch Programm und eine von etwa fünf Stimmen wählen, danach
  soll es direkt funktionieren): `werkzeuge/stimmen.json` (Katalog: Programme Piper, XTTS-v2, Chatterbox mit je fünf
  Stimmen, Ordner unter `~/.local/share/`, Hörprobe), `werkzeuge/sprecher.py` (läuft in der Python-Umgebung des Programms,
  spricht Satz für Satz als WAV, offline: `HF_HUB_OFFLINE=1`), `werkzeuge/aufnahmen.py` (System-Python: liest Texte und
  `settings.stimme`, Rohaufnahmen-Zwischenspeicher `~/.local/share/meditation-app/rohaufnahmen/<programm>-<stimme>/`,
  daraus MP3 mit Tempo per Rubber Band, tonhöhenerhaltend; Liste erst am Ende ausgetauscht, bis dahin die alte Stimme).
  Piper Thorsten bei 100 % behält die alten Dateinamen (keine neuen Aufnahmen nötig).
- Wahl im Admin-Bereich unter „Einstellungen“ (Variante A „im Admin-Bereich“, Claudes Empfehlung, mit dem Inhaber noch nicht
  entschieden): Programm-Umschalter, Stimmen mit Hörprobe und „Wählen“ (mit Rückgängig), Sprechtempo 80–120 %, Pause.
  `config.js` `settings.stimme = {programm, stimme, tempo}` (fehlt = Standard), geprüft in `cleanVoice` und im Helfer.
- Wartezeiten: Pause sofort; Tempo etwa 1–2 Min. (umrechnen); neue Stimme einmal alle Sätze: Piper ~3 Min., XTTS ~30 s und
  Chatterbox ~60 s je Satz auf diesem Rechner; zurück zu einer benutzten Stimme schnell.
- Entscheidungsvorlage mit allen Hörproben: `hoerproben/entscheidung/index.html` (lokal, von Git ausgenommen), auch als
  private Seite auf claude.ai (fürs iPhone). Code auf Arbeitskopie `stimmen-wahl` (lokal gespeichert, Hochladen nur nach
  OK); der Admin-Helfer läuft bereits mit diesem Stand. Erst den Code mergen, dann eine neue Stimme veröffentlichen.
  **Nach der Wahl des Inhabers:** das andere Programm löschen (Ordner `~/.local/share/meditation-xtts` bzw.
  `meditation-chatterbox`, seine Hörproben, Rohaufnahmen und Einträge in `stimmen.json`), `~/.pkuseg` gehört zu Chatterbox.
  Bei MLS-Stimmen (CC BY 4.0) Namensnennung in `datenschutz.html`; Herkunft in `stimme/QUELLE.md`.
- Sicherheit: nur Stimmen, die für Sprachsynthese freigegeben sind (Thorsten CC0, Karlsson M-AILABS, MLS CC BY 4.0,
  XTTS-Studiostimmen), keine Stimmen realer Privatpersonen nachgeahmt. Modelle mit geprüften Prüfsummen, geladen mit
  `weights_only`/safetensors. Chatterbox lud beim ersten Start `spacy_ontonotes.zip` (Explosion/spaCy auf GitHub,
  SHA-256 b216e7f9…, nur msgpack und npz ohne Pickle) nach `~/.pkuseg`. XTTS-v2: Lizenz nur nicht-kommerziell (CPML).

## Weiter am nächsten Tag (Stand 6. Oktober 2026, abends)

- **Stimme natürlicher machen:** Hörproben `hoerproben/vergleich/` (1 Piper wie jetzt, 2 Piper lebendiger:
  length 1,2, noise 0,85, noise-w 1,1) – **„lebendiger“ ist laut Inhaber schlechter, Piper-Einstellungen bleiben (A2)**. Als Nächstes: XTTS-v2 mit Thorsten-Vorlage installieren (2–3 GB, eigener Ordner,
  vorher Sicherheitsprüfung wie bei Piper erklären) und Proben 3/4 erzeugen; Alternativen für Deutsch: Azure
  Killian/Conrad (Konto nötig), ElevenLabs (bezahlt). Der Inhaber entscheidet nach Gehör.
- Übernahme-Anfragen #1 und #2 sind gemergt (Satz-Pausen, iPhone: Restzeit sichtbar, Aufnahmen robust); online geprüft.
- Danach: durchgehende Tonspur fürs gesperrte iPhone, iPhone-Test, automatische Tests, Audit (alle Bereiche).

## Erkenntnisse aus dem Retro-Cockpit

Vorbild ist das Schwesterprojekt Retro-Cockpit (Ordner `retro-cockpit` auf demselben Rechner, öffentlich unter
https://fishfan33.github.io/retro-cockpit/). Dessen CLAUDE.md erklärt jede Lösung genauer; die Werkzeuge von dort
als Vorlage übernehmen und anpassen, nicht neu erfinden. Was nur zur Retro gehört (Phasen, Methoden, Teilen-Link,
Admin-Modus), gilt hier nicht.

### Aufbau

- Reines HTML/CSS/JS, kein Build, keine Abhängigkeiten, kein Server. GitHub Pages liefert die Dateien direkt aus.
- Strenge Content-Security-Policy im `<meta>` von `index.html`: nur eigene Dateien (`'self'`), kein Inline-Script,
  keine CDNs, keine fremden Schriften. Vorlage: `default-src 'none'; script-src 'self'; connect-src 'self';
  worker-src 'self'; manifest-src 'self'; style-src 'self' 'unsafe-inline'; style-src-elem 'self';
  style-src-attr 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; base-uri 'none'; form-action 'none'`.
- Mehrere kleine Dateien mit deutschen Namen nach Themen statt einer großen (der Inhaber wollte das im Retro-Cockpit).
  Klassische Skripte statt Module (Module laufen nicht, wenn man `index.html` als Datei öffnet): gemeinsamer
  Gültigkeitsbereich, Reihenfolge aus `index.html`, keine Namen doppelt.
- Farben als CSS-Variablen auf `:root`, Dunkelmodus über `prefers-color-scheme`.

### Cache, Offline-Kopie, Zeitgeber

- GitHub Pages cacht 10 Minuten. Deshalb hängen an CSS/JS Versionen `?v=<Prüfsumme>`, gesetzt von
  `werkzeuge/versionen.sh` über den Git-Hook `.githooks/pre-commit` (`git config core.hooksPath .githooks`),
  nie von Hand. Vorlage: beide Dateien im Retro-Cockpit.
- Offline-Kopie per Service Worker (`sw.js`) und `manifest.json`: alle Dateien in `FILES`. Eine neue Version
  installiert sich im Hintergrund, die App zeigt „Neue Version verfügbar“, erst „Neu laden“ übernimmt sie.
  **Nie automatisch neu laden** – hier noch wichtiger als in der Retro: nie mitten in einer Meditation.
  Installation abbrechen, wenn die geholte Startseite nicht zu den Versionen passt (GitHub liefert nach dem
  Veröffentlichen bis zu 10 Minuten evtl. noch die alte).
- Die Browser-Vorschau der Claude-App kann keine Service Worker; Offline und Updates prüfen die automatischen Tests.
- Browser bremsen Zeitgeber in Hintergrund-Tabs und gesperrten Bildschirmen: Zeiten immer aus der Uhr berechnen
  (`Date.now()`/`performance.now()`), nie durch Mitzählen von Ticks.

### Lesbarkeit und Gestaltung

- Schrift Atkinson Hyperlegible (Regular/Bold) als WOFF2 lokal in `fonts/`, Herkunft und Prüfsummen in
  `fonts/QUELLE.md`, in `index.html` vorgeladen (`rel="preload"`). Nur zwei Schnitte, also keine Zwischengewichte.
  Ziffern aus Inter (`@font-face` mit `unicode-range`): Der Inhaber fand die durchgestrichene Null von Atkinson zu verspielt.
  Dateien und Lizenzen liegen im Retro-Cockpit unter `fonts/`.
- Kontrast mindestens 4,5:1 für jede Schrift, auch auf farbigen Flächen und im Dunkelmodus (eigene Variable für
  Schrift auf Akzentflächen; Weiß auf hellem Blau reichte im Dunkelmodus nicht). Ein Test misst das.
- Ruhig: Farbe sparsam, ein auffälliges Element je Ansicht, keine Schattenkarten.
- Keine Großbuchstaben-Labels, keine „A · B“-Trennungen.
- Bedienflächen mindestens 44 px hoch. Reine Symbolknöpfe bekommen `aria-label` und `title`.

### Handy und Browser-Eigenheiten

- iPhone/Safari: `position: fixed` in verschobenen oder transformierten Containern geht schief, feste Elemente
  einzeln fixieren. Unten fixierte Leisten: `body` bekommt unten genauso viel Platz, sonst verdecken sie Inhalt.
- Am Handy Auswahl als Blatt von unten; Zahlen und Uhrzeiten über eigene Räder (Scroll-Snap) statt Tastatur oder
  Browser-Zeitauswahl (die beachtete `step` nicht).
- Firefox mit Textcursor-Navigation (F7, bei der Inhaber an): `mousedown` auf Klickflächen ohne Text verhindern, sonst steht
  ein Cursor-Strich neben Knöpfen.
- Pfeile zum Auf-/Zuklappen: nur das Symbol drehen, nie den Knopf.
- Fenster als echte `<dialog>`, nur über eine zentrale `openDialog()`: Fokus bleibt drin, Escape schließt, Klick
  daneben schließt nur, wenn er auch daneben begann, danach Fokus zurück (per `setTimeout`).
- Beim Neuzeichnen Scrollposition und Fokus erhalten, sonst springt die Seite am Handy nach oben.
- Meldungen mit „Rückgängig“ statt Rückfragen (`showToast`/`withUndo` im Retro-Cockpit).
- Änderungen immer auch in iPhone-Größe und im Dunkelmodus prüfen.

### Daten und Datenschutz

- Alles, was geladen wird (Speicher, Link, Einstellungen), läuft durch eine Prüffunktion (Muster `sanitizeState`):
  Unbekanntes und Ungültiges verwerfen, neue Felder dort mit Prüfung ergänzen.
- Daten in Links nur hinter dem `#` (geht nicht an den Server), nur IDs und Zahlen, mit Versionsnummer.
- Datenschutzseite `datenschutz.html` ohne Namen und ohne Skripte, in der Fußzeile verlinkt; jeden neuen
  Datenfluss (Speichern, Offline-Kopie, Teilen) dort ergänzen.

### Texte

- Im Retro-Cockpit gilt „freundlich, aber bestimmt“ mit Ansagen an die Gruppe. Den Ton für die Meditations-App mit
  der Inhaber neu festlegen und hier eintragen.

### Testen

- **`config.js`, `stimme/` und `js/aufnahmen.js` im Arbeitsordner nie durch Tests verändern:** der Inhaber arbeitet dort
  im Admin-Bereich. Admin-Tests in einer Kopie mit eigenem Helfer (`admin_helfer.py --ordner <Kopie> --port 8767
  --kopie <Kopie-Original>`). Am 6. Oktober 2026 hat Claude beim Zurücksetzen nach Tests überarbeitete des Inhabers Texte in
  config.js überschrieben.

- **Ziehen immer mit echten Maus-/Fingerbewegungen prüfen** (in der Vorschau `computer left_click_drag`; Koordinaten
  dort = CSS-Pixel × Faktor, z. B. 800/innerWidth). Künstlich an den Griff geschickte Ereignisse verdecken Fehler:
  Beim Umhängen eines Elements verliert der Browser das „Festhalten“ des Zeigers, und das eingebaute Ziehen des
  Browsers (`dragstart`) bricht mit `pointercancel` ab. Deshalb im Admin-Bereich Bewegungen auf `document` abhören
  und `dragstart` unterbinden (Fehler, den der Inhaber im Oktober 2026 bemerkt hat).

- Automatische Tests als Python-Skript `werkzeuge/tests.py` (Vorlage im Retro-Cockpit): eigener Server mit einer
  Kopie der App, Chromium per DevTools-Protokoll mit echten Maus- und Tastatureingaben, Handy- und Dunkelmodus,
  Kontraste, Offline-Kopie und Update-Hinweis; einige Prüfungen zusätzlich in Firefox (WebDriver BiDi, mit
  Textcursor-Navigation an); Bildschirmfotos gegen Referenzbilder (`--referenz` übernimmt sie nach einer gewollten
  Änderung). Braucht `chromium` und `python3-websockets` (beides vorhanden).
- **Vor jedem Veröffentlichen alle Prüfungen grün.** Neue Funktionen bekommen eine Prüfung.
- Zufall in Bildern an den Text hängen (Prüfsumme), nicht an `Math.random`, damit Referenzbilder stabil bleiben.
- Zweiten Tab im Test schließen und den ersten wieder nach vorn holen, sonst bremst der Browser dort Animationen
  und Zeitgeber.

### Git und Veröffentlichen

- **Erst Code, dann Daten (Fehler 7. Oktober 2026):** „Für alle veröffentlichen“ im Admin-Bereich lädt Daten (config.js,
  `stimme/`, `js/aufnahmen.js`) direkt auf main, unabhängig von offenen Übernahme-Anfragen. Ändert sich das **Format**
  dieser Daten (z. B. Aufnahmen je Satz), muss der Code, der es liest, **vorher** auf main sein, sonst bricht die
  veröffentlichte App (Folge damals: auf dem iPhone sprach die Browser-Stimme). Neue Formate deshalb immer rückwärts-
  verträglich lesen und Format-Änderungen erst nach dem Mergen des Codes veröffentlichen.

- GitHub Pages aus Branch `main`. Arbeit auf einer Arbeitskopie (Branch), dann Übernahme-Anfrage; der Inhaber mergt (Squash).
- Commit-Identität in diesem Ordner: `Fishfan33` mit der GitHub-noreply-Adresse (lokal eingestellt).
- Vorschau-Server: Port 8765 belegt der Admin-Helfer des Retro-Cockpits, hier einen anderen nehmen (z. B. 8766).
