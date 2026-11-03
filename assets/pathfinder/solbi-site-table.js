/* Solbi's single-site answer as tables (PC panel static/ai_assistant.js and the phone page templates/solbi_mobile.html).
   The server builds the data (pf_solbi.site_table → result.siteTable, pf_site_report.table): the 사업성 판정, score and lookup
   time; the 8 checks (or the roof's 4) as 항목 | 상태 | 핵심 값 with each row's long reasons and law text in a collapsible
   "근거 보기"; the PF(사업성) 요약 with the figures the PDF report of the same analysis prints. Every text is set with textContent
   (no HTML from the data) and read through check-wording.js (PFWording) when loaded. Under the PF table an empty
   <div class="pf-site-mail"> is left for the mail-report form (window.PFSiteMail.mount(slot, table, payload) when present).
   At phone widths the check rows stack (항목 + 상태, then the value) so nothing scrolls sideways. */
(function (root) {
  'use strict';
  var VERSION = 'site-table-v1';
  var STYLE_ID = 'pfst-style';
  var TONES = { pass: 1, warn: 1, fail: 1 };
  // The family theme of both surfaces (family-ui.css / family-mobile.css: white bubbles, --pf-ink text); fallbacks are its values.
  var CSS = [
    '.pfst{display:block;width:100%;max-width:100%;box-sizing:border-box;color:var(--pf-ink,#24292c);font-size:13px;line-height:1.55;white-space:normal;word-break:keep-all;overflow-wrap:anywhere}',
    '.pfst *{box-sizing:border-box}',
    '.pfst-head{margin:0 0 8px}',
    '.pfst-addr{font-weight:700;font-size:1.08em}',
    '.pfst-verdict{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:4px}',
    '.pfst-label{color:var(--pf-muted,#697478)}',
    '.pfst-score{font-weight:700}',
    '.pfst-meta{color:var(--pf-muted,#697478);font-size:.92em;margin-top:2px}',
    '.pfst-comment{margin:6px 0 0;color:var(--pf-muted,#697478);font-size:.95em}',
    '.pfst-warning{margin:6px 0 0;color:#8a5a00;font-size:.95em}',
    '.pfst-badge{display:inline-block;padding:1px 8px;border-radius:9999px;font-size:.9em;font-weight:700;border:1px solid transparent;white-space:normal;text-align:center}',
    '.pfst-badge.pfst-pass{background:#e8f6ef;color:#136c48;border-color:#b9e2cc}',
    '.pfst-badge.pfst-warn{background:#fff5e2;color:#8a5a00;border-color:#efd59f}',
    '.pfst-badge.pfst-fail{background:#fdeceb;color:#a3262a;border-color:#f1bdbd}',
    // font-size:inherit: the energy map's generic table{font-size:11px} (explore.css) must not shrink the answer table.
    '.pfst-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:10px 0 0;background:var(--pf-surface,#fff);font-size:inherit}',
    '.pfst-table caption{caption-side:top;text-align:left;font-weight:700;color:var(--pf-accent,#0e6b70);padding:2px 0 4px}',
    '.pfst-table th,.pfst-table td{border:1px solid var(--pf-line,#dfe5e5);padding:5px 6px;vertical-align:top;text-align:left}',
    '.pfst-table thead th{background:#edf3f3;color:#596b70;font-weight:600}',
    '.pfst-table tbody th{font-weight:700}',
    '.pfst-checks col.pfst-c1{width:27%}.pfst-checks col.pfst-c2{width:25%}',
    '.pfst-pf col.pfst-c1{width:36%}',
    '.pfst-value{font-weight:600}',
    '.pfst-note{color:var(--pf-muted,#697478);font-size:.9em;margin-top:2px}',
    '.pfst-more{margin-top:4px}',
    '.pfst-more summary{cursor:pointer;color:var(--pf-accent,#0e6b70);font-size:.92em;min-height:36px;display:flex;align-items:center;gap:4px;list-style:none}',
    '.pfst-more summary::before{content:"\u25b8";display:inline-block}',
    '.pfst-more[open] summary::before{content:"\u25be"}',
    '.pfst-more summary::-webkit-details-marker{display:none}',
    '.pfst-more ul{margin:4px 0 0;padding-left:16px}',
    '.pfst-more li{margin:2px 0;font-size:.92em}',
    '.pfst-more li.pfst-k-note{color:var(--pf-muted,#697478)}',
    '.pfst-notes{margin:6px 0 0;padding-left:16px;color:var(--pf-muted,#697478);font-size:.9em}',
    '.pfst-foot{margin:6px 0 0;color:var(--pf-muted,#697478);font-size:.9em}',
    '.pf-site-mail:empty{display:none}',
    '.pf-site-mail{margin-top:10px}',
    // Inside a liquid-glass surface (the PC Solbi drawer, family-glass.css): the tables are faint wells (no blur of their
    // own, SPEC D6), so the blurred map still shows through the whole drawer instead of a white slab; the inks are measured
    // on the .84 sheet plus the faint layer, and the amber texts use the glass review ink (>= 4.5:1 over any backdrop pixel).
    // Where the drawer has no blur (<= 700px) it is a .94 well itself, so nothing ghosts behind the rows.
    '.pf-glass .pfst-table{background:var(--pf-glass-fill-faint,rgba(255,255,255,.22));border-radius:var(--pf-r-sm,10px)}',
    '.pf-glass .pfst-table caption{color:var(--pf-glass-accent-ink,#0a5054)}',
    '.pf-glass .pfst-table th,.pf-glass .pfst-table td{border-color:var(--pf-glass-line,#dfe5e5)}',
    '.pf-glass .pfst-table thead th{background:rgba(14,107,112,.08);color:var(--pf-glass-ink-2,#2b373c)}',
    '.pf-glass .pfst-warning{color:var(--pf-glass-review-ink,#6f4300)}',
    '.pf-glass .pfst-more summary{color:var(--pf-glass-accent-ink,#0a5054);font-weight:600}',
    // Phone widths: 16px text; the check rows stack (항목 + 상태 on one line, the value under them) and the PF table keeps its
    // two columns (label | value), so nothing scrolls sideways.
    '@media (max-width:560px){',
    '.pfst{font-size:16px}',
    '.pfst-checks,.pfst-checks tbody,.pfst-checks tr,.pfst-checks th,.pfst-checks td{display:block;width:100%}',
    '.pfst-checks colgroup,.pfst-checks thead{display:none}',
    '.pfst-checks{background:transparent}',
    '.pfst-checks caption{display:block}',
    '.pfst-checks tr{border:1px solid var(--pf-line,#dfe5e5);border-radius:10px;margin:0 0 6px;padding:6px 9px;background:var(--pf-surface,#fff)}',
    '.pfst-checks th,.pfst-checks td{border:0;padding:0}',
    '.pfst-checks tr{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:8px;row-gap:2px;align-items:start}',
    '.pfst-checks tbody th{grid-column:1}',
    '.pfst-checks td.pfst-state{grid-column:2;width:auto;max-width:11em;text-align:right}',
    '.pfst-checks td.pfst-cell{grid-column:1/-1}',
    '.pfst-badge{font-size:14px}',
    '.pfst-pf col.pfst-c1{width:38%}',
    '.pfst-pf th,.pfst-pf td{padding:6px 7px}',
    '.pfst-pf tbody th{font-weight:600;color:var(--pf-muted,#697478);font-size:15px}',
    '.pfst-more summary{min-height:44px}',
    '.pfst-note,.pfst-more li,.pfst-notes,.pfst-foot,.pfst-meta,.pfst-comment{font-size:14px}',
    '}'
  ].join('\n');

  function wording() { return root.PFWording || { text: function (s) { return s == null ? '' : String(s).trim(); } }; }
  function txt(v) { return wording().text(v == null ? '' : String(v)); }
  function tone(v) { return TONES[v] ? v : 'warn'; }

  function injectStyle(doc) {
    if (!doc || doc.getElementById(STYLE_ID)) return;
    var style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function make(doc, tag, cls, text) {
    var node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (text != null && text !== '') node.textContent = txt(text);
    return node;
  }

  function badge(doc, text, t) { return make(doc, 'span', 'pfst-badge pfst-' + tone(t), text); }

  /* The table data of a reply: result.siteTable (inline replies carry the analysis under result), else null. */
  function find(payload) {
    if (!payload || typeof payload !== 'object') return null;
    var table = payload.siteTable || (payload.result && typeof payload.result === 'object' ? payload.result.siteTable : null);
    return table && typeof table === 'object' && table.version === VERSION && Array.isArray(table.rows) ? table : null;
  }

  function colgroup(doc, n) {
    var cg = doc.createElement('colgroup');
    for (var i = 1; i <= n; i++) { var c = doc.createElement('col'); c.className = 'pfst-c' + i; cg.appendChild(c); }
    return cg;
  }

  function details(doc, lines) {
    var items = (lines || []).filter(function (d) { return d && String(d.text || '').trim(); });
    if (!items.length) return null;
    var box = make(doc, 'details', 'pfst-more');
    box.appendChild(make(doc, 'summary', '', '근거 보기'));
    var list = doc.createElement('ul');
    items.forEach(function (d) { list.appendChild(make(doc, 'li', 'pfst-k-' + (d.kind === 'value' || d.kind === 'note' ? d.kind : 'msg'), d.text)); });
    box.appendChild(list);
    return box;
  }

  function checksTable(doc, table) {
    var t = make(doc, 'table', 'pfst-table pfst-checks');
    t.appendChild(make(doc, 'caption', '', table.mode === 'roof' ? '지붕 체크 4항목' : '8대 체크'));
    t.appendChild(colgroup(doc, 3));
    var head = doc.createElement('thead'), hr = doc.createElement('tr');
    ['항목', '상태', '핵심 값'].forEach(function (h) { var th = make(doc, 'th', '', h); th.scope = 'col'; hr.appendChild(th); });
    head.appendChild(hr); t.appendChild(head);
    var body = doc.createElement('tbody');
    table.rows.forEach(function (row) {
      var tr = make(doc, 'tr', 'pfst-row pfst-tone-' + tone(row.tone));
      if (row.key) tr.setAttribute('data-key', String(row.key));
      var th = make(doc, 'th', '', row.title); th.scope = 'row'; tr.appendChild(th);
      var state = make(doc, 'td', 'pfst-state'); state.appendChild(badge(doc, row.badge, row.tone)); tr.appendChild(state);
      var cell = make(doc, 'td', 'pfst-cell');
      cell.appendChild(make(doc, 'div', 'pfst-value', row.value));
      var more = details(doc, row.detail);
      if (more) cell.appendChild(more);
      tr.appendChild(cell);
      body.appendChild(tr);
    });
    t.appendChild(body);
    return t;
  }

  function pfTable(doc, pf) {
    var t = make(doc, 'table', 'pfst-table pfst-pf');
    t.appendChild(make(doc, 'caption', '', (pf.title || 'PF(사업성) 요약') + ' · PDF 보고서와 같은 값'));
    t.appendChild(colgroup(doc, 2));
    var body = doc.createElement('tbody');
    (pf.rows || []).forEach(function (row) {
      var tr = make(doc, 'tr', 'pfst-pfrow');
      if (row.key) tr.setAttribute('data-key', String(row.key));
      var th = make(doc, 'th', '', row.label); th.scope = 'row'; tr.appendChild(th);
      var td = doc.createElement('td');
      td.appendChild(make(doc, 'div', 'pfst-value', row.value));
      if (row.note) td.appendChild(make(doc, 'div', 'pfst-note', row.note));
      tr.appendChild(td);
      body.appendChild(tr);
    });
    t.appendChild(body);
    return t;
  }

  /* The answer's element. opts.document (tests), opts.payload: the reply the mail form may need. */
  function render(table, opts) {
    opts = opts || {};
    var doc = opts.document || root.document;
    injectStyle(doc);
    var box = make(doc, 'section', 'pfst');
    box.setAttribute('aria-label', '현장 분석 결과 표');
    var head = make(doc, 'div', 'pfst-head');
    head.appendChild(make(doc, 'div', 'pfst-addr', table.address || ''));
    var verdict = make(doc, 'div', 'pfst-verdict');
    verdict.appendChild(make(doc, 'span', 'pfst-label', '사업성 판정'));
    verdict.appendChild(badge(doc, (table.business || {}).text || '미확인', (table.business || {}).tone));
    verdict.appendChild(make(doc, 'span', 'pfst-score', '점수 ' + ((table.score || {}).text || '미산정')));
    head.appendChild(verdict);
    var when = table.date ? '조회 ' + table.date + ' KST' : '기준 시각 미확인';
    head.appendChild(make(doc, 'div', 'pfst-meta', when + (table.source ? ' · ' + table.source : '')));
    if (table.comment) head.appendChild(make(doc, 'p', 'pfst-comment', table.comment));
    (table.warnings || []).forEach(function (w) { head.appendChild(make(doc, 'p', 'pfst-warning', '주의: ' + w)); });
    box.appendChild(head);
    box.appendChild(checksTable(doc, table));
    if (table.pf) {
      box.appendChild(pfTable(doc, table.pf));
      var notes = (table.pf.notes || []).filter(Boolean);
      if (notes.length) {
        var list = make(doc, 'ul', 'pfst-notes');
        notes.forEach(function (n) { list.appendChild(make(doc, 'li', '', n)); });
        box.appendChild(list);
      }
    }
    if (table.footnote) box.appendChild(make(doc, 'p', 'pfst-foot', table.footnote));
    var slot = make(doc, 'div', 'pf-site-mail');
    box.appendChild(slot);
    try { if (root.PFSiteMail && typeof root.PFSiteMail.mount === 'function') root.PFSiteMail.mount(slot, table, opts.payload || null); }
    catch (err) { if (root.console) root.console.warn('[PFSiteMail]', err); }
    return box;
  }

  var api = { VERSION: VERSION, render: render, find: find, css: CSS };
  root.PFSiteTable = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
