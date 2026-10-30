/* catalog.js — shows the dress cards (all / winter / summer) and handles "Request Item".
   Admins type a student's roll number; a logged-in student always requests for themselves
   (the backend takes their identity from the admission ID they entered). */
(function () {
  const { api, esc, toast, modal, closeModal, role, user } = GLB;
  const isStudent = role === 'student';
  const grid = document.getElementById('card-grid');
  const season = grid.dataset.season; // all | winter | summer
  let items = [];

  if (isStudent) {
    const sub = document.querySelector('.page-subtitle');
    if (sub) sub.textContent = 'Browse the uniform items and request the ones you need';
  }

  function card(it) {
    const stockText = it.stock > 0 ? `${it.stock} in stock` : 'Out of stock';
    const stockClass = it.stock >= 50 ? 'in-stock' : 'low-stock';
    return `
      <article class="card">
        <div class="card-image">
          <span class="badge badge-${esc(it.season)}">${esc(it.season)}</span>
          <span class="sku">${esc(it.sku)}</span>
          <img src="images/${esc(it.image)}?v=3" alt="${esc(it.name)}">
        </div>
        <div class="card-body">
          <h3 class="item-name">${esc(it.name)}</h3>
          <div class="price-row">
            <span class="price">₹${it.price}</span>
            <span class="stock ${stockClass}">${stockText}</span>
          </div>
          <div class="size-label">SIZE</div>
          <div class="size-options">${it.sizes.map((s) => `<span>${esc(s)}</span>`).join('')}</div>
          <button class="request-btn" data-id="${it.id}" ${it.stock > 0 ? '' : 'disabled'}>${isStudent ? "Add to cart" : "Request Item"}</button>
        </div>
      </article>`;
  }

  async function load() {
    try {
      items = await api('/items' + (season !== 'all' ? '?season=' + season : ''));
      grid.innerHTML = items.length ? items.map(card).join('') : '<p class="glb-empty">No items found.</p>';
      // If a picture file is missing, hide the broken-image icon.
      grid.querySelectorAll('img').forEach((img) => img.addEventListener('error', () => img.remove()));
    } catch (e) { toast(e.message, 'error'); }
  }

  async function openRequestForm(item) {
    if (isStudent) return openStudentRequestForm(item);
    let students = [];
    try { students = await api('/students'); } catch { /* the form still works without suggestions */ }
    const body = modal('Request: ' + item.name, `
      <form id="req-form">
        <label for="rf-roll">Student roll number</label>
        <input id="rf-roll" list="rf-students" placeholder="e.g. 2100980310001" required autocomplete="off">
        <datalist id="rf-students">${students.map((s) => `<option value="${esc(s.roll_no)}">${esc(s.name)}</option>`).join('')}</datalist>
        <label for="rf-size">Size</label>
        <select id="rf-size" required>${item.sizes.map((s) => `<option>${esc(s)}</option>`).join('')}</select>
        <button class="glb-submit" type="submit">Add to cart</button>
      </form>`);
    submitRequest(body, item, () => ({ roll_no: body.querySelector('#rf-roll').value.trim() }));
  }

  // Student version: no roll number to type, the request is made for the logged-in student.
  function openStudentRequestForm(item) {
    const st = user.student;
    if (!st) {
      modal('Request: ' + item.name, `<p>Your admission ID <b>${esc(user.admission_id || '')}</b> is not linked to a student record yet,
        so a dress cannot be requested. Please contact the Dress Management office.</p>`);
      return;
    }
    const body = modal('Request: ' + item.name, `
      <form id="req-form">
        <dl>
          <dt>Student</dt><dd>${esc(st.name)}</dd>
          <dt>Roll number</dt><dd>${esc(st.roll_no)}</dd>
          <dt>Admission ID</dt><dd>${esc(user.admission_id)}</dd>
          <dt>Item</dt><dd>${esc(item.name)} (₹${item.price})</dd>
        </dl>
        <label for="rf-size">Size</label>
        <select id="rf-size" required>${item.sizes.map((s) => `<option>${esc(s)}</option>`).join('')}</select>
        <button class="glb-submit" type="submit">Submit request</button>
      </form>`);
    submitRequest(body, item, () => ({}));
  }

  function submitRequest(body, item, extraFields) {
    body.querySelector('#req-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = body.querySelector('.glb-submit');
      btn.disabled = true;
      try {
        if (isStudent) {
          let cart = [];
          try { cart = JSON.parse(localStorage.getItem('glb_cart')) || []; } catch {}
          const size = body.querySelector('#rf-size').value;
          if (cart.some((entry) => entry.item_id === item.id && entry.size === size)) {
            toast('This item and size are already in your cart.', 'error');
            btn.disabled = false;
            return;
          }
          cart.push({ item_id: item.id, size, name: item.name, price: item.price, sku: item.sku });
          localStorage.setItem('glb_cart', JSON.stringify(cart));
          closeModal();
          toast(`${item.name} (${size}) added to cart.`);
          return;
        }
        const r = await api('/requests', { method: 'POST', body: {
          ...extraFields(),
          item_id: item.id,
          size: body.querySelector('#rf-size').value,
        }});
        closeModal();
        toast(`Request ${r.request_code} created for ${r.student_name}`);
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
      }
    });
  }

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.request-btn');
    if (!btn) return;
    openRequestForm(items.find((i) => i.id === Number(btn.dataset.id)));
  });

  load();
})();
