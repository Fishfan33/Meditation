#!/usr/bin/env bash
# Setzt die Versionen von app.css und den Skripten in js/ („…?v=…“) in den HTML-Seiten und in sw.js
# auf eine Prüfsumme des jeweiligen Inhalts. Ändert sich eine Datei, ändert sich damit ihre Adresse,
# und Browser laden sie sofort neu, statt bis zu 10 Minuten die alte Fassung aus dem Zwischenspeicher
# zu nehmen (GitHub Pages cacht 10 Minuten). Gleicher Inhalt ergibt immer dieselbe Version.
# Vorlage: werkzeuge/versionen.sh im Retro-Cockpit.
#
# Außerdem bekommt die Offline-Kopie (sw.js) eine VERSION über alle Dateien, die sie ablegt: Ändert sich
# irgendetwas davon, ändert sich sw.js, und die App bietet „Neue Version verfügbar“ an.
#
#   werkzeuge/versionen.sh            # nach den Dateien im Ordner (z. B. für die lokale Vorschau)
#   werkzeuge/versionen.sh --staged   # nach der vorgemerkten Fassung (läuft vor jedem Commit,
#                                     # siehe .githooks/pre-commit)
set -euo pipefail
cd "$(dirname "$0")/.."
shopt -s nullglob

# Prüfsumme einer Datei: im Commit-Helfer die vorgemerkte Fassung, sonst die Datei im Ordner
# (beides liefert für denselben Inhalt dieselbe Prüfsumme)
id() {
  if [ "${MODE:-}" = "--staged" ] && git cat-file -e ":$1" 2>/dev/null; then
    git rev-parse ":$1"
  else
    git hash-object "$1"
  fi
}
MODE="${1:-}"

for f in app.css config.js js/*.js; do
  v="$(id "$f" | cut -c1-8)"
  for page in *.html sw.js; do
    sed -i -E "s#(\b${f//./\\.})\?v=[0-9a-f]+#\1?v=$v#g" "$page"
  done
done

# Version der Offline-Kopie. Die HTML-Seiten zählen in ihrer gerade angepassten Fassung (sie werden
# gleich mit vorgemerkt); über ihre „?v=…“ stecken app.css, config.js und js/*.js mit darin.
ids="$(for page in *.html; do git hash-object "$page"; done)"
for f in manifest.json fonts/*.woff2 icons/* klang/*.mp3 stimme/*; do ids+="$(id "$f")"; done
v="$(printf '%s' "$ids" | git hash-object --stdin | cut -c1-8)"
sed -i -E "s/^const VERSION = \"[0-9a-f]+\";/const VERSION = \"$v\";/" sw.js
