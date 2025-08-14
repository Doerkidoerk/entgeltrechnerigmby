document.addEventListener('DOMContentLoaded', () => {
  const userList = document.getElementById('userList');
  const newUserName = document.getElementById('newUserName');
  const newUserPass = document.getElementById('newUserPass');
  const newUserPass2 = document.getElementById('newUserPass2');
  const createBtn = document.getElementById('createUserBtn');
  const err = document.getElementById('createUserError');
  const logoutBtn = document.getElementById('logoutBtn');
  let token = localStorage.getItem('token') || '';
  const isAdmin = localStorage.getItem('isAdmin') === '1';
  if (!token || !isAdmin) { window.location.href = '/'; return; }

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

  async function loadUsers(){
    try {
      const res = await fetchJSON('/api/users');
      userList.innerHTML = '<ul>' + res.users.map(u => `<li>${u.username}${u.isAdmin ? ' (Admin)' : ''}</li>`).join('') + '</ul>';
    } catch(e){
      userList.textContent = 'Fehler: ' + e.message;
    }
  }

  createBtn.addEventListener('click', async () => {
    err.textContent = '';
    if (newUserPass.value !== newUserPass2.value) {
      err.textContent = 'Passwörter stimmen nicht überein';
      return;
    }
    try {
      await fetchJSON('/api/users', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ username: newUserName.value, password: newUserPass.value })
      });
      newUserName.value = '';
      newUserPass.value = '';
      newUserPass2.value = '';
      loadUsers();
    } catch(e){
      err.textContent = 'Fehler: ' + e.message;
    }
  });

  loadUsers();
});
