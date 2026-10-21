# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/),
und dieses Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

### Hinzugefügt
- Automatisches `upgrade.sh` Script für Produktions-Updates
- `upgrade.sh`: automatischer Rollback, wenn ein Schritt nach dem Stoppen des Service fehlschlägt; Health-Check mit Wiederholungen
- Umgebungsvariablen `TRUST_PROXY` und `RATE_LIMIT_MAX`
- Tariftabellen enthalten `label`, `validFrom` und optional `azubiHint`; neue Tabellen benötigen keine Code-Änderung mehr
- `npm start` liefert API und Frontend gemeinsam aus (lokale Entwicklung)

### Geändert
- API in Module aufgeteilt (`lib/app.js`, `calculate.js`, `config.js`, `schemas.js`, `tables.js`); Tests nach `api/test/`
- Frontend (`app.js`) neu strukturiert, als ES-Modul geladen; HTML-Ausgabe mit automatischem Escaping
- Tariftabellen werden beim Laden per Schema validiert; beim Neuladen bleibt die letzte gültige Version aktiv
- `/api/health` liefert die Version und antwortet mit 503, solange keine Tabelle geladen ist
- Tabellen-Antworten werden nur noch 5 Minuten gecacht (vorher 1 Tag, `immutable`), damit Korrekturen ankommen
- Abhängigkeiten per `npm audit fix` aktualisiert

### Behoben
- Rate-Limiting hinter nginx: alle Nutzer teilten sich ein gemeinsames Kontingent von 100 Anfragen
- Unbekannte Tabellen-/Entgeltgruppen-Schlüssel fielen stillschweigend auf eine Ersatztabelle bzw. EG01 zurück
- Dezimalkomma in Arbeitszeit/Leistungszulage wurde verworfen („35,5“ → 40 h); leeres Feld rechnete mit 0 h
- Wechsel von Entgeltgruppe bzw. Tarifdatum setzte Leistungszulage und Betriebszugehörigkeit zurück
- Komma im AT-Gehalt ließ sich nicht eintippen
- Defekter oder blockierter `localStorage` brach die Berechnung bzw. den Seitenstart ab
- Badges zeigten englisches Zahlenformat („14.00 %“), Footer eine veraltete Version
- Ungültiges JSON im Request lieferte eine HTML-Fehlerseite statt JSON

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

[Unreleased]: https://github.com/Doerkidoerk/entgeltrechnerigmby/compare/v1.13.0...HEAD
[1.13.0]: https://github.com/Doerkidoerk/entgeltrechnerigmby/releases/tag/v1.13.0
[1.12.0]: https://github.com/Doerkidoerk/entgeltrechnerigmby/releases/tag/v1.12.0
