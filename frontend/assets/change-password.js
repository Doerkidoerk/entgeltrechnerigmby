document.addEventListener('DOMContentLoaded', () => {
  const oldPw = document.getElementById('oldPw');
  const newPw = document.getElementById('newPw');
  const newPw2 = document.getElementById('newPw2');
  const btn = document.getElementById('pwChangeBtn');
  const err = document.getElementById('pwChangeError');
  const logoutBtn = document.getElementById('logoutBtn');
  let token = localStorage.getItem('token') || '';
  if (!token) { window.location.href = '/'; return; }

  async function fetchJSON(url, opts = {}) {
    const r = await fetch(url, {
      ...opts,
      headers: {
        'Accept': 'application/json',
        ...(opts.headers || {}),
        Authorization: `Bearer ${token}`
      }
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
    try { await fetch('/api/logout', { method:'POST', headers:{ Authorization: `Bearer ${token}` } }); } catch {}
    token='';
    localStorage.removeItem('token');
    localStorage.removeItem('isAdmin');
    window.location.href = '/';
  }

  logoutBtn.addEventListener('click', logout);

  btn.addEventListener('click', async () => {
    err.textContent = '';
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
