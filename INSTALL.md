# Installationsanleitung – Entgeltrechner

Ausführliche Installationsanleitung für die Entgeltrechner-WebApp (v1.12+).

## Inhaltsverzeichnis

1. [Systemvoraussetzungen](#systemvoraussetzungen)
2. [Schnellstart (Entwicklung)](#schnellstart-entwicklung)
3. [Produktions-Installation](#produktions-installation)
4. [Konfiguration](#konfiguration)
5. [Sicherheit](#sicherheit)
6. [Wartung](#wartung)
7. [Backup & Restore](#backup--restore)
8. [Troubleshooting](#troubleshooting)
9. [Updates](#updates)

---

## Systemvoraussetzungen

### Mindestanforderungen

- **Betriebssystem:** Linux (empfohlen), macOS, oder Windows
- **Node.js:** Version 22.x (empfohlen: per `nvm` als Benutzerinstallation)
- **npm:** Wird über `nvm` gemeinsam mit Node.js installiert
- **RAM:** Mindestens 512 MB (1 GB empfohlen)
- **Festplatte:** Mindestens 500 MB freier Speicher

### Produktionsumgebung (zusätzlich)

- **Reverse Proxy:** nginx (empfohlen) oder Apache
- **SSL-Zertifikat:** Let's Encrypt oder kommerzielles Zertifikat
- **Prozess-Manager:** systemd (empfohlen) oder PM2
- **Firewall:** ufw, iptables, oder firewalld

### Abhängigkeiten prüfen

```bash
# nvm initialisieren (falls noch nicht im Profil)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

# Node.js-Version prüfen
node --version
# Sollte v22.x.x oder höher ausgeben

# npm-Version prüfen
npm --version
# Wird automatisch mit Node.js geliefert
```

Wenn Node.js/npm noch nicht installiert sind, verwenden Sie `nvm`:
```bash
# Als Zielbenutzer (z. B. entgeltrechner) nvm installieren
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# nvm in der aktuellen Shell laden
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

# Node.js 22 LTS installieren und als Standard setzen
nvm install lts/jod
nvm alias default lts/jod
```

---

## Schnellstart (Entwicklung)

Für lokale Entwicklung und Tests:

### 1. Repository klonen

```bash
git clone https://github.com/yourusername/entgeltrechnerigmby.git
cd entgeltrechnerigmby
```

### 2. Backend installieren und starten

```bash
cd api

# Sicherstellen, dass nvm geladen ist
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

# Node.js-Version einmalig installieren (liest .nvmrc)
nvm install
nvm use   # aktiviert die in .nvmrc definierte Node-Version

# Dependencies für die Entwicklung
npm install

# API lokal starten
node server.js
```

Der API-Server läuft nun auf `http://127.0.0.1:3001`.

### 3. Frontend bereitstellen

**Option A: Direkter Zugriff (nur für Tests)**
```bash
# Im Projektverzeichnis
cd frontend
# Eine der folgenden Optionen:
python3 -m http.server 8080
# oder
npx serve -l 8080
```

Frontend ist erreichbar unter `http://localhost:8080`.

**Option B: Mit Live-Server (für Entwicklung)**
```bash
cd frontend
npx live-server --port=8080
```

### 4. Erste Anmeldung

1. Öffnen Sie `http://localhost:8080` im Browser
2. Melden Sie sich an mit:
   - **Benutzername:** `admin`
   - **Passwort:** `Admin123!Test`
3. Sie werden aufgefordert, das Passwort zu ändern

**⚠️ Wichtig:** Im Entwicklungsmodus funktioniert die App nur mit HTTPS oder wenn Sie die HTTPS-Checks deaktivieren (nicht empfohlen).

---

## Produktions-Installation

### Vorbereitung

#### 1. Benutzer anlegen

```bash
# Service-Benutzer mit Home-Verzeichnis erstellen (falls noch nicht vorhanden)
sudo useradd -m -s /bin/bash entgeltrechner

# Bereitstellungsverzeichnis vorbereiten
sudo mkdir -p /opt/entgeltrechner
sudo chown entgeltrechner:entgeltrechner /opt/entgeltrechner
```

> Hinweis: Falls der Benutzer bereits existiert und ein anderes Home-Verzeichnis nutzt (z. B. `/opt/entgeltrechner`), passen Sie die nachfolgenden `NVM_DIR`-Pfadangaben entsprechend an.

#### 2. nvm & Node.js vorbereiten

```bash
# In eine Shell des entgeltrechner-Benutzers wechseln
sudo -u entgeltrechner -i

# Innerhalb der entgeltrechner-Shell:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
nvm install lts/jod
nvm alias default lts/jod
node --version   # Erwartet: v22.x.x
npm --version

# Zurück zur Root-Shell (falls erforderlich)
exit
```

#### 3. Repository installieren

```bash
# Als entgeltrechner-Benutzer
sudo -u entgeltrechner -i
cd /opt/entgeltrechner
git clone https://github.com/yourusername/entgeltrechnerigmby.git app
cd app
```

Bleiben Sie für die nächsten Befehle in dieser Shell – alle Installationsschritte laufen unter dem Benutzer `entgeltrechner`.

#### 4. Backend installieren

```bash
cd /opt/entgeltrechner/app/api
nvm use   # liest die .nvmrc und aktiviert Node 22 LTS
npm ci --omit=dev
```

> Standardmäßig liegt unter `api/data/users.json` bereits ein Administrator-Konto (`admin` / `Admin123!Test`). Falls Sie bestehende Daten übernehmen, ersetzen Sie die Datei vor dem ersten Start entsprechend.

Nach Abschluss können Sie die `entgeltrechner`-Shell mit `exit` verlassen.

### Konfiguration

#### 5. Umgebungsvariablen einrichten

```bash
sudo nano /opt/entgeltrechner/.env
```

Inhalt:

```bash
# Server-Konfiguration
NODE_ENV=production
PORT=3001

# Session-Konfiguration (in Millisekunden)
# 3600000 = 1 Stunde
SESSION_TTL_MS=3600000

# CSRF-Secret (32+ Zeichen, zufällig generiert)
CSRF_SECRET=IhrSuperGeheimesZufälligesSecretMitMindestens32Zeichen

# Erlaubte Origins (Ihre Domain)
ALLOWED_ORIGINS=https://entgeltrechner.ihredomain.de

# Log-Level (optional)
LOG_LEVEL=info
```

**CSRF_SECRET generieren:**
```bash
# Sicheres Secret generieren
openssl rand -base64 48
```

#### 6. Berechtigungen setzen

```bash
chmod 600 /opt/entgeltrechner/.env
chown entgeltrechner:entgeltrechner /opt/entgeltrechner/.env
```

### Systemd-Service einrichten

#### 7. Service-Datei erstellen

```bash
sudo nano /etc/systemd/system/entgeltrechner.service
```

Inhalt:

```ini
[Unit]
Description=Entgeltrechner API Server
After=network.target

[Service]
Type=simple
User=entgeltrechner
Group=entgeltrechner
WorkingDirectory=/opt/entgeltrechner/app/api
EnvironmentFile=/opt/entgeltrechner/.env
Environment="NVM_DIR=/home/entgeltrechner/.nvm"
ExecStart=/bin/bash -lc 'source /home/entgeltrechner/.nvm/nvm.sh && cd /opt/entgeltrechner/app/api && nvm use --silent && exec node server.js'
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=entgeltrechner

# Security-Einstellungen
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/entgeltrechner/app/api/data

[Install]
WantedBy=multi-user.target
```

#### 8. Service aktivieren und starten

```bash
# Service neu laden
sudo systemctl daemon-reload

# Service aktivieren (startet automatisch beim Booten)
sudo systemctl enable entgeltrechner

# Service starten
sudo systemctl start entgeltrechner

# Status prüfen
sudo systemctl status entgeltrechner

# Logs anzeigen
sudo journalctl -u entgeltrechner -f
```

### nginx als Reverse Proxy

#### 9. nginx installieren

```bash
# Debian/Ubuntu
sudo apt-get update
sudo apt-get install nginx

# RHEL/CentOS/Fedora
sudo yum install nginx
```

#### 10. nginx-Konfiguration erstellen

```bash
sudo nano /etc/nginx/sites-available/entgeltrechner
```

Inhalt:

```nginx
# HTTP -> HTTPS Redirect
server {
    listen 80;
    listen [::]:80;
    server_name entgeltrechner.ihredomain.de;

    # Let's Encrypt ACME Challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS Server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name entgeltrechner.ihredomain.de;

    # SSL-Konfiguration
    ssl_certificate /etc/letsencrypt/live/entgeltrechner.ihredomain.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/entgeltrechner.ihredomain.de/privkey.pem;

    # SSL-Sicherheit
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # HSTS (HTTP Strict Transport Security)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Frontend (statische Dateien)
    root /opt/entgeltrechner/app/frontend;
    index index.html;

    # Statische Dateien direkt ausliefern
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API-Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Logging
    access_log /var/log/nginx/entgeltrechner_access.log;
    error_log /var/log/nginx/entgeltrechner_error.log;
}
```

#### 11. nginx-Konfiguration aktivieren

```bash
# Symlink erstellen
sudo ln -s /etc/nginx/sites-available/entgeltrechner /etc/nginx/sites-enabled/

# Konfiguration testen
sudo nginx -t

# nginx neu starten
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### SSL-Zertifikat mit Let's Encrypt

#### 12. Certbot installieren

```bash
# Debian/Ubuntu
sudo apt-get install certbot python3-certbot-nginx

# RHEL/CentOS/Fedora
sudo yum install certbot python3-certbot-nginx
```

#### 13. Zertifikat erstellen

```bash
# Zertifikat anfordern
sudo certbot --nginx -d entgeltrechner.ihredomain.de

# Automatische Erneuerung testen
sudo certbot renew --dry-run
```

Certbot richtet automatisch einen Cron-Job für die Zertifikatserneuerung ein.

### Firewall konfigurieren

#### 14. Firewall-Regeln

```bash
# ufw (Ubuntu/Debian)
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable

# firewalld (RHEL/CentOS/Fedora)
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

---

## Konfiguration

### Umgebungsvariablen

| Variable | Beschreibung | Standard | Erforderlich |
|----------|--------------|----------|--------------|
| `NODE_ENV` | Umgebung (`production`, `development`, `test`) | `development` | Empfohlen |
| `PORT` | API-Server-Port | `3001` | Nein |
| `SESSION_TTL_MS` | Session-Gültigkeit in Millisekunden | `3600000` (1h) | Nein |
| `CSRF_SECRET` | Secret für CSRF-Token-Generierung | - | **Ja (Produktion)** |
| `ALLOWED_ORIGINS` | Erlaubte CORS-Origins (kommasepariert) | `https://entgeltrechner.cbmeyer.xyz` | Ja |
| `DEFAULT_ADMIN_PASSWORD` | Startpasswort für den Benutzer `admin`, wenn `data/users.json` fehlt | `Admin123!Test` | Nein |

### Tariftabellen

Tariftabellen befinden sich in `api/data/` als JSON-Dateien:

- `mai2024.json` – Tariftabelle gültig ab 01. Mai 2024
- `april2025.json` – Tariftabelle gültig ab 01. April 2025
- `april2026.json` – Tariftabelle gültig ab 01. April 2026

**Neue Tabelle hinzufügen:**

1. JSON-Datei in `api/data/` erstellen (z.B. `oktober2026.json`)
2. Struktur:

```json
{
  "table": {
    "EG01": { "A": 2850.00, "B": 3100.00, "C": 3350.00 },
    "EG05": { "A": 3200.00, "B": 3560.00, "C": 3920.00 },
    "AJ1": { "salary": 1264.00 }
  },
  "atMin": {
    "35": { "monat": 4200.00, "jahr": 50400.00 },
    "40": { "monat": 4800.00, "jahr": 57600.00 }
  }
}
```

3. Server neu starten (lädt Tabellen automatisch)

Der Server überwacht das `data/`-Verzeichnis und lädt Änderungen automatisch nach.

---

## Sicherheit

### Initiales Admin-Passwort ändern

**Sehr wichtig!** Nach der ersten Anmeldung:

1. Mit `admin` / `Admin123!Test` anmelden
2. Sie werden zur Passwortänderung weitergeleitet
3. Neues Passwort muss enthalten:
   - Mindestens 12 Zeichen
   - Großbuchstaben (A-Z)
   - Kleinbuchstaben (a-z)
   - Zahlen (0-9)
   - Sonderzeichen (!@#$%^&*...)

### Sicherheits-Checkliste

- [ ] `CSRF_SECRET` gesetzt und geheim gehalten
- [ ] `ALLOWED_ORIGINS` auf Ihre Domain beschränkt
- [ ] SSL/TLS-Zertifikat installiert und gültig
- [ ] Admin-Passwort geändert
- [ ] Firewall konfiguriert (nur Ports 80, 443 offen)
- [ ] Datei-Berechtigungen geprüft (`data/users.json` = 600)
- [ ] Regelmäßige Backups eingerichtet
- [ ] Audit-Log überwacht (`data/audit.log`)
- [ ] Updates regelmäßig eingespielt

### Dateiberechtigungen

```bash
# Sensible Dateien schützen
cd /opt/entgeltrechner/app/api/data
chmod 600 users.json invites.json audit.log
chown entgeltrechner:entgeltrechner users.json invites.json audit.log
```

### Audit-Log überwachen

```bash
# Audit-Log anzeigen
tail -f /opt/entgeltrechner/app/api/data/audit.log

# Fehlgeschlagene Login-Versuche
grep "login_failed" /opt/entgeltrechner/app/api/data/audit.log

# Erfolgreiche Logins
grep "login_success" /opt/entgeltrechner/app/api/data/audit.log
```

### Rate-Limiting

Die App schützt sich automatisch gegen Brute-Force-Angriffe:

- **Login:** Maximal 5 Versuche pro 15 Minuten
- **API:** Maximal 100 Requests pro 15 Minuten

Bei Überschreitung wird HTTP 429 (Too Many Requests) zurückgegeben.

---

## Wartung

### Logs anzeigen

```bash
# Systemd-Journal
sudo journalctl -u entgeltrechner -f

# nginx Access-Log
sudo tail -f /var/log/nginx/entgeltrechner_access.log

# nginx Error-Log
sudo tail -f /var/log/nginx/entgeltrechner_error.log

# Audit-Log
sudo tail -f /opt/entgeltrechner/app/api/data/audit.log
```

### Service-Verwaltung

```bash
# Status prüfen
sudo systemctl status entgeltrechner

# Neu starten
sudo systemctl restart entgeltrechner

# Stoppen
sudo systemctl stop entgeltrechner

# Starten
sudo systemctl start entgeltrechner

# Automatischen Start deaktivieren
sudo systemctl disable entgeltrechner
```

### Abgelaufene Sessions bereinigen

Sessions werden automatisch alle 10 Minuten bereinigt. Manuelles Cleanup:

```bash
# Server neu starten
sudo systemctl restart entgeltrechner
```

### Benutzer verwalten

**Neuen Benutzer anlegen:**

1. Als Admin anmelden
2. "Admin-Bereich" öffnen
3. "Einladungscode generieren" klicken
4. Code an neuen Benutzer weitergeben
5. Neuer Benutzer registriert sich unter `/register.html`

**Benutzer löschen:**

1. Als Admin anmelden
2. "Admin-Bereich" → Benutzer auswählen → "Löschen"

**Passwort zurücksetzen:**

1. Als Admin anmelden
2. "Admin-Bereich" → Benutzer auswählen → "Passwort setzen"

---

## Backup & Restore

### Backup erstellen

```bash
#!/bin/bash
# backup.sh - Tägliches Backup

BACKUP_DIR="/var/backups/entgeltrechner"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
APP_DIR="/opt/entgeltrechner/app/api/data"

# Backup-Verzeichnis erstellen
mkdir -p "$BACKUP_DIR"

# Daten sichern
tar -czf "$BACKUP_DIR/entgeltrechner_${TIMESTAMP}.tar.gz" \
    -C "$APP_DIR" \
    users.json invites.json audit.log *.json

# Alte Backups löschen (älter als 30 Tage)
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete

echo "Backup erstellt: entgeltrechner_${TIMESTAMP}.tar.gz"
```

**Backup automatisieren:**

```bash
# Cron-Job einrichten
sudo crontab -e

# Täglich um 2 Uhr morgens
0 2 * * * /opt/entgeltrechner/backup.sh >> /var/log/entgeltrechner_backup.log 2>&1
```

### Backup wiederherstellen

```bash
# Service stoppen
sudo systemctl stop entgeltrechner

# Backup wiederherstellen
cd /opt/entgeltrechner/app/api/data
sudo tar -xzf /var/backups/entgeltrechner/entgeltrechner_20250101_020000.tar.gz

# Berechtigungen wiederherstellen
sudo chown -R entgeltrechner:entgeltrechner /opt/entgeltrechner/app/api/data
sudo chmod 600 users.json invites.json audit.log

# Service starten
sudo systemctl start entgeltrechner
```

---

## Troubleshooting

### Problem: API startet nicht

**Symptom:** `systemctl status entgeltrechner` zeigt "failed"

**Lösung:**
```bash
# Logs prüfen
sudo journalctl -u entgeltrechner -n 50

# Häufige Ursachen:
# 1. Port bereits belegt
sudo lsof -i :3001

# 2. Berechtigungen falsch
ls -la /opt/entgeltrechner/app/api/data

# 3. Umgebungsvariablen fehlen
cat /opt/entgeltrechner/.env
```

### Problem: Frontend lädt nicht

**Symptom:** Weiße Seite oder 404-Fehler

**Lösung:**
```bash
# nginx-Konfiguration prüfen
sudo nginx -t

# nginx-Error-Log prüfen
sudo tail -f /var/log/nginx/entgeltrechner_error.log

# Dateiberechtigungen prüfen
ls -la /opt/entgeltrechner/app/frontend/
```

### Problem: Login schlägt fehl

**Symptom:** "Invalid credentials" trotz korrektem Passwort

**Lösung:**
```bash
# 1. HTTPS erzwingen?
# Login funktioniert nur über HTTPS (außer in Tests)

# 2. Rate-Limiting?
# Nach 5 Fehlversuchen 15 Minuten warten

# 3. Session abgelaufen?
# Token im Browser gelöscht oder abgelaufen

# 4. users.json prüfen
cat /opt/entgeltrechner/app/api/data/users.json
```

### Problem: CSRF-Fehler

**Symptom:** "CSRF validation failed"

**Lösung:**
```bash
# 1. CSRF_SECRET gesetzt?
grep CSRF_SECRET /opt/entgeltrechner/.env

# 2. Cookies blockiert?
# Browser-Einstellungen prüfen

# 3. Cookie-Domain stimmt?
# ALLOWED_ORIGINS muss mit Frontend-Domain übereinstimmen
```

### Problem: Hohe CPU-Auslastung

**Symptom:** Server langsam, hohe Last

**Lösung:**
```bash
# CPU-Verbrauch prüfen
top -u entgeltrechner

# Häufige Ursachen:
# 1. Rate-Limiting-Angriff?
grep "Too many" /var/log/nginx/entgeltrechner_access.log | tail -20

# 2. Zu viele Requests?
# nginx-Rate-Limiting aktivieren

# 3. Speicher-Leak?
sudo systemctl restart entgeltrechner
```

### Problem: Daten fehlen nach Update

**Symptom:** Benutzer oder Tabellen verschwunden

**Lösung:**
```bash
# 1. Backup wiederherstellen (siehe oben)

# 2. Datei-Pfade prüfen
ls -la /opt/entgeltrechner/app/api/data/

# 3. Git-Status prüfen
cd /opt/entgeltrechner/app
git status

# data/ sollte in .gitignore sein
cat .gitignore | grep data
```

---

## Updates

### Manuelles Update

```bash
# 1. Backup erstellen
/opt/entgeltrechner/backup.sh

# 2. Service stoppen
sudo systemctl stop entgeltrechner

# 3. Code aktualisieren
cd /opt/entgeltrechner/app
sudo -u entgeltrechner git pull

# 4. Abhängigkeiten aktualisieren
cd api
sudo -u entgeltrechner npm install

# 5. Migrations-Script ausführen (falls vorhanden)
# Siehe CHANGELOG.md

# 6. Service starten
sudo systemctl start entgeltrechner

# 7. Status prüfen
sudo systemctl status entgeltrechner
```

### Automatisches Update (upgrade.sh)

```bash
# Script ausführen
cd /opt/entgeltrechner/app
sudo -u entgeltrechner ./upgrade.sh
```

**Wichtig:** Lesen Sie vor Updates immer `CHANGELOG.md` und `SECURITY.md` auf Breaking Changes.

### Version prüfen

```bash
# API-Version
curl -k https://entgeltrechner.ihredomain.de/api/health | jq

# Frontend-Version
# Siehe Footer der Webseite oder HTML-Quelltext
```

---

## Support & Weiterführende Dokumentation

- **Sicherheits-Details:** [SECURITY.md](./SECURITY.md)
- **Projekt-README:** [README.md](./README.md)
- **Bug-Reports:** GitHub Issues
- **Changelog:** [CHANGELOG.md](./CHANGELOG.md) (falls vorhanden)

---

## Anhang: Beispiel-Deployment-Script

```bash
#!/bin/bash
# deploy.sh - Automatisches Deployment

set -e

APP_DIR="/opt/entgeltrechner/app"
BACKUP_DIR="/var/backups/entgeltrechner"

echo "=== Entgeltrechner Deployment ==="

# 1. Backup
echo "Erstelle Backup..."
/opt/entgeltrechner/backup.sh

# 2. Service stoppen
echo "Stoppe Service..."
sudo systemctl stop entgeltrechner

# 3. Code aktualisieren
echo "Aktualisiere Code..."
cd "$APP_DIR"
sudo -u entgeltrechner git pull

# 4. Dependencies installieren
echo "Installiere Dependencies..."
cd "$APP_DIR/api"
sudo -u entgeltrechner npm install --production

# 5. Berechtigungen prüfen
echo "Prüfe Berechtigungen..."
sudo chown -R entgeltrechner:entgeltrechner "$APP_DIR"
sudo chmod 600 "$APP_DIR/api/data/"{users.json,invites.json,audit.log}

# 6. Service starten
echo "Starte Service..."
sudo systemctl start entgeltrechner

# 7. Status prüfen
sleep 3
if systemctl is-active --quiet entgeltrechner; then
    echo "✓ Deployment erfolgreich!"
    sudo systemctl status entgeltrechner --no-pager
else
    echo "✗ Deployment fehlgeschlagen!"
    sudo journalctl -u entgeltrechner -n 20 --no-pager
    exit 1
fi
```

**Installation des Scripts:**

```bash
sudo cp deploy.sh /opt/entgeltrechner/
sudo chmod +x /opt/entgeltrechner/deploy.sh
```

---

**Stand:** Version 1.12 (Oktober 2025)

Bei Fragen oder Problemen erstellen Sie bitte ein Issue im GitHub-Repository.
