// Shared config for the Musicaa waitlist site.
// Loaded by both index.html and survey/index.html via a plain <script> tag
// (executes synchronously before the module scripts run, so the global is
// available when imports resolve).
//
// To rotate the Apps Script URL after a redeploy, change it here ONLY.
// META_PIXEL_ID is public by design (every Pixel-using site embeds it in
// page source); the matching CAPI access token is the actual secret and
// lives only in Apps Script Script Properties.
window.MUSICAA_CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyK4Zn7XetPHnxXw2QNXkcIYV1cxsMuCjtoPbMkGhpkVTmpEOXOY28MCOG3xZdU0Lgq/exec',
  META_PIXEL_ID: '1527680395728389',
};
