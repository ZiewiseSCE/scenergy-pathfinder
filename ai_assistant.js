/* ============================================================================
 * ai_assistant.js  —  SCEnergy 태양광 Pathfinder · AI 비서 채팅 모듈
 * ----------------------------------------------------------------------------
 *  - 헤더 toolbar 에 💬 AI 비서 버튼을 자동 주입
 *  - 우측 슬라이드 패널(420px) 채팅창
 *  - SSE 스트리밍 응답 (백엔드 /api/llm/chat/stream)
 *  - 의도 분류 결과로 8체크 카드 / 표 / 엑셀 다운로드 자동 렌더
 *  - 이 파일은 solar_pathfinder.html 끝에 한 줄 <script src="...ai_assistant.js"></script>
 *    만 추가하면 동작. 기존 코드 변경 없음.
 *  - 백엔드 base URL 은 window.SOLAR_API_BASE 또는 window.BACKEND_URL 또는 location.origin 사용.
 * ============================================================================ */

(function () {
  "use strict";

  // -------- Configuration ---------------------------------------------------
  // [FIX 2026-05-03] window.BACKEND_URL fallback 추가.
  // HTML 측에서는 ?backend=... 쿼리스트링으로 window.BACKEND_URL 만 설정하므로,
  // window.SOLAR_API_BASE 가 없으면 BACKEND_URL 을 따라가야 cross-origin POST 가 백엔드로 정확히 도달함.
  const API_BASE = (window.SOLAR_API_BASE || window.BACKEND_URL || "").replace(/\/+$/, "")
                   || ""; // 둘 다 없으면 같은 도메인 호출
  const MAX_HISTORY = 20;
  const PANEL_WIDTH = 420;
  const HEADER_INJECT_MAX_RETRY = 20;
  const jobStorageKey = () => window.PFSolbiContext?.storageKey('aiast_jobs_v2') || 'aiast_jobs_signed_out';
  const JOB_TTL_MS = 24 * 3600 * 1000;
  const activeJobPolls = new Map();

  const state = {
    open: false,
    history: [],         // [{role:'user'|'assistant', content:string}]
    busy: false,
    abort: null,activeTurn:null,turns:new Map(),
    lastIntent: null,
    lastResult: null,
    headerInjectRetries: 0,
    awake:false,wakeChecked:false,wakeRevision:0,epoch:0,scope:crypto.randomUUID(),clarification:null,contextReset:false,pendingNotice:null,activationGrant:null,
  };
  const scopedFetch=window.fetch.bind(window);
  window.fetch=function(input,init={}){let url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);if(url.origin===location.origin&&/^\/api\/(?:llm\/scan-wizard|batches)(?:\/|$)/.test(url.pathname)){url=new URL(url.pathname+url.search,API_BASE||location.origin);input=input instanceof Request?new Request(url,input):url.href;}if(state.activationGrant&&url.origin===new URL(API_BASE||location.origin,location.href).origin&&url.pathname.startsWith('/api/llm/')){const headers=new Headers(init.headers||(input instanceof Request?input.headers:undefined));headers.set('X-Solbi-Wake-Grant',state.activationGrant);init={...init,headers};}return scopedFetch(input,init);};
  let resolvePcAwake,pcAwakeReady=new Promise(resolve=>{resolvePcAwake=resolve;});
  window.PFSolbiWake={get ready(){return pcAwakeReady;},isAwake:()=>state.awake,recheck:()=>checkWake()};
  window.PFSolbiFiles={download:url=>window.PFHTTP.download(new URL(url,API_BASE||location.origin).href),share:url=>window.PFHTTP.download(new URL(url,API_BASE||location.origin).href)};
  const widgetPromises=new Map();
  async function openWorkflow(action){if(!state.awake)return;const batch=action.kind==='batch_pdf',name=batch?'batch':'scan-wizard',html=batch?'solbi_batch.html':'solbi_scan_wizard.html',api=batch?'PFSolbiBatch':'PFSolbiScanWizard';if(!widgetPromises.has(name))widgetPromises.set(name,(async()=>{const base=new URL('/assets/',location.origin);const response=await fetch(new URL(html,base),{cache:'no-store'});if(!response.ok)throw Error('설정 화면을 불러오지 못했습니다.');const host=document.createElement('div');host.innerHTML=await response.text();document.body.append(host);const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('solbi-'+name+'.css?v='+Date.now(),base);document.head.append(css);await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('solbi-'+name+'.js?v='+Date.now(),base);script.onload=resolve;script.onerror=reject;document.body.append(script);});})());try{await widgetPromises.get(name);if(!state.awake)return;if(batch)window[api].open((action.addresses||[]).join('\n'));else window[api].open({view:action.view==='jobs'?'jobs':'new',draft:action.draft});}catch(_){widgetPromises.delete(name);addMessage('system','설정 화면을 불러오지 못했습니다. 연결을 확인한 뒤 다시 눌러 주세요.');}}

  // -------- Utility ---------------------------------------------------------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) =>
      ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  }
  function mdToHtml(s) {
    // 매우 가벼운 markdown → html (표/볼드/리스트 정도만)
    let html = escapeHtml(s);
    // 표
    html = html.replace(/\n((\|.*\|\n)+)/g, function (m, tbl) {
      const lines = tbl.trim().split(/\n/);
      const header = lines[0].split("|").slice(1, -1).map(s=>s.trim());
      const sep = lines[1] && /^[\s|:\-]+$/.test(lines[1]) ? lines[1] : null;
      const rowsStart = sep ? 2 : 1;
      const rows = lines.slice(rowsStart).map(l => l.split("|").slice(1, -1).map(s=>s.trim()));
      let h = "<table class='aiast-table'><thead><tr>" +
              header.map(h=>`<th>${h}</th>`).join("") + "</tr></thead><tbody>" +
              rows.map(r => "<tr>" + r.map(c=>`<td>${c}</td>`).join("") + "</tr>").join("") +
              "</tbody></table>";
      return "\n" + h;
    });
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>\s*)+/gs, m => "<ul>" + m + "</ul>");
    html = html.replace(/\n{2,}/g, "<br/><br/>");
    html = html.replace(/\n/g, "<br/>");
    return html;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchJsonWithRetry(url, options = {}, retry = 1, timeoutMs = 60000) {
    let lastErr = null;
    for (let attempt = 0; attempt <= retry; attempt++) {
      const ctrl = new AbortController();
      const relay=()=>ctrl.abort();if(options.signal?.aborted)relay();else options.signal?.addEventListener('abort',relay,{once:true});
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const ownJob=/\/api\/llm\/(chat(?:\/stream)?|job\/start)$/.test(new URL(url,location.href).pathname);
        const transport=ownJob&&window.PFHTTP?.native?window.PFHTTP.native:window.fetch.bind(window);
        const headers=new Headers(window.PFHTTP?.headers?.(options.headers)||options.headers);
        if(state.activationGrant&&new URL(url,location.href).origin===new URL(API_BASE||location.origin,location.href).origin&&new URL(url,location.href).pathname.startsWith('/api/llm/'))headers.set('X-Solbi-Wake-Grant',state.activationGrant);
        const resp = await transport(url, {
          ...options,
          headers,
          credentials: "include",
          signal: ctrl.signal,
        });
        if(ctrl.signal.aborted)throw new DOMException('요청 중단','AbortError');
        const text = await resp.text();
        if(ctrl.signal.aborted)throw new DOMException('요청 중단','AbortError');
        let data = {};
        if (text) {
          try { data = JSON.parse(text); }
          catch (_) { data = { ok: false, error: text.slice(0, 300) }; }
        }
        if(data.intent==='wake_required'){lockAssistant();throw new Error('시작 상태를 다시 확인해 주세요.');}
        if (!resp.ok) {
          if(resp.status===401||resp.status===403)state.activationGrant=null;
          throw new Error(data.message || data.reason || data.error || `HTTP ${resp.status}`);
        }
        return data;
      } catch (err) {
        lastErr = err;
        if (err.name === "AbortError" || (options.method||"GET").toUpperCase() !== "GET" || attempt >= retry) break;
        await sleep(700 * (attempt + 1));
      } finally {
        clearTimeout(timer);options.signal?.removeEventListener('abort',relay);
      }
    }
    throw lastErr || new Error("network_error");
  }

  function isAddressLike(text) {
    return /(?:시|군|구|동|읍|면|리|로|길)\s?\d|번지|산\s?\d/.test(text || "")
        || /[가-힣]+(?:시|도|군)\s+[가-힣]+(?:구|군|시)/.test(text || "");
  }

  function countAddressLines(text) {
    return (text || "")
      .split(/\n|,|;|\/|하고|이랑|와|과/g)
      .map((s) => s.trim())
      .filter((s) => s.length >= 6 && isAddressLike(s)).length;
  }

  function isSpecificAddressRequest(text) {
    return isAddressLike(text) && /(?:\d|번지|산\s?\d)/.test(text || "");
  }

  function shouldRunInBackground(text) {
    const t = text || "";
    if (countAddressLines(t) >= 2) return true;
    if (/(?:주소|부지|필지).{0,8}\d+\s*개|\d+\s*개.{0,8}(?:주소|부지|필지)/.test(t)) return true;
    const scanLike = /(전수|스캔)/.test(t) && /(시작|실행|돌려|해줘|해 줘)/.test(t);
    return scanLike && !isSpecificAddressRequest(t);
  }

  function loadBackgroundJobs() {
    try {
      const jobs = JSON.parse(sessionStorage.getItem(jobStorageKey()) || "[]");
      const cutoff = Date.now() - JOB_TTL_MS;
      return (Array.isArray(jobs) ? jobs : []).filter((j) => j && j.job_id && (j.t || 0) > cutoff&&!replyCancelled(j));
    } catch (_) {
      return [];
    }
  }

  function saveBackgroundJobs(jobs) {
    try { sessionStorage.setItem(jobStorageKey(), JSON.stringify((jobs || []).slice(-20))); }
    catch (_) {}
  }

  function upsertBackgroundJob(job) {
    if (!job || !job.job_id) return;
    const jobs = loadBackgroundJobs().filter((j) => j.job_id !== job.job_id);
    jobs.push({ ...job, t: job.t || Date.now() });
    saveBackgroundJobs(jobs);
  }

  function removeBackgroundJob(jobId) {
    if (!jobId) return;
    saveBackgroundJobs(loadBackgroundJobs().filter((j) => j.job_id !== jobId));
  }

  function terminalJobStatus(status) {
    return ["done", "error", "stopped", "cancelled"].includes(String(status || "").toLowerCase());
  }

  function jobPayloadForCards(j) {
    const payload = (j && j.result && j.result.result) || (j && j.result) || {};
    const out = payload && typeof payload === "object" ? { ...payload } : {};
    if (j && j.download_url) out.download_url = j.download_url;
    if (j && j.results_url) out.results_url = j.results_url;
    return out;
  }

  function jobActionHtml(payload) {
    if (!payload || (!payload.download_url && !payload.results_url)) return "";
    const btn = (href, label, bg) => href
      ? `<button style="background:${bg};color:white;border:0;border-radius:8px;padding:7px 10px;font-size:11px;font-weight:700;cursor:pointer" onclick="window.open('${escapeHtml(href)}','_blank')">${escapeHtml(label)}</button>`
      : "";
    return `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
      ${btn(payload.download_url, "CSV 다운로드", "#0891b2")}
      ${btn(payload.results_url, "결과 보기", "#334155")}
    </div>`;
  }

  function historyForAPI() {
    return state.history.slice(0, -1).slice(-MAX_HISTORY);
  }

  // -------- Style injection -------------------------------------------------
  function injectStyle() {
    if (document.getElementById("aiast-style")) return;
    const css = `
      #aiast-btn{
        padding:3px 10px;font-size:11px;font-weight:700;border-radius:9999px;cursor:pointer;
        background:rgba(168,85,247,.12);color:#c084fc;border:1px solid rgba(168,85,247,.45);
        display:flex;align-items:center;gap:4px;transition:.2s;
      }
      #aiast-btn:hover{background:rgba(168,85,247,.25);color:#e9d5ff;}
      #aiast-panel{
        position:fixed;top:0;right:-${PANEL_WIDTH+20}px;width:min(${PANEL_WIDTH}px,100vw);height:100dvh;
        background:linear-gradient(180deg,rgba(15,23,42,.92),rgba(2,6,23,.95));
        backdrop-filter:blur(18px) saturate(160%);
        -webkit-backdrop-filter:blur(18px) saturate(160%);
        border-left:1px solid rgba(168,85,247,.4);
        box-shadow:-12px 0 40px rgba(0,0,0,.55);
        z-index:3000;display:flex;flex-direction:column;
        transition:right .35s cubic-bezier(.4,0,.2,1);
        color:#e2e8f0;font-family:Pretendard,system-ui,sans-serif;
      }
      #aiast-panel.open{right:0;}
      .aiast-header{
        padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.25);
        display:flex;align-items:center;gap:8px;
      }
      .aiast-title{font-size:13px;font-weight:700;color:#e9d5ff;flex:1;}
      .aiast-subtitle{font-size:10px;color:#94a3b8;margin-top:2px;}
      .aiast-iconbtn{
        background:transparent;border:none;color:#cbd5e1;cursor:pointer;
        padding:4px 8px;border-radius:6px;font-size:13px;
      }
      .aiast-iconbtn:hover{background:rgba(148,163,184,.15);color:#fff;}
      .aiast-body{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;}
      .aiast-body::-webkit-scrollbar{width:6px;}
      .aiast-body::-webkit-scrollbar-thumb{background:rgba(148,163,184,.4);border-radius:3px;}
      .aiast-msg{
        padding:8px 11px;border-radius:12px;font-size:12px;line-height:1.55;
        max-width:92%;word-break:break-word;white-space:pre-wrap;
      }
      .aiast-msg.user{
        background:rgba(56,189,248,.15);border:1px solid rgba(56,189,248,.4);
        color:#e0f2fe;align-self:flex-end;border-bottom-right-radius:4px;
      }
      .aiast-msg.assistant{
        background:rgba(15,23,42,.6);border:1px solid rgba(168,85,247,.3);
        color:#e2e8f0;align-self:flex-start;border-bottom-left-radius:4px;
      }
      .aiast-msg.system{
        background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.35);
        color:#fde68a;align-self:center;font-size:10.5px;text-align:center;
      }
      .aiast-msg .aiast-table{
        width:100%;border-collapse:collapse;margin:6px 0;font-size:11px;
      }
      .aiast-msg .aiast-table th,.aiast-msg .aiast-table td{
        border:1px solid rgba(148,163,184,.3);padding:4px 6px;
      }
      .aiast-msg .aiast-table th{background:rgba(168,85,247,.15);color:#e9d5ff;}
      .aiast-checks{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px;}
      .aiast-check{
        font-size:10.5px;padding:5px 7px;border-radius:6px;
        background:rgba(15,23,42,.5);border:1px solid rgba(71,85,105,.45);
      }
      .aiast-check.pass{border-left:3px solid #22c55e;}
      .aiast-check.warn{border-left:3px solid #f59e0b;}
      .aiast-check.fail{border-left:3px solid #ef4444;}
      .aiast-check b{color:#cbd5e1;}
      .aiast-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;}
      .aiast-action{
        font-size:10.5px;padding:4px 8px;border-radius:9999px;cursor:pointer;
        background:rgba(56,189,248,.12);color:#7dd3fc;border:1px solid rgba(56,189,248,.4);
      }
      .aiast-action:hover{background:rgba(56,189,248,.25);}
      .aiast-input-row{
        padding:10px 12px;border-top:1px solid rgba(148,163,184,.25);
        display:flex;gap:6px;align-items:flex-end;background:rgba(2,6,23,.55);
      }
      .aiast-input{
        flex:1;background:rgba(15,23,42,.7);border:1px solid rgba(148,163,184,.3);
        color:#e2e8f0;border-radius:10px;padding:8px 10px;font-size:12px;
        resize:none;min-height:36px;max-height:140px;font-family:inherit;
      }
      .aiast-input:focus{outline:none;border-color:rgba(168,85,247,.7);}
      .aiast-send{
        background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;border:none;
        border-radius:10px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;
        transition:.2s;
      }
      .aiast-send:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(168,85,247,.4);}
      .aiast-send:disabled{opacity:.5;cursor:not-allowed;transform:none;}
      .aiast-typing{
        display:inline-flex;gap:3px;padding:5px;
      }
      .aiast-typing span{
        width:5px;height:5px;background:#cbd5e1;border-radius:50%;
        animation:aiast-blink 1.4s infinite;
      }
      .aiast-typing span:nth-child(2){animation-delay:.2s;}
      .aiast-typing span:nth-child(3){animation-delay:.4s;}
      @keyframes aiast-blink{0%,80%,100%{opacity:.3;}40%{opacity:1;}}
      .aiast-quickbar{
        padding:6px 12px;display:flex;gap:5px;flex-wrap:wrap;
        border-top:1px solid rgba(148,163,184,.18);background:rgba(2,6,23,.4);
      }
      .aiast-quick{
        font-size:10px;padding:3px 8px;border-radius:9999px;
        background:rgba(15,23,42,.6);color:#94a3b8;cursor:pointer;
        border:1px solid rgba(71,85,105,.45);
      }
      .aiast-quick:hover{color:#e9d5ff;border-color:rgba(168,85,247,.5);}
    `;
    const style = document.createElement("style");
    style.id = "aiast-style";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // -------- Header button injection -----------------------------------------
  function injectHeaderButton() {
    if (document.getElementById("aiast-btn")) return;

    const btn = document.createElement("button");
    btn.id = "aiast-btn";
    btn.type = "button";
    btn.className = "header-sim-btn";
    btn.innerHTML = "💬 솔비";
    btn.title = "AI 비서 (자연어로 주소 분석/전기사용량 조회)";
    btn.addEventListener("click", openPanel);

    // 기존 3D 시뮬 버튼 옆에 끼워 넣되, 해당 버튼이 없는 화면에서는
    // 무한 setTimeout 재시도로 CPU를 쓰지 않고 toolbar/body 우측 하단 fallback 사용.
    const sim3d = document.getElementById("headerSim3dBtn");
    const toolbar = document.querySelector("header .toolbar, .toolbar, #toolbar, header");
    if (sim3d) {
      sim3d.insertAdjacentElement("afterend", btn);
      return;
    }
    if (toolbar) {
      toolbar.appendChild(btn);
      return;
    }
    if (state.headerInjectRetries < HEADER_INJECT_MAX_RETRY) {
      state.headerInjectRetries += 1;
      setTimeout(injectHeaderButton, 300);
      return;
    }
    btn.style.position = "fixed";
    btn.style.right = "16px";
    btn.style.bottom = "16px";
    btn.style.zIndex = "2999";
    document.body.appendChild(btn);
  }

  // -------- Panel rendering -------------------------------------------------
  function renderPanel() {
    if (document.getElementById("aiast-panel")) return;
    const panel = document.createElement("div");
    panel.id = "aiast-panel";
    panel.innerHTML = `
      <div class="aiast-header">
        <div style="flex:1">
          <div class="aiast-title">💬 솔비 업무 비서</div>
          <div class="aiast-subtitle" id="aiast-context">현장 미선택 · 저장 자료 우선</div>
        </div>
        <button class="aiast-iconbtn" id="aiast-clear" title="대화 비우기">🧹</button>
        <button class="aiast-iconbtn" id="aiast-guide" title="솔비 화면 안내">가이드</button>
        <button class="aiast-iconbtn" id="aiast-close" title="닫기">✕</button>
      </div>
      <div class="aiast-body" id="aiast-body"></div>
      <div id="aiast-notifications"></div>
      <div class="aiast-quickbar" id="aiast-quickbar">
        <button class="aiast-quick" data-q="선택 현장의 한전 용량과 사업성 요약해줘">선택 현장 요약</button>
        <button class="aiast-quick" data-q="최신 SMP REC 알려줘">SMP · REC</button>
        <button class="aiast-quick" data-q="솔비는 어떤 일을 할 수 있어?">솔비 사용법</button>
      </div>
      <div id="aiast-cancelbar" hidden><button id="aiast-cancel" type="button">현재 답변 취소</button><small>스캔·보고서·메일은 각 진행 화면에서 별도로 취소합니다.</small></div>
      <div id="aiast-pending-replies" hidden aria-label="진행 중인 이전 답변"></div>
      <form class="aiast-input-row" id="aiast-form" autocomplete="off">
        <input id="aiast-unlock" class="aiast-input" type="password" aria-label="AI 비서 시작 문구" placeholder="AI 비서 시작 문구" autocomplete="off" autocapitalize="off" spellcheck="false">
        <textarea id="aiast-text" hidden class="aiast-input" aria-label="솔비에게 질문" placeholder="주소·질문 입력 · 새 조회는 ‘실시간 분석’" rows="1"></textarea>
        <button class="aiast-send" id="aiast-send" type="submit">전송</button>
      </form>
    `;
    document.body.appendChild(panel);

    $("#aiast-close", panel).addEventListener("click", closePanel);
    $("#aiast-guide", panel).addEventListener("click", () => {closePanel();window.PFGuide?.start(location.pathname.includes('solar_pathfinder')?'scan':'map');});
    $("#aiast-clear", panel).addEventListener("click", clearHistory);
    $("#aiast-form", panel).addEventListener("submit", onSubmit);
    $("#aiast-cancel",panel).onclick=()=>{const turn=$("#aiast-cancel")._turn;if(turn)cancelReply(turn);};
    $("#aiast-text", panel).addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        $("#aiast-form").requestSubmit();
      }
    });
    $$(".aiast-quick", panel).forEach((b) => {
      b.addEventListener("click", () => {
        $("#aiast-text").value = b.dataset.q;
        $("#aiast-form").requestSubmit();
      });
    });

    const extra=document.createElement('style');extra.textContent='#aiast-btn[data-notification-count]:not([data-notification-count=""])::after{content:attr(data-notification-count);background:#be334d;color:white;border-radius:10px;padding:1px 6px}#aiast-panel [hidden]{display:none!important}#aiast-panel .aiast-iconbtn,#aiast-panel .aiast-send,#aiast-panel .aiast-input,#aiast-panel .aiast-choice{min-height:44px;min-width:44px}#aiast-panel .aiast-input{min-width:0;font-size:16px}#aiast-panel .aiast-header{flex-wrap:wrap}#aiast-cancelbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:5px 12px}#aiast-cancelbar button,.aiast-reply-cancel{min-height:44px;padding:6px 10px;border:1px solid #aac5c1;border-radius:9px;background:white;color:#235d59;font:12px system-ui}#aiast-cancelbar small{font-size:10px;color:#607476}#aiast-pending-replies{max-height:112px;overflow:auto;padding:0 12px;font:12px/1.5 system-ui}#aiast-pending-replies>div{display:flex;align-items:center;gap:6px;padding:4px 0}#aiast-pending-replies span{flex:1;min-width:0;overflow-wrap:anywhere}#aiast-panel .aiast-cancel-status{white-space:pre-wrap}#aiast-panel .aiast-choice{margin:4px;padding:8px 12px;border:1px solid #9dbdbb;border-radius:10px;background:#fff;color:#245958}';document.head.append(extra);
    checkWake();
    Promise.resolve(window.PFSolbiContext?.ready).then(()=>{window.PFSolbiCancel?.init({apiBase:API_BASE,ownerKey:()=>window.PFSolbiContext?.storageKey('solbi_chat_cancel_v1')||null,wakeHeaders:()=>state.activationGrant?{'X-Solbi-Wake-Grant':state.activationGrant}:{}});if(window.PFSolbiContext)window.PFSolbiNotifications?.mount($('#aiast-notifications'),{apiBase:API_BASE,ownerKey:()=>window.PFSolbiContext.storageKey('solbi_notifications_v1'),workerUrl:'/solbi-notifications-sw.js',workerScope:'/',onWorkflow:item=>openWorkflow({kind:item.id.startsWith('batch')?'batch_pdf':'scan_wizard',view:'jobs'}),canReadResult:()=>state.awake,wakeHeaders:()=>state.activationGrant?{'X-Solbi-Wake-Grant':state.activationGrant}:{},onUnread:count=>{const button=$('#aiast-btn');if(button){button.dataset.notificationCount=count?String(count):'';button.setAttribute('aria-label','솔비'+(count?' · 새 알림 '+count+'건':''));}},isReading:event=>state.awake&&state.open&&!document.hidden&&event.conversationScope===state.scope&&!event.workflowId,onOpen:item=>{openPanel();if(item?.jobId){state.pendingNotice=item.jobId;if(state.awake)showNoticeResult();}}});});
  }

  function welcome() {
    addMessage(
      "assistant",
      "솔비 업무 비서입니다.\n• 지도에서 선택한 현장의 저장 결과를 요약합니다.\n• 새 조회는 정확한 주소와 ‘실시간 분석’을 입력하세요.\n• SMP·REC, 내 작업 상태, 대출 계산도 바로 물어보세요."
    );
  }

  function openPanel() {
    if (!document.getElementById("aiast-panel")) renderPanel();
    state.open = true;
    const c=window.PFSolbiContext?.get()||{};
    $('#aiast-context').textContent=(c.address||'현장 미선택')+' · '+(c.dataMode==='live'?'실시간 모드':'저장 자료 우선');
    requestAnimationFrame(() => {
      $("#aiast-panel").classList.add("open");
      $("#aiast-text") && $("#aiast-text").focus();
    });
    if(state.awake)resumeBackgroundJobs();else checkWake();
  }
  function closePanel() {
    state.open = false;
    const p = $("#aiast-panel");
    if (p) p.classList.remove("open");
  }
  function clearHistory() {
    if(!state.awake||!confirm('새 대화를 시작할까요? 대화와 현장 조건은 초기화되며 접수한 서버 작업은 계속됩니다.'))return;
    ++state.epoch;state.scope=crypto.randomUUID();state.clarification=null;state.contextReset=true;state.busy=false;state.activeTurn=null;refreshCancelTools();
    $('#aiast-send').disabled=false;
    window.PFSolbiContext?.clear();
    state.history = [];
    state.lastIntent = null;
    state.lastResult = null;
    const body = $("#aiast-body");
    if (body) body.innerHTML = "";
    welcome();
  }

  function conversationContext(){return{...(state.contextReset?{}:window.PFSolbiContext?.get()||{}),conversationId:state.scope,...(state.clarification?{clarification:state.clarification}:{})};}
  function acceptContext(context){if(context&&Object.hasOwn(context,'clarification'))state.clarification=context.clarification||null;if(context&&['siteId','layoutId','address','pnu'].some(k=>context[k])){window.PFSolbiContext?.set(context);state.contextReset=false;}}
  function lockAssistant(){const wasAwake=state.awake;if(wasAwake){pcAwakeReady=new Promise(resolve=>{resolvePcAwake=resolve;});window.dispatchEvent(new Event('solbi:locked'));}state.awake=false;state.wakeChecked=true;state.activeTurn=null;refreshCancelTools();++state.epoch;++state.wakeRevision;state.busy=false;state.clarification=null;for(const timer of activeJobPolls.values())clearTimeout(timer);activeJobPolls.clear();$('#aiast-body').replaceChildren();addMessage('system','AI 비서 시작 문구를 입력해 주세요.');$('#aiast-text').hidden=true;$('#aiast-text').value='';$('#aiast-unlock').hidden=false;$('#aiast-unlock').value='';$('#aiast-quickbar').hidden=true;$('#aiast-send').disabled=false;}
  async function checkWake(){const revision=++state.wakeRevision;try{const j=await fetchJsonWithRetry(API_BASE+'/api/llm/wake/status',{method:'GET'},0,15000);if(revision!==state.wakeRevision)return;if(j.awake===true){const was=state.awake;state.awake=true;state.wakeChecked=true;$('#aiast-unlock').hidden=true;$('#aiast-text').hidden=false;$('#aiast-quickbar').hidden=false;if(!was){$('#aiast-body').replaceChildren();if(state.history.length)state.history.forEach(row=>addMessage(row.role,row.content));else welcome();resolvePcAwake(true);window.dispatchEvent(new Event('solbi:awake'));resumeBackgroundJobs();refreshCancelTools();if(state.pendingNotice)showNoticeResult();}return;}lockAssistant();}catch(_){if(revision===state.wakeRevision)lockAssistant();}}
  async function showNoticeResult(){const id=state.pendingNotice,epoch=state.epoch;if(!id||!state.awake||PFSolbiCancel.isCancelled({jobId:id}))return;state.pendingNotice=null;try{const j=await fetchJsonWithRetry(API_BASE+'/api/llm/job/status/'+encodeURIComponent(id),{method:'GET'},0,15000);if(!state.awake||epoch!==state.epoch||PFSolbiCancel.isCancelled({jobId:id})||j.displaySuppressed===true||j.cancelRequested||j.status==='cancelled')return;const section=document.createElement('details'),title=document.createElement('summary'),content=document.createElement('p');section.dataset.replyJob=id;if(j.cancelLocator)section.dataset.replyTurn=j.cancelLocator.messageId;title.textContent='알림의 작업 결과 · 현재 대화 기억과 별도';content.textContent=j.answer||'작업 상태: '+j.status;section.append(title,content);section.open=true;$('#aiast-body').append(section);}catch(_){if(state.awake&&epoch===state.epoch&&!PFSolbiCancel.isCancelled({jobId:id}))addMessage('system','이 작업의 결과를 지금 확인하지 못했습니다.');}}
  function responseActions(payload,node){
    acceptContext(payload.context);
    const action=payload.action;if(action?.kind==='clarification')for(const choice of action.choices||[]){const button=document.createElement('button');button.type='button';button.className='aiast-choice';button.textContent=choice.label;button.onclick=()=>{if(!state.awake||state.busy)return;if(state.clarification?.id!==action.id||state.clarification.revision!==action.revision||Date.now()/1000>=action.expiresAt){addMessage('system','선택의 유효 시간이 지났습니다. 요청을 다시 말씀해 주세요.');return;}$('#aiast-text').value=choice.value;$('#aiast-form').requestSubmit();};node.append(button);}
    if(['scan_wizard','batch_pdf'].includes(action?.kind)){const button=document.createElement('button');button.type='button';button.className='aiast-choice';button.textContent=action.kind==='batch_pdf'?'주소 목록·PDF 설정 열기':'지역 스캔 설정·결과 열기';button.onclick=()=>openWorkflow(action);node.append(button);}
  }
  function replyLocator(job){const loc=job?.cancelLocator||{};return{messageId:job?.messageId||loc.messageId,conversationId:loc.conversationId||job?.scope,jobId:job?.jobId||job?.job_id};}
  function replyCancelled(job){return window.PFSolbiCancel?.isCancelled({...replyLocator(job),job_id:job?.job_id})===true;}
  function refreshCancelTools(){const button=$('#aiast-cancel'),bar=$('#aiast-cancelbar');if(!button)return;const pending=[...state.turns.values()].filter(turn=>!turn.cancelled&&turn.scope===state.scope&&!turn.detached),turn=state.activeTurn&&!state.activeTurn.cancelled?state.activeTurn:pending.at(-1);button._turn=turn;bar.hidden=!state.awake||!turn;const list=$('#aiast-pending-replies');if(!list)return;list.replaceChildren();for(const pending of state.turns.values()){if(pending.cancelled||!pending.jobId||pending===turn)continue;const row=document.createElement('div'),text=document.createElement('span');text.textContent=String(pending.message||'이전 대화에서 접수한 답변').slice(0,120);row.append(text);attachReplyCancel(row,pending);list.append(row);}list.hidden=!state.awake||!list.childElementCount;}
  function attachReplyCancel(node,turn){if(!node||!turn?.messageId||!turn?.scope)return;node.dataset.replyTurn=turn.messageId;if(node.querySelector('.aiast-reply-cancel'))return;const button=document.createElement('button');button.type='button';button.className='aiast-reply-cancel';button.textContent='현재 답변 취소';button.onclick=()=>cancelReply(turn);node.append(button);}
  function finishReply(turn){state.turns.delete(turn.messageId);document.querySelectorAll('[data-reply-turn]').forEach(node=>{if(node.dataset.replyTurn===turn.messageId)node.querySelector('.aiast-reply-cancel')?.remove();});refreshCancelTools();}
  function cancelReply(turn,notifyServer=true){if(!state.awake||!turn?.messageId||!turn?.scope||turn.cancelled)return;turn.cancelled=true;if(notifyServer)PFSolbiCancel.cancel({messageId:turn.messageId,conversationId:turn.scope,jobId:turn.jobId});turn.controller?.abort();turn.streamAbort?.abort();if(state.activeTurn===turn){state.activeTurn=null;state.busy=false;$('#aiast-send').disabled=false;}if(turn.jobId){clearTimeout(activeJobPolls.get(turn.jobId));activeJobPolls.delete(turn.jobId);removeBackgroundJob(turn.jobId);}state.turns.delete(turn.messageId);state.history=state.history.filter(row=>row.messageId!==turn.messageId);document.querySelectorAll('[data-reply-turn]').forEach(node=>{if(node.dataset.replyTurn===turn.messageId)node.remove();});if(turn.scope===state.scope){const notice=addMessage('system',PFSolbiCancel.status(turn));notice.dataset.cancelStatus=turn.messageId;}refreshCancelTools();}
  window.addEventListener('solbi:cancel-storage',()=>{for(const turn of state.turns.values())if(replyCancelled(turn))cancelReply(turn,false);});
  window.addEventListener('solbi:reply-cancelled',event=>{document.querySelectorAll('[data-cancel-status]').forEach(node=>{if(node.dataset.cancelStatus===event.detail.messageId)node.textContent=PFSolbiCancel.status(event.detail);});document.querySelectorAll('[data-reply-job]').forEach(node=>{if(PFSolbiCancel.isCancelled({jobId:node.dataset.replyJob}))node.remove();});});
  function notifyReply(j,jobId,scope=state.scope){if(j.status==='cancelled'||j.cancelRequested||j.displaySuppressed===true||replyCancelled({...j,jobId}))return;const id=j.notificationEventId||(jobId?'job-'+jobId:null);if(id)window.PFSolbiNotifications?.received({id,intent:j.intent,type:'reply',jobId,conversationScope:scope,rendered:scope===state.scope});}

  // -------- Messages --------------------------------------------------------
  function addMessage(role, content, opts = {}) {
    const body = $("#aiast-body");
    if (!body) return null;
    const div = document.createElement("div");
    div.className = "aiast-msg " + role;
    if (opts.html) {
      div.innerHTML = opts.html;
    } else {
      div.innerHTML = role === "assistant" ? mdToHtml(content || "") : escapeHtml(content || "");
    }
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    return div;
  }

  function pushTyping() {
    return addMessage("assistant", "", {
      html: "<span class='aiast-typing'><span></span><span></span><span></span></span>",
    });
  }

  async function postChatFallback(message, targetNode) {
    const j = await fetchJsonWithRetry(API_BASE + "/api/llm/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history: historyForAPI(), context: window.PFSolbiContext?.get() || {} }),
    }, 1, 90000);
    const text = j.answer || j.text || j.reply || j.error || "(응답 없음)";
    targetNode.innerHTML = mdToHtml(text);
    state.history.push({ role: "assistant", content: text });
    if (j.result) renderRichResult(j.intent, j.result);
  }

  async function startBackgroundJob(message) {
    return await fetchJsonWithRetry(API_BASE + "/api/llm/job/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history: historyForAPI(), context: window.PFSolbiContext?.get() || {} }),
    }, 1, 30000);
  }

  async function runBackgroundJob(message, targetNode) {
    const j = await startBackgroundJob(message);
    if (!j.job_id) {
      const text = j.answer || j.text || j.reply || "작업 요청을 처리했습니다.";
      targetNode.innerHTML = mdToHtml(text);
      state.history.push({ role: "assistant", content: text });
      if (j.result) renderRichResult(j.intent, j.result);
      return;
    }
    const job = {
      job_id: j.job_id,
      kind: j.kind || "chat",
      status: j.status || "queued",
      intent: j.intent || "",
      message,
      t: Date.now(),
    };
    upsertBackgroundJob(job);
    const text = "백그라운드 작업으로 시작했습니다. 패널을 닫아도 서버에서 계속 진행하고, 다시 열면 결과를 이어서 보여드릴게요.";
    targetNode.innerHTML = mdToHtml(text);
    state.history.push({ role: "assistant", content: text });
    pollBackgroundJob(job, { targetNode, fast: true });
  }

  async function pollBackgroundJob(job, opts = {}) {
    if(!state.awake)return;
    if (!job || !job.job_id||replyCancelled(job)) return;
    let loc=replyLocator(job);let turn=loc.messageId?state.turns.get(loc.messageId):null;if(loc.messageId&&!turn){turn={messageId:loc.messageId,scope:loc.conversationId,jobId:job.job_id,message:job.message,cancelled:false};state.turns.set(turn.messageId,turn);}refreshCancelTools();
    if (activeJobPolls.has(job.job_id)) return;
    const wakeRevision=state.wakeRevision;
    const targetNode = opts.targetNode || (job.scope&&job.scope!==state.scope?document.createElement('div'):addMessage("assistant", '접수한 작업 상태를 확인하고 있습니다.'));
    let delay = opts.fast ? 1200 : 3500;

    const tick = async () => {
      if(!state.awake||wakeRevision!==state.wakeRevision)return;
      try {
        const j = await fetchJsonWithRetry(
          API_BASE + "/api/llm/job/status/" + encodeURIComponent(job.job_id),
          { method: "GET" },
          0,
          30000
        );
        if(!state.awake||wakeRevision!==state.wakeRevision)return;
        if(j.displaySuppressed===true){const current=j.cancelLocator||loc;if(current.messageId)PFSolbiCancel.suppress({...current,jobId:job.job_id},['done','error'].includes(j.status)?'already_completed':j.cancelRequested?'cancel_requested':'cancelled');}
        if(replyCancelled(job)||j.status==='cancelled'||j.cancelRequested||j.displaySuppressed===true){activeJobPolls.delete(job.job_id);removeBackgroundJob(job.job_id);if(turn&&!turn.cancelled)cancelReply(turn,false);else if(turn)finishReply(turn);targetNode.remove();return;}
        if(j.cancelLocator){job={...job,cancelLocator:j.cancelLocator,messageId:j.cancelLocator.messageId};loc=replyLocator(job);if(!turn&&loc.messageId){turn={messageId:loc.messageId,scope:loc.conversationId,jobId:job.job_id,message:job.message,cancelled:false};state.turns.set(turn.messageId,turn);refreshCancelTools();}}
        if (!j || (!j.ok&&!terminalJobStatus(j.status))) throw new Error((j && (j.error || j.message)) || "job_status_failed");
        const merged = { ...job, ...j, t: job.t || Date.now() };
        upsertBackgroundJob(merged);

        const pct = typeof j.progress === "number" ? Math.round(j.progress) : null;
        if (pct !== null && !terminalJobStatus(j.status)) {
          targetNode.innerHTML = mdToHtml(`백그라운드 작업 진행 중입니다. (${pct}%)`);if(turn)attachReplyCancel(targetNode,turn);
        }

        if (terminalJobStatus(j.status)) {
          activeJobPolls.delete(job.job_id);
          removeBackgroundJob(job.job_id);
          if(turn)finishReply(turn);
          notifyReply(j,job.job_id,job.scope||null);
          const answer = j.answer || (j.status === "done"
            ? "백그라운드 작업이 완료됐습니다."
            : `백그라운드 작업이 중단됐습니다: ${j.error || j.status}`);
          const payload = jobPayloadForCards(j);
          if(job.scope&&job.scope!==state.scope){addMessage('system','이전 대화의 작업 결과가 준비됐습니다. 알림에서 확인하세요.');return;}
          targetNode.innerHTML = mdToHtml(answer) + jobActionHtml(payload);
          state.history.push({ role: "assistant", content: answer,messageId:loc.messageId });responseActions(j,targetNode);
          if ((j.result && j.result.result) || (payload && payload.checks)) {
            renderRichResult((j.result && j.result.intent) || j.intent, (j.result && j.result.result) || payload);
          }
          return;
        }

        delay = Math.min(12000, Math.round(delay * 1.25));
        const timer = setTimeout(tick, delay);
        activeJobPolls.set(job.job_id, timer);
      } catch (err) {
        if(!state.awake||wakeRevision!==state.wakeRevision)return;
        if (String(err && err.message || "").includes("job_not_found")) {
          activeJobPolls.delete(job.job_id);
          removeBackgroundJob(job.job_id);
          targetNode.innerHTML = mdToHtml("이전 백그라운드 작업 상태를 서버에서 찾지 못했습니다.");
          return;
        }
        delay = Math.min(20000, Math.round(delay * 1.6));
        const timer = setTimeout(tick, delay);
        activeJobPolls.set(job.job_id, timer);
      }
    };

    const timer = setTimeout(tick, opts.fast ? 400 : 1000);
    activeJobPolls.set(job.job_id, timer);
  }

  function resumeBackgroundJobs() {
    const jobs = loadBackgroundJobs();
    if (!jobs.length) return;
    jobs.forEach((job) => pollBackgroundJob(job, { fast: false }));
  }

  // -------- Form submit -----------------------------------------------------
  async function onSubmit(e) {
    e.preventDefault();if(state.busy)return;await window.PFSolbiContext?.ready;
    const ta=$(state.awake?'#aiast-text':'#aiast-unlock'),txt=(ta.value||'').trim();if(!txt)return;ta.value='';
    if(!state.awake){if(!state.wakeChecked)return;state.busy=true;$('#aiast-send').disabled=true;try{const j=await fetchJsonWithRetry(API_BASE+'/api/llm/wake/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phrase:txt,grantTransport:'header'})},0,15000);if(j.awake===true){if(typeof j.activationGrant==='string'&&/^[A-Za-z0-9_-]{43}$/.test(j.activationGrant))state.activationGrant=j.activationGrant;await checkWake();}else lockAssistant();}catch(_){lockAssistant();}finally{state.busy=false;$('#aiast-send').disabled=false;}return;}
    const turn={messageId:crypto.randomUUID(),scope:state.scope,epoch:state.epoch,controller:new AbortController(),message:txt,cancelled:false,jobId:null},history=state.history.slice(-16),context=conversationContext();
    state.activeTurn=turn;state.turns.set(turn.messageId,turn);state.busy=true;$('#aiast-send').disabled=true;const typingNode=pushTyping();attachReplyCancel(typingNode,turn);refreshCancelTools();
    const current=()=>state.activeTurn===turn&&!turn.cancelled&&turn.epoch===state.epoch&&state.awake;
    try{
      const j=await fetchJsonWithRetry(API_BASE+'/api/llm/chat',{method:'POST',headers:{'Content-Type':'application/json','X-Solbi-Message-Id':turn.messageId,'X-Solbi-Conversation':turn.scope},signal:turn.controller.signal,body:JSON.stringify({message:txt,history,context})},0,120000);
      if(j.displaySuppressed===true){PFSolbiCancel.suppress({messageId:turn.messageId,conversationId:turn.scope,jobId:j.job_id},['done','error'].includes(j.status)?'already_completed':j.cancelRequested?'cancel_requested':'cancelled');cancelReply(turn,false);return;}
      if(turn.cancelled||replyCancelled(turn)){if(j.job_id)PFSolbiCancel.link(turn,j.job_id);return;}
      if(j.job_id){turn.jobId=j.job_id;turn.detached=!current();const job={job_id:j.job_id,kind:j.kind||'chat',status:j.status||'queued',scope:turn.detached?'detached-'+turn.messageId:turn.scope,cancelLocator:{messageId:turn.messageId,conversationId:turn.scope},messageId:turn.messageId,message:txt,t:Date.now()};upsertBackgroundJob(job);if(state.awake)pollBackgroundJob(job,{fast:true,...(current()?{targetNode:typingNode}:{})});}
      if(!current()){if(!j.job_id)finishReply(turn);return;}
      if(j.intent==='wake_required'){lockAssistant();return;}
      if(!(j.intent==='greeting'&&j.awake===true)){const userNode=addMessage('user',txt);userNode.dataset.replyTurn=turn.messageId;if(typingNode.parentNode)typingNode.parentNode.insertBefore(userNode,typingNode);state.history.push({role:'user',content:txt,messageId:turn.messageId});}
      const answer=j.job_id?'서버에 접수됐습니다. 패널을 닫아도 서버에서 계속 처리합니다.':j.answer||j.text||'응답을 확인해 주세요.';
      typingNode.innerHTML=mdToHtml(answer);state.history.push({role:'assistant',content:answer,messageId:turn.messageId});if(state.history.length>MAX_HISTORY)state.history=state.history.slice(-MAX_HISTORY);
      if(j.job_id)attachReplyCancel(typingNode,turn);else{responseActions(j,typingNode);notifyReply(j);if(j.result)renderRichResult(j.intent,j.result);finishReply(turn);}
    }catch(err){if(!current())return;if(err.name!=='AbortError')console.error(err);typingNode.innerHTML=mdToHtml(err.name==='AbortError'?'요청 대기 시간을 초과했습니다. 접수된 작업은 작업 상태에서 확인할 수 있습니다.':'응답을 받지 못했습니다. '+(err.message||'잠시 후 다시 시도해주세요.'));finishReply(turn);}
    finally{if(state.activeTurn===turn){state.activeTurn=null;state.busy=false;$('#aiast-send').disabled=false;}refreshCancelTools();}
  }

  // -------- SSE streaming ---------------------------------------------------
  // Phase 9.3: progress stages — 모바일 솔비처럼 단계 표시
  function startStages(targetNode) {
    const stages = ["☀️ 응답 준비 중 · 자체 서버에서 처리하고 있습니다."];
    let idx = 0;
    const started=Date.now();
    const render = () => {
      targetNode.innerHTML =
        "<div style=\"font-size:11.5px;color:#cbd5e1;display:flex;align-items:center;gap:8px;\">"
        + "<span>" + stages[idx % stages.length] + " · " + Math.round((Date.now()-started)/1000) + "초</span>"
        + "<span class=\"aiast-typing\"><span></span><span></span><span></span></span>"
        + "</div>";
    };
    render();
    const timer = setInterval(() => { idx++; render(); }, 2500);
    return { stop: () => clearInterval(timer) };
  }

  async function chatStream(message, targetNode) {
    const url = API_BASE + "/api/llm/chat/stream";
    const ctrl = new AbortController();
    state.abort = ctrl;const turn=state.activeTurn,epoch=state.epoch;const streamCurrent=()=>state.awake&&state.epoch===epoch&&(!turn||(!turn.cancelled&&state.activeTurn===turn));if(turn)turn.streamAbort=ctrl;
    const stageCtrl = startStages(targetNode);

    try {
      if (!API_BASE && location.protocol === "file:") {
        throw new Error("BACKEND_URL이 설정되지 않았습니다. ?backend=https://... 로 백엔드를 지정해 주세요.");
      }

      // Phase 9.1: credentials include — wake-word solbi_token 쿠키 전달 위해
      let resp;
      try {
        resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
          body: JSON.stringify({
            message,
            history: historyForAPI(),
            context: window.PFSolbiContext?.get() || {},
          }),
          signal: ctrl.signal,
          credentials: "include",
        });
      } catch (err) {
        if (stageCtrl) { try { stageCtrl.stop(); } catch (_) {} }
        throw err; // Do not replay a possibly accepted POST after transport failure.
      }

        if (!resp.ok) throw new Error(resp.status===401?"라이선스 로그인을 확인하세요.":"서버 응답 오류 ("+resp.status+")");
        if (!resp.body) {
        // Phase 9.3: fallback 진입 시 stage 중단 (응답 받기 직전)
        if (stageCtrl) { try { stageCtrl.stop(); } catch (_) {} }
      // SSE 가 막혀있으면 비스트리밍으로 fallback
      await postChatFallback(message, targetNode);
      return;
    }

    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buffer = "";
    let assembled = "";
    let intentMeta = null;

    while (true) {
      if(!streamCurrent()){ctrl.abort();return;}
      const { value, done } = await reader.read();
      if(!streamCurrent()){ctrl.abort();return;}
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const evt = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const lines = evt.split("\n");
        let event = "message";
        let data = "";
        for (const ln of lines) {
          if (ln.startsWith("event:")) event = ln.slice(6).trim();
          else if (ln.startsWith("data:")) data += ln.slice(5).trim();
        }
        try {
          const obj = data ? JSON.parse(data) : {};
          if (event === "meta") {
            intentMeta = obj;
          } else if (event === "token") {
            // Phase 9.3: 첫 token 도착 시 stage progress 즉시 중단
            if (stageCtrl) { try { stageCtrl.stop(); } catch (_) {} }
            assembled += obj.t || "";
            targetNode.innerHTML = mdToHtml(assembled);
            $("#aiast-body").scrollTop = $("#aiast-body").scrollHeight;
          } else if (event === "error") {
            assembled += "\n[오류] " + (obj.error || "");
            targetNode.innerHTML = mdToHtml(assembled);
          } else if (event === "done") {
            // pass
          }
        } catch (err) { /* ignore parse errors */ }
      }
    }

    // Phase 9.3: stream 종료 시 stage progress 안전 중단
    if (stageCtrl) { try { stageCtrl.stop(); } catch (_) {} }
    if(!streamCurrent())return;
    state.history.push({ role: "assistant", content: assembled });
    if(!assembled.trim())throw new Error('빈 응답입니다. 작업 상태를 확인하고 다시 시도하세요.');
    window.PFSolbiContext?.set(intentMeta?.context);
      if (intentMeta && intentMeta.result) {
        renderRichResult(intentMeta.intent || (intentMeta.result || {}).intent, intentMeta.result);
      }
    } finally {
      if (stageCtrl) { try { stageCtrl.stop(); } catch (_) {} }
      if(state.abort===ctrl)state.abort=null;
    }
  }

  // -------- Rich result renderers -------------------------------------------
  function renderRichResult(intent, result) {
    if (!result) return;
    state.lastIntent = intent;
    state.lastResult = result;

    if (intent === "single_address" && Array.isArray(result.checks)) {
      const cards = result.checks.map((c) => {
        const status = (c.status || "WARNING").toUpperCase();
        const klass = status === "PASS" ? "pass" : status === "FAIL" ? "fail" : "warn";
        return `<div class="aiast-check ${klass}"><b>${escapeHtml(c.title || c.key || "")}</b><br/>${escapeHtml(c.message || c.value || "")}</div>`;
      }).join("");
      const score = result.attractiveness_score;

      // Phase 9.3: PPA 후보 5곳 표 — 백엔드 ppa_candidates 활용
      let ppaTable = "";
      const ppa = Array.isArray(result.ppa_candidates) ? result.ppa_candidates : [];
      if (ppa.length > 0) {
        const re100Label = (s) => {
          const v = (s || "").toLowerCase();
          if (v === "both" || v === "re100") return "🌿 RE100";
          if (v === "k-re100") return "K-RE100";
          return "";
        };
        const ppaRows = ppa.slice(0, 5).map((p, i) => {
          const name = p.biz_name || p.company_name || p.name || "이름 없음";
          const distKm = (p.distance_km != null) ? Number(p.distance_km).toFixed(2) + "km" : "-";
          const fs = (p.final_score != null) ? Number(p.final_score).toFixed(1) : "-";
          const tag = re100Label(p.re100_status);
          return `<tr><td style="text-align:center">${i+1}</td><td>${escapeHtml(name)}</td><td style="text-align:right">${escapeHtml(distKm)}</td><td style="text-align:right">${escapeHtml(fs)}</td><td>${escapeHtml(tag)}</td></tr>`;
        }).join("");
        ppaTable = `
          <div style="font-size:11.5px;color:#7dd3fc;margin-top:10px;margin-bottom:4px;font-weight:600;">
            💡 PPA 후보 ${ppa.length}곳 (30km 내)
          </div>
          <table class="aiast-table">
            <thead><tr><th style="width:24px">#</th><th>회사명</th><th style="width:60px">거리</th><th style="width:50px">점수</th><th style="width:70px">구분</th></tr></thead>
            <tbody>${ppaRows}</tbody>
          </table>`;
      }

      // Phase 9.3: 지도 이동 / PF 시뮬 버튼 제거 — cross-origin 환경에서 window.map /
      // openFinanceModal 못 닿아 클릭 무반응. 사용자 명시 요청으로 삭제.
      const html = `
        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">
          📍 ${escapeHtml(result.address || "")}
          ${score != null ? ` · 사업성 점수 <strong style="color:#a855f7">${score}</strong>` : ""}
        </div>
        <div class="aiast-checks">${cards}</div>
        ${ppaTable}`;
      addMessage("assistant", "", { html });
    }

    if ((intent === "bulk_addresses" || intent === "factory_energy_bulk") && Array.isArray(result.results || result.items || result.matches)) {
      const list = result.results || result.items || result.matches;
      const rows = list.slice(0, 30).map((r, i) => {
        if (r.matches && Array.isArray(r.matches)) {
          const top = r.matches[0] || {};
          return `<tr><td>${i+1}</td><td>${escapeHtml(r.query?.address || r.query?.name || "")}</td><td>${escapeHtml(top.biz_name||"")}</td><td>${escapeHtml((top.elec_mwh||"-")+" MWh")}</td></tr>`;
        }
        const score = r.attractiveness_score || r.score || "-";
        return `<tr><td>${i+1}</td><td>${escapeHtml(r.address||"")}</td><td>${escapeHtml(score)}</td><td>-</td></tr>`;
      }).join("");
      const html = `
        <table class="aiast-table">
          <thead><tr><th>#</th><th>주소·쿼리</th><th>대표 매칭</th><th>지표</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="aiast-actions">
          <button class="aiast-action" data-act="downloadXlsx">⬇ 엑셀 다운로드</button>
        </div>`;
      const el = addMessage("assistant", "", { html });
      el.querySelector(".aiast-action").addEventListener("click", () => downloadAsCsv(list, intent));
    }
  }

  function downloadAsCsv(list, intent) {
    if (!list || !list.length) return;
    const flat = list.map((r) => {
      if (r.matches && r.matches.length) {
        const m = r.matches[0];
        return { 쿼리: r.query?.address || r.query?.name || "", 사업장명: m.biz_name, 주소: m.address,
                 연도: m.year, 전기_MWh: m.elec_mwh, 가스_Nm3: m.gas_nm3, 업종: m.industry_name };
      }
      return r;
    });
    const headers = Array.from(new Set(flat.flatMap((o) => Object.keys(o))));
    const csv = [headers.join(",")].concat(
      flat.map((o) => headers.map((h) => {
        const v = o[h];
        if (v == null) return "";
        const s = String(v).replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      }).join(","))
    ).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aiast_${intent || "result"}_${Date.now()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  // -------- Bootstrap -------------------------------------------------------
  function init() {
    injectStyle();
    injectHeaderButton();
    renderPanel();
    document.addEventListener('visibilitychange',()=>{if(document.hidden)lockAssistant();else checkWake();});
    window.addEventListener('solbi:logout',()=>{state.activationGrant=null;state.history=[];lockAssistant();});
    // 전역 API (다른 코드에서 호출 가능)
    window._aiAssistant = { open: openPanel, close: closePanel, wakeHeaders:()=>state.activationGrant?{'X-Solbi-Wake-Grant':state.activationGrant}:{}, ask: (q) => {
      openPanel();
      const ta = $("#aiast-text");
      if (ta) { ta.value = q; $("#aiast-form").requestSubmit(); }
    }};
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
