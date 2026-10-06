#!/usr/bin/env python3
"""Admin-Helfer der Meditation: zeigt die App auf diesem Rechner und speichert, was der Inhaber im Admin-Bereich ändert.

    python3 werkzeuge/admin_helfer.py            # http://localhost:8766/ (Admin), http://127.0.0.2:8766/ (öffentlich)

Vorlage: werkzeuge/admin_helfer.py im Retro-Cockpit. Startet beim Anmelden von selbst
(~/.config/autostart/meditation-admin.desktop → ~/.local/share/meditation-app/admin-helfer-start.sh, Protokoll
admin-helfer.log daneben).
- Liefert die App-Dateien aus (immer frisch, ohne Zwischenspeicher).
- POST /api/speichern: nimmt Sprüche und Klänge aus dem Admin-Bereich, prüft sie und schreibt config.js im
  Arbeitsordner. config.js läuft bei allen Besuchern als Programm; darin steht nur geprüftes JSON, von Python erzeugt.
- Sicherungen: Vor jedem Speichern wird der bisherige Stand von config.js mit Uhrzeit in SICHERUNGEN abgelegt
  (außerhalb des Projekts, die letzten 500). POST /api/sicherungen listet sie, /api/wiederherstellen holt einen
  zurück (der Stand davor wird dabei selbst gesichert). Anlass: Am 6. Oktober 2026 gingen überarbeitete des Inhabers
  Texte verloren, weil Claude config.js nach Tests zurückgesetzt hat.
- Automatische Vertonung (Inhaber, Oktober 2026): Nach jedem Speichern nimmt der Helfer im Hintergrund alle neuen oder
  geänderten Sprüche mit der gewählten Stimme auf (werkzeuge/aufnahmen.py mit Piper). POST /api/aufnahme-status
  liefert den Fortschritt für den Ladebalken im Admin-Bereich.
- POST /api/vorschau und /api/veroeffentlichen: „Für alle veröffentlichen“ (Sprüche, Klänge und Aufnahmen). Nie im Arbeitsordner (dort arbeitet
  Claude oft auf einer anderen Arbeitskopie), sondern in einer eigenen Kopie des Originals:
    1. lokal:  eigene Kopie (git worktree in KOPIE) auf den Stand von GitHub bringen (origin/main)
    2. lokal:  Sprüche prüfen, Änderungen gegenüber der veröffentlichten config.js auflisten (fürs Fenster)
    3. lokal:  nach „Ja“: config.js dort schreiben, Cache-Versionen setzen, speichern (Commit mit den Änderungen)
    4. online: hochladen (Push auf main); GitHub Pages veröffentlicht in 1–10 Minuten
- Schutz: nur auf diesem Rechner erreichbar; /api/ nur mit Host und Origin der eigenen Seite, eigenem Kopf
  X-Meditation: 1 und JSON. Andere Webseiten im selben Browser können so nichts speichern oder veröffentlichen.
  Der Zugang zu GitHub bleibt bei Git (gh auth), nie im Browser.
"""
import argparse
import functools
import http.server
import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = 8766
MAX_BYTES = 1024 * 1024
PHASEN = ["einstimmung", "bodyscan", "kraftort", "unterbewusst", "rueckkehr"]   # wie PHASES in js/phasen.js
KLAENGE = ["regen", "wald", "wind", "meer"]                                      # wie SOUNDS in js/phasen.js
ID = re.compile(r"^[a-z0-9-]{1,40}$")
TEXT_MAX = 400
NAME_MAX = 60
KOPIE = Path.home() / ".local" / "share" / "meditation-app" / "veroeffentlichen-kopie"
SPERRE = threading.Lock()   # nie zwei Veröffentlichungen gleichzeitig
SICHERUNGEN = Path.home() / ".local" / "share" / "meditation-app" / "sicherungen"
SICHERUNGEN_MAX = 500
PIPER_PYTHON = Path.home() / ".local" / "share" / "meditation-stimme" / "venv" / "bin" / "python"


class Fehler(Exception):
    pass


