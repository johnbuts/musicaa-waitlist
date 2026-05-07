# Musicaa Waitlist

Free, self-hosted waitlist landing page with the Three.js genre cloud as the hero. Frontend is a single static `index.html` (deployable to GitHub Pages). Backend is a Google Apps Script that writes signups to a Google Sheet and sends a confirmation email via Gmail.

## Files

- `index.html` — the landing page (Three.js genre cloud + signup form, all inline)
- `apps-script.gs` — Google Apps Script backend (paste into Apps Script editor)

## Setup

### 1. Google Sheet + Apps Script

1. Create a new Google Sheet. Name it something like "Musicaa Waitlist".
2. In row 1, add headers: `Email`, `Timestamp`, `Status`.
3. **Extensions → Apps Script**. Delete the boilerplate `function myFunction()` code.
4. Paste the contents of `apps-script.gs` into the editor.
5. Edit the `CONFIG` block at the top:
   - `LANDING_PAGE_URL` — your eventual GitHub Pages URL (you can update this later).
6. Click **Save** (disk icon).
7. Click **Deploy → New deployment**.
   - Click the gear next to "Select type" → **Web app**.
   - Description: anything (e.g. "v1").
   - **Execute as**: Me.
   - **Who has access**: Anyone.
   - Click **Deploy**.
8. Authorize when prompted (Google will warn it's an unverified app — click "Advanced → Go to (project name)").
9. Copy the **Web app URL** that shows up after deployment.

### 2. Wire the frontend to the backend

1. Open `index.html`.
2. Find the line `const APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL_HERE';`
3. Replace with the Web app URL from step 1.

### 3. Test locally

Open `index.html` directly in Chrome (just double-click, or `file://` it). The genre cloud should render. Submit a test email and verify:
- A new row appears in the Google Sheet
- A confirmation email arrives in your inbox

### 4. Deploy to GitHub Pages

1. Create a new GitHub repo (e.g. `musicaa-waitlist`).
2. Copy `index.html` into the repo root. Commit and push.
3. Repo **Settings → Pages**. Under "Source", select **Deploy from a branch**, branch **main**, folder **/ (root)**. Click Save.
4. Wait ~1 minute. Your site will be live at `https://YOUR_USERNAME.github.io/musicaa-waitlist/`.
5. Update `LANDING_PAGE_URL` in your Apps Script to that URL, redeploy the script (**Deploy → Manage deployments → edit (pencil icon) → New version → Deploy**).

### Optional: custom domain

In your repo's `Settings → Pages → Custom domain`, add `waitlist.musicaa.app` (or whatever) and add a CNAME record at your DNS provider pointing to `YOUR_USERNAME.github.io`.

## Updating the Apps Script later

Whenever you change `apps-script.gs`, you must redeploy:
- **Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy**

The Web app URL stays the same across redeployments — no need to update the frontend.

## Limits to know about

- Gmail send quota: 100 emails/day on free Gmail, 1500/day on Workspace. Plenty for a waitlist unless you go viral.
- Google Sheets: 10M cells per sheet. You'll never hit this.
- Apps Script execution: 6 min/invocation, 90 min/day. Each signup takes well under a second.

## Customizing

- **Tagline / branding**: edit the `<h1>` and `.tagline` text in `index.html`.
- **Theme colors**: search for `#8B5CF6` and `#A855F7` (purple accents) in `index.html` and the email template in `apps-script.gs`.
- **Email body**: edit `buildEmailHtml()` in `apps-script.gs`.
- **Genre data**: pulled from `musicaa/lib/genre_3d_map.json` at build time. To regenerate, re-run the Python snippet that inlined it (see commit history).
