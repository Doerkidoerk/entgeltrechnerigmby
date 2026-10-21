#!/bin/bash
#
# upgrade.sh - Automatisches Update-Script für Entgeltrechner
# Version: 1.1
# Führt ein sicheres Update der laufenden Produktions-Installation durch.
# Schlägt ein Schritt nach dem Stoppen des Service fehl, wird automatisch
# auf den vorherigen Stand zurückgerollt.
#
# AUFRUF als root oder sudo-Benutzer:
#   sudo /opt/entgeltrechner/app/upgrade.sh
#

set -euo pipefail

# ============================================================================
# KONFIGURATION (per Umgebungsvariable überschreibbar)
# ============================================================================

APP_USER="${APP_USER:-entgeltrechner}"
APP_HOME="${APP_HOME:-/opt/entgeltrechner}"
APP_DIR="${APP_DIR:-${APP_HOME}/app}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/entgeltrechner}"
SERVICE_NAME="${SERVICE_NAME:-entgeltrechner}"
DATA_DIR="${APP_DIR}/api/data"
ENV_FILE="${ENV_FILE:-${APP_HOME}/.env}"
NVM_DIR="${NVM_DIR:-${APP_HOME}/.nvm}"
HEALTH_RETRIES="${HEALTH_RETRIES:-10}"

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Zustand
OLD_COMMIT=""
BACKUP_FILE=""
ROLLBACK_NEEDED=false   # ab dem Stoppen des Service
CODE_UPDATED=false      # nach erfolgreichem git pull
DEPS_TOUCHED=false      # sobald node_modules verändert wird

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
    echo -e "${RED}✗${NC} $1" >&2
    exit 1
}

# Fragt nach Bestätigung (j/N). Ohne Terminal-Eingabe gilt "Nein".
confirm() {
    local reply=""
    echo -n "$1 (j/N): "
    read -r -n 1 reply || true
    echo
    [[ $reply =~ ^[Jj]$ ]]
}

as_app_user() {
    sudo -u "$APP_USER" -H "$@"
}

app_git() {
    as_app_user git -C "$APP_DIR" "$@"
}

check_user() {
    if [ "$EUID" -ne 0 ]; then
        error "Dieses Script muss als root ausgeführt werden: sudo $0"
    fi
}

check_prerequisites() {
    log "Prüfe Voraussetzungen..."

    id "$APP_USER" &>/dev/null || error "Benutzer '$APP_USER' existiert nicht"
    [ -d "${APP_DIR}/.git" ] || error "Kein Git-Repository gefunden in ${APP_DIR}"
    [ -s "$NVM_DIR/nvm.sh" ] || error "nvm nicht gefunden unter $NVM_DIR"
    systemctl cat "${SERVICE_NAME}.service" &>/dev/null || error "systemd Service '${SERVICE_NAME}' nicht gefunden"

    if [ ! -f "$ENV_FILE" ]; then
        warning ".env Datei nicht gefunden unter $ENV_FILE"
    fi

    success "Voraussetzungen erfüllt"
}

check_remote_updates() {
    log "Prüfe auf Updates..."

    app_git fetch origin || error "Git fetch fehlgeschlagen"

    local local_commit remote_commit
    local_commit=$(app_git rev-parse @)
    remote_commit=$(app_git rev-parse '@{u}' 2>/dev/null) \
        || error "Kein Remote-Branch (Upstream) für den aktuellen Branch konfiguriert"

    if [ "$local_commit" = "$remote_commit" ]; then
        success "Repository ist bereits aktuell"
        echo ""
        confirm "Trotzdem fortfahren?" || exit 0
    else
        echo ""
        log "Verfügbare Updates:"
        app_git log --oneline --decorate "${local_commit}..${remote_commit}"
        echo ""
    fi
}

confirm_update() {
    echo ""
    warning "ACHTUNG: Dieses Script wird folgende Aktionen durchführen:"
    echo "  1. Service '${SERVICE_NAME}' stoppen"
    echo "  2. Code-Update via 'git pull --ff-only'"
    echo "  3. npm-Abhängigkeiten aktualisieren"
    echo "  4. Datei-Berechtigungen prüfen"
    echo "  5. Service neu starten und Health-Check ausführen"
    echo "  Bei einem Fehler wird automatisch auf den aktuellen Stand zurückgerollt."
    echo ""
    if ! confirm "Möchten Sie fortfahren?"; then
        log "Update abgebrochen"
        exit 0
    fi
}

