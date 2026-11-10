/* Solbi's analysis conditions card (owner request 2026-11-10): when a chat asks to analyse an address, the reply carries
   action.kind === 'analysis_options' (pf_solbi_analysis_options.card) and this renders it on both surfaces — the phone page
   (templates/solbi_mobile.html, renderCards) and the PC panel (static/ai_assistant.js, lazy-loaded).

     PFSolbiOptions.render(action, {send, disabled})  ->  the card's element
       action   {id, expiresAt, addresses, count, groups:[{key,label,value,options:[{value,label,detail,featured}],
                 showWhen:{key,value}?}],   (a group with showWhen is rendered hidden unless the named group has that value)
                 email:{label,value,required,mailReady,multiple}, submitLabel, cancelLabel}
       send     (message, extraContext) => Promise<boolean> | boolean : hands a chat message to the page's own send path.
                Submit sends '이 조건으로 분석해줘' with {analysisOptions:{id,mode,moduleId,inverterId,marginPct,roofScope (only while visible),email}};
                cancel sends '취소'. false (or a rejection) means "not sent now": the card stays usable.
       disabled true | () => boolean : the chat cannot send right now (locked, busy); a card drawn read-only when true at render.
     PFSolbiOptions.settle(id, state)  the server ended the draft ('submitted' | 'cancelled' | 'expired' | 'closed'):
                                       every card of that draft becomes read-only.

   Chips are buttons with aria-pressed; choosing 지붕/토지 or a chip only changes the selection (no request). Featured
   equipment shows first, "전체 보기" reveals the rest. Every text is set with textContent. The card brings its own scoped
   styles (prefix pf-solbi-options-): a light liquid-glass panel with its own inks, readable on the dark phone bubble and
   inside the PC glass drawer (where it adds no second blur). */
