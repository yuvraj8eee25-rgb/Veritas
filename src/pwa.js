function announce(text) {
  const status = document.getElementById("pwa-status");
  if (!status) return;
  status.replaceChildren(document.createTextNode(text));
  if (text.includes("update")) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Update now";
    button.addEventListener("click", () => {
      window.__veritasWaitingWorker?.postMessage("SKIP_WAITING");
      button.disabled = true;
    });
    status.append(" ", button);
  }
  status.hidden = false;
}

window.addEventListener("offline", () => announce("You’re offline. Your saved practice and app shell are still available."));
if (!navigator.onLine) announce("You’re offline. Your saved practice and app shell are still available.");
window.addEventListener("online", () => {
  const status = document.getElementById("pwa-status");
  if (status && !status.querySelector("button")) status.hidden = true;
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const announceUpdate = () => {
        if (registration.waiting) {
          window.__veritasWaitingWorker = registration.waiting;
          announce("A Veritas update is ready.");
        }
      };
      announceUpdate();
      registration.addEventListener("updatefound", () => {
        registration.installing?.addEventListener("statechange", () => {
          if (registration.installing?.state === "installed" && navigator.serviceWorker.controller) announceUpdate();
        });
      });
      navigator.serviceWorker.addEventListener("controllerchange", () => location.reload());
      window.setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
    } catch {
      // Offline support is progressive enhancement and must not interrupt use.
    }
  }, { once: true });
}
