/* dashboard.js — fills the dashboard cards, recent requests and stock summary. */
(async function () {
  const { api, esc, toast } = GLB;
  try {
    const d = await api('/dashboard');

    document.getElementById('stat-items').textContent = d.stats.totalItems;
    document.getElementById('stat-pending').textContent = d.stats.pending;
    document.getElementById('stat-dispatched').textContent = d.stats.dispatched;
    document.getElementById('stat-students').textContent = d.stats.students;

    const body = document.getElementById('recent-body');
    body.innerHTML = d.recent.length ? d.recent.map((r) => `
      <tr>
        <td><div class="student-name">${esc(r.student_name)}</div><div class="student-id">${esc(r.roll_no)}</div></td>
        <td>${esc(r.item_name)}</td>
        <td class="date-cell">${esc(r.date)}</td>
        <td><span class="badge badge-${esc(r.status)}">${esc(r.status[0].toUpperCase() + r.status.slice(1))}</span></td>
      </tr>`).join('') : '<tr><td colspan="4" class="glb-empty">No requests yet.</td></tr>';

    const max = Math.max(1, ...d.stock.map((s) => s.stock));
    document.getElementById('stock-list').innerHTML = d.stock.map((s) => `
      <div class="stock-item">
        <div class="stock-row"><span class="stock-name">${esc(s.name)}</span><span class="stock-count">${s.stock}</span></div>
        <div class="stock-bar"><div class="stock-fill" style="width:${Math.round((s.stock / max) * 100)}%"></div></div>
      </div>`).join('');
  } catch (e) {
    toast(e.message, 'error');
  }
})();
