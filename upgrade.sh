#!/bin/bash
#
# upgrade.sh - Automatisches Update-Script für Entgeltrechner
# Version: 1.0
# Führt ein sicheres Update der laufenden Produktions-Installation durch
#
# AUFRUF als root oder sudo-Benutzer:
#   sudo /opt/entgeltrechner/app/upgrade.sh
#

set -euo pipefail

# ============================================================================
# KONFIGURATION
# ============================================================================

APP_USER="entgeltrechner"
APP_DIR="/opt/entgeltrechner/app"
BACKUP_DIR="/var/backups/entgeltrechner"
SERVICE_NAME="entgeltrechner"
DATA_DIR="${APP_DIR}/api/data"
ENV_FILE="/opt/entgeltrechner/.env"
NVM_DIR="/opt/entgeltrechner/.nvm"

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# HILFSFUNKTIONEN
# ============================================================================

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

check_user() {
    if [ "$EUID" -ne 0 ]; then
        error "Dieses Script muss als root ausgeführt werden: sudo $0"
    fi
}

check_prerequisites() {
    log "Prüfe Voraussetzungen..."

    # User existiert?
    if ! id "$APP_USER" &>/dev/null; then
        error "Benutzer '$APP_USER' existiert nicht"
    fi

    # Git Repository?
    if [ ! -d "${APP_DIR}/.git" ]; then
        error "Kein Git-Repository gefunden in ${APP_DIR}"
    fi

    # nvm verfügbar?
    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
        error "nvm nicht gefunden unter $NVM_DIR"
    fi

    # .env Datei vorhanden?
    if [ ! -f "$ENV_FILE" ]; then
        warning ".env Datei nicht gefunden unter $ENV_FILE"
    fi

    # systemd Service existiert?
    if ! systemctl list-unit-files | grep -q "^${SERVICE_NAME}.service"; then
        error "systemd Service '${SERVICE_NAME}' nicht gefunden"
    fi

    success "Voraussetzungen erfüllt"
}

create_backup() {
    log "Erstelle Backup..."

    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="${BACKUP_DIR}/pre-upgrade_${TIMESTAMP}.tar.gz"

    # Backup-Verzeichnis erstellen
    mkdir -p "$BACKUP_DIR"

    # Git-Status sichern (als app-user)
    cd "$APP_DIR"
    sudo -u "$APP_USER" git rev-parse HEAD > "/tmp/pre-upgrade-commit.txt"
    sudo -u "$APP_USER" git status --porcelain > "/tmp/pre-upgrade-status.txt"

    # Daten sichern
    if [ -d "$DATA_DIR" ]; then
        tar -czf "$BACKUP_FILE" \
            -C "$DATA_DIR" \
            --exclude='*.log' \
            . 2>/dev/null || true
        chmod 600 "$BACKUP_FILE"
    fi

    # Auch env-Datei sichern (falls vorhanden)
    if [ -f "$ENV_FILE" ]; then
        cp "$ENV_FILE" "${BACKUP_DIR}/.env.${TIMESTAMP}"
        chmod 600 "${BACKUP_DIR}/.env.${TIMESTAMP}"
    fi

    # Commit-Info speichern
    cp "/tmp/pre-upgrade-commit.txt" "${BACKUP_DIR}/commit.${TIMESTAMP}.txt"

    success "Backup erstellt: $BACKUP_FILE"
    echo "   Commit: $(cat /tmp/pre-upgrade-commit.txt)"
}

check_remote_updates() {
    log "Prüfe auf Updates..."

    cd "$APP_DIR"

    # Fetch remote changes (als app-user)
    sudo -u "$APP_USER" git fetch origin 2>&1 || error "Git fetch fehlgeschlagen"

    LOCAL=$(sudo -u "$APP_USER" git rev-parse @)
    REMOTE=$(sudo -u "$APP_USER" git rev-parse @{u} 2>/dev/null || echo "")

    if [ -z "$REMOTE" ]; then
        warning "Kein Remote-Branch konfiguriert"
        return 1
    fi

    if [ "$LOCAL" = "$REMOTE" ]; then
        success "Repository ist bereits aktuell"
        echo ""
        echo "Trotzdem fortfahren? (j/N): "
        read -r -n 1 REPLY
        echo
        if [[ ! $REPLY =~ ^[Jj]$ ]]; then
            exit 0
        fi
    else
        # Zeige Änderungen
        echo ""
        log "Verfügbare Updates:"
        sudo -u "$APP_USER" git log --oneline --decorate "$LOCAL..$REMOTE"
        echo ""
    fi
}

