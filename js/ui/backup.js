// ui/backup.js: backup and restore UI (#backup-panel, inside the settings
// area) and the gentle reminder (#backup-reminder) after a week without one.
// The data side lives in F.store.backup.
(function (root) {
  'use strict';
  const F = root.F;
  const U = F.util;
  const $ = id => document.getElementById(id);
  const DAY = 86400000;
  const REMIND_AFTER_DAYS = 7;
  const SNOOZE_DAYS = 3;

  const ui = {
    preview: null,      // inspected backup awaiting confirmation
    ready: null,        // {blob, name} prepared when sharing needs a second tap
    message: '',        // last result line
    busy: false,
  };

  function ago(ts) {
    if (!ts) return 'never';
    const days = Math.floor((Date.now() - ts) / DAY);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    return `${days} days ago`;
  }
  function fmtDate(ts) {
    if (!ts) return 'unknown date';
    try { return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch (e) { return new Date(ts).toISOString().slice(0, 10); }
  }
  const n = x => Number(x || 0).toLocaleString();
  const progressCount = () => Object.keys(F.store.data.srs).length;

  function render() {
    const el = $('backup-panel');
    if (!el) return;
    const meta = F.store.data.meta;
    const cards = progressCount();
    let html = '<label>Backup</label>'
      + `<p class="backup-line">Last backup: <strong>${ago(meta.lastBackupAt)}</strong> &middot; ${n(cards)} card${cards === 1 ? '' : 's'} with progress on this device.</p>`
      + '<div class="backup-acts">'
      + `<button type="button" class="action-btn" data-action="backup-export"${ui.busy ? ' disabled' : ''}>Export backup</button>`
      + `<button type="button" class="action-btn" data-action="backup-pick"${ui.busy ? ' disabled' : ''}>Restore from file</button>`
      + '<input type="file" id="backup-file" accept="application/json,.json" hidden>'
      + '</div>';
    if (ui.ready) {
      html += '<div class="backup-box"><p>Your backup is ready.</p><div class="backup-acts">'
        + '<button type="button" class="action-btn active" data-action="backup-share">Save to Files</button>'
        + '<button type="button" class="action-btn" data-action="backup-download">Download</button>'
        + '</div></div>';
    }
    if (ui.preview) html += previewHTML(ui.preview);
    if (ui.message) html += `<p class="backup-line backup-msg">${U.esc(ui.message)}</p>`;
    const st = F.store.status;
    if (st.migrated) {
      html += `<p class="backup-note">Your progress was moved to the new storage format on this visit (${n(st.migrated.srs)} reviewed cards).</p>`;
    }
    if (st.migrationError) {
      html += `<p class="backup-line backup-msg">Could not read your old progress: ${U.esc(st.migrationError)}. Nothing was changed; reload to try again.</p>`;
    }
    if (st.saveError) {
      html += `<p class="backup-line backup-msg">Saving failed: ${U.esc(st.saveError)}. Export a backup now.</p>`;
    }
    html += '<p class="backup-note">The home-screen app and Safari keep separate progress on iPhone. '
      + 'To move progress between them (or to a new phone), export a backup in one and restore it in the other.</p>';
    el.innerHTML = html;
    renderReminder();
  }

  function previewHTML(p) {
    const s = p.summary;
    const known = s.knownCards == null ? '' : ` (${n(s.knownCards)} in the current deck)`;
    const from = p.kind === 'v1' ? 'Progress saved by the old version of the app'
      : `Backup from ${fmtDate(Date.parse(s.exportedAt))}`;
    return '<div class="backup-box">'
      + `<p><strong>${from}</strong></p>`
      + '<ul class="backup-facts">'
      + `<li>${n(s.cards)} ${U.plural(s.cards, 'card')} with progress${known}</li>`
      + `<li>${n(s.reviews)} logged ${U.plural(s.reviews, 'review')}</li>`
      + `<li>${n(s.buried)} buried, last review ${s.lastReviewAt ? fmtDate(s.lastReviewAt) : 'never'}</li>`
      + '</ul>'
      + `<p>Restoring replaces the progress on this device (${n(progressCount())} cards). A safety copy of the current progress is kept on this device.</p>`
      + '<div class="backup-acts">'
      + `<button type="button" class="action-btn backup-danger" data-action="backup-confirm"${ui.busy ? ' disabled' : ''}>Replace my progress</button>`
      + '<button type="button" class="action-btn" data-action="backup-cancel">Cancel</button>'
      + '</div></div>';
  }

  // ---------- Reminder ----------
  function reminderDue() {
    const meta = F.store.data.meta;
    const cards = progressCount();
    if (!cards) return false;
    const now = Date.now();
    if (meta.backupSnoozedAt && now - meta.backupSnoozedAt < SNOOZE_DAYS * DAY) return false;
    if (!meta.lastBackupAt) return cards >= 20 || now - (meta.createdAt || now) > REMIND_AFTER_DAYS * DAY;
    return now - meta.lastBackupAt > REMIND_AFTER_DAYS * DAY;
  }
  function renderReminder() {
    const el = $('backup-reminder');
    if (!el) return;
    const due = reminderDue();
    el.hidden = !due;
    if (!due) { el.innerHTML = ''; return; }
    const last = F.store.data.meta.lastBackupAt;
    el.innerHTML = `<span>Your progress lives only on this device. Last backup: ${ago(last)}.</span>`
      + '<span class="backup-acts"><button type="button" class="mini" data-action="backup-export">Back up now</button>'
      + '<button type="button" class="mini" data-action="backup-snooze">Later</button></span>';
  }

  // ---------- Export ----------
  function blobFor(obj) {
    return new Blob([JSON.stringify(obj)], { type: 'application/json' });
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function canShareFile(blob, name) {
    try {
      const nav = root.navigator;
      const touch = root.matchMedia && root.matchMedia('(pointer: coarse)').matches;
      if (!touch || !nav.share || !nav.canShare || typeof File !== 'function') return false;
      return nav.canShare({ files: [new File([blob], name, { type: 'application/json' })] });
    } catch (e) { return false; }
  }
  function share(blob, name) {
    const file = new File([blob], name, { type: 'application/json' });
    return root.navigator.share({ files: [file], title: 'Farsi flashcards backup' });
  }
  function done(msg) {
    F.store.backup.markBackedUp();
    ui.ready = null;
    ui.message = msg;
    render();
  }

  function exportBackup() {
    ui.busy = true; ui.message = ''; ui.preview = null; render();
    F.store.backup.build().then(obj => {
      ui.busy = false;
      const name = F.store.backup.fileName();
      const blob = blobFor(obj);
      if (canShareFile(blob, name)) {
        share(blob, name).then(() => done('Backup saved.'), e => {
          if (e && e.name === 'AbortError') { ui.message = 'Backup not saved.'; render(); return; }
          // Usually the tap "expired" while the backup was being built; a
          // second tap on a ready file shares straight away.
          ui.ready = { blob, name };
          render();
        });
        return;
      }
      download(blob, name);
      done(`Downloaded ${name}.`);
    }).catch(e => {
      ui.busy = false;
      ui.message = 'Export failed: ' + (e && e.message || e);
      render();
    });
  }

  // ---------- Import ----------
  function pickFile() {
    const input = $('backup-file');
    if (!input) return;
    input.value = '';
    input.click();
  }
  function onFile(file) {
    ui.message = ''; ui.preview = null; ui.ready = null;
    const reader = new FileReader();
    reader.onload = () => {
      let obj;
      try { obj = JSON.parse(reader.result); } catch (e) { ui.message = 'That file is not valid JSON.'; render(); return; }
      const res = F.store.backup.inspect(obj);
      if (!res.ok) { ui.message = res.error; render(); return; }
      ui.preview = res;
      render();
    };
    reader.onerror = () => { ui.message = 'Could not read that file.'; render(); };
    reader.readAsText(file);
  }
  function confirmImport() {
    if (!ui.preview) return;
    ui.busy = true; render();
    F.store.backup.apply(ui.preview).then(() => {
      ui.message = 'Progress restored. Reloading…';
      ui.preview = null;
      render();
      setTimeout(() => root.location.reload(), 600);
    }).catch(e => {
      ui.busy = false;
      ui.message = 'Restore failed: ' + (e && e.message || e);
      render();
    });
  }

  const A = F.actions;
  A.register('backup-export', () => exportBackup());
  A.register('backup-share', () => {
    if (!ui.ready) return;
    const { blob, name } = ui.ready;
    share(blob, name).then(() => done('Backup saved.'), e => {
      if (e && e.name === 'AbortError') return;
      download(blob, name);
      done(`Downloaded ${name}.`);
    });
  });
  A.register('backup-download', () => {
    if (!ui.ready) return;
    download(ui.ready.blob, ui.ready.name);
    done(`Downloaded ${ui.ready.name}.`);
  });
  A.register('backup-pick', () => pickFile());
  A.register('backup-confirm', () => confirmImport());
  A.register('backup-cancel', () => { ui.preview = null; ui.message = 'Restore cancelled.'; render(); });
  A.register('backup-snooze', () => {
    F.store.data.meta.backupSnoozedAt = Date.now();
    F.store.saveSoon();
    renderReminder();
  });

  document.addEventListener('change', e => {
    if (e.target && e.target.id === 'backup-file' && e.target.files && e.target.files[0]) onFile(e.target.files[0]);
  });

  // Keep the counts fresh without redrawing on every card: only on boot,
  // after a grade when the panel is visible, and when the view changes.
  F.hooks.on('boot', render);
  F.hooks.on('view:changed', render);
  F.hooks.on('card:graded', () => { if (!document.body.classList.contains('filters-collapsed')) render(); else renderReminder(); });

  F.backupUI = { render, renderReminder };
})(window);
