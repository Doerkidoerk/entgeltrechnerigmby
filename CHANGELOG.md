# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/),
und dieses Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

### Hinzugefügt
- Automatisches `upgrade.sh` Script für Produktions-Updates

---

## [2.0.0] - 2025-10-10

### Hinzugefügt
- Wieder eingeführte Benutzer- und Rollenverwaltung mit Session-basiertem Login.
- Admin-Oberfläche im Frontend für Benutzer, Einladungen, Passwort-Resets und Sperren.
- Einladungscodes mit optionaler Ablaufzeit zur Self-Service-Registrierung.
- CSRF-Schutz für alle mutierenden API-Aufrufe und Login-Lockout nach wiederholten Fehlversuchen.
- Passwortwechsel-Funktion für angemeldete Benutzer, inklusive Must-Change-Anzeige.

### Geändert
- Frontend zeigt nach Login den Rechner und blendet administrative Funktionen nur für Admins ein.
- `upgrade.sh` setzt Berechtigungen für `users.json`, `invites.json` sowie das Session-Verzeichnis.
- Dokumentation (README, INSTALL, SECURITY) auf authentifizierte Nutzung aktualisiert.

### Sicherheit
- Aktivierte `express-session` mit strikt konfigurierten Cookies und Rolling Sessions.
- Bcrypt-Hashing und Passwort-Policy (≥12 Zeichen, komplexe Zusammensetzung).

### Migration von v1.13.x → v2.0.0
1. `.env` um `SESSION_SECRET` (Pflicht) sowie ggf. `DEFAULT_ADMIN_PASSWORD` und `SESSION_TTL_MS` ergänzen.
2. Service stoppen, `npm install` im Ordner `api/` ausführen (neue Dependencies).
3. `upgrade.sh` einmal laufen lassen, damit Berechtigungen und Backups aktualisiert werden.
4. Nach dem Start mit dem Admin anmelden und das Passwort sofort ändern.

---

## [1.13.0] - 2025-10-10

### Entfernt
- Sämtliche Authentifizierungs-, Session- und Benutzerverwaltungsfunktionen
- Audit-Log-Dateien und Einladungscode-Handling

### Geändert
- Frontend zeigt den Rechner ohne Login-Barrieren an
- Dokumentation für Installation, Sicherheit und Updates auf die öffentliche Nutzung angepasst
- `upgrade.sh` bereinigt Berechtigungsprüfungen von nicht mehr vorhandenen Dateien

### Migration von v1.12.x → v1.13.0
1. Alte Benutzer- und Einladungstabellen (`users.json`, `invites.json`) sichern und anschließend entfernen
2. Konfigurationsdateien auf nicht mehr benötigte Secrets (z. B. `CSRF_SECRET`, `SESSION_TTL_MS`) prüfen
3. Deployment-Checkliste aus den aktualisierten Docs nutzen

---

## [1.12.0] - 2025-10-09

### Hinzugefügt
- Security-Hardening mit Rate-Limiting für API-Anfragen
- Content-Security-Policy und zusätzliche Security-Header via Helmet
- Validierung sämtlicher Eingaben über Zod
- Health-Check-Endpunkt `/api/health`

### Geändert
- Verbesserte Fehlerbehandlung und Logging
- Tariftabellen-Ladeprozess robuster gestaltet

---

## [1.10.0] - (Datum einfügen)

### Hinzugefügt
- Tariftabelle April 2026
- Automatisches Hot-Reload von Tariftabellen
- Health-Check Endpunkt `/api/health`

### Geändert
- Optimierte Tarifberechnung
- Verbesserte Fehlerbehandlung

---

## [1.0.0] - (Datum einfügen)

### Hinzugefügt
- Initiales Release
- Entgeltberechnung für IG Metall Bayern
- Express.js API Backend
- Statisches HTML/JS Frontend
- Basic Authentication
- Unterstützung für EG01-EG17 und AJ1-AJ4
- Tariftabellen Mai 2024, April 2025

---

## Template für neue Releases

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Hinzugefügt (Added)
- Neue Features

### Geändert (Changed)
- Änderungen an bestehenden Features

### Veraltet (Deprecated)
- Features, die bald entfernt werden

### Entfernt (Removed)
- Entfernte Features

### Behoben (Fixed)
- Bugfixes

### Sicherheit (Security)
- Sicherheitsrelevante Änderungen

### Migration
- Anleitung für Breaking Changes
```

---

## Versionierungs-Schema

**MAJOR.MINOR.PATCH** (z.B. 1.13.0)

- **MAJOR:** Breaking Changes (Inkompatible API-Änderungen)
- **MINOR:** Neue Features (abwärtskompatibel)
- **PATCH:** Bugfixes (abwärtskompatibel)

**Beispiele:**
- `1.13.0 → 1.13.1`: Bugfix, kein Update-Risiko
- `1.13.0 → 1.14.0`: Neue Features, geringes Risiko
- `1.13.0 → 2.0.0`: Breaking Changes, CHANGELOG lesen!

---

[Unreleased]: https://github.com/Doerkidoerk/entgeltrechnerigmby/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/Doerkidoerk/entgeltrechnerigmby/releases/tag/v2.0.0
[1.13.0]: https://github.com/Doerkidoerk/entgeltrechnerigmby/releases/tag/v1.13.0
[1.12.0]: https://github.com/Doerkidoerk/entgeltrechnerigmby/releases/tag/v1.12.0
