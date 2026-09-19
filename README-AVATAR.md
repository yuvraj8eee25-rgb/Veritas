# Profile Avatar (Appwrite Storage)

Files that power this feature:

| File | Purpose |
|---|---|
| `appwrite-config.js` | Appwrite client init + anonymous session |
| `avatar.js` | Upload handling, preview rendering |
| `index.html` | Appwrite CDN script tag + avatar markup on the Profile screen |
| `styles.css` | `.profile-avatar-*` rules |

`app.js` was edited in a few small places (all in existing, already-present
sections — nothing new was invented):
- `onScreenShown()` now calls `window.avatarRenderProfile()` (guarded) when
  the Profile screen is shown, same pattern as the existing
  `window.mpOpenLobby` call.
- `cachedProfile` gained one more field: `avatarFileId`.
- `fetchProfileFromServer()` now also selects the `progress` column and
  reads `avatarFileId` out of it, then calls `window.avatarRenderProfile()`
  once data lands.
- `pushProfileToServer()` now includes `avatarFileId` in the `progress`
  object it sends to `sync_profile`, so routine XP-triggered syncs never
  clobber it.
- The sign-out handler resets `cachedProfile.avatarFileId` and re-renders,
  same as it already did for `eloRating`/`wins`/etc.
- `window.DA` gained one new method: `pushProfile()`, a thin wrapper
  around the existing `pushProfileToServer()`, so `avatar.js` can trigger
  an immediate sync right after an upload instead of waiting for the next
  XP change.

## Why this isn't localStorage (and the earlier prototype version was)

This app used to be anonymous-auth-only, so "whichever browser you're in"
and "your account" were the same thing, and a localStorage-only avatar
pointer was fine. **That's no longer true** — Veritas now has real
email/password accounts with an actual Sign Out button, so more than one
account can use the same browser over time. A localStorage-based avatar
would leak between accounts (Account A's photo showing under Account B's
name) the moment someone signs out and back in as someone else on the
same machine.

So the avatar pointer now rides the exact same channel the ELO/display-
name sync already uses: `profiles.progress.avatarFileId`, written via the
existing `sync_profile` RPC (see `supabase/migrations/0006_reconcile_profiles.sql`)
and read back via the existing `fetchProfileFromServer()`. No new database
migration was needed — `progress` is a schemaless `jsonb` column that
already existed for exactly this kind of client-defined data.

**What this actually gets you:** sign in with the same account on a
different device/browser, and your avatar now follows you — a real
improvement over the prototype version, made possible by (and only
because) real accounts already exist in this codebase.

## 1. Create the Appwrite project

