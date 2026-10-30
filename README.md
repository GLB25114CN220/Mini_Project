# GL Bajaj ITM – Dress Management System (Frontend + Backend)

## Folder layout
```
mini_projrct/
├── Install App Shortcut.bat      <- run ONCE (Windows): installs packages + Desktop shortcut
├── Start Dress Management.bat    <- what the Desktop shortcut runs (starts server + opens the site)
├── Mini_Project/Dashboard/       <- frontend (HTML/CSS + js/ folder that talks to the backend)
└── backend/                      <- backend (Node.js + Express + SQLite)
```

## Easiest way (Windows)
1. Install Node.js LTS (version 22.13 or newer) from https://nodejs.org
2. Double-click **Install App Shortcut.bat** (once). It installs everything, adds a
   **GL Bajaj Dress Management** shortcut to your Desktop and opens the website.
3. From then on, double-click the Desktop shortcut. A small minimised window runs the server;
   close that window to stop it.

## Manual way (any computer)
```
cd backend
npm install
npm start
```
Then open http://localhost:3000

## The two blocks
The website opens on an entry page with two doors.

| | **Student Block** | **Admins Block** |
|---|---|---|
| Who | Students, with an **Admission ID** | Admins, with email + password |
| Sections | My Dashboard, Dress Catalog (+ Winter / Summer), Shopping Cart, My Orders, My Profile, Student Query | Dashboard, Requests, Students, Query Inbox, Admission IDs, Inventory |

* Admins can also open the Student Block sections (the Dress Catalog and Student Query).
* Students can **only** open the Student Block. Typing an Admins Block address in the browser sends them back,
  and the server itself refuses (error 403) every Admins Block request that comes with a student login.

### Student login
Enter an Admission ID from the **Admission IDs** list (Admins Block). Sample IDs: `ADM2025001` to `ADM2025008`.
An ID that is not in the list is refused. Deleting an ID cuts that student off immediately.
Each ID should be **linked to a student record** (Admission IDs page -> *Link student*); a linked student
- is pre-filled in the query form (name, roll number, branch, year) and
- requests dresses for themselves without typing a roll number.

An ID with no linked student can still browse and send queries, but cannot request dresses until it is linked.

### Admin login
- Email:    admin@glbajaj.ac.in
- Password: admin123   (change it in backend/.env BEFORE first run)

## Student Query + Query Inbox
* The query page has a **Back** button in the top-left corner: admins go back to the **Dashboard**,
  students go back to the **Dress Catalog**.
* Every submitted query (also the ones an admin adds) shows up in **Admins Block -> Query Inbox**,
  with the student's admission ID, attachment, and a *Mark as resolved* button.

## Useful commands (inside `backend`)
- `npm run dev`   restart automatically when you edit code
- `npm run seed`  RESET the database to the sample data (erases current data)
- `npm test`      run the self-test of the backend logic

An existing `dress.db` from an older version keeps its data; admission IDs (`ADM2025001`, `ADM2025002`, ...)
are created automatically for the students already in it.

## Images
Put your dress pictures in `Mini_Project/Dashboard/images/` using the names in `backend/seed.js`
(e.g. `navy-blue-blazer.jpg`). If a picture is missing, the card just shows the dark background.

## Added student ordering and inventory features
- Students can add multiple uniform/size selections to a browser shopping cart and submit them as order requests.
- **My Orders** lists the logged-in student's own requests and status. Students cannot view another student's requests.
- **My Profile** displays the student details linked to their admission ID.
- Admins can open **Inventory** to update item stock and price. Stock is reduced when an approved request is dispatched.
- The Student Query page remains available for student questions; admins review and resolve queries in Query Inbox.

## Run after updating
From the `backend` folder run `npm install` (if needed), then `npm test`, then `npm start`. Open http://localhost:3000.
The sample admin credentials above are for local demonstration only; change the password and JWT secret in `backend/.env` before using real student data.


## What's new in this version
- **Every section is now connected.** The admin Dashboard ends with an *All Sections* grid (Admins Block, requests by status, Student Block) with live counts. Students get their own **My Dashboard** (`home.html`) with their request stats, recent orders, details and the same grid.
- **Fixed:** *My Orders* and *My Profile* called two backend routes that did not exist (`/api/student/requests`, `/api/student/profile`). They are added in `backend/routes.js`.
- **Login page** polished: show/hide password, Caps Lock warning, feature highlights. Students now land on **My Dashboard** after login.
- **Mobile menu:** on phones the sidebar becomes a slide-in menu (`common.css`, loaded automatically by `js/api.js`).
- **Dress pictures:** simple placeholder images for all 8 items are in `Mini_Project/Dashboard/images/`. Replace them with real photos using the same file names.
- Admins now see only the Dress Catalog and Student Query in the Student Block (cart, orders and profile belong to students).


## College database connection (new)
The college app's student data is copied into this website automatically.

