# Entgeltrechner

Eine kleine Webanwendung zur Berechnung des Entgelts nach IG‑Metall‑Tariftabellen. Aus Eingaben wie Entgeltgruppe, Arbeitszeit, Leistungszulage oder Urlaubstagen ermittelt sie Monats‑ und Jahreswerte und stellt die Bestandteile übersichtlich dar.

Monorepo mit zwei Komponenten:

- **API** (`api/`): Node.js/Express-Server für die Entgeltberechnung.
- **Frontend** (`frontend/`): statische HTML/CSS/JS-Anwendung, die die API nutzt.

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

