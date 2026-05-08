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
 *   4. Edit CONFIG below — set LANDING_PAGE_URL to your live site URL.
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
const LANDING_PAGE_URL = 'https://musicaa.io';
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
          return jsonResponse({ success: false, duplicate: true, message: "That email is already on the list." });
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
    "Over 100,000 songs are released every day. " + APP_NAME + " surfaces the actual unique ones based on your taste, not what everyone else is listening to.\n\n" +
    "We'll email you the moment early access opens.\n\n" +
    "— The " + APP_NAME + " team";

  GmailApp.sendEmail(email, subject, plain, {
    name: FROM_NAME,
    htmlBody: html,
  });
}

function buildEmailHtml() {
  const shareText = 'I just joined the ' + APP_NAME + ' waitlist — find your next favorite song with AI.';
  const xUrl        = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText) + '&url=' + encodeURIComponent(LANDING_PAGE_URL);
  const whatsappUrl = 'https://wa.me/?text=' + encodeURIComponent(shareText + ' ' + LANDING_PAGE_URL);
  const mailUrl     = 'mailto:?subject=' + encodeURIComponent('Check out ' + APP_NAME) + '&body=' + encodeURIComponent(shareText + '\n\n' + LANDING_PAGE_URL);

  const btnStyle = 'display:inline-block;padding:11px 20px;background-color:#1a1029;border:1px solid #3b1d4f;border-radius:10px;color:#c4b5fd;font-size:13px;font-weight:600;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;';

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="color-scheme" content="dark">',
    '  <meta name="supported-color-schemes" content="dark">',
    '  <title>You\'re on the list</title>',
    '</head>',
    '<body style="margin:0;padding:0;background-color:#070709;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#ffffff;">',
    '  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#070709" style="background-color:#070709;padding:40px 20px;">',
    '    <tr><td align="center" bgcolor="#070709" style="background-color:#070709;">',
    '      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0f0f12" style="max-width:520px;background-color:#0f0f12;border:1px solid #2a1d4d;border-radius:20px;overflow:hidden;">',
    '        <tr><td bgcolor="#0f0f12" style="background-color:#0f0f12;padding:40px 36px 22px 36px;text-align:center;">',
    '          <h1 style="margin:0 0 10px 0;font-size:36px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">' + APP_NAME + '</h1>',
    '          <p style="margin:0;color:#c4b5fd;font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;">You\'re on the list</p>',
    '        </td></tr>',
    '        <tr><td bgcolor="#0f0f12" style="background-color:#0f0f12;padding:0 36px 14px 36px;text-align:center;">',
    '          <p style="margin:0;color:#a78bfa;font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;">Over 100,000 songs are released every day</p>',
    '        </td></tr>',
    '        <tr><td bgcolor="#0f0f12" style="background-color:#0f0f12;padding:0 36px 28px 36px;color:#ffffff;font-size:16px;line-height:1.55;text-align:center;">',
    '          <p style="margin:0 0 14px 0;color:#ffffff;">Thanks for joining the ' + APP_NAME + ' waitlist.</p>',
    '          <p style="margin:0 0 14px 0;color:#ffffff;">We\'re building ' + APP_NAME + ' to surface the actual unique ones based on your taste, not what everyone else is listening to.</p>',
    '          <p style="margin:0;color:#c4b5fd;">We\'ll email you the moment early access opens.</p>',
    '        </td></tr>',
    '        <tr><td bgcolor="#0f0f12" style="background-color:#0f0f12;padding:8px 36px 32px 36px;text-align:center;border-top:1px solid #1f1f24;">',
    '          <p style="margin:18px 0 14px 0;color:#a1a1aa;font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;">Help us spread the word</p>',
    '          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">',
    '            <tr>',
    '              <td style="padding:4px;"><a href="' + xUrl + '" target="_blank" style="' + btnStyle + '">Share on X</a></td>',
    '              <td style="padding:4px;"><a href="' + whatsappUrl + '" target="_blank" style="' + btnStyle + '">WhatsApp</a></td>',
    '              <td style="padding:4px;"><a href="' + mailUrl + '" style="' + btnStyle + '">Email</a></td>',
    '            </tr>',
    '          </table>',
    '        </td></tr>',
    '        <tr><td bgcolor="#0f0f12" style="background-color:#0f0f12;padding:20px 36px;border-top:1px solid #1f1f24;text-align:center;color:#71717a;font-size:12px;">',
    '          You received this email because you signed up at <a href="' + LANDING_PAGE_URL + '" style="color:#a855f7;text-decoration:none;">' + LANDING_PAGE_URL.replace(/^https?:\/\//, '') + '</a>.',
    '        </td></tr>',
    '      </table>',
    '    </td></tr>',
    '  </table>',
    '</body>',
    '</html>'
  ].join('\n');
}
