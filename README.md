# Entgeltrechner

Version 1.9 – erweiterte Nutzerverwaltung mit Admin-Account.

Eine kleine Webanwendung zur Berechnung des Entgelts nach der IG Metall Tariftabelle für die bayerische Metall- und Elektroindustrie. Aus Eingaben wie Entgeltgruppe, Arbeitszeit, Leistungszulage oder Urlaubstagen ermittelt sie Monats‑ und Jahreswerte und stellt die verschiedenen Entgeltsbestandteile übersichtlich dar.

WebApp mit zwei Komponenten:

- **API** (`api/`): Node.js/Express-Server für die Entgeltberechnung.
- **Frontend** (`frontend/`): statische HTML/CSS/JS-Anwendung, die die API nutzt.

## Benutzerverwaltung

Standardmäßig existiert der Benutzer `admin` mit dem Passwort `admin`. Nur dieser Account muss nach dem ersten Login sein Passwort ändern – auf einer eigenen Seite mit doppelter Eingabe. Passwörter müssen mindestens 8 Zeichen lang sein. Sitzungen laufen nach einer Stunde automatisch ab. Nur angemeldete Benutzer können den Entgeltrechner verwenden. Ein Logout-Button beendet die Sitzung. Im Admin-Bereich lassen sich Benutzer anlegen, löschen und deren Passwörter zurücksetzen, ohne dass Passwörter eingesehen werden können.

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

