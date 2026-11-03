/* Solbi's single-site answer by mail: "원하시면 상세 PDF 보고서를 메일로 보내드립니다" (owner request 2026-11-03).
   - Under a table answer: solbi-site-table.js calls PFSiteMail.mount(slot, table, payload) when table.mail carries the id of the
     report payload the server kept for that answer (pf_site_mail.offer).
   - A chat reply to "메일로 보내줘 a@b.com" / "보고서 메일로" (result.siteMail, result.siteMailRequest): PFSiteMail.find(payload)
     and PFSiteMail.renderReply(payload).
   The address field is prefilled with the last address this account used, read from the server (never browser storage). One
   address per send; the server renders the same PDF as the studio's report of that analysis and mails it. The state shown is
   the server's: 접수됨 → 발송 중 → 메일 서버가 받았습니다 (SMTP accepted, not "received"), or why not (메일 서버 미설정 /
   주소 확인 / 잠시 후 다시). Every text is set with textContent. Works on the PC panel (static/ai_assistant.js, API at
   window.SOLAR_API_BASE / BACKEND_URL) and on /m (same origin; APK WebView, iPhone home screen app). */
(function (root) {
  'use strict';
  var VERSION = 'site-mail-v1';
  var PREFIX = '/api/llm/site-report';
  var STYLE_ID = 'pfsm-style';
  var POLL_MS = [1200, 1500, 2000, 2000, 3000, 3000, 4000, 5000];
  var POLL_LIMIT_MS = 15 * 60 * 1000;
  // no '=' or '?': an RFC 2047 encoded word ('=?utf-8?q?…?=@…') is header text, not one address (pf_site_mail.EMAIL)
  var EMAIL = /^[A-Za-z0-9.!#$%&'*+/^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/;
  var STEPS = [['queued', '접수됨'], ['sending', '발송 중'], ['accepted', '메일 서버가 받았습니다']];
  var CSS = [
    '.pfsm{display:block;margin:10px 0 0;padding:10px 12px;border:1px solid var(--pf-line,#dfe5e5);border-radius:10px;background:var(--pf-surface,#fff);color:var(--pf-ink,#24292c);font-size:13px;line-height:1.5;white-space:normal;word-break:keep-all;overflow-wrap:anywhere;box-sizing:border-box;max-width:100%}',
    '.pfsm *{box-sizing:border-box}',
    '.pfsm-lead{margin:0 0 4px;font-weight:700;color:var(--pf-accent,#0e6b70)}',
    '.pfsm-sub{margin:0 0 6px;color:var(--pf-muted,#697478);font-size:.92em}',
    '.pfsm-label{display:block;margin:0 0 4px;color:var(--pf-muted,#697478);font-size:.92em}',
    '.pfsm-row{display:flex;flex-wrap:wrap;gap:6px;align-items:stretch}',
    '.pfsm-input{flex:1 1 180px;min-width:0;font-size:16px;line-height:1.3;padding:8px 10px;border:1px solid #c9d4d6;border-radius:8px;background:#fff;color:#24292c}',
    '.pfsm-input:focus{outline:2px solid var(--pf-accent,#0e6b70);outline-offset:1px}',
    '.pfsm-send{flex:0 0 auto;min-height:40px;padding:8px 16px;border:0;border-radius:8px;background:var(--pf-accent,#0e6b70);color:#fff;font-size:15px;font-weight:700;cursor:pointer}',
    '.pfsm-send[disabled]{opacity:.55;cursor:default}',
    '.pfsm-steps{display:flex;flex-wrap:wrap;gap:2px 6px;list-style:none;margin:8px 0 0;padding:0;color:var(--pf-muted,#697478);font-size:.92em}',
    '.pfsm-steps[hidden]{display:none}',
    '.pfsm-steps li::after{content:"\\2192";margin-left:6px;color:var(--pf-muted,#697478);font-weight:400}',
    '.pfsm-steps li:last-child::after{content:""}',
    '.pfsm-steps li.pfsm-done{color:#136c48}',
    '.pfsm-steps li.pfsm-now{color:var(--pf-ink,#24292c);font-weight:700}',
    '.pfsm-status{margin:6px 0 0;font-size:.95em}',
    '.pfsm-status:empty{display:none}',
    '.pfsm-status.pfsm-ok{color:#136c48}',
    '.pfsm-status.pfsm-warn{color:#8a5a00}',
    '.pfsm-status.pfsm-fail{color:#a3262a}',
    // Liquid glass (family-glass.css: the field is a .94 well, 보내기 the primary glass button). Inside the PC Solbi drawer
    // the form is a faint nested glass card (the blurred map shows through, no white slab): no blur of its own (one blur
    // layer), glass inks for the small texts.
    '.pfsm-send.pf-glass-btn{border-radius:var(--pf-r-md,10px)}',
    '.pf-glass .pfsm{background:linear-gradient(180deg,rgba(255,255,255,.34),rgba(255,255,255,0) 62%),var(--pf-glass-fill-faint,rgba(255,255,255,.22));border-color:rgba(255,255,255,.72);box-shadow:inset 0 1px 0 rgba(255,255,255,.85),0 0 0 1px rgba(16,40,44,.10)}',
    '.pf-glass .pfsm-lead{color:var(--pf-glass-accent-ink,#0a5054)}',
    '.pf-glass .pfsm-steps li.pfsm-done,.pf-glass .pfsm-status.pfsm-ok{color:var(--pf-glass-ok-ink,#145236)}',
    '.pf-glass .pfsm-status.pfsm-warn{color:var(--pf-glass-review-ink,#6f4300)}',
    '.pf-glass .pfsm-status.pfsm-fail{color:var(--pf-glass-danger-ink,#8f1f31)}',
    '@media (max-width:560px){',
    '.pfsm{font-size:16px}',
    '.pfsm-input{flex-basis:100%}',
    '.pfsm-send{flex:1 1 100%;min-height:44px;font-size:16px}',
    '.pfsm-sub,.pfsm-label,.pfsm-steps,.pfsm-status{font-size:14px}',
    '}'
  ].join('\n');
  var counter = 0;
  var optionsPromise = null;

  function wording() { return root.PFWording || { text: function (s) { return s == null ? '' : String(s).trim(); } }; }
  function txt(v) { return wording().text(v == null ? '' : String(v)); }

  function base() {
    var value = root.SOLAR_API_BASE || root.BACKEND_URL || '';
    return String(value || '').replace(/\/+$/, '');
  }

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

  /* One JSON call to the server; {status, data}. A network failure is {status: 0}. */
  function call(path, init) {
    var fetcher = root.fetch;
    if (typeof fetcher !== 'function') return Promise.resolve({ status: 0, data: {} });
    var options = Object.assign({ credentials: 'include', cache: 'no-store' }, init || {});
    return Promise.resolve().then(function () { return fetcher.call(root, base() + path, options); }).then(function (response) {
      return response.text().then(function (body) {
        var data = {};
        try { data = body ? JSON.parse(body) : {}; } catch (_) { data = {}; }
        return { status: response.status, data: data && typeof data === 'object' ? data : {} };
      });
    }).catch(function () { return { status: 0, data: {} }; });
  }

  function options(fresh) {
    if (!optionsPromise || fresh) {
      var pending = call(PREFIX + '/mail/options', { method: 'GET' }).then(function (r) {
        var value = r.status === 200 && r.data && r.data.ok && r.data.version === VERSION ? r.data : null;
        if (!value && optionsPromise === pending) optionsPromise = null;  // a locked or offline moment: the next form asks again
        return value;
      });
      optionsPromise = pending;
    }
    return optionsPromise;
  }

  function remember(email) {
    var previous = optionsPromise || Promise.resolve(null);
    optionsPromise = previous.then(function (value) { return Object.assign({}, value || { ok: true, configured: true }, { lastEmail: email }); });
  }

  function validOffer(offer) {
    return !!(offer && typeof offer === 'object' && offer.version === VERSION && /^[0-9a-f]{32}$/.test(String(offer.reportId || '')));
  }

  /* A reply's mail data: {siteMail, siteMailRequest} (the reply result's own keys) or null. */
  function find(payload) {
    if (!payload || typeof payload !== 'object') return null;
    var source = payload.siteMail ? payload : (payload.result && typeof payload.result === 'object' && payload.result.siteMail ? payload.result : null);
    if (!source || !validOffer(source.siteMail)) return null;
    var request = source.siteMailRequest && typeof source.siteMailRequest === 'object' && source.siteMailRequest.version === VERSION ? source.siteMailRequest : null;
    return request ? { siteMail: source.siteMail, siteMailRequest: request } : { siteMail: source.siteMail };
  }

  function tone(state) {
    if (!state) return '';
    if (state.status === 'accepted') return 'pfsm-ok';
    if (state.status === 'queued' || state.status === 'sending') return '';
    return state.status === 'unknown' ? 'pfsm-warn' : 'pfsm-fail';
  }

  function build(doc, offer, opts) {
    injectStyle(doc);
    opts = opts || {};
    var id = 'pfsm-email-' + (++counter);
    var form = make(doc, 'form', 'pfsm');
    form.setAttribute('novalidate', '');
    form.setAttribute('aria-label', '상세 PDF 보고서 메일 보내기');
    form.setAttribute('data-report', String(offer.reportId));
    form.appendChild(make(doc, 'p', 'pfsm-lead', offer.text || '원하시면 상세 PDF 보고서를 메일로 보내드립니다'));
    if (opts.showPlace && offer.address) {
      form.appendChild(make(doc, 'p', 'pfsm-sub', offer.address + ' ' + (offer.mode === 'roof' ? '지붕' : '토지') + ' 분석 · 표와 같은 값의 상세 PDF'));
    }
    // an address the request typed ("… 분석해서 메일로 보내줘 a@b.com"): in the field, and said not to be sent yet
    if (opts.note) form.appendChild(make(doc, 'p', 'pfsm-sub pfsm-prefill', opts.note));
    var label = make(doc, 'label', 'pfsm-label', '받을 메일 주소');
    label.setAttribute('for', id);
    form.appendChild(label);
    var row = make(doc, 'div', 'pfsm-row');
    var input = make(doc, 'input', 'pfsm-input pf-glass-field');
    input.id = id;
    input.name = 'email';
    var attributes = { type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'off', spellcheck: 'false',
      maxlength: '254', placeholder: 'name@example.com', required: '' };
    Object.keys(attributes).forEach(function (key) { input.setAttribute(key, attributes[key]); });
    if (opts.email) input.value = String(opts.email);
    var button = make(doc, 'button', 'pfsm-send pf-glass-btn pf-glass-btn--primary', '보내기');
    button.type = 'submit';
    button.setAttribute('type', 'submit');
    row.appendChild(input);
    row.appendChild(button);
    form.appendChild(row);
    var steps = make(doc, 'ol', 'pfsm-steps');
    steps.hidden = true;
    steps.setAttribute('aria-label', '발송 단계');
    STEPS.forEach(function (step) {
      var li = make(doc, 'li', '', step[1]);
      li.setAttribute('data-step', step[0]);
      steps.appendChild(li);
    });
    form.appendChild(steps);
    var status = make(doc, 'p', 'pfsm-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    form.appendChild(status);

    var view = { form: form, input: input, button: button, steps: steps, status: status, offer: offer, busy: false, poll: 0 };
    form.addEventListener('submit', function (event) {
      if (event && event.preventDefault) event.preventDefault();
      if (event && event.stopPropagation) event.stopPropagation();
      submit(view);
    });
    // The last address this account used (server-side) fills an empty field; a mail server that is not set up is said at once.
    options().then(function (value) {
      if (!value) return;
      if (!input.value && value.lastEmail) input.value = String(value.lastEmail);
      if (value.configured === false && !view.busy && !view.token) show(view, { status: 'not_configured', label: '메일 서버 미설정', message: '메일 서버 설정이 없어 지금은 보고서를 메일로 보낼 수 없습니다.' });
    });
    return view;
  }

  function show(view, state, note) {
    var steps = view.steps.children || [];
    var at = -1;
    STEPS.forEach(function (step, index) { if (state && state.status === step[0]) at = index; });
    var progress = at >= 0;
    view.steps.hidden = !progress;
    for (var i = 0; i < steps.length; i++) {
      steps[i].className = !progress ? '' : (i < at ? 'pfsm-done' : (i === at ? 'pfsm-now' : ''));
      if (i === at) steps[i].setAttribute('aria-current', 'step');
      else if (steps[i].removeAttribute) steps[i].removeAttribute('aria-current');
    }
    var text = state ? [state.label, state.message].filter(Boolean).join(' — ') : (note || '');
    if (state && state.email && state.status === 'accepted') text = state.email + ' · ' + text;
    view.status.className = 'pfsm-status' + (tone(state) ? ' ' + tone(state) : (state ? '' : ' pfsm-fail'));
    view.status.textContent = txt(text);
    view.form.setAttribute('data-status', state ? String(state.status || '') : 'invalid');
  }

  function settle(view, state) {
    show(view, state);
    var done = !state || state.final || ['accepted', 'unknown', 'not_configured', 'error'].indexOf(state.status) >= 0;
    view.busy = !done;
    view.button.disabled = !done;
    if (!done) schedule(view, state);
  }

  function schedule(view, state) {
    var started = view.pollStarted || (view.pollStarted = Date.now());
    var delay = POLL_MS[Math.min(view.poll, POLL_MS.length - 1)];
    view.poll += 1;
    var token = view.token;
    root.setTimeout(function () {
      if (token !== view.token) return;
      if (view.form.isConnected === false) return;  // the reply left the screen (a new chat, a lock)
      if (Date.now() - started > POLL_LIMIT_MS) {
        view.busy = false; view.button.disabled = false;
        view.status.className = 'pfsm-status pfsm-warn';
        view.status.textContent = txt('발송 상태를 더 확인하지 않았습니다. 같은 주소로 다시 보내면 지금 상태를 다시 알려 드립니다.');
        return;
      }
      call(PREFIX + '/mail/' + encodeURIComponent(state.id), { method: 'GET' }).then(function (r) {
        if (token !== view.token) return;
        if (r.status === 200 && r.data && r.data.request) { settle(view, r.data.request); return; }
        if (r.data && (r.data.intent === 'wake_required' || r.data.error === 'wake_required')) {
          view.busy = false; view.button.disabled = false;
          view.status.className = 'pfsm-status pfsm-warn';
          view.status.textContent = txt('솔비가 잠겨 발송 상태를 확인하지 못했습니다. 시작 문구를 입력한 뒤 같은 주소로 다시 보내면 지금 상태를 알려 드립니다.');
          return;
        }
        schedule(view, state);  // a dropped poll: try again (the server keeps the state)
      });
    }, delay);
  }

  function submit(view) {
    if (view.busy) return;
    var email = String(view.input.value || '').trim();
    view.input.value = email;
    if (!email || email.length > 254 || !EMAIL.test(email)) {
      show(view, null, '주소 확인 — 받을 메일 주소 하나를 정확히 입력해 주세요. 예: name@example.com');
      if (view.input.focus) view.input.focus();
      return;
    }
    view.busy = true;
    view.button.disabled = true;
    view.poll = 0; view.pollStarted = 0; view.token = {};
    var token = view.token;
    view.status.className = 'pfsm-status';
    view.status.textContent = txt('요청 중…');
    view.steps.hidden = true;
    call(PREFIX + '/mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: view.offer.reportId, email: email })
    }).then(function (r) {
      if (token !== view.token) return;
      var data = r.data || {};
      if (data.intent === 'wake_required' || data.error === 'wake_required') {
        view.busy = false; view.button.disabled = false;
        show(view, { status: 'error', label: '솔비 시작 필요', message: '솔비가 잠겨 있습니다. 시작 문구를 입력한 뒤 다시 보내 주세요. 메일은 보내지 않았습니다.' });
        return;
      }
      if (data.ok && data.request) {
        remember(email);
        var state = data.request;
        if (data.duplicate && state.final) {
          // the same report to the same address shortly before: its state again, and why nothing new was sent
          state = Object.assign({}, state, { message: [state.message, '방금 같은 주소로 요청한 보고서라 다시 보내지 않았습니다.'].filter(Boolean).join(' ') });
        }
        settle(view, state);
        return;
      }
      view.busy = false; view.button.disabled = false;
      if (data.request) { show(view, data.request); return; }
      if (r.status === 0) {
        show(view, { status: 'error', label: '잠시 후 다시', message: '서버에 연결하지 못했습니다. 연결을 확인한 뒤 다시 보내 주세요. 메일은 보내지 않았습니다.' });
        return;
      }
      show(view, { status: data.error === 'mail_not_configured' ? 'not_configured' : 'error',
        label: data.label || (r.status === 401 || r.status === 403 ? '로그인 확인' : '잠시 후 다시'),
        message: data.message || '요청을 처리하지 못했습니다. 메일은 보내지 않았습니다.' });
    });
  }

  /* The form under a table answer. */
  function mount(slot, table, payload) {
    var offer = table && table.mail;
    if (!slot || !validOffer(offer)) return null;
    var doc = slot.ownerDocument || root.document;
    var typed = offer.email && EMAIL.test(String(offer.email)) ? String(offer.email) : '';
    var view = build(doc, offer, { email: typed, note: typed ? offer.note || '' : '' });
    if (slot.replaceChildren) slot.replaceChildren(view.form);
    else slot.appendChild(view.form);
    return view.form;
  }

  /* A chat reply's form: prefilled with the typed address and, when a request was queued, following its state. */
  function renderReply(payload, opts) {
    var found = find(payload);
    if (!found) return null;
    opts = opts || {};
    var doc = opts.document || root.document;
    var request = found.siteMailRequest;
    var view = build(doc, found.siteMail, { showPlace: true, email: (request && request.email) || found.siteMail.email || '' });
    if (request) {
      view.token = {};
      settle(view, request);
    }
    return view.form;
  }

  var api = { VERSION: VERSION, PREFIX: PREFIX, mount: mount, find: find, renderReply: renderReply, css: CSS, valid: function (v) { return EMAIL.test(String(v || '').trim()); } };
  root.PFSiteMail = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
