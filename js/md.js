// md.js: F.md, a small markdown renderer for the lesson notes
// (ALEX-SESSION-*_formatted.md). Pure string work, no DOM, so node tests load it.
//
// It handles what those files use: ATX headings, paragraphs (each source line
// break is kept as a <br>), ---, > blockquotes (nested blocks inside), - and 1.
// lists, pipe tables with :--: alignment, ``` fences, `code`, **bold**,
// *italic*. Everything else is shown as text. All source text is HTML-escaped,
// so a notes file can never inject markup.
//
// Persian: every run of Persian letters is wrapped in
// <span class="fa" lang="fa" dir="rtl"> (dir makes it a bidi isolate), so
// mixed English/Persian lines read in the right order. A line with no Latin
// letters is wrapped whole, so its punctuation sits on the Persian side; a
// table cell or paragraph with no Latin letters gets dir="rtl" itself.
//
// F.md.render(src, {idPrefix}) -> {html, headings: [{level, text, id}], units: [{text, heading}]}
//   Every heading, paragraph, list item, table row and code block is a "unit"
//   carrying data-u="<index>"; units[] holds its plain text for search.
// F.md.norm(s) / F.md.normMap(s) -> folded text for matching (and the index map).
(function (root) {
  'use strict';
  const F = root.F = root.F || {};

  const FA = '\\u0600-\\u06FF\\u0750-\\u077F\\uFB50-\\uFDFF\\uFE70-\\uFEFF';
  const FA_CHAR = new RegExp(`[${FA}]`);
  // A Persian run: Persian letters, allowing spaces, ZWNJ, hyphens (letter
  // breakdowns like ب-ا-ل-ا), Persian commas and guillemets between them.
  const FA_RUN = new RegExp(`[${FA}](?:[${FA}\\u200C\\u200D]|[ \\u00A0\\u200C\\-،؛«»]+(?=[${FA}]))*`, 'g');
  const LATIN = /[A-Za-zÀ-ɏḀ-ỿ]/;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Wrap Persian runs in the text parts of an HTML string we built ourselves
  // (source < and > are already escaped, so every < here is one of our tags).
  function wrapFa(html) {
    return html.replace(/(<[^>]*>)|([^<]+)/g, (m, tag, text) =>
      tag || text.replace(FA_RUN, r => `<span class="fa" lang="fa" dir="rtl">${r}</span>`));
  }

  // Strip markdown inline markers for plain text (search, alt checks).
  function plainInline(s) {
    return s.replace(/`([^`]*)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*\s][^*]*)\*/g, '$1');
  }

  function isPersianOnly(text) { return FA_CHAR.test(text) && !LATIN.test(text); }

  // One line of inline markdown -> HTML (escaped, emphasis, code, Persian runs).
  function inlineLine(src) {
    const parts = src.split(/(`[^`]+`)/);
    let out = '';
    for (const p of parts) {
      if (p.length > 1 && p[0] === '`' && p[p.length - 1] === '`') {
        out += `<code>${wrapFa(esc(p.slice(1, -1)))}</code>`;
      } else {
        let h = esc(p);
        h = h.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
        h = h.replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\w)/g, '$1<em>$2</em>');
        out += wrapFa(h);
      }
    }
    if (isPersianOnly(plainInline(src))) out = `<span class="fa-line" dir="rtl" lang="fa">${out}</span>`;
    return out;
  }

  // Several source lines (a paragraph, list item, cell) -> HTML joined by <br>.
  function inline(lines) {
    return lines.map(l => inlineLine(l.replace(/\s+$/, ''))).join('<br>');
  }

  const RE = {
    heading: /^(#{1,6})\s+(.*?)\s*#*\s*$/,
    hr: /^\s{0,3}([-*_])(\s*\1){2,}\s*$/,
    fence: /^\s{0,3}(```|~~~)/,
    quote: /^\s{0,3}>\s?/,
    list: /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/,
    delim: /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/,
  };

  function splitRow(line) {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
    const cells = [];
    let cur = '';
    let code = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
      if (c === '`') code = !code;
      if (c === '|' && !code) { cells.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    cells.push(cur.trim());
    return cells;
  }

  function isTableStart(lines, i) {
    return lines[i].includes('|') && i + 1 < lines.length && RE.delim.test(lines[i + 1]) && lines[i + 1].includes('-');
  }

  function startsBlock(lines, i) {
    const l = lines[i];
    return RE.heading.test(l) || RE.hr.test(l) || RE.fence.test(l) || RE.quote.test(l)
      || RE.list.test(l) || isTableStart(lines, i);
  }

  function render(src, opts) {
    opts = opts || {};
    const prefix = opts.idPrefix || 'n';
    const headings = [];
    const units = [];
    let curHeading = '';

    function unit(text, extra) {
      units.push(Object.assign({ text: text.replace(/\s+/g, ' ').trim(), heading: curHeading }, extra));
      return units.length - 1;
    }

    function blocks(lines) {
      let out = '';
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) { i++; continue; }

        // fenced code
        const fm = line.match(RE.fence);
        if (fm) {
          const body = [];
          i++;
          while (i < lines.length && !lines[i].trim().startsWith(fm[1])) body.push(lines[i++]);
          i++;
          const text = body.join('\n');
          const fa = isPersianOnly(text) ? ' dir="rtl" lang="fa"' : '';
          const u = unit(text);
          out += `<pre class="md-pre" data-u="${u}"${fa}><code>${wrapFa(esc(text))}</code></pre>`;
          continue;
        }

        // heading
        const hm = line.match(RE.heading);
        if (hm) {
          const level = hm[1].length;
          const text = plainInline(hm[2]);
          const id = `${prefix}-h${headings.length}`;
          headings.push({ level, text, id });
          if (level === 1) curHeading = ''; else if (level <= 3) curHeading = text;
          const u = unit(text, { isHeading: true });
          out += `<h${level} id="${id}" class="md-h" data-u="${u}">${inlineLine(hm[2])}</h${level}>`;
          i++;
          continue;
        }

        if (RE.hr.test(line)) { out += '<hr>'; i++; continue; }

        // blockquote (contents are parsed as blocks)
        if (RE.quote.test(line)) {
          const body = [];
          while (i < lines.length && RE.quote.test(lines[i])) body.push(lines[i++].replace(RE.quote, ''));
          out += `<blockquote>${blocks(body)}</blockquote>`;
          continue;
        }

        // table
        if (isTableStart(lines, i)) {
          const head = splitRow(lines[i]);
          const align = splitRow(lines[i + 1]).map(c => {
            const l = c.startsWith(':');
            const r = c.endsWith(':');
            return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
          });
          i += 2;
          const rows = [];
          while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(splitRow(lines[i++]));
          const cell = (tag, txt, k) => {
            const fa = isPersianOnly(plainInline(txt));
            let a = align[k] || '';
            if (fa && (a === 'left' || a === '')) a = 'start';
            const style = a ? ` style="text-align:${a}"` : '';
            return `<${tag}${style}${fa ? ' dir="rtl" lang="fa" class="fa-cell"' : ''}>${inlineLine(txt)}</${tag}>`;
          };
          const hu = unit(head.map(plainInline).join(' · '), { isRow: true, cells: head.map(plainInline) });
          let t = `<div class="md-table-wrap"><table class="md-table"><thead><tr data-u="${hu}">`
            + head.map((c, k) => cell('th', c, k)).join('') + '</tr></thead><tbody>';
          for (const r of rows) {
            while (r.length < head.length) r.push('');
            const cells = r.slice(0, head.length);
            const u = unit(cells.map(plainInline).filter(Boolean).join(' · '), { isRow: true, cells: cells.map(plainInline) });
            t += `<tr data-u="${u}">` + cells.map((c, k) => cell('td', c, k)).join('') + '</tr>';
          }
          out += t + '</tbody></table></div>';
          continue;
        }

        // list (flat; indented lines continue the current item)
        const lm = line.match(RE.list);
        if (lm) {
          const ordered = /\d/.test(lm[2]);
          const start = ordered ? parseInt(lm[2], 10) : 1;
          const items = [];
          while (i < lines.length) {
            const m = lines[i].match(RE.list);
            if (m && /\d/.test(m[2]) === ordered) { items.push([m[3]]); i++; continue; }
            if (m || !lines[i].trim()) break;
            if (/^\s+\S/.test(lines[i]) && items.length && !startsBlock(lines, i)) {
              items[items.length - 1].push(lines[i].trim()); i++; continue;
            }
            break;
          }
          const tag = ordered ? 'ol' : 'ul';
          out += `<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>`;
          for (const it of items) {
            const plain = plainInline(it.join(' '));
            const u = unit(plain);
            out += `<li data-u="${u}"${isPersianOnly(plain) ? ' dir="rtl" lang="fa"' : ''}>${inline(it)}</li>`;
          }
          out += `</${tag}>`;
          continue;
        }

        // paragraph: until a blank line or the start of another block
        const para = [];
        while (i < lines.length && lines[i].trim() && (para.length === 0 || !startsBlock(lines, i))) para.push(lines[i++]);
        const plain = plainInline(para.join('\n'));
        const u = unit(plain);
        out += `<p data-u="${u}"${isPersianOnly(plain) ? ' dir="rtl" lang="fa"' : ''}>${inline(para)}</p>`;
      }
      return out;
    }

    const lines = String(src).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
    const html = blocks(lines);
    return { html, headings, units };
  }

  // ---------- Matching ----------
  // Fold text for search: lower case, Latin accents off (ā -> a), Arabic
  // diacritics and ZWNJ/tatweel off, Arabic yeh/kaf -> Persian, markdown
  // markers off, whitespace collapsed. normMap also returns, for each folded
  // character, the index of the source character it came from.
  const DROP = /[̀-ًͯ-ٰٟـ‌‍‎‏*`|_]/;
  const MAP = { 'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'ة': 'ه', 'ۀ': 'ه', 'أ': 'ا', 'إ': 'ا', 'ٱ': 'ا', '’': "'", '‘': "'" };

  function normMap(s) {
    s = String(s);
    let n = '';
    const map = [];
    for (let i = 0; i < s.length; i++) {
      const parts = s[i].normalize('NFD');
      for (let ch of parts) {
        if (DROP.test(ch)) continue;
        ch = MAP[ch] || ch.toLowerCase();
        if (/\s/.test(ch)) {
          if (!n.length || n[n.length - 1] === ' ') continue;
          ch = ' ';
        }
        n += ch;
        map.push(i);
      }
    }
    if (n.endsWith(' ')) { n = n.slice(0, -1); map.pop(); }
    return { n, map };
  }
  function norm(s) { return normMap(s).n; }

  F.md = { render, norm, normMap, esc, isPersianOnly, hasPersian: s => FA_CHAR.test(s) };
})(typeof window !== 'undefined' ? window : globalThis);
