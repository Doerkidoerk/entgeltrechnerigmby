# Installationsanleitung

Diese Anleitung beschreibt die empfohlene Produktionsinstallation des authentifizierten Entgeltrechners (Version 2.0) auf einer Debian-/Ubuntu-Serverumgebung. Alle Schritte setzen `root`-Rechte voraus.

---

## 1. System vorbereiten

1. Pakete aktualisieren
   ```bash
   apt update && apt upgrade -y
   ```
2. Benötigte Pakete installieren
   ```bash
   apt install -y git curl build-essential nginx
   ```
3. Systembenutzer anlegen (falls noch nicht vorhanden)
   ```bash
   useradd --system --home /opt/entgeltrechner --shell /bin/bash entgeltrechner || true
   mkdir -p /opt/entgeltrechner
   chown entgeltrechner:entgeltrechner /opt/entgeltrechner
   ```

---

## 2. Node.js via nvm für den Service-User installieren

```bash
sudo -u entgeltrechner bash <<'INNER'
set -e
export NVM_DIR="/opt/entgeltrechner/.nvm"
mkdir -p "$NVM_DIR"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi
source "$NVM_DIR/nvm.sh"
nvm install 22
nvm alias default 22
INNER
```

---

## 3. Anwendung ausrollen

```bash
sudo -u entgeltrechner bash <<'INNER'
set -e
cd /opt/entgeltrechner
if [ ! -d app ]; then
  git clone https://github.com/Doerkidoerk/entgeltrechnerigmby.git app
else
  cd app
  git pull --ff-only
  exit 0
fi
cd app
source ../.nvm/nvm.sh
cd api
npm ci --omit=dev
INNER
```

Die statischen Frontend-Dateien werden direkt aus `frontend/` ausgeliefert.

---

## 4. Konfiguration

Erstelle `/opt/entgeltrechner/.env` mit folgendem Inhalt und passe Werte an:

```dotenv
NODE_ENV=production
PORT=3001
ALLOWED_ORIGINS=https://entgeltrechner.example.com
SESSION_SECRET=$(openssl rand -hex 48)
# Optional: Standard-Passwort des initialen Admins überschreiben
# DEFAULT_ADMIN_PASSWORD=IhrSehrSicheresPasswort123!
# Optional: Sitzungsdauer in Millisekunden (Standard 1800000 = 30 Min)
# SESSION_TTL_MS=1800000
```

`SESSION_SECRET` ist zwingend erforderlich und sollte ein ausreichend langer, zufälliger Wert sein. Ohne diesen Wert werden Sessions verworfen.

---

## 5. systemd-Service einrichten

`/etc/systemd/system/entgeltrechner.service`

```ini
[Unit]
Description=Entgeltrechner API
After=network.target

[Service]
Type=simple
User=entgeltrechner
Group=entgeltrechner
EnvironmentFile=/opt/entgeltrechner/.env
WorkingDirectory=/opt/entgeltrechner/app/api
ExecStart=/bin/bash -lc 'source /opt/entgeltrechner/.nvm/nvm.sh && node server.js'
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Anschließend:
```bash
systemctl daemon-reload
systemctl enable --now entgeltrechner.service
```

Der Health-Check ist unter `http://127.0.0.1:3001/api/health` erreichbar.

Nach dem ersten erfolgreichen Start legt die Anwendung automatisch den Administrator `admin` an. Das anfängliche Passwort lautet `Admin123!Test` oder – sofern gesetzt – der Wert aus `DEFAULT_ADMIN_PASSWORD`. Melden Sie sich umgehend an und ändern Sie das Passwort über den Menüpunkt **Account‑Sicherheit**.

---

## 6. nginx als Reverse Proxy

Beispielkonfiguration `/etc/nginx/sites-available/entgeltrechner`:

```nginx
server {
    listen 80;
    server_name entgeltrechner.example.com;

    location / {
        root /opt/entgeltrechner/app/frontend;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Symlink setzen und Konfiguration testen:
```bash
ln -s /etc/nginx/sites-available/entgeltrechner /etc/nginx/sites-enabled/entgeltrechner
nginx -t
systemctl reload nginx
```

TLS lässt sich mit [Certbot](https://certbot.eff.org/) ergänzen.

---

## 7. Backups

- Alle persistenten Daten liegen unter `/opt/entgeltrechner/app/api/data/` (Tariftabellen, `users.json`, `invites.json`, `sessions/`).
- Vor Updates das beiliegende `upgrade.sh` ausführen, es erstellt automatisch Backups.
- Backups regelmäßig an einen sicheren Ort kopieren und insbesondere `users.json` vertraulich behandeln.

---

## 8. Updates & Wartung

- Aktualisierungen erfolgen per `upgrade.sh` (siehe Abschnitt unten)
- Nach größeren Änderungen `npm audit` und `npm outdated` prüfen
- Rate-Limit-Auslastung und Serverlogs (systemd & nginx) überwachen

### upgrade.sh verwenden

```bash
cd /opt/entgeltrechner/app
sudo ./upgrade.sh
```

Das Script stoppt den Service, erstellt Backups, aktualisiert den Code, installiert Abhängigkeiten und startet die Anwendung neu. Es erwartet keine Benutzer- oder Einladungstabellen mehr.
Das Script stoppt den Service, erstellt Backups, aktualisiert den Code, installiert Abhängigkeiten und startet die Anwendung neu. Benutzer- und Einladungstabellen (`users.json`, `invites.json`) werden dabei automatisch mitgesichert.

---

## 9. Fehlerdiagnose

| Problem | Prüfschritte |
| --- | --- |
| Service startet nicht | `journalctl -u entgeltrechner -n 50` |
| Kein Zugriff auf `/api` | Prüfen, ob Service auf Port 3001 läuft und nginx-Konfiguration korrekt ist |
| Rate-Limit greift zu früh | `ALLOWED_ORIGINS` prüfen und ggf. zusätzliche Proxies berücksichtigen |
| Falsche Tabellenwerte | JSON-Dateien in `api/data` kontrollieren |
| Anmeldung nicht möglich | `SESSION_SECRET` gesetzt? Browser-Cookies löschen, Logs von API & nginx prüfen |

---

## 10. Entwicklung & Tests

Für lokale Entwicklung genügt:
```bash
# API
cd api
npm install
npm test
node server.js

# Frontend (in zweiter Shell)
cd frontend
npx serve -l 8080
```

Der Rechner ist anschließend unter `http://localhost:8080` verfügbar und ruft die API unter `http://127.0.0.1:3001` auf.
