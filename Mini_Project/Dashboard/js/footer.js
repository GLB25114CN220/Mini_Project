/* footer.js — the site footer (loaded by js/api.js).
   WHERE IT SHOWS: the login page, the student pages (home, catalog, winter/summer, cart, orders, profile, query),
   the admin Dashboard and the Help page. Admin working pages (requests, students, inventory ...) are kept clean.
   To change this: edit FOOTER_PAGES below, or put  window.GLB_FOOTER = true / false  in a page before js/api.js. */
(function () {
  const FOOTER_PAGES = [
    'index.html', 'dashboard.html', 'home.html', 'all_items.html', 'Winters_dress.html', 'Summers_dress.html',
    'cart.html', 'my_orders.html', 'profile.html', 'student_query.html', 'help.html',
  ];
  const page = location.pathname.split('/').pop() || 'index.html';
  const wanted = window.GLB_FOOTER !== undefined ? window.GLB_FOOTER : FOOTER_PAGES.includes(page);
  if (!wanted) return;

  const LINKS = {
    instagram: 'https://www.instagram.com/glbajajitm/?hl=en',
    website:   'https://www.glbitm.org/',
    linkedin:  'https://www.linkedin.com/school/g-l-bajaj-institute-of-technology-and-management/',
  };

  function build() {
    if (document.querySelector('.glb-footer')) return;
    const role = window.GLB && GLB.role;           // 'admin' | 'student' | undefined (login page)
    const home = role === 'admin' ? 'dashboard.html' : role === 'student' ? 'home.html' : 'index.html';
    const bookings = role === 'admin' ? ['All_requests.html', 'All Requests'] : ['my_orders.html', 'My Bookings'];

    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'footer.css';
    document.head.appendChild(css);

    const ext = 'target="_blank" rel="noopener noreferrer"';
    const foot = document.createElement('footer');
    foot.className = 'glb-footer';
    foot.innerHTML = `
      <div class="gf-top">
        <div class="gf-brand">
          <span class="gf-logo" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="38" height="38"><path d="M32 12 3 26l29 14 29-14z" fill="#1f3a6e"/><path d="M15 35v11c0 5 8 9 17 9s17-4 17-9V35L32 43z" fill="#2c4f94"/><path d="M57 28v17" stroke="#1f3a6e" stroke-width="3" stroke-linecap="round"/><circle cx="57" cy="48" r="3.4" fill="#1f3a6e"/></svg>
          </span>
          <div>
            <h3>GL Bajaj Dress Management</h3>
            <p>A smarter way to manage college dress bookings.</p>
          </div>
        </div>
        <div class="gf-social" aria-label="GL Bajaj ITM on the web">
          <a href="${LINKS.instagram}" ${ext} aria-label="Instagram" title="Instagram">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none"/></svg>
            <span>Instagram</span></a>
          <a href="${LINKS.website}" ${ext} aria-label="College website" title="College website">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg>
            <span>College Website</span></a>
          <a href="${LINKS.linkedin}" ${ext} aria-label="LinkedIn" title="LinkedIn">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.75h4V21H3zM9.5 9.75h3.8v1.6h.06c.53-.95 1.84-1.95 3.78-1.95 4.04 0 4.78 2.55 4.78 5.87V21h-4v-5.1c0-1.22-.02-2.78-1.77-2.78-1.77 0-2.04 1.32-2.04 2.69V21h-4z"/></svg>
            <span>LinkedIn</span></a>
        </div>
      </div>

      <div class="gf-cols">
        <nav aria-label="Quick links">
          <h4>Quick Links</h4>
          <a href="${home}">Home</a>
          <a href="all_items.html">Available Dresses</a>
          <a href="${bookings[0]}">${bookings[1]}</a>
          <a href="${LINKS.website}" ${ext}>About Us</a>
        </nav>
        <nav aria-label="Student support">
          <h4>Student Support</h4>
          <a href="help.html#guidelines">Booking Guidelines</a>
          <a href="help.html#returns">Return Policy</a>
          <a href="help.html#faqs">FAQs</a>
          <a href="student_query.html">Contact Support</a>
        </nav>
        <div class="gf-note">
          <h4>Designed for Campus Convenience</h4>
          <p>Making college dress booking simple, organized, and accessible for every student.</p>
        </div>
      </div>

      <div class="gf-bottom">
        <span>© ${new Date().getFullYear()} GL Bajaj Dress Management System. All rights reserved.</span>
        <span class="gf-legal"><a href="help.html#privacy">Privacy Policy</a> · <a href="help.html#terms">Terms of Use</a></span>
      </div>`;
    (document.querySelector('.main') || document.body).appendChild(foot);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
