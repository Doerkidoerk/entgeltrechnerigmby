# Sicherheitsdokumentation

## Version 1.13 – Öffentlicher Zugriff

Diese Dokumentation beschreibt die aktuellen Sicherheitsmaßnahmen des Entgeltrechners nach der Umstellung auf eine vollständig öffentliche Nutzung ohne Benutzer- oder Session-Verwaltung.

---

## 🔒 Implementierte Schutzmaßnahmen

### 1. API-Rate-Limiting
- 100 Requests pro 15 Minuten und IP für sämtliche `/api`-Routen
- Schützt den öffentlich erreichbaren Rechner vor Missbrauch und übermäßiger Last
- In Testumgebungen (`NODE_ENV=test`) deaktiviert

### 2. Sicherheits-Header via Helmet
- `Content-Security-Policy` mit restriktiven Direktiven (`default-src 'self'`, `script-src 'self'`, usw.)
- `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`
- `crossOriginResourcePolicy` auf `same-site`

### 3. Strenge CORS-Konfiguration
- Zugriff nur von vordefinierten Origins (konfigurierbar über `ALLOWED_ORIGINS`)
- Standardmäßig auf die produktive Domain beschränkt

### 4. Eingabevalidierung
- Sämtliche Berechnungsparameter werden mit Zod-Schemata geprüft
- JSON-Body-Größe auf 20 kB begrenzt
- Fehlende oder ungültige Felder lösen verständliche Fehlerantworten aus

### 5. Logging & Monitoring
- Zugriff über `morgan` im Combined-Format protokolliert
- Logdateien sollten zentral gesammelt und überwacht werden

---

## ⚙️ Wichtige Umgebungsvariablen

| Variable | Beschreibung | Standard | Pflicht in Prod? |
| --- | --- | --- | --- |
| `NODE_ENV` | `development`, `production` oder `test` | `development` | Ja |
| `PORT` | Port des API-Servers | `3001` | Optional |
| `ALLOWED_ORIGINS` | Kommagetrennte Liste vertrauenswürdiger Origins | `https://entgeltrechner.cbmeyer.xyz` | Ja |

---

## 🛡️ Best Practices für den Betrieb

1. **Reverse Proxy**
   - HTTPS-Terminierung und zusätzliches Rate-Limiting vor der Node.js-Anwendung
   - Setze `X-Forwarded-*` Header korrekt, falls Logging/Monitoring sie benötigt

2. **Firewall & Netzwerk**
   - Nur den Reverse Proxy (z. B. nginx) nach außen öffnen
   - API-Port (3001) auf localhost oder interne Netze beschränken

3. **Daten- & Dateirechte**
   - Tariftabellen im Verzeichnis `api/data/*.json` gehören dem Service-User und sollten mindestens `640` besitzen
   - Backups regelmäßig erstellen und sicher ablegen

4. **Monitoring**
   - HTTP-Logs und Systemd-Journal beobachten
   - Alarme bei anhaltend hoher Rate-Limit-Auslastung oder 5xx-Antworten konfigurieren

5. **Updates**
   - `npm audit` und Dependency-Updates regelmäßig einplanen
   - Vor Produktiv-Updates das beiliegende `upgrade.sh` verwenden und Backups prüfen

---

## 🚨 Bekannte Einschränkungen

- **Keine Authentifizierung:** Der Rechner ist absichtlich frei zugänglich. Sensible Umgebungen sollten zusätzlich netzwerkseitig geschützt werden.
- **Kein CSRF-Schutz notwendig:** Es existieren keine mutierenden Endpunkte; alle Requests sind lesend.
- **Volatile Sessions entfallen:** Da keine Sessions existieren, müssen keine Session-Stores betrieben werden.

---

## 🔍 Checkliste vor dem Go-Live

- [ ] HTTPS über Reverse Proxy aktiviert
- [ ] `ALLOWED_ORIGINS` auf benötigte Domains beschränkt
- [ ] Firewall-Regeln getestet
- [ ] Log-Rotation und Monitoring eingerichtet
- [ ] Backups der Tariftabellen getestet
- [ ] `npm audit` ohne kritische Findings

