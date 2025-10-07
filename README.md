# Entgeltrechner

Version 1.12 – Security-Hardening mit Rate-Limiting, verschärften Passwortregeln, Audit-Logging und verbessertem Session-Management.

Eine kleine Webanwendung zur Berechnung des Entgelts nach der IG Metall Tariftabelle für die bayerische Metall- und Elektroindustrie. Aus Eingaben wie Entgeltgruppe, Arbeitszeit, Leistungszulage oder Urlaubstagen ermittelt sie Monats‑ und Jahreswerte und stellt die verschiedenen Entgeltsbestandteile übersichtlich dar.

WebApp mit zwei Komponenten:

- **API** (`api/`): Node.js/Express-Server für die Entgeltberechnung.
- **Frontend** (`frontend/`): statische HTML/CSS/JS-Anwendung, die die API nutzt.

## 🔒 Sicherheit

**Wichtig:** Siehe [SECURITY.md](./SECURITY.md) für detaillierte Informationen zu allen Sicherheitsfeatures.

Neue Sicherheitsfeatures in v1.12:
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

## Voraussetzungen

- [Node.js](https://nodejs.org/) 18 oder neuer inkl. `npm`
- Optional: einfacher Webserver zum Ausliefern des Frontends (z. B. `npx serve` oder `python -m http.server`)

## Installation

1. Repository klonen.
2. Abhängigkeiten der API installieren:

   ```bash
   cd api
   npm install
   ```

3. API starten:

   ```bash
   node server.js
   ```

   Der Server läuft unter `http://127.0.0.1:3001` (Port über `PORT` variierbar).

4. Frontend verwenden:

   - `frontend/index.html` direkt im Browser öffnen oder
   - `frontend/` mit einem statischen Webserver bedienen.

## Tests

Jest-Tests für die API befinden sich im Ordner `api`:

```bash
cd api
npm test
```