1. [cloud.appwrite.io](https://cloud.appwrite.io) → **Create project** (or
   self-host — see [appwrite/appwrite](https://github.com/appwrite/appwrite)).
2. Project **Settings** → copy your **Project ID** and **API Endpoint**
   (looks like `https://fra.cloud.appwrite.io/v1` — the region prefix
   varies) into `appwrite-config.js`, replacing the two placeholders.
3. **Settings → Domains / Platforms** → **Add platform** → **Web app** →
   enter the hostname you'll serve Veritas from (e.g. `localhost` for
   local dev, or your real domain). Without this, every request from the
   browser is blocked by Appwrite's CORS check.
4. **Auth → Settings** → enable **Anonymous sessions**. (Yes, even though
   Veritas itself now uses real accounts — this toggle is for Appwrite's
   *own*, separate anonymous session, used only to scope who can
   overwrite/delete a given avatar file. See "Two separate identity
   systems" below.)

## 2. Create the storage bucket

1. **Storage** → **Create bucket**.
2. Bucket ID: `avatars` (must match `APPWRITE_AVATARS_BUCKET_ID` in
   `appwrite-config.js` — change one or the other if you want a different
   name).
3. **File security**: turn ON (lets each file carry its own read/update/
   delete permissions instead of only bucket-wide ones — the app sets
   per-file permissions on every upload).
4. **Allowed file extensions**: `png, jpg, jpeg, webp, gif`.
5. **Maximum file size**: 5MB (matches `MAX_BYTES` in `avatar.js` — keep
   these in sync if you change one).
6. Permissions tab: leave bucket-level permissions empty — the app grants
   `read: any` + `update/delete: <uploader>` on each file individually at
   upload time.

## 3. Serve the app

Nothing extra beyond what `README-MULTIPLAYER.md` already documents — the
Appwrite CDN script and `appwrite-config.js`/`avatar.js` are just two more
static `<script>` tags in `index.html`. Deploy alongside the rest of the
files.

## Two separate identity systems — why, and the one trade-off

Appwrite is a completely independent backend from Supabase, with its own
auth. There's no built-in way to hand Appwrite a Supabase session and have
it recognize the same "user" — bridging the two would mean writing a
custom Appwrite Function to verify a Supabase JWT, a much bigger change
than this feature needs. So:

- **Which account owns which avatar** (the part that must survive
  sign-out/sign-in and cross-device) lives entirely in Supabase, via
  `profiles.progress.avatarFileId` — tied to your real account, same as
  your ELO and display name already are.
- **Who's allowed to overwrite/delete a specific file blob in Appwrite
  Storage** is scoped to Appwrite's own per-browser anonymous session —
  a much narrower, lower-stakes permission that doesn't need to know
  anything about your real account.

The one trade-off this creates: if you upload an avatar on Device A, then
sign into the same account on Device B and upload a *new* one, Device B's
Appwrite session can't delete Device A's old file (different Appwrite
anonymous identity), so upload still succeeds and the new avatar shows
correctly everywhere — the old file just becomes a harmless orphan sitting
in the bucket rather than being cleaned up. Not a bug, just a known
limitation of not building the full cross-backend identity bridge.

## How it works, end to end

1. `avatar.js` treats `window.DA.getCachedProfile().avatarFileId` — the
   same in-memory object `app.js` already syncs from `profiles.progress`
   — as the single source of truth. It never keeps its own separate copy.
2. Tapping the pencil badge on the Profile screen's avatar circle opens
   the native file picker.
3. On selection: client-side validation first (type must be PNG/JPG/WEBP/
   GIF, size ≤ 5MB) — cheap, immediate feedback via `toast()` before ever
   calling Appwrite.
4. Upload via `storage.createFile()` with per-file permissions: **read:
   anyone**, **update/delete: only this browser's Appwrite user id**.
5. On success: the new file's `$id` is written straight into the shared
   `cachedProfile` object, then `window.DA.pushProfile()` is called to
   sync it to Supabase immediately (piggybacking the existing
   `sync_profile` RPC other profile fields already use) — rather than
   waiting for the next incidental XP-triggered sync.
6. The `<img>` src is built via `storage.getFilePreview({bucketId,
   fileId, width:200, height:200, ...})`, Appwrite's built-in resize/crop
   endpoint — no separate thumbnail generation needed.
7. The previous file is best-effort deleted afterward (see the trade-off
   above for when this silently no-ops).

## Known limitations (by design, for this first pass)

- **Not shown anywhere else yet.** This pass only wires the avatar into
  the Profile screen, as scoped. It is NOT shown in the multiplayer debate
  room. That screen *already* fetches the opponent's `display_name` and
  `elo_rating` from `profiles` (see `multiplayer.js`), so showing their
  avatar too would be a natural, fairly small follow-up — just select
  `progress` alongside those columns and reuse `previewUrl()` — but it's a
  separate change, not included here.
- **No moderation/reporting on uploaded images.** Same class of gap
  already flagged for live-debate text in the project's audit notes —
  worth adding before any public rollout (Appwrite validates file
  type/size, not image *content*, out of the box).
- **Orphaned files on cross-device replacement** — see the trade-off
  section above. Cosmetic storage waste only, not a functional bug.
