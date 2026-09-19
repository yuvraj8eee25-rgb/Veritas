/* =========================================================
   APPWRITE CONFIG — profile avatar storage only
   Loaded after the Appwrite CDN script, before avatar.js.
   This is a SEPARATE backend/identity from Supabase — Appwrite's
   own anonymous session exists purely to scope file permissions
   (owner-only update/delete, public read) on the avatars bucket.

   It is intentionally NOT the same identity as the real Supabase
   email/password account this app now uses. The cross-device,
   cross-browser link for "whose avatar is this" is handled at a
   higher layer: the uploaded file's id is stored in the Supabase
   profiles.progress column (via the existing sync_profile RPC —
   see avatar.js + app.js's pushProfileToServer/fetchProfileFromServer),
   which IS tied to the real account. Appwrite's anonymous session
   only ever controls who's allowed to overwrite/delete a given
   file blob, never which account it "belongs to" — see
   README-AVATAR.md for the full reasoning and its one known
   trade-off (replacing an avatar from a different browser than
   the one that uploaded it still works, but can't delete the old
   file — a harmless orphan, not a bug).

   Replace the two placeholders below with your own Appwrite
   project's values (Appwrite Console -> your project -> Settings).
   ========================================================= */

const APPWRITE_ENDPOINT = "https://<REGION>.cloud.appwrite.io/v1"; // e.g. https://fra.cloud.appwrite.io/v1
const APPWRITE_PROJECT_ID = "<YOUR_APPWRITE_PROJECT_ID>";
const APPWRITE_AVATARS_BUCKET_ID = "avatars"; // must match the Bucket ID you create — see README-AVATAR.md

const awClient = new Appwrite.Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

const awAccount = new Appwrite.Account(awClient);
const awStorage = new Appwrite.Storage(awClient);

// Resolves with an Appwrite user id once a session exists (reusing one
// if this browser already has it, otherwise creating a fresh anonymous
// one) — or null if Appwrite is unreachable/misconfigured, so avatar.js
// can fail gracefully instead of hanging forever.
const awReady = new Promise((resolve) => {
  awAccount.get()
    .then((user) => resolve(user.$id))
    .catch(() => {
      awAccount.createAnonymousSession()
        .then((session) => resolve(session.userId))
        .catch((err) => {
          console.error("Appwrite anonymous session failed:", err);
          resolve(null);
        });
    });
});

window.avatarAppwrite = {
  client: awClient,
  account: awAccount,
  storage: awStorage,
  bucketId: APPWRITE_AVATARS_BUCKET_ID,
  ready: awReady
};
