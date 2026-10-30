/* requests.js — request tables (All / Pending / Approved / Dispatched / Rejected) + action buttons. */
(function () {
  const { api, esc, toast } = GLB;
  const body = document.getElementById('requests-body');
  const status = body.dataset.status; // all | pending | approved | dispatched | rejected
  const cap = (s) => s[0].toUpperCase() + s.slice(1);

  function actions(r) {
    if (r.status === 'pending') {
      return `<button class="action-btn action-approve" data-id="${r.id}" data-to="approved">Approve</button>
              <button class="action-btn action-reject" data-id="${r.id}" data-to="rejected">Reject</button>`;
    }
    if (r.status === 'approved') {
      return `<button class="action-btn action-dispatch" data-id="${r.id}" data-to="dispatched">Dispatch</button>`;
    }
    return '<span class="action-none">—</span>';
  }

  function row(r) {
    return `
      <tr>
        <td class="req-id">${esc(r.request_code)}</td>
        <td class="student-name">${esc(r.student_name)}</td>
        <td class="roll-no">${esc(r.roll_no)}</td>
        <td>${esc(r.item_name)}</td>
        <td><span class="size-chip">${esc(r.size)}</span></td>
        <td class="date-cell">${esc(r.date)}</td>
        <td><span class="status-badge status-${esc(r.status)}">${cap(esc(r.status))}</span></td>
        <td class="actions-cell">${actions(r)}</td>
      </tr>`;
  }

  async function load() {
    try {
      const rows = await api('/requests' + (status !== 'all' ? '?status=' + status : ''));
      body.innerHTML = rows.length ? rows.map(row).join('')
        : '<tr><td colspan="8" class="glb-empty">No requests found.</td></tr>';
    } catch (e) { toast(e.message, 'error'); }
  }

  body.addEventListener('click', async (e) => {
    const btn = e.target.closest('.action-btn');
    if (!btn) return;
    const to = btn.dataset.to;
    if (to === 'rejected' && !confirm('Reject this request?')) return;
    btn.disabled = true;
    try {
      const r = await api(`/requests/${btn.dataset.id}/status`, { method: 'PATCH', body: { status: to } });
      toast(`${r.request_code} is now ${to}`);
      load();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });

  load();
})();
