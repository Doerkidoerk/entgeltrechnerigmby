# Sicherheitsdokumentation

## Version 1.12 - Security-Hardening

Diese Dokumentation beschreibt die implementierten Sicherheitsmaßnahmen im Entgeltrechner.

---

## 🔒 Implementierte Sicherheitsfeatures

### 1. **Rate-Limiting**
- **Login:** Max. 5 Versuche pro 15 Minuten pro IP
- **API-Endpunkte:** Max. 100 Requests pro 15 Minuten pro Token
- Automatische Blockierung bei Überschreitung
- Verhindert Brute-Force-Angriffe

### 2. **Verschärfte Passwort-Policy**
- Mindestlänge: 12 Zeichen (vorher 8)
- Erforderlich:
  - Mind. 1 Großbuchstabe
  - Mind. 1 Kleinbuchstabe
  - Mind. 1 Zahl
  - Mind. 1 Sonderzeichen (`!@#$%^&*()_+-=[]{}...`)
- Maximallänge: 128 Zeichen

**Standardpasswort:** Das initiale Admin-Passwort `admin` muss **sofort** nach dem ersten Login geändert werden!

### 3. **Audit-Logging**
Alle sicherheitsrelevanten Ereignisse werden in `api/data/audit.log` protokolliert:
- Login-Erfolg/Fehlschläge
- Passwortänderungen
- Benutzer-Erstellung/-Löschung
- Passwort-Resets
- Einladungscode-Generierung
- Registrierungen

**Format:** JSON-Zeilen mit Timestamp, Event-Typ, Username und IP-Adresse

### 4. **Session-Management**
- **Session-Timeout:** 1 Stunde (konfigurierbar via `SESSION_TTL_MS`)
- **Session-Rotation:** Bei Passwortänderung werden alle anderen Sessions des Users ungültig
- **Automatisches Cleanup:** Abgelaufene Sessions werden alle 10 Minuten entfernt
- **Logout:** Sofortige Session-Invalidierung

### 5. **Content Security Policy (CSP)**
Strikte CSP-Header aktiv:
```javascript
defaultSrc: ['self']
scriptSrc: ['self']
styleSrc: ['self', 'unsafe-inline']  // inline-styles für dynamisches Theming
imgSrc: ['self', 'data:']
connectSrc: ['self']
objectSrc: ['none']
frameSrc: ['none']
```

Schützt vor XSS-Angriffen durch Einschränkung der Ressourcen-Quellen.

### 6. **HTTPS-Enforcement**
- Alle passwortbezogenen Endpunkte erfordern HTTPS
- HSTS-Header gesetzt (max-age=1 Jahr)
- HTTP-Requests für `/api/login`, `/api/register`, `/api/change-password`, `/api/users/*` werden abgelehnt

### 7. **Input-Validierung**
Mittels Zod-Schemas:
- **Benutzernamen:** 3-32 Zeichen, alphanumerisch + Unterstrich
- **Passwörter:** 12-128 Zeichen
- **JSON-Payloads:** Max. 20KB (vorher 256KB)
- Alle API-Inputs werden validiert

### 8. **Datei-Berechtigungen**
- `users.json`: **600** (nur Owner lesbar/schreibbar)
- `invites.json`: **600**
- `audit.log`: **600**
- `api/`: **700** (nur Owner Zugriff)
- `api/data/`: **755** (lesbar für Gruppe)

### 9. **Stärkere Einladungscodes**
- Länge: 12 Zeichen (vorher 6)
- Zeichensatz: A-Z, 0-9 (36^12 ≈ 4.7 × 10^18 Kombinationen)
- Ablaufzeit: 7 Tage
- Einmalige Verwendung

### 10. **Timing-Safe Vergleiche**
- Passwort-Vergleiche nutzen `crypto.timingSafeEqual()`
- Bei nicht-existenten Benutzern wird trotzdem ein Hash berechnet (verhindert Username-Enumeration via Timing-Angriffe)

### 11. **Security-Headers**
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-XSS-Protection: 1; mode=block` (via Helmet)

---

## ⚙️ Umgebungsvariablen

### `ALLOWED_ORIGINS` (wichtig!)
Legt erlaubte Origins für CORS fest. Standard: `https://entgeltrechner.cbmeyer.xyz`

