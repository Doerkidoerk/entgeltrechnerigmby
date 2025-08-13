#!/usr/bin/env bash
set -e

# ensure running with sudo/root
if [ "$EUID" -ne 0 ]; then
  echo "Dieses Skript muss mit sudo ausgeführt werden." >&2
  exit 1
fi

# Funktion für Pfad-Eingabe mit Tab-Vervollständigung
read_path() {
    local PROMPT="$1"
    local REPLY_VAR
    # Aktiviert Dateipfad-Komplettierung
    bind 'set show-all-if-ambiguous on'
    bind 'TAB:menu-complete'
    bind 'set completion-ignore-case on'
    read -e -p "$PROMPT" -i "" REPLY_VAR
    echo "$REPLY_VAR"
}

FRONTEND_DIR=$(read_path "Wo sollen die Frontend-Dateien installiert werden? ")
API_DIR=$(read_path "Wo sollen die API-Dateien installiert werden? ")

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# copy frontend and api
mkdir -p "$FRONTEND_DIR" "$API_DIR"
rsync -a "$REPO_DIR/frontend/" "$FRONTEND_DIR/"
rsync -a "$REPO_DIR/api/" "$API_DIR/"

chown -R www-data:www-data "$FRONTEND_DIR" "$API_DIR"
chmod -R 775 "$FRONTEND_DIR" "$API_DIR"

echo "Upgrade abgeschlossen."
