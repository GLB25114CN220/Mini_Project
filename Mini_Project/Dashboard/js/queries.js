/* queries.js — admin "Query Inbox": see what students submitted, open attachments, mark resolved. */
(function () {
  const { api, esc, toast, modal, closeModal, API_BASE, getToken } = GLB;
  const body = document.getElementById('queries-body');
  const tabs = document.querySelectorAll('.tabs a');
  let filter = 'all';
  let rows = [];

  const cap = (s) => s[0].toUpperCase() + s.slice(1);

  function render() {
    const shown = filter === 'all' ? rows : rows.filter((q) => q.status === filter);
    body.innerHTML = shown.length ? shown.map((q) => `
      <tr>
        <td class="date-cell">${esc(q.created_at.slice(0, 10))}</td>
        <td><div class="student-name">${esc(q.full_name)}</div><div class="roll-no">${esc(q.roll_no)}</div></td>
        <td>${esc(q.category)}</td>
        <td>${esc(q.subject)}</td>
        <td><span class="size-chip">${esc(q.urgency)}</span></td>
        <td><span class="status-badge ${q.status === 'open' ? 'status-pending' : 'status-approved'}">${cap(esc(q.status))}</span></td>
        <td class="actions-cell"><button class="action-btn action-approve" data-view="${q.id}">View</button></td>
      </tr>`).join('') : '<tr><td colspan="7" class="glb-empty">No queries found.</td></tr>';
  }

  async function load() {
    try { rows = await api('/queries'); render(); } catch (e) { toast(e.message, 'error'); }
  }

  tabs.forEach((t) => t.addEventListener('click', (e) => {
    e.preventDefault();
    tabs.forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    filter = t.dataset.filter;
    render();
  }));

  // Attachments are protected, so download them with the login token and open the result.
  async function openAttachment(id) {
    try {
      const res = await fetch(`${API_BASE}/api/queries/${id}/attachment`, { headers: { Authorization: 'Bearer ' + getToken() } });
      if (!res.ok) throw new Error('Could not open the attachment');
      window.open(URL.createObjectURL(await res.blob()), '_blank');
    } catch (e) { toast(e.message, 'error'); }
  }

  body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    const q = rows.find((r) => r.id === Number(btn.dataset.view));
    const m = modal(q.subject, `
      <dl>
        <dt>From</dt><dd>${esc(q.full_name)} (${esc(q.roll_no)})</dd>
        <dt>Branch / Year</dt><dd>${esc(q.branch)}, ${esc(q.year)}</dd>
        <dt>Email</dt><dd>${esc(q.email)}</dd>
        <dt>Phone</dt><dd>${esc(q.phone || '—')}</dd>
        <dt>Category</dt><dd>${esc(q.category)}</dd>
        <dt>Admission ID</dt><dd>${esc(q.admission_id || '—')}</dd>
        <dt>Request ID</dt><dd>${esc(q.request_code || '—')}</dd>
        <dt>Urgency</dt><dd>${esc(q.urgency)}</dd>
        <dt>Submitted</dt><dd>${esc(q.created_at)}</dd>
      </dl>
      <p style="white-space:pre-wrap;background:#f3f4f7;padding:12px;border-radius:8px">${esc(q.message)}</p>
      ${q.has_attachment ? `<p><a href="#" id="q-att">📎 ${esc(q.attachment_name)}</a></p>` : ''}
      <button class="glb-submit" id="q-toggle">${q.status === 'open' ? 'Mark as resolved' : 'Re-open'}</button>`);
    const att = m.querySelector('#q-att');
    if (att) att.addEventListener('click', (ev) => { ev.preventDefault(); openAttachment(q.id); });
    m.querySelector('#q-toggle').addEventListener('click', async () => {
      try {
        await api(`/queries/${q.id}/status`, { method: 'PATCH', body: { status: q.status === 'open' ? 'resolved' : 'open' } });
        closeModal();
        load();
      } catch (err) { toast(err.message, 'error'); }
    });
  });

  load();
})();
