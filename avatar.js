/* Profile avatar storage backed by the authenticated user's private Supabase bucket. */
const AVATAR_BUCKET = "avatars";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
let uploading = false;

function avatarPath() {
  const profile = window.DA?.getCachedProfile?.();
  return profile?.avatarFileId || null;
}

async function renderAvatarProfile() {
  const wrap = document.getElementById("profile-avatar");
  const img = document.getElementById("profile-avatar-img");
  const monogram = document.getElementById("profile-avatar-monogram");
  const btn = document.getElementById("profile-avatar-edit-btn");
  if (!wrap || !img) return;
  const profile = window.DA?.getCachedProfile?.();
  const path = avatarPath();
  let url = null;
  if (path && window.VeritasApi?.isConfigured) {
    try { url = await window.VeritasApi.storageSignedUrl(AVATAR_BUCKET, path, 3600); }
    catch { url = null; }
  }
  img.onload = () => { img.classList.remove("hidden"); monogram?.classList.add("hidden"); };
  img.onerror = () => { img.classList.add("hidden"); monogram?.classList.remove("hidden"); };
  if (url) img.src = url;
  else { img.removeAttribute("src"); img.classList.add("hidden"); monogram?.classList.remove("hidden"); }
  if (monogram) monogram.textContent = (profile?.displayName || "D").trim()[0]?.toUpperCase() || "D";
  if (btn) btn.disabled = !window.VeritasApi?.isConfigured;
}

async function handleFileSelected(file) {
  if (!file) return;
  if (!ALLOWED_TYPES.includes(file.type)) return window.DA.toast("Use a PNG, JPG, WEBP, or GIF image.");
  if (file.size > MAX_BYTES) return window.DA.toast("Image is too large — 5MB max.");
  const user = await window.VeritasApi.currentUser();
  if (!user) return window.DA.toast("Sign in before setting an avatar.");
  if (uploading) return;
  uploading = true;
  const btn = document.getElementById("profile-avatar-edit-btn");
  if (btn) btn.disabled = true;
  const path = `${user.id}/avatar.${file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1]}`;
  try {
    await window.VeritasApi.storageUpload(AVATAR_BUCKET, path, file, {
      upsert: true, contentType: file.type, cacheControl: "3600"
    }, { timeoutMs: 30000, retrySafe: true, retries: 1 });
    const profile = window.DA.getCachedProfile();
    profile.avatarFileId = path;
    await window.DA.pushProfile();
    await renderAvatarProfile();
    window.DA.toast("Avatar updated.");
  } catch (error) {
    console.error("Avatar upload failed:", error);
    window.DA.toast("Couldn't upload — try again.");
  } finally {
    uploading = false;
    if (btn) btn.disabled = false;
  }
}

function initAvatar() {
  const input = document.getElementById("profile-avatar-input");
  const btn = document.getElementById("profile-avatar-edit-btn");
  if (!input || !btn || btn.dataset.avatarBound) return;
  btn.dataset.avatarBound = "true";
  btn.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    void handleFileSelected(input.files?.[0]);
    input.value = "";
  });
}

document.addEventListener("DOMContentLoaded", initAvatar);
if (document.readyState !== "loading") initAvatar();
window.avatarRenderProfile = renderAvatarProfile;
