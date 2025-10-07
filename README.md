# Entgeltrechner

Version 1.12 – Security-Hardening mit Rate-Limiting, verschärften Passwortregeln, Audit-Logging und verbessertem Session-Management.

Eine kleine Webanwendung zur Berechnung des Entgelts nach der IG Metall Tariftabelle für die bayerische Metall- und Elektroindustrie. Aus Eingaben wie Entgeltgruppe, Arbeitszeit, Leistungszulage oder Urlaubstagen ermittelt sie Monats‑ und Jahreswerte und stellt die verschiedenen Entgeltsbestandteile übersichtlich dar.

WebApp mit zwei Komponenten:

- **API** (`api/`): Node.js/Express-Server für die Entgeltberechnung.
- **Frontend** (`frontend/`): statische HTML/CSS/JS-Anwendung, die die API nutzt.

## 🔒 Sicherheit

**Wichtig:** Siehe [SECURITY.md](./SECURITY.md) für detaillierte Informationen zu allen Sicherheitsfeatures.

Neue Sicherheitsfeatures in v1.12:
- **CSRF-Protection:** Double Submit Cookie Pattern mit csrf-csrf
- **Rate-Limiting:** Schutz vor Brute-Force (5 Login-Versuche/15min)
- **Starke Passwörter:** Mind. 12 Zeichen mit Groß-/Kleinbuchstaben, Zahlen, Sonderzeichen
- **Audit-Logging:** Alle sicherheitsrelevanten Events werden protokolliert
- **Session-Härten:** Automatisches Cleanup, Session-Rotation bei Passwortänderung
- **CSP-Header:** Schutz vor XSS-Angriffen
- **Sichere Datei-Berechtigungen:** chmod 600 für `users.json`, `invites.json`, `audit.log`
- **Input-Validierung:** Strenge Validierung aller User-Inputs
- **Stärkere Invite-Codes:** 12 Zeichen mit 7-Tage-Ablauf

## Benutzerverwaltung

Standardmäßig existiert der Benutzer `admin` mit dem Passwort `Admin123!Test` (oder das von dir gesetzte Passwort). Dieser Account muss nach dem ersten Login sein Passwort ändern. **Passwörter müssen mindestens 12 Zeichen lang sein und Groß-/Kleinbuchstaben, Zahlen sowie Sonderzeichen enthalten.** Sitzungen laufen nach einer Stunde automatisch ab. Nur angemeldete Benutzer können den Entgeltrechner verwenden. Ein Logout-Button beendet die Sitzung. Im Admin-Bereich lassen sich Benutzer anlegen, löschen und deren Passwörter zurücksetzen, ohne dass Passwörter eingesehen werden können. Zusätzlich können dort einmalige Einladungscodes (12 Zeichen, 7 Tage gültig) erzeugt werden, mit denen sich neue Nutzer selbst registrieren. Jeder Nutzer kann sein Passwort später über den Link "Passwort ändern" im Header anpassen. Alle passwortbezogenen Endpunkte verlangen eine HTTPS-Verbindung.

## Installation

### Schnellstart (Entwicklung)

```bash
# 1. Repository klonen
git clone https://github.com/yourusername/entgeltrechnerigmby.git
cd entgeltrechnerigmby

# 2. API installieren und starten
cd api
npm install
node server.js

# 3. Frontend bereitstellen (in neuem Terminal)
cd ../frontend
npx serve -l 8080
```

Der API-Server läuft unter `http://127.0.0.1:3001`, das Frontend unter `http://localhost:8080`.

**Erste Anmeldung:**
- **Benutzername:** `admin`
- **Passwort:** `Admin123!Test`

### Produktions-Deployment

Für eine vollständige Produktions-Installation mit nginx, SSL, systemd und allen Sicherheitsfeatures siehe **[INSTALL.md](./INSTALL.md)**.

Die ausführliche Installationsanleitung enthält:
- Systemvoraussetzungen und Abhängigkeiten
- Produktions-Setup mit nginx + Let's Encrypt
- systemd-Service-Konfiguration
- Umgebungsvariablen und Sicherheits-Konfiguration
- Backup & Restore-Strategien
- Wartung und Monitoring
- Troubleshooting-Guide

## Umgebungsvariablen (Produktion)

Erstellen Sie eine `.env`-Datei oder setzen Sie die folgenden Variablen:

```bash
NODE_ENV=production
PORT=3001
SESSION_TTL_MS=3600000
CSRF_SECRET=IhrSuperGeheimesZufälligesSecret  # 32+ Zeichen!
ALLOWED_ORIGINS=https://ihredomain.de
```

**Wichtig:** `CSRF_SECRET` muss in Produktion gesetzt werden! Generieren Sie ein sicheres Secret mit:
```bash
openssl rand -base64 48
```

## Tests

Jest-Tests für die API befinden sich im Ordner `api`:

```bash
cd api
npm test
```

## Dokumentation

- **[INSTALL.md](./INSTALL.md)** - Ausführliche Installationsanleitung (867 Zeilen)
- **[SECURITY.md](./SECURITY.md)** - Sicherheitsfeatures und Best Practices

## Projektstruktur

```
entgeltrechnerigmby/
├── api/
│   ├── server.js           # Express-Server & API
│   ├── server.test.js      # Jest-Tests
│   ├── package.json
│   └── data/               # Tariftabellen & Benutzerdaten
│       ├── mai2024.json
│       ├── april2025.json
│       ├── april2026.json
│       ├── users.json      # Benutzerdatenbank (automatisch erstellt)
│       ├── invites.json    # Einladungscodes (automatisch erstellt)
│       └── audit.log       # Sicherheitsprotokoll (automatisch erstellt)
├── frontend/
│   ├── index.html          # Hauptseite
│   ├── admin.html          # Admin-Bereich
│   ├── register.html       # Registrierung
│   ├── change-password.html
│   └── assets/
│       ├── app.js          # Hauptlogik
│       ├── admin.js
│       ├── register.js
│       └── change-password.js
├── INSTALL.md              # Ausführliche Installationsanleitung
├── SECURITY.md             # Sicherheitsdokumentation
├── README.md               # Diese Datei
└── upgrade.sh              # Update-Script
```

## Support

Bei Fragen oder Problemen:
- Lesen Sie [INSTALL.md](./INSTALL.md) für detaillierte Anleitungen
- Prüfen Sie [SECURITY.md](./SECURITY.md) für Sicherheitsfragen
- Erstellen Sie ein Issue auf GitHub
