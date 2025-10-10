# Sicherheitsdokumentation

## Version 2.0 – Authentifizierter Zugriff

Diese Dokumentation beschreibt die Sicherheitsarchitektur der Version 2.0 des Entgeltrechners. Seit dieser Version ist die Nutzung nur noch nach Authentifizierung möglich, die gesamte Oberfläche wurde um Rollen- und Einladungskonzepte ergänzt.

---

## 🔒 Implementierte Schutzmaßnahmen

### 1. Sitzungsbasierte Authentifizierung
- `express-session` mit dem `session-file-store` sorgt für signierte, serverseitig verwaltete Sessions.
- Cookies sind `HttpOnly`, `SameSite=Strict` und in Produktion `Secure`.
- Session-Lebensdauer standardmäßig 30 Minuten (`SESSION_TTL_MS`), Rolling Sessions verhindern inaktive Langläufer.
- Beim Login wird die Session-ID regeneriert (Session Fixation Schutz), beim Logout zerstört.

### 2. Passwortsicherheit & Lockout
- Passwörter werden mit bcrypt (12 Runden) gehasht (`bcryptjs`).
- Policy: Mindestlänge 12 Zeichen, Zahlen, Groß-/Kleinbuchstaben und Sonderzeichen Pflicht.
- Fehlgeschlagene Logins werden gezählt; nach 5 Versuchen sperrt das Konto automatisch (`AUTH_MAX_FAILED_ATTEMPTS`).
- Standard-Admin (`admin`) erzwingt eine Passwortänderung beim ersten Login. Zurückgesetzte Passwörter ebenso.

### 3. Rollen & Einladungssystem
- Zwei Rollen: `admin` (volle Verwaltung) und `user` (Rechner + Passwortwechsel).
- Admins können Benutzer anlegen, sperren, Rollen wechseln und Passwörter zurücksetzen.
- Einladungen (`invites.json`) sind einmalig nutzbar, optional befristet und werden beim Verbrauch automatisch invalidiert.

### 4. CSRF-Schutz
- `csurf` erzwingt ein per-Request-Token für alle mutierenden HTTP-Methoden.
- Das Frontend fordert das Token per `/api/auth/csrf` an und sendet es über den Header `X-CSRF-Token`.

### 5. API-Rate-Limiting
- Globale Limitierung: 100 Requests pro 15 Minuten und IP.
- Schutz vor Brute-Force-Angriffen und Missbrauch öffentlich erreichbarer Endpunkte.

### 6. Sicherheits-Header via Helmet
- Harte CSP (`default-src 'self'`, keine externen Skripte) und klassische Header (`HSTS`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`).
- `crossOriginResourcePolicy` auf `same-site` gestellt.

### 7. Strikte CORS-Konfiguration
- Nur explizit whitelisted Origins (Umgebungsvariable `ALLOWED_ORIGINS`) erhalten Zugriff.
- Cookies werden ausschließlich für erlaubte Origins mitgesendet (`credentials: true`).

### 8. Eingabevalidierung
- Zod-Schemata prüfen sämtliche Eingaben für Berechnung, Auth und Verwaltung.
- JSON-Bodies auf 20 kB begrenzt, ungültige Requests liefern strukturierte Fehlerantworten.

### 9. Logging & Auditing
- `morgan` zeichnet Zugriffe im Combined-Format auf.
- Login-Fehler, Sperren und Einladungsoperationen werden serverseitig protokolliert.

---

## ⚙️ Wichtige Umgebungsvariablen

| Variable | Beschreibung | Standard | Pflicht in Prod? |
| --- | --- | --- | --- |
| `NODE_ENV` | Laufzeitmodus (`development` / `production` / `test`) | `development` | ✅ |
| `PORT` | API-Port | `3001` | ⭕ |
| `ALLOWED_ORIGINS` | Kommagetrennte Liste vertrauenswürdiger Frontend-Origins | `https://entgeltrechner.cbmeyer.xyz` | ✅ |
| `SESSION_SECRET` | Signatur für Sessions (mind. 32 zufällige Bytes) | _(leer)_ | ✅ |
| `SESSION_TTL_MS` | Session-Lebensdauer in ms (Rolling) | `1800000` | ⭕ |
| `DEFAULT_ADMIN_PASSWORD` | Initiales Passwort für den ersten Admin | `Admin123!Test` | ⭕ |
| `AUTH_MAX_FAILED_ATTEMPTS` | Fehlversuche bis Lockout | `5` | ⭕ |
| `BCRYPT_ROUNDS` | Hash-Runden (10–16) | `12` | ⭕ |

> **Hinweis:** `SESSION_SECRET` muss in jeder Umgebung gesetzt werden. Ohne diesen Wert werden Sessions nicht akzeptiert.

---

## 🛡️ Best Practices für den Betrieb

1. **TLS & Reverse Proxy** – TLS-Termination, zusätzlicher Rate-Limiter und Weitergabe der `X-Forwarded-*` Header.
2. **Geheimnisse schützen** – `.env` nur für den Service-User lesbar, `SESSION_SECRET` nicht im Repo speichern.
3. **Dateirechte** – `api/data/users.json` & `invites.json` mindestens `640`, `api/data/sessions/` auf `700` beschränken (Script `upgrade.sh` setzt dies automatisch).
4. **Backups** – Sensible Daten (Benutzer/Einladungen) verschlüsselt sichern, Zugriffe auditieren.
5. **Monitoring** – Fehlgeschlagene Logins, Sperren und 5xx-Raten beobachten (systemd-, Nginx- und Applogs).
6. **Passwortwechsel-Policy** – Admins sollten initiale Passwörter unmittelbar wechseln und regelmäßig erneuern.

---

## 🚨 Bekannte Einschränkungen

- Kein Multi-Faktor-Login oder Single-Sign-On integriert.
- Session-Store basiert auf dem Dateisystem; horizontale Skalierung erfordert einen zentralen Store (z. B. Redis).
- Einladungen werden als Codes verteilt (keine integrierte Mail-Verteilung).
- Nutzer-Passwort-Reset erfolgt durch Admins (kein Self-Service außer Einladung).

---

## 🔍 Checkliste vor dem Go-Live

- [ ] `SESSION_SECRET` gesetzt und sicher aufbewahrt
- [ ] Standard-Admin-Kennwort geändert / `DEFAULT_ADMIN_PASSWORD` gesetzt
- [ ] HTTPS auf dem Reverse Proxy aktiviert
- [ ] `ALLOWED_ORIGINS` auf benötigte Domains beschränkt
- [ ] Dateirechte von `api/data` geprüft (insbesondere `users.json`, `invites.json`, `sessions/`)
- [ ] Log-Rotation & Monitoring eingerichtet (Login-Fehler, Sperren, 5xx)
- [ ] Backups getestet (inkl. Wiederherstellung der Benutzerdateien)
- [ ] `npm audit` ohne kritische Findings

