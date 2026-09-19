/* =========================================================
   VERITAS — Profile Avatar (Appwrite Storage)
   Loaded after app.js + appwrite-config.js.

   Unlike the app's original prototype (anonymous-auth-only),
   Veritas now has real email/password accounts, so the avatar
   pointer is NOT stored in localStorage — that would leak one
   account's avatar into another account signed in on the same
   browser. Instead this file treats window.DA.getCachedProfile()
   (app.js's server-synced profile cache) as the single source of
   truth for "which Appwrite file is my avatar," and persists
   changes to it through the SAME sync_profile channel app.js
   already uses for ELO/display name — see app.js section 17.

   Talks to app.js only through window.DA, exactly like
   multiplayer.js / ai-debate.js do for their own features.
   Exposes window.avatarRenderProfile so app.js can call it (a)
   when the Profile screen is shown, and (b) whenever a fresh
   profile arrives from the server — same guarded-bridge pattern
   already used for window.mpOpenLobby.
   ========================================================= */
(function () {
"use strict";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

let uploading = false;

function aw() { return window.avatarAppwrite; }

function currentFileId() {
  const p = window.DA && window.DA.getCachedProfile && window.DA.getCachedProfile();
  return p ? p.avatarFileId : null;
}

function previewUrl(fileId) {
  const a = aw();
  if (!a || !fileId) return null;
  const result = a.storage.getFilePreview({
    bucketId: a.bucketId,
    fileId: fileId,
    width: 200,
    height: 200,
    gravity: "center",
    quality: 90
  });
  // Different SDK builds return either a plain string or a URL-like
  // object here — normalize to a string either way.
  return typeof result === "string" ? result : result.toString();
}

/* ---------------------------------------------------------
   Render — called on init, whenever the Profile screen is
   shown, and whenever app.js pulls a fresh profile from the
   server (sign-in, sign-out, or the periodic fetch).
   --------------------------------------------------------- */

function renderAvatarProfile() {
  const wrap = document.getElementById("profile-avatar");
  const img = document.getElementById("profile-avatar-img");
  if (!wrap || !img) return; // markup not present — nothing to do

  const fileId = currentFileId();

  if (fileId && aw()) {
    const url = previewUrl(fileId);
    if (url) {
      img.src = url;
      img.classList.remove("hidden");
      wrap.classList.add("has-image");
    }
  } else {
    img.removeAttribute("src");
    img.classList.add("hidden");
    wrap.classList.remove("has-image");
  }

  const btn = document.getElementById("profile-avatar-edit-btn");
  if (btn) btn.classList.toggle("is-busy", uploading);
}

/* ---------------------------------------------------------
   Upload flow
   --------------------------------------------------------- */

async function handleFileSelected(file) {
  if (!file) return;

  if (!ALLOWED_TYPES.includes(file.type)) {
    window.DA.toast("Use a PNG, JPG, WEBP, or GIF image.");
    return;
  }
  if (file.size > MAX_BYTES) {
    window.DA.toast("Image is too large \u2014 5MB max.");
    return;
  }

  const a = aw();
  if (!a) {
    window.DA.toast("Avatar storage isn't available right now.");
    return;
  }
  if (!window.DA || !window.DA.getCachedProfile) {
    window.DA.toast("Sign in before setting an avatar.");
    return;
  }

  uploading = true;
  renderAvatarProfile();

  try {
    const uid = await a.ready;
    if (!uid) throw new Error("no appwrite session available");

    const profile = window.DA.getCachedProfile();
    const oldFileId = profile.avatarFileId;

    const created = await a.storage.createFile({
      bucketId: a.bucketId,
      fileId: Appwrite.ID.unique(),
      file: file,
      permissions: [
        Appwrite.Permission.read(Appwrite.Role.any()),
        Appwrite.Permission.update(Appwrite.Role.user(uid)),
        Appwrite.Permission.delete(Appwrite.Role.user(uid))
      ]
    });

    // Mutate the shared cachedProfile object directly (app.js hands us
    // the object by reference via getCachedProfile()), then push it to
    // the server immediately so it's not waiting on the next XP change.
    profile.avatarFileId = created.$id;
    await window.DA.pushProfile();

    if (oldFileId) {
      // Best-effort cleanup of the previous avatar file. A failed delete
      // (e.g. it belonged to a different browser's Appwrite session — see
      // README-AVATAR.md) should never block the new avatar from showing.
      a.storage.deleteFile({ bucketId: a.bucketId, fileId: oldFileId }).catch(() => {});
    }

    window.DA.toast("Avatar updated.");
  } catch (err) {
    console.error("Avatar upload failed:", err);
    window.DA.toast("Couldn't upload \u2014 try again.");
  }

  uploading = false;
  renderAvatarProfile();
}

/* ---------------------------------------------------------
   Wiring
   --------------------------------------------------------- */

function init() {
  const input = document.getElementById("profile-avatar-input");
  const btn = document.getElementById("profile-avatar-edit-btn");
  if (btn && input) {
    btn.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      handleFileSelected(file);
      input.value = ""; // allow re-selecting the same file next time
    });
  }
  renderAvatarProfile();
}

document.addEventListener("DOMContentLoaded", init);
if (document.readyState !== "loading") init();

/* ---------------------------------------------------------
   BRIDGE — small surface app.js calls into
   --------------------------------------------------------- */
window.avatarRenderProfile = renderAvatarProfile;

})();
