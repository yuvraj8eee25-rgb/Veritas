import { defineConfig } from "vite";

function appShellWorker() {
  return {
    name: "veritas-app-shell-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const bundled = Object.values(bundle)
        .filter(file => file.type === "chunk" || (file.type === "asset" && /\.(css|svg|webp|png|woff2?)$/i.test(file.fileName)))
        .map(file => `/${file.fileName}`);
      const shell = ["/", "/index.html", "/manifest.webmanifest", "/icons/veritas.svg", "/icons/veritas-192.png", "/icons/veritas-512.png", ...bundled];
      const sw = `const CACHE_NAME = "veritas-shell-${process.env.npm_package_version || "1"}";\nconst SHELL = ${JSON.stringify([...new Set(shell)])};\n` +
        `const PRIVATE = /\\/(?:rest\\/v1|auth\\/v1|functions\\/v1|realtime\\/v1|storage\\/v1)(?:\\/|$)/;\n` +
        `self.addEventListener("install", event => event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL))));\n` +
        `self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("veritas-shell-") && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())));\n` +
        `self.addEventListener("fetch", event => { const req=event.request, url=new URL(req.url); if(req.method!=="GET"||url.origin!==self.location.origin||PRIVATE.test(url.pathname))return; if(req.mode!=="navigate"&&!SHELL.includes(url.pathname))return; event.respondWith(caches.match(req,{ignoreSearch:true}).then(hit=>hit||fetch(req).then(res=>{if(res.ok&&res.type==="basic"){const copy=res.clone();caches.open(CACHE_NAME).then(cache=>cache.put(req,copy));}return res;}).catch(()=>caches.match("/index.html")))); });\n` +
        `self.addEventListener("message", event => { if(event.data==="SKIP_WAITING") self.skipWaiting(); });\n`;
      this.emitFile({ type: "asset", fileName: "sw.js", source: sw });
    }
  };
}

export default defineConfig({
  appType: "spa",
  build: { outDir: "dist", emptyOutDir: true },
  plugins: [appShellWorker()]
});