confirm_update() {
    echo ""
    warning "ACHTUNG: Dieses Script wird folgende Aktionen durchführen:"
    echo "  1. Service '${SERVICE_NAME}' stoppen"
    echo "  2. Code-Update via 'git pull'"
    echo "  3. npm-Abhängigkeiten aktualisieren"
    echo "  4. Datei-Berechtigungen prüfen"
    echo "  5. Service neu starten"
    echo ""
    echo "Möchten Sie fortfahren? (j/N): "
    read -r -n 1 REPLY
    echo
    if [[ ! $REPLY =~ ^[Jj]$ ]]; then
        log "Update abgebrochen"
        exit 0
    fi
}

stop_service() {
    log "Stoppe Service '${SERVICE_NAME}'..."

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        systemctl stop "$SERVICE_NAME" || error "Service konnte nicht gestoppt werden"
        sleep 2
        success "Service gestoppt"
    else
        warning "Service läuft nicht"
    fi
}

update_code() {
    log "Aktualisiere Code..."

    cd "$APP_DIR"

    # Lokale Änderungen prüfen
    if [ -n "$(sudo -u "$APP_USER" git status --porcelain)" ]; then
        warning "Lokale Änderungen gefunden:"
        sudo -u "$APP_USER" git status --short
        echo ""
        echo "Änderungen verwerfen und fortfahren? (j/N): "
        read -r -n 1 REPLY
        echo
        if [[ $REPLY =~ ^[Jj]$ ]]; then
            # Nur nicht-getrackte Data-Dateien behalten
            sudo -u "$APP_USER" git checkout -- . || true
            success "Lokale Änderungen verworfen"
        else
            error "Update abgebrochen. Bitte committen Sie Ihre Änderungen erst."
        fi
    fi

    # Pull durchführen (als app-user)
    sudo -u "$APP_USER" git pull origin main || \
    sudo -u "$APP_USER" git pull origin master || \
    error "Git pull fehlgeschlagen"

    NEW_COMMIT=$(sudo -u "$APP_USER" git rev-parse HEAD)
    success "Code aktualisiert auf Commit: ${NEW_COMMIT:0:8}"
}

