/**
 * Musicaa Waitlist — Google Apps Script backend.
 *
 * This script:
 *   1. Receives a POST from the landing page with { email }
 *   2. Appends Email + Timestamp + Status to your "musicaa waitlist" Google Sheet
 *   3. Sends a styled confirmation email to the subscriber
 *
 * SETUP (one-time):
 *   1. Open the "musicaa waitlist" Google Sheet.
 *   2. Make the first row a header: "Email", "Timestamp", "Status".
 *   3. Extensions → Apps Script. Replace the boilerplate with this file.
 *   4. Edit CONFIG below — set LANDING_PAGE_URL to your GitHub Pages URL.
 *   5. Click Deploy → New deployment → type "Web app".
 *      - "Execute as": Me
 *      - "Who has access": Anyone
 *      - Click Deploy, authorize, copy the Web app URL.
 *   6. Paste that URL into APPS_SCRIPT_URL in index.html.
 *
 * Note: the frontend posts as text/plain to skip the CORS preflight that
 * Apps Script Web Apps don't handle. The body is still JSON; we parse it.
 */

// ───────────────────────── CONFIG ─────────────────────────
const SPREADSHEET_NAME = 'musicaa waitlist';
const LANDING_PAGE_URL = 'https://YOUR_GITHUB_USERNAME.github.io/musicaa-waitlist/';
const APP_NAME = 'Musicaa';
const FROM_NAME = 'Musicaa';
// ──────────────────────────────────────────────────────────

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const email = (body.email || '').toString().trim().toLowerCase();

    if (!isValidEmail(email)) {
      return jsonResponse({ success: false, message: 'Invalid email address.' });
    }

    const sheet = getSubscriberSheet();
    if (!sheet) {
      return jsonResponse({ success: false, message: 'Sheet "' + SPREADSHEET_NAME + '" not found. Bind this script to the correct spreadsheet.' });
    }

    // Check for duplicates (skip header row)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const emails = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < emails.length; i++) {
        if ((emails[i][0] || '').toString().trim().toLowerCase() === email) {
          return jsonResponse({ success: false, duplicate: true, message: "You're already on the list." });
        }
      }
    }

    sheet.appendRow([email, new Date(), 'confirmed']);

    try {
      sendConfirmationEmail(email);
    } catch (mailErr) {
      // Email send failures shouldn't block signup — they're already on the list.
      Logger.log('Email send failed: ' + mailErr);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    Logger.log('Error: ' + err);
    return jsonResponse({ success: false, message: 'Server error. Try again.' });
  }
}

function doGet() {
  return jsonResponse({ status: 'ok', service: APP_NAME + ' waitlist', sheet: SPREADSHEET_NAME });
}

/**
 * Resolve the subscriber sheet. The script is container-bound to the
 * "musicaa waitlist" spreadsheet (Extensions → Apps Script from inside the
 * sheet), so getActiveSpreadsheet() returns it. We sanity-check the name so a
 * misbinding fails loud rather than writing to the wrong sheet.
 */
function getSubscriberSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return null;
  if (ss.getName().toLowerCase() !== SPREADSHEET_NAME.toLowerCase()) {
    Logger.log('Bound spreadsheet name is "' + ss.getName() + '", expected "' + SPREADSHEET_NAME + '"');
    return null;
  }
  return ss.getActiveSheet();
}

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sendConfirmationEmail(email) {
  const subject = "You're on the " + APP_NAME + " waitlist";
  const html = buildEmailHtml();
  const plain =
    "You're on the " + APP_NAME + " waitlist.\n\n" +
    "Over 100,000 songs are released every day. " + APP_NAME + " surfaces the actual unique ones based on your taste — not what everyone else is listening to.\n\n" +
    "We'll email you the moment early access opens.\n\n" +
    "Visit: " + LANDING_PAGE_URL + "\n\n" +
    "— The " + APP_NAME + " team";

  GmailApp.sendEmail(email, subject, plain, {
    name: FROM_NAME,
    htmlBody: html,
  });
}

function buildEmailHtml() {
  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head><meta charset="UTF-8"><title>You\'re on the list</title></head>',
    '<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#fff;">',
    '  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a;padding:40px 20px;">',
    '    <tr><td align="center">',
    '      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#141416;border:1px solid rgba(168,85,247,0.18);border-radius:20px;overflow:hidden;">',
    '        <tr><td style="padding:40px 36px 28px 36px;text-align:center;">',
    '          <h1 style="margin:0 0 10px 0;font-size:36px;font-weight:800;letter-spacing:-0.02em;color:#c4b5fd;">' + APP_NAME + '</h1>',
    '          <p style="margin:0;color:rgba(196,181,253,0.85);font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;">You\'re on the list</p>',
    '        </td></tr>',
    '        <tr><td style="padding:0 36px 12px 36px;text-align:center;">',
    '          <p style="margin:0;color:rgba(196,181,253,0.85);font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;">Over 100,000 songs released every day</p>',
    '        </td></tr>',
    '        <tr><td style="padding:0 36px 28px 36px;color:rgba(255,255,255,0.85);font-size:16px;line-height:1.55;text-align:center;">',
    '          <p style="margin:0 0 14px 0;">Thanks for joining the ' + APP_NAME + ' waitlist.</p>',
    '          <p style="margin:0 0 14px 0;">We\'re building ' + APP_NAME + ' to surface the actual unique ones based on your taste — not what everyone else is listening to.</p>',
    '          <p style="margin:0;color:rgba(255,255,255,0.65);">We\'ll email you the moment early access opens.</p>',
    '        </td></tr>',
    '        <tr><td style="padding:0 36px 36px 36px;text-align:center;">',
    '          <a href="' + LANDING_PAGE_URL + '" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#8B5CF6 0%,#A855F7 100%);color:#fff;text-decoration:none;font-weight:600;font-size:15px;border-radius:12px;">Visit ' + APP_NAME + '</a>',
    '        </td></tr>',
    '        <tr><td style="padding:24px 36px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;color:rgba(255,255,255,0.35);font-size:12px;">',
    '          You received this email because you signed up at <a href="' + LANDING_PAGE_URL + '" style="color:#a855f7;text-decoration:none;">' + LANDING_PAGE_URL.replace(/^https?:\/\//, '') + '</a>.',
    '        </td></tr>',
    '      </table>',
    '    </td></tr>',
    '  </table>',
    '</body>',
    '</html>'
  ].join('\n');
}
