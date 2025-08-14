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
      userList.innerHTML = '<ul>' + res.users.map(u => {
        const delBtn = u.username !== 'admin' ? ` <button type="button" data-del="${u.username}">Löschen</button>` : '';
        const pwBtn = u.username !== 'admin' ? ` <button type="button" data-pw="${u.username}">Passwort setzen</button>` : '';
        return `<li>${u.username}${u.isAdmin ? ' (Admin)' : ''}${delBtn}${pwBtn}</li>`;
      }).join('') + '</ul>';
      userList.querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', () => deleteUser(b.dataset.del)));
      userList.querySelectorAll('button[data-pw]').forEach(b => b.addEventListener('click', () => resetPassword(b.dataset.pw)));
    } catch(e){
      userList.textContent = 'Fehler: ' + e.message;
    }
  }

  createBtn.addEventListener('click', async () => {
    err.textContent = '';
    if (location.protocol !== 'https:') {
      err.textContent = 'HTTPS erforderlich';
      return;
    }
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

  async function deleteUser(name){
    if (!confirm(`User ${name} löschen?`)) return;
    try {
      await fetchJSON(`/api/users/${encodeURIComponent(name)}`, { method:'DELETE' });
      loadUsers();
    } catch(e){
      alert('Fehler: ' + e.message);
    }
  }

  async function resetPassword(name){
    const p1 = prompt(`Neues Passwort für ${name}:`);
    if (!p1) return;
    const p2 = prompt('Passwort wiederholen:');
    if (p1 !== p2){ alert('Passwörter stimmen nicht überein'); return; }
    if (location.protocol !== 'https:') { alert('HTTPS erforderlich'); return; }
    try {
      await fetchJSON(`/api/users/${encodeURIComponent(name)}/password`, {
        method:'PUT',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ password: p1 })
      });
      alert('Passwort gesetzt');
    } catch(e){
      alert('Fehler: ' + e.message);
    }
  }

  loadUsers();
});