create_backup() {
    log "Erstelle Backup..."

    local timestamp
    timestamp=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="${BACKUP_DIR}/pre-upgrade_${timestamp}.tar.gz"
    OLD_COMMIT=$(app_git rev-parse HEAD)

    mkdir -p "$BACKUP_DIR"
    chmod 700 "$BACKUP_DIR"

    if [ -d "$DATA_DIR" ]; then
        tar -czf "$BACKUP_FILE" -C "$DATA_DIR" --exclude='*.log' . \
            || error "Backup der Tariftabellen fehlgeschlagen"
        chmod 600 "$BACKUP_FILE"
    fi

    if [ -f "$ENV_FILE" ]; then
        cp "$ENV_FILE" "${BACKUP_DIR}/.env.${timestamp}"
        chmod 600 "${BACKUP_DIR}/.env.${timestamp}"
    fi

    echo "$OLD_COMMIT" > "${BACKUP_DIR}/commit.${timestamp}.txt"

    success "Backup erstellt: $BACKUP_FILE"
    echo "   Commit: $OLD_COMMIT"
}

stop_service() {
    log "Stoppe Service '${SERVICE_NAME}'..."

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        systemctl stop "$SERVICE_NAME" || error "Service konnte nicht gestoppt werden"
        success "Service gestoppt"
    else
        warning "Service läuft nicht"
    fi
}

# Vor dem Stoppen des Service: lokale Änderungen an getrackten Dateien klären
check_local_changes() {
    if [ -z "$(app_git status --porcelain --untracked-files=no)" ]; then
        return
    fi
    warning "Lokale Änderungen gefunden:"
    app_git status --short --untracked-files=no
    echo ""
    if confirm "Änderungen verwerfen und fortfahren?"; then
        # Nicht getrackte Dateien (z. B. eigene Tariftabellen) bleiben erhalten
        app_git checkout -- .
        success "Lokale Änderungen verworfen"
    else
        error "Update abgebrochen. Bitte committen Sie Ihre Änderungen erst."
    fi
}

update_code() {
    log "Aktualisiere Code..."
    app_git pull --ff-only || error "Git pull fehlgeschlagen (kein Fast-Forward möglich?)"
    CODE_UPDATED=true
    success "Code aktualisiert auf Commit: $(app_git rev-parse --short HEAD)"
}

# npm-Abhängigkeiten gemäß package-lock.json installieren (gibt Status zurück, bricht nicht ab)
install_dependencies() {
    # kein "set -e": nvm.sh ist damit nicht zuverlässig nutzbar.
    # Pfade werden als Argumente übergeben, daher bewusst einfache Anführungszeichen.
    # shellcheck disable=SC2016
    as_app_user bash -c '
        cd "$1" || exit 1
        export NVM_DIR="$2"
        source "$NVM_DIR/nvm.sh"
        if [ -f .nvmrc ]; then
            nvm use --silent || echo "Node-Version aus .nvmrc konnte nicht aktiviert werden"
        fi
        if [ -f package-lock.json ]; then
            npm ci --omit=dev --silent
        else
            npm install --omit=dev --silent
        fi
    ' _ "${APP_DIR}/api" "$NVM_DIR"
}

update_dependencies() {
    log "Aktualisiere Dependencies..."
    DEPS_TOUCHED=true
    install_dependencies || error "npm-Installation fehlgeschlagen"
    success "Dependencies aktualisiert"
}

check_permissions() {
    log "Prüfe Datei-Berechtigungen..."

    chown -R "${APP_USER}:${APP_USER}" "$APP_DIR"

    # Tariftabellen auf 640 setzen
    find "$DATA_DIR" -maxdepth 1 -name '*.json' -type f -exec chmod 640 {} + 2>/dev/null || true

    if [ -f "$ENV_FILE" ]; then
        chmod 600 "$ENV_FILE"
        chown "${APP_USER}:${APP_USER}" "$ENV_FILE"
    fi

    success "Berechtigungen geprüft"
}

run_migrations() {
    log "Prüfe auf Migrations-Scripts..."

    local migration_script="${APP_DIR}/migrate.sh"

    if [ -f "$migration_script" ] && [ -x "$migration_script" ]; then
        warning "Migrations-Script gefunden: $migration_script"
        echo ""
        if confirm "Migrations-Script ausführen?"; then
            as_app_user bash "$migration_script" || warning "Migration fehlgeschlagen (nicht kritisch)"
        fi
    else
        success "Keine Migrationen erforderlich"
    fi
}