- **Where:** `backend/college/sample_college_students.sqlite` (your sample file). To use the real one, set `COLLEGE_DB_PATH` in `backend/.env` (a `.sqlite`/`.db` file with a `students` table, or a `.csv` export). Column names are matched flexibly: `student_name`, `branch_code`, `branch_name`, `section`, `roll_number`, `admission_id`, `academic_year`.
- **When:** at server start, every `COLLEGE_SYNC_MINUTES` (default 5) if the file changed, and with the **Sync now** button on the Admission IDs page.
- **What happens:** every college student becomes a student record *and* an admission ID. If the college record has no admission ID, one like `ADM-2026-0097` is generated. Running it again never creates duplicates. The college file is only read, never changed.
- **Admission IDs page:** college status card, a search bar (words can be mixed: `cse a 0012`, a name, a roll number, a branch or section), a branch filter, and **+ Add Admission ID** which can create a *new student + ID in one step* (leave the ID empty to generate one) or link an existing student.
- **Students page:** Students → Branch tiles (animated, with counts) → Sections of that branch → the student cards of that section. Branches and sections are built from the data, so a new branch or section appears by itself when a student is added to it.
- Students can type their admission ID with or without dashes (`ADM-2026-0017` or `ADM20260017`).
- The 8 original demo students (and their sample requests) are still in a fresh database. Delete `backend/dress.db` and run `npm run seed` only if you want to reset; to keep just college students, remove the demo rows from `backend/seed.js`.

## Footer (new)
- Built by `Mini_Project/Dashboard/js/footer.js` + `footer.css` (loaded automatically by `js/api.js`). It has the logo and tagline, Instagram / College Website / LinkedIn buttons, the Quick Links and Student Support columns, the "Designed for Campus Convenience" note and the copyright line.
- **Shown on:** the login page, the student pages (home, catalog, winter/summer, cart, orders, profile, query), the admin Dashboard and `help.html`. Admin working pages (requests, students, inventory, admission IDs ...) stay clean. Change the list `FOOTER_PAGES` in `footer.js`, or set `window.GLB_FOOTER = true/false` in a page.
- `help.html` holds Booking Guidelines, Return Policy, FAQs, Privacy Policy and Terms of Use. Edit the text there to match the college's real rules.
- Social links are at the top of `footer.js` (`LINKS`).

## Catalog pictures
The real uniform photos are in `Mini_Project/Dashboard/images/` (one file per catalog item, same names the database uses). To change a picture, replace the file with the same name (ideal size about 800 x 600 px, JPG). The two trousers, two ties and two shirts use the same photo for winter and summer.

**Pictures not showing?** (1) Stop the server and start it again (`npm start`): at start-up every catalog item is pointed at its picture automatically, even in an older `dress.db`. (2) Hard-refresh the browser (Ctrl+F5). (3) Check http://localhost:3000/images/grey-sweater.jpg opens the sweater photo; if it does not, the old project folder is still being used.


## Put the website online (permanent link that works on phones and laptops)
GitHub stores the code, but GitHub itself cannot run this website (it has a server + database). So:
**GitHub keeps the code, Render runs the website** and gives you a public `https://....onrender.com` link.

1. **Upload to GitHub** (once): double-click **Publish to GitHub.bat** (needs Git installed). It uploads everything to
   https://github.com/GLB25114CN220/Mini_Project. The secret file `backend/.env` is never uploaded.
2. **Deploy on Render** (once): go to https://render.com, sign up with your GitHub account, then
   **New > Blueprint**, choose the `Mini_Project` repository and press **Apply**. Render reads `render.yaml`.
   It asks for **ADMIN_PASSWORD**: type a strong password (at least 8 characters). Do not use `admin123`.
3. Wait a few minutes for the first build. Render shows your link (like `https://glbajaj-dress-management.onrender.com`).
   Open it on your laptop and phone, then send the link to anyone. Every later push to GitHub updates the live site automatically.
4. Admin sign-in on the live site: email `admin@glbajaj.ac.in` + the ADMIN_PASSWORD you typed in step 2.

### Free vs paid (please read)
- **Free plan:** the site **sleeps after 15 minutes without visitors** and the first visit afterwards takes up to about a minute to wake it. The free plan also **forgets everything saved on its disk whenever it restarts or redeploys**, so student **orders, queries and stock edits are lost** (college students, admission IDs, catalog and sample data come back automatically). Good for showing the project.
- **Paid plan + disk:** the site stays awake and keeps its data permanently. In `render.yaml` change `plan: free` to a paid plan, un-comment the `disk:` lines and add the variable `DB_PATH=/var/data/dress.db`.
- The site refuses to start on Render if ADMIN_PASSWORD / JWT_SECRET are the sample values (safety check).

### Before using real college data
Students sign in with their admission ID only. Sample IDs such as `ADM-2026-0001` are easy to guess, which is fine for fake data but **not** for real students. Do not publish real student data on a public site until sign-in also asks for something private (for example a date of birth or a password).
