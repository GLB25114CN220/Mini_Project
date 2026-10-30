/* sections.js — draws the "All Sections" tiles so every page of the site is one click away.
   Admin dashboard: Admins Block + request statuses + Student Block.   Student home: Student Block. */
(function () {
  const { api, esc } = GLB;
  const box = document.getElementById('all-sections');
  if (!box) return;

  const tile = (t, counts) => `
    <a class="glb-tile" href="${t.href}">
      <div class="glb-tile-icon">${t.icon}</div>
      <div><b>${esc(t.title)}</b><span>${esc(t.text)}</span>${t.count ? `<em data-count="${t.count}">${esc(counts[t.count] ?? '')}</em>` : ''}</div>
    </a>`;
  const group = (title, tiles, counts) =>
    `<div class="glb-group-title">${esc(title)}</div><div class="glb-sections">${tiles.map((t) => tile(t, counts)).join('')}</div>`;

  const ADMIN = [
    { icon: '📄', title: 'All Requests',   text: 'Every uniform request with approve / dispatch actions.', href: 'All_requests.html', count: 'requests' },
    { icon: '🎒', title: 'Students',       text: 'Student records, search and issue status.',              href: 'Students.html',     count: 'students' },
    { icon: '📥', title: 'Query Inbox',    text: 'Questions sent by students, with attachments.',          href: 'queries.html',      count: 'queries' },
    { icon: '🪪', title: 'Admission IDs',  text: 'Create, link and remove student login IDs.',             href: 'admission_ids.html', count: 'ids' },
    { icon: '📦', title: 'Inventory',      text: 'Update stock levels and prices.',                        href: 'inventory.html',    count: 'items' },
  ];
  const STATUS = [
    { icon: '⏳', title: 'Pending',    text: 'Waiting for approval.',          href: 'Pending.html',    count: 'pending' },
    { icon: '✅', title: 'Approved',   text: 'Approved, not yet dispatched.',  href: 'Approved.html',   count: 'approved' },
    { icon: '🚚', title: 'Dispatched', text: 'Handed over to students.',       href: 'Dispatched.html', count: 'dispatched' },
    { icon: '⛔', title: 'Rejected',   text: 'Requests that were declined.',   href: 'Rejected.html',   count: 'rejected' },
  ];
  const STUDENT = [
    { icon: '🎓', title: 'Dress Catalog',   text: 'All uniform items in one place.',     href: 'all_items.html' },
    { icon: '❄️', title: 'Winter Uniform',  text: 'Blazer, sweater, trousers and more.', href: 'Winters_dress.html' },
    { icon: '☀️', title: 'Summer Uniform',  text: 'Light shirts and trousers.',          href: 'Summers_dress.html' },
    { icon: '🛒', title: 'Shopping Cart',   text: 'Review items and submit your order.', href: 'cart.html', count: 'cart' },
    { icon: '📦', title: 'My Orders',       text: 'Track every request you made.',       href: 'my_orders.html', count: 'orders' },
    { icon: '👤', title: 'My Profile',      text: 'Your student details.',               href: 'profile.html' },
    { icon: '❓', title: 'Student Query',   text: 'Ask the Dress Management office.',    href: 'student_query.html' },
  ];

  function draw(counts) {
    let html = '';
    if (GLB.role === 'admin') {
      html += group('Admins Block', ADMIN, counts) + group('Requests by status', STATUS, counts);
    }
    html += group('Student Block', GLB.role === 'admin' ? STUDENT.filter((t) => t.href !== 'my_orders.html' && t.href !== 'profile.html' && t.href !== 'cart.html') : STUDENT, counts);
    box.innerHTML = html;
  }

  const counts = {};
  try { counts.cart = (JSON.parse(localStorage.getItem('glb_cart')) || []).length + ' in cart'; } catch { /* ignore */ }
  draw(counts);

  (async () => {
    try {
      if (GLB.role === 'admin') {
        const [reqs, studs, qs, ids, items] = await Promise.allSettled(
          ['/requests', '/students', '/queries', '/admission-ids', '/items'].map((p) => api(p)));
        const n = (r) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : null);
        if (n(reqs)) {
          counts.requests = n(reqs).length + ' total';
          for (const s of ['pending', 'approved', 'dispatched', 'rejected']) {
            counts[s] = n(reqs).filter((r) => r.status === s).length + ' request(s)';
          }
        }
        if (n(studs)) counts.students = n(studs).length + ' enrolled';
        if (n(qs)) counts.queries = n(qs).filter((q) => q.status === 'open').length + ' open';
        if (n(ids)) counts.ids = n(ids).length + ' IDs';
        if (n(items)) counts.items = n(items).length + ' items';
      } else {
        const mine = await api('/student/requests');
        if (Array.isArray(mine)) counts.orders = mine.length + ' request(s)';
      }
    } catch { /* tiles still work without counts */ }
    draw(counts);
  })();
})();