def text_pruefen(t, maximal=TEXT_MAX, was="Ein Spruch"):
    """Wie cleanText() in js/zustand.js: Steuerzeichen raus, Leerraum zusammenfassen, Länge begrenzt."""
    if not isinstance(t, str):
        raise Fehler(f"{was} ist kein Text.")
    t = re.sub(r"\s+", " ", re.sub(r"[\x00-\x1f\x7f]", " ", t)).strip()
    if not t:
        raise Fehler(f"{was} ist leer.")
    if len(t) > maximal:
        raise Fehler(f"{was} ist länger als {maximal} Zeichen.")
    return t


def pruefen(entwurf):
    """Gleiche Regeln wie cleanSayings()/cleanSounds() in js/zustand.js, aber streng: Fehler statt still verwerfen."""
    sayings, sounds = entwurf.get("sayings"), entwurf.get("sounds")
    if not isinstance(sayings, dict) or set(sayings) != set(PHASEN):
        raise Fehler("Die Sprüche passen nicht zu den Phasen.")
    gesehen, sauber = set(), {}

    def kennung(x):
        if not isinstance(x, dict) or not isinstance(x.get("id"), str) or not ID.match(x["id"]) or x["id"] in gesehen:
            raise Fehler("Ein Spruch oder eine Gruppe hat keine gültige Kennung.")
        gesehen.add(x["id"])
        return x["id"]

    def spruch(x):
        return {"id": kennung(x), "text": text_pruefen(x.get("text")), "active": x.get("active") is not False}

    for p in PHASEN:
        liste = sayings[p]
        if not isinstance(liste, list):
            raise Fehler("Die Sprüche einer Phase sind keine Liste.")
        sauber[p] = []
        for x in liste:
            if isinstance(x, dict) and "items" in x:   # Gruppe (Wahl B des Inhabers), keine Gruppe in einer Gruppe
                if not isinstance(x["items"], list) or any(isinstance(y, dict) and "items" in y for y in x["items"]):
                    raise Fehler("Eine Gruppe ist ungültig.")
                sauber[p].append({"id": kennung(x), "name": text_pruefen(x.get("name"), NAME_MAX, "Ein Gruppenname"),
                                  "active": x.get("active") is not False, "items": [spruch(y) for y in x["items"]]})
            else:
                sauber[p].append(spruch(x))
        if sum(len(e["items"]) if "items" in e else 1 for e in sauber[p]) > 300:
            raise Fehler("Zu viele Sprüche in einer Phase (höchstens 300).")
    if not isinstance(sounds, dict) or not set(sounds) <= set(KLAENGE):
        raise Fehler("Die Klänge sind ungültig.")
    einst = entwurf.get("settings") if isinstance(entwurf.get("settings"), dict) else {}
    pause = einst.get("pause", 2)
    if not isinstance(pause, (int, float)) or isinstance(pause, bool) or not 0.5 <= pause <= 10:
        raise Fehler("Die Sprechpause muss zwischen 0,5 und 10 Sekunden liegen.")
    return {"version": 1, "sayings": sauber, "sounds": {k: sounds.get(k) is not False for k in KLAENGE},
            "settings": {"pause": round(float(pause), 1)}}


def config_text(daten):
    return ("// Meditation – zentrale Einstellungen aus dem Admin-Bereich (Sprüche je Phase, Klänge an/aus).\n"
            "// Nicht von Hand bearbeiten: schreibt werkzeuge/admin_helfer.py, wenn der Inhaber im Admin-Bereich speichert.\n"
            "window.MEDITATION_CONFIG = " + json.dumps(daten, ensure_ascii=False, indent=1) + ";\n")


def config_lesen(datei):
    """Daten aus einer config.js (null = Grundbestand). Nur das JSON nach dem Gleichheitszeichen wird gelesen."""
    if not datei.is_file():
        return None
    m = re.search(r"window\.MEDITATION_CONFIG\s*=\s*(.*);\s*$", datei.read_text(encoding="utf-8"), re.S)
    try:
        return json.loads(m.group(1)) if m else None
    except ValueError:
        return None


def zaehlen(daten):
    """Kurzbeschreibung eines Stands für die Liste der Sicherungen: Sprüche gesamt und aktiv."""
    if not daten:
        return "Grundbestand"
    alle = [x for p in PHASEN for x, _ in flach(daten.get("sayings", {}).get(p, []))]
    return f"{len(alle)} Sprüche, {sum(1 for x in alle if x.get('active', True))} aktiv"


