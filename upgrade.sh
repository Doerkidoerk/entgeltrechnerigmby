#!/usr/bin/env bash
set -e

# ensure running with sudo/root
if [ "$EUID" -ne 0 ]; then
  echo "Dieses Skript muss mit sudo ausgeführt werden." >&2
  exit 1
fi

# Pfad-Eingabe mit Tab-Unterstützung
read_path() {
    local PROMPT="$1"
    local VAR
    read -e -p "$PROMPT" VAR   # -e = Readline aktivieren
    echo "$VAR"
}

FRONTEND_DIR=$(read_path "Wo sollen die Frontend-Dateien installiert werden? ")
API_DIR=$(read_path "Wo sollen die API-Dateien installiert werden? ")

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# copy frontend and api
mkdir -p "$FRONTEND_DIR" "$API_DIR" "$API_DIR/data"
rsync -a "$REPO_DIR/frontend/" "$FRONTEND_DIR/"
rsync -a "$REPO_DIR/api/" "$API_DIR/" --exclude="data/users.json" --exclude="data/invites.json" --exclude="data/audit.log"

# Sichere Berechtigungen
chown -R www-data:www-data "$FRONTEND_DIR" "$API_DIR"
chmod -R 755 "$FRONTEND_DIR"
chmod -R 700 "$API_DIR"
chmod 755 "$API_DIR/data"

# Besonders sichere Berechtigungen für sensitive Dateien
if [ -f "$API_DIR/data/users.json" ]; then
  chmod 600 "$API_DIR/data/users.json"
  chown www-data:www-data "$API_DIR/data/users.json"
fi
if [ -f "$API_DIR/data/invites.json" ]; then
  chmod 600 "$API_DIR/data/invites.json"
  chown www-data:www-data "$API_DIR/data/invites.json"
fi
if [ -f "$API_DIR/data/audit.log" ]; then
  chmod 600 "$API_DIR/data/audit.log"
  chown www-data:www-data "$API_DIR/data/audit.log"
fi

echo "Upgrade abgeschlossen."
echo "HINWEIS: Stelle sicher, dass die Umgebungsvariable ALLOWED_ORIGINS gesetzt ist."
