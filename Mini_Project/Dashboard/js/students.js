/* students.js — the Students section is three linked pages (chosen by <body data-view="...">):
     Students.html           (branches)  -> animated branch tiles + a search for any student
     students_sections.html  (sections)  -> the sections of one branch   (?branch=CSE)
     students_list.html      (list)      -> the student cards of one section (?branch=CSE&section=A)
   Branches and sections are built from the database, so they appear by themselves when students are added. */
(function () {
  const { api, esc, toast, modal } = GLB;
  const view = document.body.dataset.view;
  const root = document.getElementById('sn-root');
  const params = new URLSearchParams(location.search);
  const PALETTE = ['#2f5fb3', '#1f9254', '#c2603a', '#7a4bb8', '#b8860b', '#0e8a9a', '#c23a6a', '#4b6b2f'];
  const statusClass = { Issued: 'status-issued', Pending: 'status-pending', 'Not Issued': 'status-not-issued' };

  // The same branch always gets the same colour.
  const accent = (code) => PALETTE[[...String(code)].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTE.length];
  const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const secUrl = (code) => `students_sections.html?branch=${encodeURIComponent(code)}`;
  const listUrl = (code, sec) => `students_list.html?branch=${encodeURIComponent(code)}&section=${encodeURIComponent(sec)}`;

  // Numbers that count up when the page opens.
  function countUp(scope) {
    scope.querySelectorAll('[data-count]').forEach((el) => {
      const to = Number(el.dataset.count) || 0;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches || to === 0) { el.textContent = to; return; }
      const start = performance.now();
      const tick = (now) => {
        const k = Math.min(1, (now - start) / 900);
        el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  // Fills the progress rings after the first paint so they animate.
  function growRings(scope) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      scope.querySelectorAll('.sn-ring').forEach((r) => r.style.setProperty('--p', r.dataset.p));
    }));
  }

  function crumbs(parts) {
    const el = document.getElementById('crumbs');
    if (!el) return;
    el.innerHTML = parts.map((p, i) => {
      const last = i === parts.length - 1;
      return (i ? '<span class="sep">›</span>' : '') + (last ? `<span class="here">${esc(p.label)}</span>` : `<a href="${p.href}">${esc(p.label)}</a>`);
    }).join('');
  }

  // ------------------------------------------------------------ student cards (same look as before)
  function card(s, i = 0) {
    const color = s.id % 2 ? 'avatar-blue' : 'avatar-pink';
    return `
      <article class="student-card" style="--i:${Math.min(i, 24)}">
        <div class="student-header">
          <div class="student-avatar ${color}">${esc(initials(s.name))}</div>
          <div><div class="student-name">${esc(s.name)}</div><div class="student-roll">${esc(s.roll_no)}</div>
            ${s.admission_id ? `<div class="student-adm">${esc(s.admission_id)}</div>` : ''}</div>
        </div>
        <div class="student-meta"><div class="branch">${esc(s.branch)}</div>
          <div class="year"><span class="sn-chip">${esc(s.branch_code || '')}${s.section ? ' · Sec ' + esc(s.section) : ''}</span>${esc(s.year)}</div></div>
        <div class="student-footer">
          <span class="status-badge ${statusClass[s.issue_status] || ''}">${esc(s.issue_status)}</span>
          <a href="#" class="view-link" data-id="${s.id}">View →</a>
        </div>
      </article>`;
  }

  function cardGrid(list) {
    return `<section class="student-grid">${list.length ? list.map(card).join('') : '<p class="sn-empty">No students found.</p>'}</section>`;
  }

  // "View →" opens the student's details + requests
  document.addEventListener('click', async (e) => {
    const link = e.target.closest('.view-link');
    if (!link) return;
    e.preventDefault();
    try {
      const s = await api('/students/' + link.dataset.id);
      modal(s.name, `
        <dl>
          <dt>Admission ID</dt><dd>${esc(s.admission_id || '—')}</dd>
          <dt>Roll number</dt><dd>${esc(s.roll_no)}</dd>
          <dt>Branch</dt><dd>${esc(s.branch)} (${esc(s.branch_code || '—')})</dd>
          <dt>Section</dt><dd>${esc(s.section || '—')}</dd>
          <dt>Year</dt><dd>${esc(s.year)}${s.academic_year ? ' · session ' + esc(s.academic_year) : ''}</dd>
          <dt>Email</dt><dd>${esc(s.email || '—')}</dd>
          <dt>Phone</dt><dd>${esc(s.phone || '—')}</dd>
          <dt>Dress status</dt><dd>${esc(s.issue_status)}</dd>
        </dl>
        <h4 style="margin:18px 0 0">Requests</h4>
        ${s.requests.length ? `<table><thead><tr><th>ID</th><th>Item</th><th>Size</th><th>Status</th></tr></thead><tbody>
          ${s.requests.map((r) => `<tr><td>${esc(r.request_code)}</td><td>${esc(r.item_name)}</td><td>${esc(r.size)}</td><td>${esc(r.status)}</td></tr>`).join('')}
          </tbody></table>` : '<p style="color:#6b7280">No requests yet.</p>'}`);
    } catch (err) { toast(err.message, 'error'); }
  });

  const notFound = (what) => {
    root.innerHTML = `<p class="sn-empty">${esc(what)} was not found. <a href="Students.html" style="font-weight:700;text-decoration:underline">Back to all branches</a></p>`;
  };

  // ------------------------------------------------------------ 1) branches
  async function branchesView() {
    const search = document.getElementById('student-search');
    let tree = [];
    try { tree = await api('/students/branches'); } catch (e) { toast(e.message, 'error'); return; }
    const all = tree.reduce((n, b) => n + b.total, 0);
    const secs = tree.reduce((n, b) => n + b.sections.length, 0);

    function tiles() {
      if (!tree.length) {
        root.innerHTML = '<p class="sn-empty">No students yet. Connect the college database or add one from <a href="admission_ids.html#add" style="font-weight:700;text-decoration:underline">Admission IDs</a>.</p>';
        return;
      }
      root.innerHTML = `
        <div class="sn-stats">
          <div class="sn-stat sn-anim" style="--i:0"><b data-count="${all}">0</b><span>Students</span></div>
          <div class="sn-stat sn-anim" style="--i:1"><b data-count="${tree.length}">0</b><span>Branches</span></div>
          <div class="sn-stat sn-anim" style="--i:2"><b data-count="${secs}">0</b><span>Sections</span></div>
        </div>
        <section class="sn-grid">${tree.map((b, i) => {
          const max = Math.max(...b.sections.map((x) => x.count));
          return `
          <a class="sn-tile sn-anim" style="--i:${i + 3};--accent:${accent(b.branch_code)}" href="${secUrl(b.branch_code)}" aria-label="${esc(b.branch_name)}">
            <div class="sn-top">
              <div class="sn-ring" data-p="${Math.round((b.total / all) * 100)}"><i>${esc(b.branch_code)}</i></div>
              <div><div class="sn-name">${esc(b.branch_name)}</div><div class="sn-sub">${plural(b.sections.length, 'section')} · ${Math.round((b.total / all) * 100)}% of college</div></div>
            </div>
            <div class="sn-count"><b data-count="${b.total}">0</b><span>students</span></div>
            <div class="sn-bars">${b.sections.map((x) => `
              <div class="sn-bar"><span>${esc(x.section)}</span><div><span style="--w:${Math.round((x.count / max) * 100)}%"></span></div><span>${x.count}</span></div>`).join('')}</div>
            <span class="sn-open">View sections <span>→</span></span>
          </a>`;
        }).join('')}</section>`;
      countUp(root);
      growRings(root);
    }

    let timer;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = search.value.trim();
        if (!q) { tiles(); return; }
        try {
          const found = await api('/students?search=' + encodeURIComponent(q));
          root.innerHTML = `<p class="sn-count-line">${plural(found.length, 'student')} found for “${esc(q)}”</p>` + cardGrid(found);
        } catch (e) { toast(e.message, 'error'); }
      }, 250);
    });
    tiles();
  }

  // ------------------------------------------------------------ 2) sections of one branch
  async function sectionsView() {
    const code = (params.get('branch') || '').toUpperCase();
    let tree = [];
    try { tree = await api('/students/branches'); } catch (e) { toast(e.message, 'error'); return; }
    const b = tree.find((x) => x.branch_code.toUpperCase() === code);
    crumbs([{ label: 'Students', href: 'Students.html' }, { label: code || 'Branch' }]);
    if (!b) return notFound('That branch');
    document.documentElement.style.setProperty('--accent', accent(b.branch_code));
    const max = Math.max(...b.sections.map((x) => x.count));
    root.innerHTML = `
      <div class="sn-banner"><div class="sn-ring" data-p="100" style="width:60px;height:60px"><i style="width:44px;height:44px;color:#10182b;font-size:11px">${esc(b.branch_code)}</i></div>
        <div><h2>${esc(b.branch_name)}</h2><p>${plural(b.total, 'student')} in ${plural(b.sections.length, 'section')}. Choose a section to see its students.</p></div></div>
      <section class="sn-grid">${b.sections.map((x, i) => `
        <a class="sn-tile sec-tile sn-anim" style="--i:${i}" href="${listUrl(b.branch_code, x.section)}" aria-label="Section ${esc(x.section)}">
          <div class="sn-top">
            <div class="sn-letter">${esc(x.section)}</div>
            <div><div class="sn-name">Section ${esc(x.section)}</div><div class="sn-sub">${esc(b.branch_code)} · ${Math.round((x.count / b.total) * 100)}% of the branch</div></div>
          </div>
          <div class="sn-count"><b data-count="${x.count}">0</b><span>students</span></div>
          <div class="sn-bars"><div class="sn-bar" style="grid-template-columns:1fr"><div><span style="--w:${Math.round((x.count / max) * 100)}%"></span></div></div></div>
          <span class="sn-open">View students <span>→</span></span>
        </a>`).join('')}</section>`;
    countUp(root);
    growRings(root);
  }

  // ------------------------------------------------------------ 3) students of one section
  async function listView() {
    const code = (params.get('branch') || '').toUpperCase();
    const sec = (params.get('section') || '').toUpperCase();
    crumbs([{ label: 'Students', href: 'Students.html' }, { label: code || 'Branch', href: secUrl(code) }, { label: 'Section ' + sec }]);
    let list = [];
    try { list = await api(`/students?branch=${encodeURIComponent(code)}&section=${encodeURIComponent(sec)}`); }
    catch (e) { toast(e.message, 'error'); return; }
    if (!list.length) return notFound(`Section ${sec} of ${code}`);
    document.documentElement.style.setProperty('--accent', accent(code));
    const name = list.map((s) => s.branch).sort((a, b) => b.length - a.length)[0]; // the fullest branch name
    root.innerHTML = `
      <div class="sn-banner"><div><h2>${esc(name)} · Section ${esc(sec)}</h2>
        <p><span class="sn-chip">${esc(code)}</span>${plural(list.length, 'student')}</p></div></div>
      <div class="search-row"><input type="text" id="sec-search" class="search-input" placeholder="Search in this section: name, roll number or admission ID..."></div>
      <p class="sn-count-line" id="sec-count"></p>
      <div id="sec-grid"></div>`;
    const grid = document.getElementById('sec-grid');
    const count = document.getElementById('sec-count');
    const draw = (q) => {
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      const shown = list.filter((s) => words.every((w) => [s.name, s.roll_no, s.admission_id].some((v) => String(v || '').toLowerCase().includes(w))));
      grid.innerHTML = cardGrid(shown);
      count.textContent = q ? `${shown.length} of ${list.length} students` : '';
    };
    document.getElementById('sec-search').addEventListener('input', (e) => draw(e.target.value.trim()));
    draw('');
  }

  ({ branches: branchesView, sections: sectionsView, list: listView }[view] || (() => {}))();
})();
