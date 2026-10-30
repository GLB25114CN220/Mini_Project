/* api.js — shared helper loaded by every page.
   - talks to the backend (GLB.api)
   - sends visitors to index.html if they are not logged in (and keeps students out of the Admins Block)
   - small pop-up (modal) and message (toast) helpers                      */
(function () {
  const TOKEN_KEY = 'glb_token';   // the login token (holds the role: admin or student)
  const USER_KEY = 'glb_user';     // small info for the screen (email / admission ID / student name)
  localStorage.removeItem('glb_admin_token'); // token name used by the old version

  // If the page is opened with Live Server (port 5501) or as a file, call the backend on port 3000.
  const API_BASE = (location.protocol === 'file:' || location.port === '5501') ? 'http://localhost:3000' : '';

  // Each page says who may open it (before this file loads):
  //   window.GLB_ACCESS = 'public'  -> anyone (the entry page)
  //   window.GLB_ACCESS = 'student' -> Student Block: logged-in students AND admins
  //   window.GLB_ACCESS = 'admin'   -> Admins Block: admins only (this is the default if a page says nothing)
  const ACCESS = window.GLB_ACCESS || 'admin';
  const isPublic = ACCESS === 'public';
  const HOME = { admin: 'dashboard.html', student: 'home.html' };

  // Reads the saved login. Returns { token, role } or null (also null once it has expired).
  function getSession() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    try {
      const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (p.exp && p.exp * 1000 < Date.now()) throw new Error('expired');
      if (p.role !== 'admin' && p.role !== 'student') throw new Error('old token');
      return { token, role: p.role };
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      return null;
    }
  }

  const session = getSession();
  let user = {};
  try { user = JSON.parse(localStorage.getItem(USER_KEY)) || {}; } catch { /* ignore */ }

  // The browser-side check only decides where to send you. The real protection is in the
  // backend: it refuses every protected request that does not carry the right role.
  if (!isPublic) {
    let target = null;
    if (!session) target = 'index.html';
    else if (ACCESS === 'admin' && session.role !== 'admin') target = HOME[session.role];
    if (target) {
      document.documentElement.style.visibility = 'hidden'; // avoid a flash of the wrong page
      location.replace(target);
    }
  }

  async function api(path, { method = 'GET', body, form } = {}) {
    const headers = {};
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = 'Bearer ' + token;
    let payload;
    if (form) payload = form;
    else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

    let res;
    try {
      res = await fetch(API_BASE + '/api' + path, { method, headers, body: payload });
    } catch {
      throw new Error('Cannot reach the server. Is the backend running? (run "npm start" in the backend folder)');
    }
    let data = null;
    try { data = await res.json(); } catch { /* no JSON body */ }

    if (res.status === 401 && !isPublic) {
      logout();
      throw new Error('Please log in again');
    }
    if (res.status === 403 && !isPublic) {
      location.replace(session ? HOME[session.role] : 'index.html');
      throw new Error('You do not have access to that section');
    }
    if (!res.ok) throw new Error((data && data.error) || 'Request failed');
    return data;
  }

  // Makes text safe to put inside HTML (prevents HTML/script injection).
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const css = document.createElement('style');
  css.textContent = `
    .glb-toast{position:fixed;right:20px;bottom:20px;z-index:2000;padding:12px 18px;border-radius:8px;color:#fff;
      font:500 14px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);background:#1f9254;max-width:360px}
    .glb-toast.error{background:#c0392b}
    .glb-overlay{position:fixed;inset:0;background:rgba(16,24,43,.55);z-index:1500;display:flex;align-items:center;justify-content:center;padding:16px}
    .glb-modal{background:#fff;border-radius:12px;width:100%;max-width:480px;max-height:90vh;overflow:auto;font-family:system-ui,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.35)}
    .glb-modal-head{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:#10182b;color:#fff;border-radius:12px 12px 0 0}
    .glb-modal-head h3{margin:0;font-size:17px;font-weight:600}
    .glb-modal-head button{background:none;border:0;color:#d4a437;font-size:24px;cursor:pointer;line-height:1}
    .glb-modal-body{padding:20px;color:#10182b;font-size:14px}
    .glb-modal-body label{display:block;font-weight:600;font-size:13px;margin:12px 0 4px}
    .glb-modal-body input,.glb-modal-body select{width:100%;padding:9px 11px;border:1px solid #d1d5db;border-radius:7px;font-size:14px;box-sizing:border-box}
    .glb-modal-body .glb-row{display:flex;gap:12px}.glb-modal-body .glb-row>div{flex:1}
    .glb-modal-body .glb-submit{margin-top:18px;width:100%;padding:11px;border:0;border-radius:8px;background:#d4a437;color:#10182b;font-weight:700;font-size:14px;cursor:pointer}
    .glb-modal-body .glb-submit:disabled{opacity:.6;cursor:wait}
    .glb-modal-body table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
    .glb-modal-body th,.glb-modal-body td{text-align:left;padding:6px 4px;border-bottom:1px solid #e5e7eb}
    .glb-modal-body dl{display:grid;grid-template-columns:120px 1fr;gap:6px 10px;margin:0}
    .glb-modal-body dt{color:#6b7280}.glb-modal-body dd{margin:0}
    .glb-logout{display:block;padding:12px 20px;color:#d4a437;font:13px system-ui,sans-serif;text-decoration:none;cursor:pointer}
    .glb-empty{text-align:center;padding:26px;color:#6b7280}
    .glb-nav-title{list-style:none;padding:16px 12px 6px;font:700 10.5px system-ui,sans-serif;letter-spacing:.1em;
      text-transform:uppercase;color:#d4a437}
    .glb-nav-title:first-child{padding-top:2px}
    @media(max-width:720px){.glb-nav-title{display:none}}
  `;
  document.head.appendChild(css);

  function toast(message, type) {
    const el = document.createElement('div');
    el.className = 'glb-toast' + (type === 'error' ? ' error' : '');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  function closeModal() {
    document.querySelectorAll('.glb-overlay').forEach((o) => o.remove());
  }

  // Opens a pop-up window and returns its body element so you can fill/attach events.
  function modal(title, html) {
    closeModal();
    const overlay = document.createElement('div');
    overlay.className = 'glb-overlay';
    overlay.innerHTML = `<div class="glb-modal"><div class="glb-modal-head"><h3>${esc(title)}</h3>
      <button type="button" aria-label="Close">&times;</button></div><div class="glb-modal-body">${html}</div></div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    overlay.querySelector('.glb-modal-head button').addEventListener('click', closeModal);
    document.body.appendChild(overlay);
    return overlay.querySelector('.glb-modal-body');
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    location.replace('index.html');
  }

  // ---------------------------------------------------------------- sidebar menu
  // One place defines the menu for every page, so the two blocks always match everywhere.
  const ADMIN_NAV = [
    { key: 'dashboard', href: 'dashboard.html',    icon: '▭',  label: 'Dashboard' },
    { key: 'requests',  href: 'All_requests.html', icon: '📄', label: 'Requests' },
    { key: 'students',  href: 'Students.html',     icon: '🎒', label: 'Students' },
    { key: 'inbox',     href: 'queries.html',      icon: '📥', label: 'Query Inbox' },
    { key: 'admission', href: 'admission_ids.html', icon: '🪪', label: 'Admission IDs' },
    { key: 'inventory', href: 'inventory.html', icon: '📦', label: 'Inventory' },
  ];
  const STUDENT_NAV = [
    { key: 'home',    href: 'home.html',          icon: '🏠', label: 'My Dashboard' },
    { key: 'catalog', href: 'all_items.html',     icon: '🎓', label: 'Dress Catalog' },
    { key: 'cart', href: 'cart.html', icon: '🛒', label: 'Shopping Cart' },
    { key: 'orders', href: 'my_orders.html', icon: '📦', label: 'My Orders' },
    { key: 'profile', href: 'profile.html', icon: '👤', label: 'My Profile' },
    { key: 'query',   href: 'student_query.html', icon: '❓', label: 'Student Query' },
  ];

  function buildMenu(box) {
    const dash = box.dataset.navStyle === 'dash';       // the dashboard page uses different class names
    const active = box.dataset.nav;
    const link = (n) => dash
      ? `<a href="${n.href}" class="nav-item${n.key === active ? ' active' : ''}"><span class="nav-icon">${n.icon}</span> ${n.label}</a>`
      : `<li><a href="${n.href}"${n.key === active ? ' class="active"' : ''}><span class="side-icon">${n.icon}</span> ${n.label}</a></li>`;
    const title = (t) => dash ? `<div class="glb-nav-title">${t}</div>` : `<li class="glb-nav-title">${t}</li>`;

    let html = '';
    // Admins see both blocks; students only ever see the Student Block.
    if (session && session.role === 'admin') html += title('Admins Block') + ADMIN_NAV.map(link).join('');
    // Admins only need the catalog and the query form from the Student Block; cart, orders and profile belong to students.
    const studentItems = session && session.role === 'admin'
      ? STUDENT_NAV.filter((n) => n.key === 'catalog' || n.key === 'query') : STUDENT_NAV;
    html += title('Student Block') + studentItems.map(link).join('');
    box.innerHTML = html;
  }

  // The site footer (see js/footer.js). It decides by itself which pages get it.
  const footerJs = document.createElement('script');
  footerJs.src = 'js/footer.js';
  footerJs.defer = true;
  document.head.appendChild(footerJs);

  // Shared look (mobile menu, focus rings, animations) for every page.
  const common = document.createElement('link');
  common.rel = 'stylesheet';
  common.href = 'common.css';
  document.head.appendChild(common);

  document.addEventListener('DOMContentLoaded', () => {
    if (isPublic || !session) return;

    // Phones: the sidebar becomes a slide-in menu opened by a button.
    const side = document.querySelector('.sidebar');
    if (side) {
      const burger = document.createElement('button');
      burger.type = 'button';
      burger.className = 'glb-burger';
      burger.setAttribute('aria-label', 'Open menu');
      burger.innerHTML = '&#9776;';
      const scrim = document.createElement('div');
      scrim.className = 'glb-scrim';
      const toggle = (open) => document.body.classList.toggle('glb-menu-open', open);
      burger.addEventListener('click', () => toggle(!document.body.classList.contains('glb-menu-open')));
      scrim.addEventListener('click', () => toggle(false));
      document.body.append(burger, scrim);
    }

    const menu = document.querySelector('[data-nav]');
    if (menu) buildMenu(menu);

    // Bottom-left badge: "Admin Portal" for admins, "Student Portal" + admission ID for students.
    const badge = document.querySelector('.admin-portal');
    if (badge && session.role === 'student') {
      badge.innerHTML = `<div class="admin-avatar">ST</div><div><div>Student Portal</div>
        <div class="admin-email">${esc(user.admission_id || '')}</div></div>`;
    }

    // "Logout" link just above the badge.
    const box = badge || document.querySelector('.sidebar-footer');
    if (box) {
      const link = document.createElement('a');
      link.className = 'glb-logout';
      link.textContent = 'Logout';
      link.addEventListener('click', logout);
      box.insertAdjacentElement('beforebegin', link);
    }
  });

  // Small helpers shared by the pages.
  const money = (n) => '\u20B9' + Number(n || 0).toLocaleString('en-IN');
  const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

  window.GLB = {
    money, cap,
    api, esc, toast, modal, closeModal, logout, API_BASE,
    role: session ? session.role : null,
    session, user, home: session ? HOME[session.role] : 'index.html',
    getToken: () => localStorage.getItem(TOKEN_KEY),
    // Called by the entry page after a successful login.
    saveLogin: (out) => {
      localStorage.setItem(TOKEN_KEY, out.token);
      localStorage.setItem(USER_KEY, JSON.stringify({ email: out.email, admission_id: out.admission_id, student: out.student }));
    },
  };
})();
