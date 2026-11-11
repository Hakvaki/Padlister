// Optional shared database for live multi-device scoring on the static
// GitHub Pages build. Set PADEL_DB_URL to your Firebase Realtime Database
// URL (see README) and commit this file; leave empty to play per-device.
// The database URL is not a secret — access is controlled by the database
// rules in your Firebase project.
window.PADEL_DB_URL = "https://padlister-f87f6-default-rtdb.europe-west1.firebasedatabase.app";

// Optional host restriction: only devices that know the host code can start
// or end a tournament. Put the SHA-256 hex of your secret code here, e.g. run:
//   node -e "console.log(require('crypto').createHash('sha256').update('YOUR-CODE').digest('hex'))"
// Leave empty to disable the host check.
window.PADEL_HOST_CODE_HASH = "6832af1c7dbb9090c2a40c2863fd74dbfccd10cdaee0e65a5dadee669df97205";