start_service() {
    log "Starte Service '${SERVICE_NAME}'..."

    systemctl start "$SERVICE_NAME" || error "Service konnte nicht gestartet werden"
    sleep 2

    if ! systemctl is-active --quiet "$SERVICE_NAME"; then
        error "Service ist nicht aktiv! Logs: journalctl -u $SERVICE_NAME -n 50"
    fi
    success "Service gestartet"
}

read_port() {
    local port=""
    if [ -f "$ENV_FILE" ]; then
        port=$(grep -E '^[[:space:]]*PORT=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d "\"' \r" || true)
    fi
    echo "${port:-3001}"
}

verify_deployment() {
    log "Verifiziere Deployment..."

    if ! command -v curl &>/dev/null; then
        warning "curl nicht verfügbar - Health-Check übersprungen"
        return
    fi

    local health_url status attempt
    health_url="http://127.0.0.1:$(read_port)/api/health"

    for ((attempt = 1; attempt <= HEALTH_RETRIES; attempt++)); do
        status=$(curl -s -o /dev/null -w "%{http_code}" "$health_url" || true)
        if [ "$status" = "200" ]; then
            success "Health-Check erfolgreich"
            return
        fi
        sleep 1
    done

    error "Health-Check fehlgeschlagen (HTTP ${status:-000}). Logs: journalctl -u $SERVICE_NAME -n 30"
}

show_status() {
    echo ""
    log "Service-Status:"
    systemctl status "$SERVICE_NAME" --no-pager --lines=10 || true
    echo ""
}

cleanup_old_backups() {
    log "Räume alte Backups auf (>30 Tage)..."

    find "$BACKUP_DIR" -maxdepth 1 \( -name "pre-upgrade_*.tar.gz" -o -name ".env.*" -o -name "commit.*.txt" \) \
        -mtime +30 -delete 2>/dev/null || true

    success "Alte Backups entfernt"
}

show_rollback_instructions() {
    echo ""
    log "Rollback-Anleitung (falls erforderlich):"
    echo "  1. Service stoppen:   systemctl stop $SERVICE_NAME"
    echo "  2. Code zurücksetzen: sudo -u $APP_USER git -C $APP_DIR reset --hard ${OLD_COMMIT:-<COMMIT_ID>}"
    echo "  3. Deps neu install:  cd ${APP_DIR}/api && sudo -u $APP_USER bash -c 'source $NVM_DIR/nvm.sh && npm ci --omit=dev'"
    echo "  4. Backup restore:    tar -xzf ${BACKUP_FILE:-${BACKUP_DIR}/pre-upgrade_<ZEITSTEMPEL>.tar.gz} -C ${DATA_DIR}"
    echo "  5. Service starten:   systemctl start $SERVICE_NAME"
    echo ""
}

# Macht die bereits ausgeführten Schritte rückgängig und startet den Service wieder.
rollback() {
    echo "" >&2
    warning "Update fehlgeschlagen – Rollback auf ${OLD_COMMIT:0:8}..."
    if { [ "$CODE_UPDATED" = false ] || app_git reset --hard "$OLD_COMMIT"; } \
        && { [ "$CODE_UPDATED" = false ] && [ "$DEPS_TOUCHED" = false ] || install_dependencies; } \
        && chown -R "${APP_USER}:${APP_USER}" "$APP_DIR" \
        && systemctl restart "$SERVICE_NAME"; then
        warning "Rollback abgeschlossen, Service läuft wieder mit ${OLD_COMMIT:0:8}"
    else
        echo -e "${RED}✗${NC} Automatischer Rollback fehlgeschlagen – bitte manuell eingreifen:" >&2
        show_rollback_instructions
    fi
}

on_exit() {
    local status=$?
    if [ "$status" -ne 0 ] && [ "$ROLLBACK_NEEDED" = true ]; then
        set +e
        rollback
    fi
}

# ============================================================================
# HAUPTPROGRAMM
# ============================================================================

main() {
    echo ""
    echo "================================================================"
    echo "  Entgeltrechner - Automatisches Update-Script"
    echo "  Version: 1.1"
    echo "================================================================"
    echo ""

    check_user
    check_prerequisites
    check_remote_updates
    confirm_update
    create_backup
    check_local_changes

    trap on_exit EXIT
    ROLLBACK_NEEDED=true
    stop_service
    update_code
    update_dependencies
    check_permissions
    run_migrations
    start_service
    verify_deployment
    ROLLBACK_NEEDED=false

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
