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
  // Parse the body once and branch by request type. The same Web app URL
  // handles both the email signup ('signup' or no type) and the survey.
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ success: false, message: 'Invalid request body.' });
  }

  if (body && body.type === 'survey') {
    return handleSurvey(body);
  }

  const email = (body.email || '').toString().trim().toLowerCase();
  if (!isValidEmail(email)) {
    return jsonResponse({ success: false, message: 'Invalid email address.' });
  }

  // Serialize the read-then-write critical section so two near-simultaneous
  // POSTs of the same email can't both pass the dup check and both append.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); // up to 15s; plenty for the typical few-ms write
  } catch (lockErr) {
    Logger.log('Lock timeout: ' + lockErr);
    return jsonResponse({ success: false, message: 'Server is busy. Try again.' });
  }

  try {
    const sheet = getSubscriberSheet();
    if (!sheet) {
      return jsonResponse({ success: false, message: 'Sheet "' + SPREADSHEET_NAME + '" not found. Bind this script to the correct spreadsheet.' });
    }

    // Silent dedup: if the email is already on the list, skip the appendRow
    // AND skip the email send, but still return success to the user. The
    // frontend always shows the success modal regardless.
    const lastRow = sheet.getLastRow();
    let alreadyOnList = false;
    if (lastRow > 1) {
      const emails = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < emails.length; i++) {
        if ((emails[i][0] || '').toString().trim().toLowerCase() === email) {
          alreadyOnList = true;
          break;
        }
      }
    }

    if (!alreadyOnList) {
      sheet.appendRow([email, new Date(), 'confirmed']);
      SpreadsheetApp.flush();
    }

    // Stash whether we should send an email — used after the lock releases.
    // (We can't return early here because we need to release the lock first.)
    e.__shouldSendEmail = !alreadyOnList;
  } catch (err) {
    Logger.log('Error in critical section: ' + err);
    return jsonResponse({ success: false, message: 'Server error. Try again.' });
  } finally {
    lock.releaseLock();
  }

  if (e.__shouldSendEmail) {
    try {
      sendConfirmationEmail(email);
    } catch (mailErr) {
      Logger.log('Email send failed for ' + email + ': ' + mailErr);
    }
  }

  return jsonResponse({ success: true });
}

/**
 * Run from the Apps Script editor to enumerate any triggers attached to this
 * project. Useful for debugging "extra emails" — if anything other than your
 * doPost is firing, it'll show up here. Delete unwanted ones in the Triggers
 * tab (clock icon in the left sidebar of the editor).
 */
function listProjectTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  Logger.log('Total triggers: ' + triggers.length);
  triggers.forEach((t, i) => {
    Logger.log((i + 1) + '. handler=' + t.getHandlerFunction()
      + ' / event=' + t.getEventType()
      + ' / source=' + t.getTriggerSource());
  });
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

/**
 * Survey responses go into columns 4-6 of the SAME ROW as the user's email
 * in the main waitlist sheet (Music Provider | Provider Other | Rating).
 * Empty fields are written as blanks (incomplete submissions are allowed).
 * If the email isn't found (or is empty — direct visit to /survey), we
 * silently no-op and still return success so the UI flows normally.
 */
function handleSurvey(body) {
  const sheet = getSubscriberSheet();
  if (!sheet) {
    return jsonResponse({ success: false, message: 'Sheet "' + SPREADSHEET_NAME + '" not found.' });
  }

  const email = (body.email || '').toString().trim().toLowerCase();
  const provider = (body.musicProvider || '').toString().trim();
  const providerOther = (body.providerOther || '').toString().trim();
  const ratingRaw = body.findNewMusicRating;
  const rating = (ratingRaw === '' || ratingRaw == null) ? '' : parseInt(ratingRaw, 10);

  if (!email) {
    // No email to link with (direct visit). Nothing to update; just succeed.
    return jsonResponse({ success: true });
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (lockErr) {
    Logger.log('Survey lock timeout: ' + lockErr);
    return jsonResponse({ success: false, message: 'Server busy. Try again.' });
  }

  try {
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const emails = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < emails.length; i++) {
        if ((emails[i][0] || '').toString().trim().toLowerCase() === email) {
          // Found the row — write provider, providerOther, rating into cols D, E, F.
          sheet.getRange(i + 2, 4, 1, 3).setValues([[provider, providerOther, rating]]);
          SpreadsheetApp.flush();
          break;
        }
      }
      // If not found, silently no-op. User sees success regardless.
    }
  } catch (err) {
    Logger.log('Survey update failed for ' + email + ': ' + err);
    // Don't surface to user — they've already seen the success modal.
  } finally {
    lock.releaseLock();
  }

  return jsonResponse({ success: true });
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
  // Share button routes through the landing page so we can copy to clipboard
  // there (emails can't run JS). The page detects the `#share` hash on load
  // and auto-copies the URL with a "Link copied!" toast.
  const shareUrl = LANDING_PAGE_URL + '#share';
  const shareBtnStyle = 'display:inline-block;padding:13px 30px;background-color:#1a1029;border:1px solid #3b1d4f;border-radius:11px;color:#c4b5fd;font-size:14px;font-weight:600;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;';

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
    '          <p style="margin:0 0 14px 0;color:#ffffff;">We\'re building ' + APP_NAME + ' to surface the actual unique ones based on your taste, not what everyone else is listening to.</p>',
    '          <p style="margin:0;color:#c4b5fd;">We\'ll email you the moment early access opens.</p>',
    '        </td></tr>',
    '        <tr><td bgcolor="#0f0f12" style="background-color:#0f0f12;padding:8px 36px 32px 36px;text-align:center;border-top:1px solid #1f1f24;">',
    '          <p style="margin:18px 0 14px 0;color:#a1a1aa;font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;">Help us spread the word</p>',
    '          <a href="' + shareUrl + '" style="' + shareBtnStyle + '">Share Musicaa</a>',
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
