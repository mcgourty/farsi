// sw.js: offline app shell. No build step: the asset list is discovered at
// install time from index.html (<script src>, <link href>) plus STATIC below,
// and from the url()s of every precached stylesheet (the fonts).
//
// VERSION is a hash of the shell files, written by `node tools/bump-sw-version.js`.
// Any change to sw.js makes the browser install the new worker in the
// background; js/pwa.js then shows "Update ready · Reload". The page never
// reloads by itself. tools/test.js fails if VERSION is stale.
'use strict';

const VERSION = '684b2c4e1aeb';
const SHELL = 'farsi-shell-' + VERSION;
const RUNTIME = 'farsi-runtime';   // stale-while-revalidate, survives versions

// Shell files index.html does not reference directly.
const STATIC = [
  './',
  'index.html',
  'flashcards.html',
  'manifest.webmanifest',
  'js/legacy-keys.js',              // loaded lazily by the v1 migration
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/favicon.ico',
  'icons/favicon-32.png',
  'css/fonts.css',
];

const SCOPE = new URL('./', self.location).href;
const sameOrigin = (u) => u.origin === self.location.origin;

// Relative, same-origin <script src> and <link href> values in index.html.
// tools/bump-sw-version.js uses the same two patterns; keep them in step.
const SRC_RE = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
const HREF_RE = /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
const URL_RE = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;

function matches(re, text) {
  const out = [];
  for (const m of text.matchAll(re)) out.push(m[1]);
  return out;
}

async function fetchFresh(url) {
  const res = await fetch(url, { cache: 'reload' });
  if (!res.ok) throw new Error(res.status + ' ' + url);
  return res;
}

async function precache() {
  const cache = await caches.open(SHELL);
  const index = await fetchFresh(new URL('index.html', SCOPE));
  const html = await index.clone().text();
  await cache.put(new URL('index.html', SCOPE).href, index.clone());
  await cache.put(SCOPE, index);

  const urls = new Set();
  for (const p of [...STATIC, ...matches(SRC_RE, html), ...matches(HREF_RE, html)]) {
    const u = new URL(p, SCOPE);
    if (sameOrigin(u) && u.href !== SCOPE) urls.add(u.href.split('#')[0]);
  }
  urls.delete(new URL('index.html', SCOPE).href);

  const failed = [];
  const store = async (href) => {
    try {
      const res = await fetchFresh(href);
      if (/text\/css/.test(res.headers.get('content-type') || '') || href.endsWith('.css')) {
        const css = await res.clone().text();
        const nested = matches(URL_RE, css)
          .filter((p) => !p.startsWith('data:'))
          .map((p) => new URL(p, href))
          .filter((u) => sameOrigin(u) && !urls.has(u.href));
        for (const u of nested) urls.add(u.href);
        await Promise.all(nested.map((u) => store(u.href)));
      }
      await cache.put(href, res);
    } catch (e) {
      failed.push(href);
    }
  };
  await Promise.all([...urls].map(store));
  // A missing optional file must not block the update; a missing script is
  // worth failing for, so the old, working version stays in charge.
  const fatal = failed.filter((h) => h.endsWith('.js') && !h.endsWith('legacy-keys.js'));
  if (fatal.length) throw new Error('precache failed: ' + fatal.join(', '));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
  // No skipWaiting here: the new version waits until the page says so
  // (message 'skip-waiting' from js/pwa.js) or every tab is closed.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('farsi-shell-') && key !== SHELL) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'skip-waiting') self.skipWaiting();
  if (msg.type === 'version' && event.ports[0]) event.ports[0].postMessage({ version: VERSION });
});

async function fromShell(request, options) {
  const cache = await caches.open(SHELL);
  return cache.match(request, options);
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(event.request);
  const network = fetch(event.request).then((res) => {
    if (res.ok && res.type === 'basic') cache.put(event.request, res.clone());
    return res;
  });
  if (cached) {
    event.waitUntil(network.catch(() => {}));
    return cached;
  }
  return network;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!sameOrigin(url) || !url.href.startsWith(SCOPE)) return;

  if (req.mode === 'navigate') {
    // The app is one page: the scope root, index.html (any query/hash) and
    // unknown paths get the cached index.html. flashcards.html is its own file.
    event.respondWith((async () => {
      const path = url.pathname;
      const isApp = url.href.split(/[?#]/)[0] === SCOPE || path.endsWith('/index.html');
      if (!isApp) {
        const hit = await fromShell(req, { ignoreSearch: true });
        if (hit) return hit;
        try { return await fetch(req); } catch (e) { /* offline: fall through */ }
      }
      return (await fromShell(new URL('index.html', SCOPE).href)) || fetch(req);
    })());
    return;
  }

  event.respondWith((async () => {
    const hit = await fromShell(req);
    return hit || staleWhileRevalidate(event);
  })());
});