def sichern(ziel):
    """Bisherigen Stand von config.js mit Uhrzeit ablegen (nur wenn er sich von der letzten Sicherung unterscheidet)."""
    if not ziel.is_file():
        return
    SICHERUNGEN.mkdir(parents=True, exist_ok=True)
    inhalt = ziel.read_bytes()
    alle = sorted(SICHERUNGEN.glob("config-*.js"))
    if alle and alle[-1].read_bytes() == inhalt:
        return
    zeit = __import__("datetime").datetime.now().strftime("%Y-%m-%d_%H-%M-%S-%f")
    (SICHERUNGEN / f"config-{zeit}.js").write_bytes(inhalt)
    for alt in alle[:max(0, len(alle) + 1 - SICHERUNGEN_MAX)]:
        alt.unlink()


def sicherungen_liste():
    eintraege = []
    for f in sorted(SICHERUNGEN.glob("config-*.js"), reverse=True)[:100] if SICHERUNGEN.is_dir() else []:
        m = re.match(r"config-(\d{4})-(\d\d)-(\d\d)_(\d\d)-(\d\d)-(\d\d)", f.name)
        if m:
            j, mo, t, h, mi, se = m.groups()
            eintraege.append({"datei": f.name, "zeit": f"{t}.{mo}.{j}, {h}:{mi}:{se} Uhr", "inhalt": zaehlen(config_lesen(f))})
    return {"ok": True, "sicherungen": eintraege}


def wiederherstellen(entwurf, ziel):
    name = entwurf.get("datei")
    if not isinstance(name, str) or not re.fullmatch(r"config-[0-9_-]+\.js", name) or not (SICHERUNGEN / name).is_file():
        raise Fehler("Diese Sicherung gibt es nicht.")
    daten = config_lesen(SICHERUNGEN / name)
    sichern(ziel)   # auch der Stand vor dem Wiederherstellen bleibt erhalten
    if daten is None:
        inhalt = "window.MEDITATION_CONFIG = null;\n"
    else:
        inhalt = config_text(pruefen(daten))
    fd, tmp = tempfile.mkstemp(dir=ziel.parent, prefix=".config-", suffix=".js")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(inhalt)
    os.chmod(tmp, 0o644)
    os.replace(tmp, ziel)
    return {"ok": True, "stand": fingerabdruck(ziel)}


def fingerabdruck(ziel):
    """Kennung des gespeicherten Stands (SHA-256 von config.js), damit keine Seite einen neueren Stand überschreibt."""
    return __import__("hashlib").sha256(ziel.read_bytes() if ziel.is_file() else b"").hexdigest()


def speichern(entwurf, ziel):
    # Schutz vor Überschreiben (Oktober 2026): Die Seite schickt den Fingerabdruck des Stands mit, auf dem sie beruht.
    # Wurde config.js inzwischen anderswo geändert (anderes Fenster, Claude, Wiederherstellen), wird abgelehnt;
    # die Seite sagt dann rot „neu laden“ und hebt die Änderung im Browser auf. Seiten ohne Fingerabdruck sind alt.
    if entwurf.get("basis") != fingerabdruck(ziel):
        raise Fehler("KONFLIKT: Die Sprüche wurden inzwischen woanders geändert. Bitte die Seite neu laden.")
    daten = pruefen(entwurf)
    sichern(ziel)
    inhalt = config_text(daten)
    # Erst in eine Nachbardatei schreiben, dann austauschen: config.js ist nie halb geschrieben
    fd, tmp = tempfile.mkstemp(dir=ziel.parent, prefix=".config-", suffix=".js")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(inhalt)
    os.chmod(tmp, 0o644)
    os.replace(tmp, ziel)
    return {"ok": True, "stand": fingerabdruck(ziel)}


# ---------- Automatische Vertonung ----------
# Läuft im Hintergrund, immer nur einmal gleichzeitig. Kommt während einer Vertonung neues Speichern dazu, folgt
# danach ein weiterer Durchgang mit dem neuen Stand (das Werkzeug nimmt nur auf, was noch fehlt).
VERTONUNG = {"laeuft": False, "fertig": 0, "gesamt": 0, "aktuell": "", "fehler": "", "nochmal": False, "stand": 0,
             "prozent": 0, "schritt": ""}