**Beispiel:**
```bash
ALLOWED_ORIGINS=https://entgeltrechner.cbmeyer.xyz,https://www.example.com
```

### `SESSION_TTL_MS`
Session-Timeout in Millisekunden. Standard: `3600000` (1 Stunde)

### `NODE_ENV`
Bei `NODE_ENV=test` werden Rate-Limits und Session-Cleanup deaktiviert.

### `PORT`
Server-Port. Standard: `3001`

---

## 🛡️ Best Practices für Produktionsumgebungen

### 1. Reverse Proxy
Betreibe die API hinter einem Reverse Proxy (z.B. nginx):
- Terminiere HTTPS dort
- Setze `X-Forwarded-Proto`-Header
- Rate-Limiting auf Proxy-Ebene (zusätzlich!)

### 2. Firewall
- Port 3001 nur für localhost öffnen
- API nur über Reverse Proxy erreichbar machen

### 3. Monitoring
- Überwache `audit.log` auf verdächtige Aktivitäten
- Alerting bei >10 fehlgeschlagenen Logins/Stunde

### 4. Backups
- Regelmäßige Backups von `users.json` und `invites.json`
- Backup-Dateien mit chmod 600 schützen

### 5. Updates
- Führe regelmäßig `npm audit` aus
- Halte Dependencies aktuell

---

## 🚨 Bekannte Einschränkungen

### CSRF-Schutz
**Status:** ⚠️ NICHT implementiert

Die ursprünglich geplante `csurf`-Middleware ist **deprecated**. Für eine vollständige CSRF-Absicherung empfehlen wir:

**Kurzfristige Lösung:**
- Same-Site Cookies nutzen
- CORS strikt konfigurieren (bereits implementiert)

**Langfristige Lösung:**
- Migration auf moderne CSRF-Library wie `csrf-csrf` oder `@fastify/csrf-protection`
- Implementierung von CSRF-Tokens in allen zustandsändernden Forms

### Session-Persistence
Sessions werden nur im RAM gespeichert und gehen bei Server-Restart verloren. Für Produktionsumgebungen empfehlen wir:
- Redis-basiertes Session-Management
- Oder dateibasierte Session-Speicherung

---

## 📋 Audit-Log Beispiele

### Login-Erfolg
```json
{"timestamp":"2025-10-07T19:56:51.234Z","event":"login_success","username":"admin","ip":"::ffff:127.0.0.1"}
```

### Fehlgeschlagener Login
```json
{"timestamp":"2025-10-07T19:56:52.123Z","event":"login_failed","username":"attacker","reason":"user_not_found","ip":"::ffff:192.168.1.100"}
```

### Passwortänderung
```json
{"timestamp":"2025-10-07T20:15:33.456Z","event":"password_changed","username":"alice","ip":"::ffff:127.0.0.1"}
```

### User-Löschung
```json
{"timestamp":"2025-10-07T20:30:45.789Z","event":"user_deleted","username":"bob","deletedBy":"admin","ip":"::ffff:127.0.0.1"}
```

---

## 🔍 Sicherheits-Checkliste für Deployment

- [ ] Admin-Standardpasswort geändert
- [ ] HTTPS konfiguriert und erzwungen
- [ ] `ALLOWED_ORIGINS` korrekt gesetzt
- [ ] Reverse Proxy läuft (nginx/Apache)
- [ ] Firewall-Regeln aktiv
- [ ] Datei-Berechtigungen geprüft (600 für sensible Dateien)
- [ ] Audit-Logging funktioniert
- [ ] Monitoring/Alerting eingerichtet
- [ ] Backup-Strategie implementiert
- [ ] `npm audit` zeigt keine kritischen Schwachstellen
- [ ] Rate-Limits getestet

---

## 📞 Sicherheitsprobleme melden

Bei Sicherheitsproblemen bitte **nicht** ein öffentliches Issue erstellen, sondern direkt kontaktieren.

**Kontakt:** [E-Mail oder Issue-Tracker]

---

**Letzte Aktualisierung:** 2025-10-07
**Version:** 1.12
