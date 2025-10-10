# Entgeltrechner

Version 2.0 – Authentifizierter Rechner mit Benutzer- und Einladungsverwaltung.

Eine Webanwendung zur Berechnung des Entgelts nach der IG Metall Tariftabelle für die bayerische Metall- und Elektroindustrie. Aus Eingaben wie Entgeltgruppe, Arbeitszeit, Leistungszulage oder Urlaubstagen ermittelt sie Monats‑ und Jahreswerte und stellt die verschiedenen Entgeltsbestandteile übersichtlich dar. Zugriff auf die Rechnerfunktionen erfordert jetzt eine Anmeldung.

WebApp mit zwei Komponenten:

- **API** (`api/`): Node.js/Express-Server für Entgeltberechnung, Authentifizierung, Benutzerverwaltung und Einladungen.
- **Frontend** (`frontend/`): statische HTML/CSS/JS-Anwendung mit Login-Flow, Admin-Konsole und Rechner-Oberfläche.

## 🔒 Sicherheit

**Wichtig:** Siehe [SECURITY.md](./SECURITY.md) für detaillierte Informationen zu allen Sicherheitsfeatures.

Sicherheitsmaßnahmen in der authentifizierten Version:
- **Session-basierte Authentifizierung:** Signierte Cookies (express-session + FileStore) mit strengen Cookie-Flags und Rolling Sessions.
- **Passworthärtung:** bcrypt-Hashes, starke Passwort-Policy, automatisches Sperren nach wiederholtem Fehlversuch.
- **Rollen & Einladungen:** Admin-gesteuerte Benutzerverwaltung, einladungsbasierte Selbstregistrierung, getrennte Rollen `admin` und `user`.
- **CSRF-Schutz:** `csurf` mit per-Request-Token für alle zustandsverändernden Operationen.
- **API-Rate-Limiting:** 100 Requests pro 15 Minuten und IP für alle Endpunkte.
- **CSP & Security-Header:** via Helmet vorkonfiguriert; Schutz vor XSS, Clickjacking & MIME-Sniffing.
- **Strikte Origin-Allowlist:** Steuerbar über `ALLOWED_ORIGINS`.
- **Input-Validierung:** Zod-Schemata schützen die Berechnungs-Endpunkte vor ungültigen Eingaben.
- **Request-Logging:** HTTP-Logs mit morgan für Monitoring & Audits.

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
# 4. Browser öffnen und mit Benutzer "admin" / "Admin123!Test" anmelden
```

Der API-Server läuft unter `http://127.0.0.1:3001`, das Frontend unter `http://localhost:8080`.

Nach dem Start steht ein Standard-Administrator bereit (`admin` / `Admin123!Test`). Bitte direkt anmelden, das Passwort über die Account-Verwaltung ändern und anschließend weitere Benutzer bzw. Einladungen im Admin-Bereich verwalten.

## Benutzer & Einladungen

- Solange keine Benutzerdatei existiert, legt die API beim Start automatisch den Admin `admin` mit dem Kennwort `Admin123!Test` an und erzwingt eine Passwortänderung bei der ersten Anmeldung.
- Administratoren verwalten Benutzerrollen, Einladungen, Sperren und Passwort-Resets direkt im Frontend.
- Normale Benutzer haben Zugriff auf den Rechner und können ihr Passwort selbstständig ändern.
- Neue Konten können ausschließlich über Einladungscodes registriert werden; Einladungen verfallen automatisch nach Ablaufzeit oder nach Nutzung.

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
ALLOWED_ORIGINS=https://ihredomain.de
SESSION_SECRET=ein-langer-zufallswert
# Optional: Admin-Standardpasswort beim Erststart überschreiben
# DEFAULT_ADMIN_PASSWORD=IhrSicheresPasswort123!
```

## Tests

Jest-Tests für die API befinden sich im Ordner `api`:

```bash
cd api
npm test
```

## Updates

### Automatisches Update

Für Produktions-Installationen steht ein automatisches Update-Script zur Verfügung:

```bash
cd /opt/entgeltrechner/app
sudo ./upgrade.sh
```

Das Script führt automatisch durch:
- Backup vor dem Update
- Code-Aktualisierung via git
- npm-Abhängigkeiten installieren
- Berechtigungen prüfen
- Service neu starten
- Health-Check

**Wichtig:** Vor jedem Update `CHANGELOG.md` auf Breaking Changes prüfen!

## Dokumentation

- **[INSTALL.md](./INSTALL.md)** - Ausführliche Installationsanleitung
- **[SECURITY.md](./SECURITY.md)** - Sicherheitsfeatures und Best Practices
- **[CHANGELOG.md](./CHANGELOG.md)** - Versionshistorie und Breaking Changes

## Projektstruktur

```
entgeltrechnerigmby/
├── api/
│   ├── server.js           # Express-Server & API
│   ├── server.test.js      # Jest-Tests
│   ├── package.json
│   └── data/
│       ├── mai2024.json
│       ├── april2025.json
│       ├── april2026.json
│       ├── users.json      # Benutzer (wird automatisch angelegt)
│       ├── invites.json    # Einladungscodes (wird automatisch angelegt)
│       └── sessions/       # Session-Dateien (wird automatisch angelegt)
├── frontend/
│   ├── index.html          # Hauptseite (Rechner)
│   └── assets/
│       └── app.js          # Hauptlogik
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