VERTONUNG_SPERRE = threading.Lock()


def vertonen_anstossen(root):
    with VERTONUNG_SPERRE:
        if VERTONUNG["laeuft"]:
            VERTONUNG["nochmal"] = True
            return
        VERTONUNG.update(laeuft=True, fertig=0, gesamt=0, aktuell="", fehler="", nochmal=False, prozent=0,
                         schritt="Vertonung startet")
    threading.Thread(target=vertonen, args=(root,), daemon=True).start()


def vertonen(root):
    while True:
        try:
            if not PIPER_PYTHON.exists():
                raise Fehler("Piper ist nicht eingerichtet (~/.local/share/meditation-stimme).")
            prozess = subprocess.Popen([str(PIPER_PYTHON), str(Path(root) / "werkzeuge" / "aufnahmen.py")], cwd=root,
                                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            letzte, gesamt, teile = "", 0, 0
            for zeile in prozess.stdout:
                zeile = zeile.rstrip()
                letzte = zeile or letzte
                # Prozent: Texte lesen bis 4 %, Stimme laden bis 12 %, Sätze 12–92 % (je Satz zwei Teilschritte:
                # sprechen, umwandeln), Liste schreiben 92–100 %
                if zeile == "PHASE lesen":
                    VERTONUNG.update(prozent=1, schritt="Texte werden gelesen")
                elif zeile == "PHASE stimme":
                    VERTONUNG.update(prozent=5, schritt="Stimme wird geladen")
                elif m := re.match(r"GESAMT (\d+)$", zeile):
                    gesamt = int(m.group(1))
                    VERTONUNG.update(gesamt=gesamt, fertig=0, prozent=4)
                elif m := re.match(r"\[(\d+)/(\d+)\] (.*)$", zeile):
                    teile = 2 * int(m.group(1))
                    VERTONUNG.update(fertig=int(m.group(1)), aktuell=m.group(3), schritt="Satz wird gesprochen")
                elif re.match(r"TEIL (\d+)/(\d+)$", zeile):
                    teile += 1
                    VERTONUNG.update(schritt="Satz wird umgewandelt")
                elif m := re.match(r"FERTIG (\d+)/(\d+)$", zeile):
                    teile = 2 * int(m.group(1))
                    VERTONUNG.update(fertig=int(m.group(1)))
                elif zeile == "PHASE liste":
                    VERTONUNG.update(prozent=92, schritt="Liste wird geschrieben", aktuell="")
                elif m := re.match(r"LISTE (\d+)/(\d+)$", zeile):
                    VERTONUNG["prozent"] = 92 + 7 * int(m.group(1)) // max(1, int(m.group(2)))
                elif zeile == "ENDE":
                    VERTONUNG.update(prozent=100, schritt="Fertig")
                if gesamt and VERTONUNG["schritt"].startswith("Satz"):
                    VERTONUNG["prozent"] = 12 + 80 * teile // (2 * gesamt)
            if prozess.wait():
                raise Fehler(f"Die Vertonung ist abgebrochen: {letzte[:200]}")
            VERTONUNG["fehler"] = ""
        except (Fehler, OSError) as e:
            VERTONUNG["fehler"] = str(e)
            print(f"Vertonung: {e}", file=sys.stderr, flush=True)
        with VERTONUNG_SPERRE:
            VERTONUNG["stand"] += 1   # die App lädt danach die Liste der Aufnahmen neu
            if not VERTONUNG["nochmal"]:
                VERTONUNG.update(laeuft=False, aktuell="")
                return
            VERTONUNG.update(nochmal=False, fertig=0, gesamt=0, aktuell="", prozent=0, schritt="Vertonung startet")


def aufnahme_status():
    return {"ok": True, **{k: VERTONUNG[k] for k in ("laeuft", "fertig", "gesamt", "aktuell", "fehler", "stand",
                                                      "prozent", "schritt")}}


AUFNAHMEN_BLOCK = re.compile(r"(  // Aufnahmen \(setzt werkzeuge/aufnahmen\.py\)\n).*?(  // Ende Aufnahmen\n)", re.S)


def aufnahmen_uebernehmen(root, kopie):
    """Aufnahmen aus dem Arbeitsordner in die Kopie des Originals: stimme/*.mp3, js/aufnahmen.js und die Liste in
    sw.js. Liefert die Zeile für die Änderungsliste (oder None, wenn sich nichts ändert)."""
    quelle, ziel = Path(root) / "stimme", Path(kopie) / "stimme"
    neu = {f.name for f in quelle.glob("*.mp3")} if quelle.is_dir() else set()
    alt = {f.name for f in ziel.glob("*.mp3")} if ziel.is_dir() else set()
    liste_alt = Path(kopie) / "js/aufnahmen.js"
    if neu == alt and liste_alt.exists() and liste_alt.read_bytes() == (Path(root) / "js/aufnahmen.js").read_bytes():
        return None
    ziel.mkdir(exist_ok=True)
    for n in alt - neu:
        (ziel / n).unlink()
    for n in neu - alt:
        (ziel / n).write_bytes((quelle / n).read_bytes())
    (Path(kopie) / "js/aufnahmen.js").write_bytes((Path(root) / "js/aufnahmen.js").read_bytes())
    sw = (Path(kopie) / "sw.js").read_text(encoding="utf-8")
    block = "".join(f'  "stimme/{n}",\n' for n in sorted(neu))
    sw, ok = AUFNAHMEN_BLOCK.subn(lambda m: m.group(1) + block + m.group(2), sw)
    if not ok:
        raise Fehler("Die veröffentlichte Fassung kennt noch keine Aufnahmen. Erst die neue App-Fassung übernehmen.")
    (Path(kopie) / "sw.js").write_text(sw, encoding="utf-8")
    teile = [f"{len(neu - alt)} neu" if neu - alt else "", f"{len(alt - neu)} entfernt" if alt - neu else ""]
    return "Aufnahmen: " + (", ".join(t for t in teile if t) or "Liste aktualisiert")


def vorschau_aufnahmen(root, kopie):
    quelle, ziel = Path(root) / "stimme", Path(kopie) / "stimme"
    neu = {f.name for f in quelle.glob("*.mp3")} if quelle.is_dir() else set()
    alt = {f.name for f in ziel.glob("*.mp3")} if ziel.is_dir() else set()
    if neu == alt:
        return []
    teile = [f"{len(neu - alt)} neu" if neu - alt else "", f"{len(alt - neu)} entfernt" if alt - neu else ""]
    return ["Aufnahmen: " + ", ".join(t for t in teile if t)]


# ---------- Für alle veröffentlichen ----------
def git(*args, cwd, timeout=60):
    try:
        r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise Fehler(f"Git hat zu lange gebraucht (git {args[0]}).")
    if r.returncode:
        raise Fehler(f"git {args[0]}: {(r.stderr or r.stdout).strip()[:400]}")
    return r.stdout.strip()


def kopie_aktualisieren(repo, kopie):
    """Eigene Kopie des Originals (main) auf den Stand von GitHub bringen. Sie gehört nur dem Helfer."""
    try:
        git("remote", "get-url", "origin", cwd=repo)
    except Fehler:
        raise Fehler("Das Projekt ist noch nicht mit GitHub verbunden. Das richtet Claude ein, sobald der Name feststeht.")
    try:
        git("fetch", "-q", "origin", "main", cwd=repo, timeout=90)
    except Fehler:
        raise Fehler("Keine Verbindung zu GitHub. Bitte Internet prüfen und es noch einmal versuchen.")
    if not (kopie / ".git").exists():
        kopie.parent.mkdir(parents=True, exist_ok=True)
        git("worktree", "prune", cwd=repo)
        git("worktree", "add", "-q", "--detach", str(kopie), "origin/main", cwd=repo)
    git("reset", "-q", "--hard", "origin/main", cwd=kopie)
    git("clean", "-q", "-fd", cwd=kopie)


def kurz(t, n=50):
    return f"„{t if len(t) <= n else t[:n].rstrip() + ' …'}“"


def flach(liste):
    """Sprüche einer Phase in Reihenfolge, mit der Gruppe, in der sie stehen (oder None)."""
    for e in liste if isinstance(liste, list) else []:
        if isinstance(e, dict) and isinstance(e.get("items"), list):
            for x in e["items"]:
                if isinstance(x, dict) and "id" in x:
                    yield x, e
        elif isinstance(e, dict) and "id" in e:
            yield e, None


def unterschiede(alt, neu, grund):
    """Änderungen in Worten, für das Fenster vor dem „Ja“ und den Commit. alt = veröffentlicht (None = Grundbestand
    `grund`, den die Seite mitschickt), neu = geprüfter Entwurf."""
    if alt is None:
        alt = {"sayings": grund, "sounds": {k: True for k in KLAENGE}}
    namen = {"einstimmung": "Einstimmung", "bodyscan": "Bodyscan", "kraftort": "Kraftort",
             "unterbewusst": "Unterbewusstes", "rueckkehr": "Rückkehr"}
    gname = lambda g: f"Gruppe „{g.get('name', '')}“" if g else "ohne Gruppe"
    zeilen = []
    for p in PHASEN:
        P = namen[p]
        alt_liste, neu_liste = alt.get("sayings", {}).get(p, []), neu["sayings"][p]
        ag = {e["id"]: e for e in alt_liste if isinstance(e, dict) and isinstance(e.get("items"), list)}
        ng = {e["id"]: e for e in neu_liste if "items" in e}
        for i, g in ng.items():
            if i not in ag:
                zeilen.append(f"{P}: neue Gruppe „{g['name']}“")
            else:
                if ag[i].get("name") != g["name"]:
                    zeilen.append(f"{P}: Gruppe „{ag[i].get('name', '')}“ umbenannt in „{g['name']}“")
                if ag[i].get("active", True) != g["active"]:
                    zeilen.append(f"{P}: Gruppe „{g['name']}“ {'aktiviert' if g['active'] else 'deaktiviert'}")
        for i, g in ag.items():
            if i not in ng:
                zeilen.append(f"{P}: Gruppe „{g.get('name', '')}“ aufgelöst")
        a = {x["id"]: (x, g) for x, g in flach(alt_liste)}
        n = {x["id"]: (x, g) for x, g in flach(neu_liste)}
        for i, (x, g) in n.items():
            if i not in a:
                zeilen.append(f"{P}: neu {kurz(x['text'])}" + (f" in {gname(g)}" if g else ""))
                continue
            ax, agr = a[i]
            if ax.get("text") != x["text"]:
                zeilen.append(f"{P}: geändert {kurz(ax.get('text', ''))} → {kurz(x['text'])}")
            if ax.get("active", True) != x["active"]:
                zeilen.append(f"{P}: {'aktiviert' if x['active'] else 'deaktiviert'} {kurz(x['text'])}")
            if (agr or {}).get("id") != (g or {}).get("id"):
                zeilen.append(f"{P}: {kurz(x['text'])} verschoben nach {gname(g)}")
        for i, (x, g) in a.items():
            if i not in n:
                zeilen.append(f"{P}: gelöscht {kurz(x.get('text', ''))}")
        reihe_a = [i for i in [e.get("id") for e in alt_liste if isinstance(e, dict)] if i in ng or i in n]
        reihe_n = [i for i in [e["id"] for e in neu_liste] if i in ag or i in a]
        innen_a = [i for i, _ in a.items() if i in n]
        innen_n = [i for i, _ in n.items() if i in a]
        if reihe_a != reihe_n or innen_a != innen_n:
            zeilen.append(f"{P}: Reihenfolge geändert")
    alt_pause = (alt.get("settings") or {}).get("pause", 2)   # ohne Angabe gilt der Standard der App (2,0 s)
    if alt_pause != neu["settings"]["pause"]:
        zeilen.append(f"Sprechpause: {str(alt_pause).replace('.', ',')} s → {str(neu['settings']['pause']).replace('.', ',')} s")
    for k in KLAENGE:
        if alt.get("sounds", {}).get(k, True) != neu["sounds"][k]:
            zeilen.append(f"Klang {k.capitalize()}: {'aktiviert' if neu['sounds'][k] else 'deaktiviert'}")
    return zeilen


def grundbestand(entwurf):
    g = entwurf.get("defaults")
    return g if isinstance(g, dict) else {}


def vorschau(entwurf, repo, kopie):
    with SPERRE:
        neu = pruefen(entwurf)
        kopie_aktualisieren(repo, kopie)
        if VERTONUNG["laeuft"]:
            raise Fehler("Die Vertonung läuft noch. Bitte warten, bis der Ladebalken fertig ist.")
        return {"ok": True, "aenderungen": unterschiede(config_lesen(kopie / "config.js"), neu, grundbestand(entwurf))
                + vorschau_aufnahmen(repo, kopie)}


def veroeffentlichen(entwurf, repo, kopie):
    with SPERRE:
        neu = pruefen(entwurf)
        kopie_aktualisieren(repo, kopie)
        if VERTONUNG["laeuft"]:
            raise Fehler("Die Vertonung läuft noch. Bitte warten, bis der Ladebalken fertig ist.")
        aenderungen = unterschiede(config_lesen(kopie / "config.js"), neu, grundbestand(entwurf))
        if not aenderungen and not vorschau_aufnahmen(repo, kopie):
            return {"ok": True, "aenderungen": [], "schritte": ["geprueft"]}
        try:
            (kopie / "config.js").write_text(config_text(neu), encoding="utf-8")
            zeile = aufnahmen_uebernehmen(repo, kopie)
            if zeile:
                aenderungen.append(zeile)
            subprocess.run(["bash", "werkzeuge/versionen.sh"], cwd=kopie, check=True, capture_output=True, timeout=60)
            git("add", "-A", cwd=kopie)
            text = ("Sprüche und Klänge aktualisiert\n\n" + "\n".join(f"- {z}" for z in aenderungen)
                    + "\n\nVeröffentlicht im Admin-Bereich per Knopf.\n")
            git("-c", "core.hooksPath=.githooks", "-c", "user.name=Fishfan33",
                "-c", "user.email=337108262+Fishfan33@users.noreply.github.com", "commit", "-q", "-m", text, cwd=kopie)
            stand = git("rev-parse", "--short", "HEAD", cwd=kopie)
        except (Fehler, subprocess.SubprocessError, OSError) as e:
            git("reset", "-q", "--hard", "origin/main", cwd=kopie)
            raise Fehler(f"Speichern hat nicht geklappt: {e}")
        try:
            git("push", "-q", "origin", "HEAD:main", cwd=kopie, timeout=120)
        except Fehler as e:
            git("reset", "-q", "--hard", "origin/main", cwd=kopie)
            raise Fehler(f"Hochladen zu GitHub hat nicht geklappt, nichts wurde veröffentlicht. ({e})")
        try:
            git("fetch", "-q", "origin", "main", cwd=repo, timeout=90)   # damit auch der Arbeitsordner es weiß
        except Fehler:
            pass
        return {"ok": True, "aenderungen": aenderungen, "stand": stand, "schritte": ["geprueft", "gespeichert", "hochgeladen"]}


# ---------- Webserver ----------
class Helfer(http.server.SimpleHTTPRequestHandler):
    root = ROOT
    kopie = KOPIE
    port = PORT

    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Meditation-Helfer", "1")   # daran erkennt der Admin-Bereich den Helfer
        super().end_headers()

    # Lesen nur für die eigene Seite (Audit Oktober 2026): richtige Adresse (gegen DNS-Rebinding: eine fremde Webseite,
    # die sich als localhost ausgibt), keine versteckten Ordner wie .git und keine Ordnerlisten.
    def lesen_erlaubt(self):
        erlaubt = {f"{h}:{self.port}" for h in ("localhost", "127.0.0.1", "127.0.0.2", "[::1]")}
        pfad = self.path.split("?")[0].split("#")[0]
        return self.headers.get("Host") in erlaubt and not any(t.startswith(".") for t in pfad.split("/") if t)

    def do_GET(self):
        if not self.lesen_erlaubt():
            return self.send_error(404)
        return super().do_GET()

    def do_HEAD(self):
        if not self.lesen_erlaubt():
            return self.send_error(404)
        return super().do_HEAD()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def eigene_seite(self):
        erlaubt = {f"localhost:{self.port}", f"127.0.0.1:{self.port}", f"[::1]:{self.port}"}
        return (self.headers.get("Host") in erlaubt and self.headers.get("Origin") in {f"http://{h}" for h in erlaubt}
                and self.headers.get("X-Meditation") == "1"
                and self.headers.get("Content-Type", "").startswith("application/json"))

    def antwort(self, code, daten):
        roh = json.dumps(daten, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(roh)))
        self.end_headers()
        self.wfile.write(roh)

    def do_POST(self):
        pfad = self.path.split("?")[0]
        def speichern_und_vertonen(e):
            ergebnis = speichern(e, self.root / "config.js")
            vertonen_anstossen(self.root)
            return ergebnis

        aktionen = {"/api/speichern": speichern_und_vertonen,
                    "/api/aufnahme-status": lambda e: aufnahme_status(),
                    "/api/stand": lambda e: {"ok": True, "stand": fingerabdruck(self.root / "config.js")},
                    "/api/sicherungen": lambda e: sicherungen_liste(),
                    "/api/wiederherstellen": lambda e: (wiederherstellen(e, self.root / "config.js"),
                                                        vertonen_anstossen(self.root))[0],
                    "/api/vertonen": lambda e: (vertonen_anstossen(self.root), aufnahme_status())[1],
                    "/api/vorschau": lambda e: vorschau(e, self.root, self.kopie),
                    "/api/veroeffentlichen": lambda e: veroeffentlichen(e, self.root, self.kopie)}
        if pfad not in aktionen:
            return self.antwort(404, {"ok": False, "fehler": "Unbekannt."})
        if not self.eigene_seite():
            return self.antwort(403, {"ok": False, "fehler": "Nicht erlaubt."})
        laenge = int(self.headers.get("Content-Length") or 0)
        if not 0 < laenge <= MAX_BYTES:
            return self.antwort(413, {"ok": False, "fehler": "Zu groß."})
        try:
            entwurf = json.loads(self.rfile.read(laenge))
            if not isinstance(entwurf, dict):
                raise ValueError
        except ValueError:
            return self.antwort(400, {"ok": False, "fehler": "Kein gültiges JSON."})
        try:
            return self.antwort(200, aktionen[pfad](entwurf))
        except Fehler as e:
            return self.antwort(200, {"ok": False, "fehler": str(e)})
        except Exception as e:   # unerwartet: trotzdem verständlich antworten, statt die Seite hängen zu lassen
            print(f"Unerwarteter Fehler: {e!r}", file=sys.stderr, flush=True)
            return self.antwort(200, {"ok": False, "fehler": f"Unerwarteter Fehler im Helfer: {e}"})


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class Server6(Server):
    address_family = socket.AF_INET6


