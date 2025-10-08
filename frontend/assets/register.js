document.addEventListener('DOMContentLoaded', async () => {
  const code = document.getElementById('regCode');
  const user = document.getElementById('regUser');
  const pass = document.getElementById('regPass');
  const pass2 = document.getElementById('regPass2');
  const btn = document.getElementById('regBtn');
  const err = document.getElementById('regError');

  let csrfToken = '';

  async function fetchCsrfToken() {
    try {
      const r = await fetch('/api/csrf-token', {
        method: 'GET',
        credentials: 'include'
      });
      if (r.ok) {
        const data = await r.json();
        csrfToken = data.token;
      }
    } catch (e) {
      console.error('Failed to fetch CSRF token:', e);
    }
  }

  await fetchCsrfToken();

  btn.addEventListener('click', async () => {
    err.textContent = '';
    if (location.protocol !== 'https:') { err.textContent = 'HTTPS erforderlich'; return; }
    if (pass.value !== pass2.value) { err.textContent = 'Passwörter stimmen nicht überein'; return; }
    try {
      const r = await fetch('/api/register', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify({ code: code.value.trim(), username: user.value.trim(), password: pass.value })
      });
      if (!r.ok) {
        let msg = `${r.status} ${r.statusText}`;
        try { const e = await r.json(); msg = e.error || msg; } catch {}
        throw new Error(msg);
      }
      window.location.href = '/';
    } catch(e){
      err.textContent = 'Fehler: ' + e.message;
    }
  });
});