update_dependencies() {
    log "Aktualisiere Dependencies..."

    cd "${APP_DIR}/api"

    # npm install als app-user mit nvm
    sudo -u "$APP_USER" -H bash -c "
        export NVM_DIR='$NVM_DIR'
        export HOME='/opt/entgeltrechner'
        [ -s \"\$NVM_DIR/nvm.sh\" ] && source \"\$NVM_DIR/nvm.sh\"

        # .nvmrc vorhanden?
        if [ -f '.nvmrc' ]; then
            nvm use --silent || echo 'Node-Version aus .nvmrc konnte nicht aktiviert werden'
        fi

        # npm ci für saubere Installation
        if [ -f 'package-lock.json' ]; then
            npm ci --omit=dev --silent
        else
            npm install --omit=dev --silent
        fi
    " || error "npm update fehlgeschlagen"

    success "Dependencies aktualisiert"
}

check_permissions() {
    log "Prüfe Datei-Berechtigungen..."

    # Besitzer auf app-user setzen
    chown -R "${APP_USER}:${APP_USER}" "$APP_DIR"

    # Tariftabellen auf 640 setzen
    shopt -s nullglob
    local tables=("${DATA_DIR}"/*.json)
    shopt -u nullglob
    if [ ${#tables[@]} -gt 0 ]; then
        for file in "${tables[@]}"; do
            chmod 640 "$file"
            chown "${APP_USER}:${APP_USER}" "$file"
        done
    fi

    if [ -d "${DATA_DIR}/sessions" ]; then
        chmod 700 "${DATA_DIR}/sessions"
        chown -R "${APP_USER}:${APP_USER}" "${DATA_DIR}/sessions"
    fi

    if [ -f "$ENV_FILE" ]; then
        chmod 600 "$ENV_FILE"
        chown "${APP_USER}:${APP_USER}" "$ENV_FILE"
    fi

    success "Berechtigungen geprüft"
}

run_migrations() {
    log "Prüfe auf Migrations-Scripts..."

    MIGRATION_SCRIPT="${APP_DIR}/migrate.sh"

    if [ -f "$MIGRATION_SCRIPT" ] && [ -x "$MIGRATION_SCRIPT" ]; then
        warning "Migrations-Script gefunden: $MIGRATION_SCRIPT"
        echo ""
        echo "Migrations-Script ausführen? (j/N): "
        read -r -n 1 REPLY
        echo
        if [[ $REPLY =~ ^[Jj]$ ]]; then
            sudo -u "$APP_USER" bash "$MIGRATION_SCRIPT" || warning "Migration fehlgeschlagen (nicht kritisch)"
        fi
    else
        success "Keine Migrationen erforderlich"
    fi
}

start_service() {
    log "Starte Service '${SERVICE_NAME}'..."

    systemctl start "$SERVICE_NAME" || error "Service konnte nicht gestartet werden"

    sleep 3

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        success "Service gestartet"
    else
        error "Service ist nicht aktiv! Bitte Logs prüfen: journalctl -u $SERVICE_NAME -n 50"
    fi
}

verify_deployment() {
    log "Verifiziere Deployment..."

    # Warte kurz, bis der Server hochgefahren ist
    sleep 2

    # Port aus .env lesen, falls vorhanden
    PORT=3001
    if [ -f "$ENV_FILE" ]; then
        PORT=$(grep -E "^PORT=" "$ENV_FILE" | cut -d= -f2 || echo "3001")
    fi

    # Health-Check
    HEALTH_URL="http://127.0.0.1:${PORT}/api/health"

    if command -v curl &> /dev/null; then
        HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")

        if [ "$HEALTH_RESPONSE" = "200" ]; then
            success "Health-Check erfolgreich"
        else
            warning "Health-Check fehlgeschlagen (HTTP $HEALTH_RESPONSE)"
            warning "Prüfen Sie die Logs: journalctl -u $SERVICE_NAME -n 30"
        fi
    else
        warning "curl nicht verfügbar - Health-Check übersprungen"
    fi
}

show_status() {
    echo ""
    log "Service-Status:"
    systemctl status "$SERVICE_NAME" --no-pager --lines=10 || true
    echo ""
}

cleanup_old_backups() {
    log "Räume alte Backups auf (>30 Tage)..."

    find "$BACKUP_DIR" -name "pre-upgrade_*.tar.gz" -mtime +30 -delete 2>/dev/null || true
    find "$BACKUP_DIR" -name ".env.*" -mtime +30 -delete 2>/dev/null || true
    find "$BACKUP_DIR" -name "commit.*.txt" -mtime +30 -delete 2>/dev/null || true

    success "Alte Backups entfernt"
}

show_rollback_instructions() {
    local OLD_COMMIT=$(cat /tmp/pre-upgrade-commit.txt 2>/dev/null || echo "COMMIT_ID")

    echo ""
    log "Rollback-Anleitung (falls erforderlich):"
    echo "  1. Service stoppen:   systemctl stop $SERVICE_NAME"
    echo "  2. Code zurücksetzen: cd $APP_DIR && sudo -u $APP_USER git reset --hard $OLD_COMMIT"
    echo "  3. Deps neu install:  cd ${APP_DIR}/api && sudo -u $APP_USER bash -c 'source $NVM_DIR/nvm.sh && npm ci --omit=dev'"
    echo "  4. Backup restore:    tar -xzf ${BACKUP_DIR}/pre-upgrade_*.tar.gz -C ${DATA_DIR}"
    echo "  5. Service starten:   systemctl start $SERVICE_NAME"
    echo ""
}

# ============================================================================
# HAUPTPROGRAMM
# ============================================================================

main() {
    echo ""
    echo "================================================================"
    echo "  Entgeltrechner - Automatisches Update-Script"
    echo "  Version: 1.0"
    echo "================================================================"
    echo ""

    check_user
    check_prerequisites
    check_remote_updates
    confirm_update
    create_backup
    stop_service
    update_code
    update_dependencies
    check_permissions
    run_migrations
    start_service
    verify_deployment
    show_status
    cleanup_old_backups

    echo ""
    success "============================================"
    success "  Update erfolgreich abgeschlossen!"
    success "============================================"
    echo ""

    show_rollback_instructions
}

# Script ausführen
main "$@"
