/* admission_ids.js — Admins Block: the list of admission IDs students use to enter the Student Block.
   Add an ID, link it to a student record (needed so the student can request dresses), or delete it. */
(function () {
  const { api, esc, toast, modal, closeModal } = GLB;
  const body = document.getElementById('adm-body');
  const searchBox = document.getElementById('adm-search');
  const countEl = document.getElementById('adm-count');
  const resultEl = document.getElementById('adm-result');
  const branchSel = document.getElementById('adm-branch');
  let rows = [];
  let total = 0;        // all IDs (when nothing is typed)
  let branches = [];    // branch -> sections tree (for the filter and the add form)

  // Marks the words the admin typed inside a result.
  function hi(text, words) {
    let out = esc(text);
    for (const w of words) {
      if (w.length < 2) continue;
      out = out.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>');
    }
    return out;
  }

  function render() {
    const words = searchBox.value.trim().split(/\s+/).filter(Boolean);
    body.innerHTML = rows.length ? rows.map((a) => `
      <tr>
        <td class="adm-id">${hi(a.admission_id, words)}</td>
        <td>${a.student_id
          ? `<div class="student-name">${hi(a.student_name, words)}</div><div class="roll-no">${hi(a.roll_no, words)}</div>`
          : '<span class="not-linked">Not linked</span>'}</td>
        <td>${a.student_id ? `${esc(a.branch)}<div class="sub-line">${esc(a.year)}${a.branch_code ? `<span class="sec-chip">${esc(a.branch_code)} · ${esc(a.section || '—')}</span>` : ''}</div>` : '<span class="roll-no">—</span>'}</td>
        <td class="date-cell">${esc(a.created_at)}</td>
        <td class="actions-cell">
          <button class="action-btn action-dispatch" data-link="${a.id}">${a.student_id ? 'Change' : 'Link student'}</button>
          <button class="action-btn action-reject" data-del="${a.id}">Delete</button>
        </td>
      </tr>`).join('') : '<tr><td colspan="5" class="glb-empty">No admission ID matches your search.</td></tr>';
  }

  async function load() {
    try {
      const q = searchBox.value.trim();
      const all = await api('/admission-ids' + (q ? '?search=' + encodeURIComponent(q) : ''));
      if (!q) total = all.length;
      const code = branchSel.value;
      rows = code ? all.filter((r) => r.branch_code === code) : all;
      render();
      countEl.textContent = `${total || rows.length} admission IDs registered. Students must enter one of these to open the Student Block.`;
      resultEl.textContent = (q || code) ? `Showing ${rows.length} of ${total || all.length} admission IDs` : '';
    } catch (e) { toast(e.message, 'error'); }
  }

  // ---------------------------------------------------------- college database connection
  const syncCard = document.getElementById('sync-card');
  const syncTitle = document.getElementById('sync-title');
  const syncSub = document.getElementById('sync-sub');
  const syncBtn = document.getElementById('sync-btn');
  const when = (iso) => { try { return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; } };

  function showSync(st) {
    const l = st.last;
    syncCard.className = 'sync-card' + (!st.available || (l && !l.ok) ? ' bad' : l ? ' ok' : '');
    if (!st.available) {
      syncTitle.textContent = 'College database not connected';
      syncSub.textContent = `File "${st.source}" was not found. Set COLLEGE_DB_PATH in backend/.env, then press Sync now.`;
    } else if (l && !l.ok) {
      syncTitle.textContent = 'College database could not be read';
      syncSub.textContent = l.error;
    } else if (l) {
      syncTitle.textContent = `College database connected · ${l.source}`;
      syncSub.textContent = `${l.total} students in the college data · last synced ${when(l.at)} · ${l.students_created} new, ${l.ids_created} new admission IDs`
        + (l.conflicts ? ` · ${l.conflicts} conflict(s) skipped` : '') + (st.auto_minutes ? ` · checks again every ${st.auto_minutes} min` : '');
    } else {
      syncTitle.textContent = `College database found · ${st.source}`;
      syncSub.textContent = 'Press Sync now to bring in all students and their admission IDs.';
    }
  }

  async function loadSync() {
    try { showSync(await api('/college/status')); } catch (e) { syncSub.textContent = e.message; }
  }

  async function loadBranches() {
    try {
      branches = await api('/students/branches');
      const keep = branchSel.value;
      branchSel.innerHTML = '<option value="">All branches</option>' + branches.map((b) => `<option value="${esc(b.branch_code)}">${esc(b.branch_code)} (${b.total})</option>`).join('');
      branchSel.value = keep;
    } catch { /* filter simply stays empty */ }
  }

  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    syncBtn.textContent = 'Syncing…';
    try {
      const r = await api('/college/sync', { method: 'POST' });
      toast(r.ok ? `Synced: ${r.students_created} new students, ${r.ids_created} new admission IDs` : r.error, r.ok ? undefined : 'error');
      await Promise.all([loadSync(), loadBranches(), load()]);
    } catch (e) { toast(e.message, 'error'); }
    syncBtn.disabled = false;
    syncBtn.textContent = 'Sync now';
  });
  branchSel.addEventListener('change', load);

  let timer;
  searchBox.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 300); });

  // Students who can still be linked: not linked to any ID yet (plus the current one when editing).
  async function linkableStudents(keepStudentId) {
    const [students, all] = await Promise.all([api('/students'), api('/admission-ids')]);
    const taken = new Set(all.map((a) => a.student_id).filter(Boolean));
    return students.filter((s) => !taken.has(s.id) || s.id === keepStudentId);
  }

  const options = (students, selected) =>
    '<option value="">— Not linked —</option>' +
    students.map((s) => `<option value="${s.id}"${s.id === selected ? ' selected' : ''}>${esc(s.name)} (${esc(s.roll_no)})</option>`).join('');

  const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

  async function openAdd() {
    let students = [];
    try { students = await linkableStudents(null); } catch (e) { toast(e.message, 'error'); return; }
    const branchOpts = branches.map((b) => `<option value="${esc(b.branch_code)}" data-name="${esc(b.branch_name)}">${esc(b.branch_code)} — ${esc(b.branch_name)}</option>`).join('')
      + '<option value="__new">+ New branch…</option>';
    const m = modal('Add Admission ID', `
      <div class="mode-switch"><button type="button" class="on" data-mode="new">New student</button><button type="button" data-mode="old">Link existing student</button></div>
      <form id="adm-form">
        <div id="mode-new">
          <label for="af-name">Full name</label><input id="af-name" maxlength="100" autocomplete="off">
          <label for="af-roll">Roll number</label><input id="af-roll" maxlength="30" placeholder="e.g. GLB26-CSE-A-017" autocomplete="off">
          <div class="glb-row">
            <div><label for="af-branch">Branch</label><select id="af-branch">${branchOpts}</select></div>
            <div><label for="af-section">Section</label><input id="af-section" maxlength="5" placeholder="A" value="A"></div>
          </div>
          <div id="af-newbranch" class="glb-row" hidden>
            <div><label for="af-bcode">Branch code</label><input id="af-bcode" maxlength="12" placeholder="e.g. AIML"></div>
            <div><label for="af-bname">Branch name</label><input id="af-bname" maxlength="150" placeholder="e.g. AI and Machine Learning"></div>
          </div>
          <label for="af-year">Year</label><select id="af-year">${YEARS.map((y) => `<option>${y}</option>`).join('')}</select>
        </div>
        <div id="mode-old" hidden>
          <label for="af-student">Student</label>
          <select id="af-student"><option value="">— Choose a student —</option>${students.map((s) => `<option value="${s.id}">${esc(s.name)} (${esc(s.roll_no)})</option>`).join('')}</select>
          <p class="hint">Only students who do not have an admission ID yet are listed.</p>
        </div>
        <label for="af-id">Admission ID <span style="font-weight:400;color:#6b7280">(optional for a new student)</span></label>
        <input id="af-id" maxlength="30" placeholder="Leave empty to generate one, e.g. ADM-2026-0097" autocomplete="off">
        <p class="hint">A new student gets a card in Students › branch › section automatically.</p>
        <button class="glb-submit" type="submit">Save admission ID</button>
      </form>`);
    let mode = 'new';
    const $ = (id) => m.querySelector('#' + id);
    m.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      m.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
      $('mode-new').hidden = mode !== 'new';
      $('mode-old').hidden = mode !== 'old';
    }));
    const syncBranchUi = () => { $('af-newbranch').hidden = $('af-branch').value !== '__new'; };
    $('af-branch').addEventListener('change', syncBranchUi);
    syncBranchUi();

    m.querySelector('#adm-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = m.querySelector('.glb-submit');
      let payload;
      if (mode === 'old') {
        if (!$('af-student').value) { toast('Choose a student, or switch to New student', 'error'); return; }
        payload = { admission_id: $('af-id').value, student_id: $('af-student').value };
      } else {
        const isNew = $('af-branch').value === '__new';
        const opt = $('af-branch').selectedOptions[0];
        payload = {
          admission_id: $('af-id').value, name: $('af-name').value, roll_no: $('af-roll').value,
          branch_code: isNew ? $('af-bcode').value : $('af-branch').value,
          branch_name: isNew ? $('af-bname').value : (opt && opt.dataset.name) || '',
          section: $('af-section').value, year: $('af-year').value,
        };
      }
      btn.disabled = true;
      try {
        const out = await api('/admission-ids', { method: 'POST', body: payload });
        closeModal();
        toast('Admission ID ' + out.admission_id + ' added' + (mode === 'new' ? ' — student card created' : ''));
        loadBranches();
        load();
      } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
    });
  }
  document.getElementById('adm-add').addEventListener('click', openAdd);

  body.addEventListener('click', async (e) => {
    const linkBtn = e.target.closest('[data-link]');
    const delBtn = e.target.closest('[data-del]');

    if (linkBtn) {
      const a = rows.find((r) => r.id === Number(linkBtn.dataset.link));
      let students = [];
      try { students = await linkableStudents(a.student_id); } catch (err) { toast(err.message, 'error'); return; }
      const m = modal('Link ' + a.admission_id, `
        <form id="lk-form">
          <label for="lk-student">Student</label>
          <select id="lk-student">${options(students, a.student_id)}</select>
          <button class="glb-submit" type="submit">Save</button>
        </form>`);
      m.querySelector('#lk-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          await api('/admission-ids/' + a.id, { method: 'PATCH', body: { student_id: m.querySelector('#lk-student').value } });
          closeModal();
          toast('Admission ID updated');
          load();
        } catch (err) { toast(err.message, 'error'); }
      });
    }

    if (delBtn) {
      const a = rows.find((r) => r.id === Number(delBtn.dataset.del));
      if (!confirm(`Delete admission ID ${a.admission_id}? The student will no longer be able to log in with it.`)) return;
      try {
        await api('/admission-ids/' + a.id, { method: 'DELETE' });
        toast('Admission ID deleted');
        load();
      } catch (err) { toast(err.message, 'error'); }
    }
  });

  (async () => {
    await loadBranches();
    loadSync();
    await load();
    if (location.hash === '#add') openAdd();   // "+ Add Student" on the Students page lands here
  })();
})();
