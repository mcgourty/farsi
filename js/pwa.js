// pwa.js: registers sw.js (offline app shell) and shows a non-blocking
// "Update ready · Reload" banner when a new deploy has been downloaded.
// It never reloads on its own: the new version takes over only when the
// user taps Reload (or after every window of the app has been closed).
//
// F.pwa: { supported, status, version(), checkForUpdate(), applyUpdate() }
//   status: 'off' | 'installing' | 'ready' (offline-capable) | 'update' (new version waiting)
//   hook 'pwa:update' fires when an update is waiting; 'pwa:ready' when the shell is cached.
(function (root) {
  'use strict';
  const F = root.F = root.F || {};
  const nav = root.navigator;
  const supported = !!(nav && 'serviceWorker' in nav) && /^https?:$/.test(root.location.protocol);
  const emit = (name, data) => { if (F.hooks && F.hooks.emit) F.hooks.emit(name, data); };

  let reg = null;
  let reloading = false;
  let userAsked = false;
  let lastCheck = 0;

  const pwa = F.pwa = {
    supported,
    status: supported ? 'installing' : 'off',

    // Asks the active worker for its VERSION (resolves null without one).
    version() {
      const sw = nav.serviceWorker && nav.serviceWorker.controller;
      if (!sw) return Promise.resolve(null);
      return new Promise((resolve) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (e) => resolve(e.data && e.data.version);
        sw.postMessage({ type: 'version' }, [ch.port2]);
        setTimeout(() => resolve(null), 1500);
      });
    },

    // Looks for a new sw.js (at most once a minute unless forced).
    checkForUpdate(force) {
      if (!reg || (!force && Date.now() - lastCheck < 60e3)) return Promise.resolve();
      lastCheck = Date.now();
      return reg.update().catch(() => {});
    },

    // Activates the waiting version and reloads once it has taken over.
    applyUpdate() {
      if (!reg || !reg.waiting) { root.location.reload(); return; }
      userAsked = true;
      reg.waiting.postMessage({ type: 'skip-waiting' });
    },
  };

  function banner() {
    let el = document.getElementById('pwa-update');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'pwa-update';
    el.className = 'pwa-update';
    el.setAttribute('role', 'status');
    el.innerHTML =
      '<span class="pwa-update-text">Update ready</span>' +
      '<button type="button" class="pwa-update-btn" data-pwa="reload">Reload</button>' +
      '<button type="button" class="pwa-update-close" data-pwa="later" aria-label="Later">×</button>';
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pwa]');
      if (!b) return;
      if (b.dataset.pwa === 'reload') {
        b.disabled = true;
        // Flush pending store writes before the page goes away.
        if (F.store && F.store.flush) { try { F.store.flush(); } catch (err) { /* ignore */ } }
        pwa.applyUpdate();
      } else {
        el.hidden = true;
      }
    });
    document.body.appendChild(el);
    return el;
  }

  function updateWaiting() {
    pwa.status = 'update';
    banner().hidden = false;
    emit('pwa:update', {});
  }

  function watch(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state !== 'installed') return;
      // With a controller this is an update; without one it is the first install.
      if (nav.serviceWorker.controller) updateWaiting();
      else { pwa.status = 'ready'; emit('pwa:ready', {}); }
    });
  }

  if (!supported) return;

  nav.serviceWorker.addEventListener('controllerchange', () => {
    // First install claims the page: nothing to reload. After an update the
    // reload happens only because the user tapped Reload.
    if (!userAsked || reloading) return;
    reloading = true;
    root.location.reload();
  });

  root.addEventListener('load', () => {
    nav.serviceWorker.register('sw.js', { scope: './' }).then((r) => {
      reg = r;
      if (r.waiting && nav.serviceWorker.controller) updateWaiting();
      else if (r.active) { pwa.status = 'ready'; emit('pwa:ready', {}); }
      watch(r.installing);
      r.addEventListener('updatefound', () => watch(r.installing));
    }).catch(() => { pwa.status = 'off'; });
  });

  // Home-screen apps stay alive for days: look for a deploy when brought back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pwa.checkForUpdate();
  });
})(typeof window !== 'undefined' ? window : globalThis);
