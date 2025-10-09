# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/),
und dieses Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

### Hinzugefügt
- Automatisches `upgrade.sh` Script für Produktions-Updates

---

## [1.12.0] - 2025-10-09

### Hinzugefügt
- **Security-Hardening:** Rate-Limiting für Login (5 Versuche/15min) und API (100 Requests/15min)
- **CSRF-Protection:** Double Submit Cookie Pattern mit csrf-csrf
- **Audit-Logging:** Alle sicherheitsrelevanten Events werden in `data/audit.log` protokolliert
- **Starke Passwörter:** Mindestens 12 Zeichen mit Groß-/Kleinbuchstaben, Zahlen, Sonderzeichen
- **Session-Management:** Automatisches Cleanup abgelaufener Sessions alle 10 Minuten
- **Session-Rotation:** Bei Passwortänderung werden alte Sessions invalidiert
- **CSP-Header:** Content Security Policy gegen XSS-Angriffe
- **Sichere Datei-Berechtigungen:** chmod 600 für sensible Dateien (users.json, invites.json, audit.log)
- **Stärkere Invite-Codes:** 12 Zeichen mit 7-Tage-Ablaufzeit
- **Input-Validierung:** Strenge Validierung mit Zod-Schema
- **HTTPS-Enforcement:** Passwort-Endpunkte nur über HTTPS

### Geändert
- Standard-Admin-Passwort muss beim ersten Login geändert werden
- Session-TTL standardmäßig 1 Stunde (konfigurierbar via `SESSION_TTL_MS`)
- Verbesserte Fehlerbehandlung und Logging

### Sicherheit
- **WICHTIG:** `CSRF_SECRET` muss in Produktion gesetzt werden
- **WICHTIG:** `ALLOWED_ORIGINS` sollte auf Ihre Domain beschränkt sein
- Alle Passwörter werden mit scrypt gehasht (64 Bytes)
- Timing-safe Passwort-Vergleich gegen Timing-Angriffe

### Migration von v1.11.x → v1.12.0
Keine Breaking Changes. Nach dem Update:
1. `.env` Datei erstellen und `CSRF_SECRET` setzen (siehe INSTALL.md)
2. Beim nächsten Login wird Admin aufgefordert, Passwort zu ändern
3. Alte Sessions werden automatisch invalidiert

---

## [1.11.0] - (Datum einfügen)

### Hinzugefügt
- Benutzer-Registrierung via Einladungscodes
- Admin-Bereich für Benutzerverwaltung
- Passwort-Änderung für alle Benutzer

### Geändert
- Umstellung auf bcrypt für Passwort-Hashing
- Verbesserte Login-Seite

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

**MAJOR.MINOR.PATCH** (z.B. 1.12.0)

- **MAJOR:** Breaking Changes (Inkompatible API-Änderungen)
- **MINOR:** Neue Features (abwärtskompatibel)
- **PATCH:** Bugfixes (abwärtskompatibel)

**Beispiele:**
- `1.12.0 → 1.12.1`: Bugfix, kein Update-Risiko
- `1.12.0 → 1.13.0`: Neue Features, geringes Risiko
- `1.12.0 → 2.0.0`: Breaking Changes, CHANGELOG lesen!

---

[Unreleased]: https://github.com/Doerkidoerk/entgeltrechnerigmby/compare/v1.12.0...HEAD
[1.12.0]: https://github.com/Doerkidoerk/entgeltrechnerigmby/releases/tag/v1.12.0
