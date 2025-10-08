document.addEventListener('DOMContentLoaded', async () => {
  const oldPw = document.getElementById('oldPw');
  const newPw = document.getElementById('newPw');
  const newPw2 = document.getElementById('newPw2');
  const btn = document.getElementById('pwChangeBtn');
  const err = document.getElementById('pwChangeError');
  const logoutBtn = document.getElementById('logoutBtn');
  let token = localStorage.getItem('token') || '';
  let csrfToken = '';
  if (!token) { window.location.href = '/'; return; }

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

  async function fetchJSON(url, opts = {}) {
    const headers = {
      'Accept': 'application/json',
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`
    };

    if (opts.method && opts.method !== 'GET' && csrfToken) {
      headers['x-csrf-token'] = csrfToken;
    }

    const r = await fetch(url, {
      ...opts,
      credentials: 'include',
      headers
    });
    if (r.status === 401) {
      token = '';
      localStorage.removeItem('token');
      localStorage.removeItem('isAdmin');
      window.location.href = '/';
      throw new Error('Unauthorized');
    }
    if (!r.ok) {
      let msg = `${r.status} ${r.statusText}`;
      try { const e = await r.json(); msg = e.error || msg; } catch {}
      throw new Error(msg);
    }
    return r.json();
  }

  async function logout(){
    try { await fetchJSON('/api/logout', { method:'POST' }); } catch {}
    token='';
    localStorage.removeItem('token');
    localStorage.removeItem('isAdmin');
    window.location.href = '/';
  }

  await fetchCsrfToken();

  logoutBtn.addEventListener('click', logout);

  btn.addEventListener('click', async () => {
    err.textContent = '';
    if (location.protocol !== 'https:') {
      err.textContent = 'HTTPS erforderlich';
      return;
    }
    if (newPw.value !== newPw2.value) {
      err.textContent = 'Passwörter stimmen nicht überein';
      return;
    }
    try {
      await fetchJSON('/api/change-password', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ oldPassword: oldPw.value, newPassword: newPw.value })
      });
      window.location.href = '/';
    } catch(e){
      err.textContent = 'Fehler: ' + e.message;
    }
  });
});