def starten(root, port, kopie=KOPIE, adressen=("127.0.0.1", "127.0.0.2", "::1")):
    handler = type("H", (Helfer,), {"root": Path(root), "kopie": Path(kopie), "port": port})
    server = []
    for adresse in adressen:
        try:
            klasse = Server6 if ":" in adresse else Server
            server.append(klasse((adresse, port), functools.partial(handler, directory=str(root))))
        except OSError as e:
            if adresse != "::1":   # ohne IPv6 geht es auch
                for s in server:
                    s.server_close()
                raise SystemExit(f"Port {port} auf {adresse} ist belegt ({e.strerror}). Läuft der Helfer schon?")
    for s in server:
        threading.Thread(target=s.serve_forever, daemon=True).start()
    return server


def main():
    global SICHERUNGEN
    a = argparse.ArgumentParser(description="Meditation lokal zeigen und Änderungen aus dem Admin-Bereich speichern.")
    a.add_argument("--ordner", default=str(ROOT), help="Ordner mit der App")
    a.add_argument("--port", type=int, default=PORT)
    a.add_argument("--kopie", default=str(KOPIE), help="Ordner für die eigene Kopie des Originals (main)")
    a.add_argument("--sicherungen", default=str(SICHERUNGEN), help="Ordner für die Sicherungen von config.js")
    args = a.parse_args()
    SICHERUNGEN = Path(args.sicherungen)
    starten(args.ordner, args.port, args.kopie)
    print(f"Meditation: http://localhost:{args.port}/ (Admin), http://127.0.0.2:{args.port}/ (öffentlich)", flush=True)
    threading.Event().wait()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