(function (root) {
  'use strict';
  var STYLE_ID = 'pf-solbi-options-style';
  var SUBMIT_MESSAGE = '이 조건으로 분석해줘';
  var CANCEL_MESSAGE = '취소';
  var EMAIL = /^[A-Za-z0-9.!#$%&'*+/^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/;
  var LOCKED = {
    submitted: '이 조건으로 접수했습니다. 결과는 아래 대화에 표시합니다.',
    cancelled: '분석 조건 선택을 취소했습니다. 분석은 실행하지 않았습니다.',
    expired: '선택 시간이 지났습니다(30분). 분석할 주소를 다시 보내 주세요.',
    closed: '이 선택은 끝났습니다. 다시 분석하려면 주소를 보내 주세요.',
    replaced: '아래 카드에서 조건을 다시 확인해 주세요.'
  };
  var CSS = [
    '.pf-solbi-options{display:block;width:100%;max-width:100%;box-sizing:border-box;margin:6px 0 0;padding:12px;border-radius:14px;',
    'border:1px solid rgba(255,255,255,.72);color:#1f2a2e;font-size:14px;line-height:1.5;white-space:normal;word-break:keep-all;overflow-wrap:anywhere;',
    'background:linear-gradient(180deg,rgba(255,255,255,.55),rgba(255,255,255,0) 60%),rgba(244,249,249,.82);',
    'box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 0 0 1px rgba(16,40,44,.10),0 8px 24px -14px rgba(16,34,38,.45);',
    '-webkit-backdrop-filter:blur(14px) saturate(160%);backdrop-filter:blur(14px) saturate(160%)}',
    '.pf-solbi-options *{box-sizing:border-box}',
    // inside a glass surface (the PC drawer) the card is a nested layer: one blur per stack
    '.pf-glass .pf-solbi-options{-webkit-backdrop-filter:none;backdrop-filter:none;background:linear-gradient(180deg,rgba(255,255,255,.45),rgba(255,255,255,0) 60%),rgba(255,255,255,.46)}',
    '.pf-solbi-options-title{margin:0 0 2px;font-size:1.04em;font-weight:700;color:#0a5054}',
    '.pf-solbi-options-sub{margin:0 0 8px;color:#3d4b50;font-size:.93em}',
    '.pf-solbi-options-list{margin:0 0 8px;color:#3d4b50;font-size:.9em}',
    '.pf-solbi-options-list summary{cursor:pointer;min-height:32px;display:flex;align-items:center;color:#0a5054;font-weight:600}',
    '.pf-solbi-options-list ol{margin:4px 0 0;padding-left:22px;max-height:180px;overflow:auto}',
    '.pf-solbi-options-group{margin:10px 0 0;padding:0;border:0;min-width:0}',
    '.pf-solbi-options-label{display:flex;flex-wrap:wrap;gap:2px 8px;align-items:baseline;margin:0 0 5px;font-weight:700;color:#24353a}',
    '.pf-solbi-options-picked{font-weight:500;color:#4a5a5f;font-size:.92em}',
    '.pf-solbi-options-chips{display:flex;flex-wrap:wrap;gap:6px}',
    '.pf-solbi-options-chip,.pf-solbi-options-more{appearance:none;-webkit-appearance:none;margin:0;font:inherit;cursor:pointer;min-height:36px;max-width:100%;',
    'padding:6px 12px;border-radius:9999px;border:1px solid rgba(14,107,112,.32);background:rgba(255,255,255,.78);color:#17383b;text-align:left;',
    'box-shadow:inset 0 1px 0 rgba(255,255,255,.9);line-height:1.3;transition:background .15s,border-color .15s,color .15s}',
    '.pf-solbi-options-chip:hover{border-color:rgba(14,107,112,.6);background:#fff}',
    '.pf-solbi-options-chip[aria-pressed="true"]{background:#0e6b70;border-color:#0b5a5e;color:#fff;font-weight:700;box-shadow:inset 0 1px 0 rgba(255,255,255,.22)}',
    '.pf-solbi-options-detail{display:block;font-size:.82em;font-weight:400;opacity:.82}',
    '.pf-solbi-options-more{border-style:dashed;background:transparent;color:#0a5054;font-weight:600}',
    '.pf-solbi-options-chip:focus-visible,.pf-solbi-options-more:focus-visible,.pf-solbi-options-submit:focus-visible,.pf-solbi-options-cancel:focus-visible,',
    '.pf-solbi-options-input:focus-visible,.pf-solbi-options-list summary:focus-visible{outline:3px solid #f2a900;outline-offset:2px}',
    '.pf-solbi-options-help{margin:5px 0 0;color:#4a5a5f;font-size:.88em}',
    '.pf-solbi-options-custom{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0 0;color:#3d4b50;font-size:.92em}',
    '.pf-solbi-options-input{font:inherit;font-size:16px;line-height:1.3;min-height:36px;padding:6px 10px;border:1px solid #b9c8ca;border-radius:10px;background:rgba(255,255,255,.94);color:#1f2a2e;min-width:0}',
    '.pf-solbi-options-custom .pf-solbi-options-input{width:6em}',
    '.pf-solbi-options-email{display:block;width:100%;margin:0}',
    '.pf-solbi-options-email .pf-solbi-options-input{display:block;width:100%}',
    '.pf-solbi-options-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0}',
    '.pf-solbi-options-submit,.pf-solbi-options-cancel{appearance:none;-webkit-appearance:none;font:inherit;cursor:pointer;min-height:40px;padding:8px 16px;border-radius:12px;font-weight:700}',
    '.pf-solbi-options-submit{flex:1 1 180px;border:1px solid #0b5a5e;background:linear-gradient(180deg,#14848a,#0e6b70);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 4px 12px -6px rgba(11,95,99,.7)}',
    '.pf-solbi-options-cancel{flex:0 0 auto;border:1px solid rgba(16,40,44,.22);background:rgba(255,255,255,.7);color:#24353a}',
    '.pf-solbi-options-status{margin:8px 0 0;font-size:.93em;color:#24353a}',
    '.pf-solbi-options-status:empty{display:none}',
    '.pf-solbi-options-status[data-tone="fail"]{color:#a3262a}',
    '.pf-solbi-options-status[data-tone="ok"]{color:#136c48}',
    '.pf-solbi-options [disabled]{cursor:default;opacity:.55}',
    '.pf-solbi-options[data-state]:not([data-state="open"]) .pf-solbi-options-chip[aria-pressed="true"]{opacity:1}',
    '.pf-solbi-options [hidden]{display:none!important}',
    // touch: 44px targets and a 16px base (no zoom on focus)
    '@media (pointer:coarse),(max-width:560px){',
    '.pf-solbi-options{font-size:16px;padding:12px 10px}',
    '.pf-solbi-options-chip,.pf-solbi-options-more,.pf-solbi-options-submit,.pf-solbi-options-cancel,.pf-solbi-options-input{min-height:44px}',
    '.pf-solbi-options-list summary{min-height:44px}',
    '.pf-solbi-options-cancel{flex:1 1 96px}',
    '}',
    '@media (prefers-reduced-motion:reduce){.pf-solbi-options-chip,.pf-solbi-options-more{transition:none}}'
  ].join('\n');
  var cards = {};   // draft id -> the cards drawn for it (a redraw from history, a card shown again)
  var counter = 0;

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
    if (text != null && text !== '') node.textContent = String(text);
    return node;
  }

  function same(a, b) { return String(a) === String(b); }

  function validEmail(value, multiple) {
    var parts = String(value || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    if (!parts.length) return '';
    if (parts.length > (multiple ? 2 : 1)) return null;
    for (var i = 0; i < parts.length; i++) if (parts[i].length > 254 || !EMAIL.test(parts[i])) return null;
    return parts.join(', ');
  }

  function render(action, opts) {
    opts = opts || {};
    action = action && typeof action === 'object' ? action : {};
    var doc = opts.document || root.document;
    injectStyle(doc);
    var id = String(action.id || '');
    var groups = Array.isArray(action.groups) ? action.groups.filter(function (g) { return g && g.key && Array.isArray(g.options); }) : [];
    var email = action.email && typeof action.email === 'object' ? action.email : {};
    var multiple = !!email.multiple || Number(action.count) > 1;
    var values = {};
    var uid = 'pf-solbi-options-' + (++counter);
    var state = 'open';
    var controls = [];      // everything that goes read-only
    var redraw = [];        // per group: refresh pressed states and the picked text
    var fields = [];        // {group, field}: showWhen groups are hidden (not removed) while their condition is not met
    function visible(group) {
      var w = group.showWhen;
      return !w || !w.key || same(values[w.key], w.value);
    }
    function showAll() {
      fields.forEach(function (f) {
        var on = visible(f.group);
        f.field.hidden = !on;
        if (on) { if (f.field.removeAttribute) f.field.removeAttribute('hidden'); }
        else if (f.field.setAttribute) f.field.setAttribute('hidden', '');
      });
    }
    var isDisabled = function () { return typeof opts.disabled === 'function' ? !!opts.disabled() : !!opts.disabled; };

    var box = make(doc, 'section', 'pf-solbi-options');
    box.setAttribute('aria-label', '분석 조건 선택');
    box.setAttribute('data-draft', id);
    box.setAttribute('data-state', state);
    box.appendChild(make(doc, 'h3', 'pf-solbi-options-title', action.title || '분석 조건 선택'));
    var addresses = Array.isArray(action.addresses) ? action.addresses.map(String) : [];
    var count = Number(action.count) || addresses.length;
    if (count > 1) {
      box.appendChild(make(doc, 'p', 'pf-solbi-options-sub', '주소 ' + count + '곳에 같은 조건을 적용합니다.'));
      var listing = make(doc, 'details', 'pf-solbi-options-list');
      listing.appendChild(make(doc, 'summary', '', '주소 목록 보기'));
      var ol = doc.createElement('ol');
      addresses.forEach(function (a) { ol.appendChild(make(doc, 'li', '', a)); });
      listing.appendChild(ol);
      box.appendChild(listing);
    } else if (addresses[0]) {
      box.appendChild(make(doc, 'p', 'pf-solbi-options-sub', addresses[0]));
    }
    if (action.note) box.appendChild(make(doc, 'p', 'pf-solbi-options-sub', action.note));

    var status = make(doc, 'p', 'pf-solbi-options-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    function say(text, tone) {
      status.textContent = String(text || '');
      if (tone) status.setAttribute('data-tone', tone); else if (status.removeAttribute) status.removeAttribute('data-tone');
    }

    groups.forEach(function (group) {
      var options = group.options.filter(function (o) { return o && o.value !== undefined && o.value !== null; });
      values[group.key] = group.value;
      var field = make(doc, 'div', 'pf-solbi-options-group');
      field.setAttribute('role', 'group');
      field.setAttribute('data-key', String(group.key));
      var label = make(doc, 'div', 'pf-solbi-options-label', group.label || group.key);
      label.id = uid + '-' + group.key;
      var picked = make(doc, 'span', 'pf-solbi-options-picked');
      label.appendChild(picked);
      field.setAttribute('aria-labelledby', label.id);
      field.appendChild(label);
      var chips = make(doc, 'div', 'pf-solbi-options-chips');
      var hasRest = options.some(function (o) { return o.featured; }) && options.some(function (o) { return !o.featured; });
      var expanded = false;
      var custom = null;
      var buttons = options.map(function (option) {
        var chip = make(doc, 'button', 'pf-solbi-options-chip');
        chip.type = 'button';
        chip.setAttribute('type', 'button');
        chip.setAttribute('data-value', String(option.value));
        chip.appendChild(make(doc, 'span', 'pf-solbi-options-name', option.label != null ? option.label : option.value));
        if (option.detail) chip.appendChild(make(doc, 'span', 'pf-solbi-options-detail', option.detail));
        chip.addEventListener('click', function () {
          if (state !== 'open') return;
          values[group.key] = option.value;
          if (custom) custom.value = '';
          say('');
          draw();
          showAll();
        });
        chips.appendChild(chip);
        controls.push(chip);
        return { option: option, chip: chip };
      });
      var more = null;
      if (hasRest) {
        more = make(doc, 'button', 'pf-solbi-options-more', '전체 보기');
        more.type = 'button';
        more.setAttribute('type', 'button');
        more.setAttribute('aria-expanded', 'false');
        more.addEventListener('click', function () {
          expanded = !expanded;
          draw();
        });
        chips.appendChild(more);
      }
      field.appendChild(chips);
      // 이격 여유율: a value between the chips can be typed (0 ~ max), as in the address-list dialog
      if (typeof group.max === 'number') {
        var row = make(doc, 'label', 'pf-solbi-options-custom', '직접 입력');
        custom = make(doc, 'input', 'pf-solbi-options-input');
        var attrs = { type: 'number', inputmode: 'decimal', min: String(group.min || 0), max: String(group.max), step: '1',
          'aria-label': (group.label || '') + ' 직접 입력 (%)' };
        Object.keys(attrs).forEach(function (k) { custom.setAttribute(k, attrs[k]); });
        if (!options.some(function (o) { return same(o.value, group.value); }) && group.value != null) custom.value = String(group.value);
        custom.addEventListener('input', function () {
          if (state !== 'open') return;
          var raw = String(custom.value || '').trim();
          if (!raw) { if (!options.some(function (o) { return same(o.value, values[group.key]); })) values[group.key] = group.value; }
          else values[group.key] = Number(raw);
          say('');
          draw();
        });
        row.appendChild(custom);
        row.appendChild(make(doc, 'span', '', '%'));
        field.appendChild(row);
        controls.push(custom);
      }
      if (group.help) field.appendChild(make(doc, 'p', 'pf-solbi-options-help', group.help));
      function draw() {
        var current = values[group.key];
        var shown = null;
        buttons.forEach(function (entry) {
          var on = same(entry.option.value, current);
          entry.chip.setAttribute('aria-pressed', on ? 'true' : 'false');
          // the rest stays behind "전체 보기", except the one that is chosen
          entry.chip.hidden = !!(hasRest && !expanded && !entry.option.featured && !on);
          if (on) shown = entry.option;
        });
        if (more) {
          more.textContent = expanded ? '주요 항목만 보기' : '전체 보기';
          more.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        }
        picked.textContent = shown ? String(shown.label != null ? shown.label : shown.value)
          : (typeof group.max === 'number' && current !== undefined && current !== null && !isNaN(current) ? current + '%' : '');
      }
      redraw.push(draw);
      draw();
      fields.push({ group: group, field: field });
      box.appendChild(field);
    });
    showAll();

    // the e-mail the PDF report goes to (optional)
    var mail = null;
    if (email.label || email.value !== undefined) {
      var mailField = make(doc, 'div', 'pf-solbi-options-group');
      var mailLabel = make(doc, 'label', 'pf-solbi-options-label', email.label || 'PDF 리포트 받을 이메일');
      mail = make(doc, 'input', 'pf-solbi-options-input');
      mail.id = uid + '-email';
      mailLabel.setAttribute('for', mail.id);
      var mailAttrs = { type: multiple ? 'text' : 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'off', spellcheck: 'false',
        maxlength: multiple ? '520' : '254', placeholder: multiple ? 'name@example.com (쉼표로 2개까지)' : 'name@example.com' };
      Object.keys(mailAttrs).forEach(function (k) { mail.setAttribute(k, mailAttrs[k]); });
      mail.value = email.mailReady === false ? '' : String(email.value || '');
      var wrap = make(doc, 'div', 'pf-solbi-options-email');
      wrap.appendChild(mail);
      mailField.appendChild(mailLabel);
      mailField.appendChild(wrap);
      mailField.appendChild(make(doc, 'p', 'pf-solbi-options-help', email.mailReady === false
        ? '메일 서버 설정이 없어 지금은 메일로 보낼 수 없습니다. 결과에서 PDF를 받을 수 있습니다.'
        : (email.required ? '분석이 끝나면 이 주소로 PDF 리포트를 보냅니다.' : '선택 사항입니다. 넣어 두면 분석이 끝난 뒤 PDF 리포트를 이 주소로 보냅니다.')));
      if (email.mailReady === false) mail.disabled = true;
      box.appendChild(mailField);
      controls.push(mail);
    }

    var actions = make(doc, 'div', 'pf-solbi-options-actions');
    var submit = make(doc, 'button', 'pf-solbi-options-submit', action.submitLabel || '이 조건으로 분석');
    submit.type = 'button';
    submit.setAttribute('type', 'button');
    var cancel = make(doc, 'button', 'pf-solbi-options-cancel', action.cancelLabel || '취소');
    cancel.type = 'button';
    cancel.setAttribute('type', 'button');
    actions.appendChild(submit);
    actions.appendChild(cancel);
    controls.push(submit, cancel);
    box.appendChild(actions);
    box.appendChild(status);

    function lock(next, text) {
      state = next;
      box.setAttribute('data-state', next);
      controls.forEach(function (c) { c.disabled = true; });
      if (root.clearTimeout && timer) root.clearTimeout(timer);
      say(text != null ? text : (LOCKED[next] || LOCKED.closed), next === 'submitted' ? 'ok' : '');
    }
    function expired() { return !!action.expiresAt && Date.now() / 1000 >= Number(action.expiresAt); }
    function hold(on) {
      // while a message is on its way the buttons do nothing twice
      submit.disabled = on; cancel.disabled = on;
    }
    function hand(message, extra, done, sending) {
      if (state !== 'open') return;
      if (expired()) { lock('expired'); return; }
      if (isDisabled() || typeof opts.send !== 'function') { say('지금은 보낼 수 없습니다. 잠시 후 다시 눌러 주세요.', 'fail'); return; }
      state = 'sending';
      hold(true);
      say(sending);
      var result;
      try { result = opts.send(message, extra); } catch (_) { result = false; }
      Promise.resolve(result).then(function (sent) {
        if (state !== 'sending') return;  // the server's answer already settled the card
        if (sent === false) { state = 'open'; hold(false); say('지금은 보낼 수 없습니다. 잠시 후 다시 눌러 주세요.', 'fail'); return; }
        lock(done);
      }, function () {
        if (state !== 'sending') return;
        state = 'open'; hold(false); say('보내지 못했습니다. 연결을 확인한 뒤 다시 눌러 주세요.', 'fail');
      });
    }
    submit.addEventListener('click', function () {
      if (state !== 'open') return;
      var chosen = { id: id };
      for (var i = 0; i < groups.length; i++) {
        var group = groups[i], value = values[group.key];
        if (!visible(group)) continue;
        if (typeof group.max === 'number') {
          if (typeof value !== 'number' || !isFinite(value) || value < (group.min || 0) || value > group.max) {
            say((group.label || '값') + '은 ' + (group.min || 0) + '~' + group.max + '% 범위로 입력하세요.', 'fail');
            return;
          }
        }
        chosen[group.key] = value;
      }
      var address = mail && !mail.disabled ? validEmail(mail.value, multiple) : '';
      if (address === null) {
        say(multiple ? '받을 메일 주소를 확인해 주세요. 쉼표로 구분해 2개까지 넣을 수 있습니다.' : '받을 메일 주소 하나를 정확히 입력해 주세요. 예: name@example.com', 'fail');
        if (mail.focus) mail.focus();
        return;
      }
      chosen.email = address;
      hand(action.submitMessage || SUBMIT_MESSAGE, { analysisOptions: chosen }, 'submitted', '접수 중…');
    });
    cancel.addEventListener('click', function () {
      hand(CANCEL_MESSAGE, {}, 'cancelled', '취소하는 중…');
    });

    var timer = 0;
    if (action.expiresAt && root.setTimeout) {
      var left = Number(action.expiresAt) * 1000 - Date.now();
      if (left > 0 && left < 2147483647) timer = root.setTimeout(function () { if (state === 'open') lock('expired'); }, left);
    }
    var api = {
      id: id,
      state: function () { return state; },
      values: function () { var out = {}; Object.keys(values).forEach(function (k) { out[k] = values[k]; }); return out; },
      lock: lock
    };
    box.pfOptions = api;
    if (id) {
      // an earlier card of the same draft (shown again after a refused value) hands over to this one
      (cards[id] || []).forEach(function (old) { if (old.state() === 'open' || old.state() === 'sending') old.lock('replaced'); });
      (cards[id] = cards[id] || []).push(api);
    }
    if (expired()) lock('expired');
    else if (isDisabled() && opts.readOnly) lock('closed');
    return box;
  }

  /* The server ended a draft: its cards are read-only from now on. A card that already says so keeps its own words. */
  function settle(id, next) {
    (cards[String(id || '')] || []).forEach(function (card) {
      var now = card.state();
      if (now === 'open' || now === 'sending') card.lock(LOCKED[next] ? next : 'closed');
    });
  }

  var api = { render: render, settle: settle, css: CSS, SUBMIT_MESSAGE: SUBMIT_MESSAGE, CANCEL_MESSAGE: CANCEL_MESSAGE };
  root.PFSolbiOptions = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
