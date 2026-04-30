/* ============================================================================
 * ai_assistant.js  —  SCEnergy 태양광 Pathfinder · AI 비서 채팅 모듈
 * ----------------------------------------------------------------------------
 *  - 헤더 toolbar 에 💬 AI 비서 버튼을 자동 주입
 *  - 우측 슬라이드 패널(420px) 채팅창
 *  - SSE 스트리밍 응답 (백엔드 /api/llm/chat/stream)
 *  - 의도 분류 결과로 8체크 카드 / 표 / 엑셀 다운로드 자동 렌더
 *  - 이 파일은 solar_pathfinder.html 끝에 한 줄 <script src="...ai_assistant.js"></script>
 *    만 추가하면 동작. 기존 코드 변경 없음.
 *  - 백엔드 base URL 은 window.SOLAR_API_BASE 또는 location.origin 사용.
 * ============================================================================ */

(function () {
  "use strict";

  // -------- Configuration ---------------------------------------------------
  const API_BASE = (window.SOLAR_API_BASE || "").replace(/\/+$/, "")
                   || ""; // 같은 도메인 호출 시 빈 문자열
  const MAX_HISTORY = 20;
  const PANEL_WIDTH = 420;

  const state = {
    open: false,
    history: [],         // [{role:'user'|'assistant', content:string}]
    busy: false,
    abort: null,
    lastIntent: null,
    lastResult: null,
  };

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
        position:fixed;top:0;right:-${PANEL_WIDTH+20}px;width:${PANEL_WIDTH}px;height:100vh;
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
    // 기존 3D 시뮬 버튼 옆에 끼워 넣기
    const sim3d = document.getElementById("headerSim3dBtn");
    if (!sim3d) {
      // 헤더가 아직 안 그려진 경우 잠시 후 재시도
      setTimeout(injectHeaderButton, 300);
      return;
    }
    if (document.getElementById("aiast-btn")) return;
    const btn = document.createElement("button");
    btn.id = "aiast-btn";
    btn.type = "button";
    btn.className = "header-sim-btn";
    btn.innerHTML = "💬 AI 비서";
    btn.title = "AI 비서 (자연어로 주소 분석/전기사용량 조회)";
    btn.addEventListener("click", openPanel);
    sim3d.insertAdjacentElement("afterend", btn);
  }

  // -------- Panel rendering -------------------------------------------------
  function renderPanel() {
    if (document.getElementById("aiast-panel")) return;
    const panel = document.createElement("div");
    panel.id = "aiast-panel";
    panel.innerHTML = `
      <div class="aiast-header">
        <div style="flex:1">
          <div class="aiast-title">💬 AI 비서</div>
          <div class="aiast-subtitle">자연어로 주소 분석 · 전수 스캔 · 전기사용량 조회</div>
        </div>
        <button class="aiast-iconbtn" id="aiast-clear" title="대화 비우기">🧹</button>
        <button class="aiast-iconbtn" id="aiast-close" title="닫기">✕</button>
      </div>
      <div class="aiast-body" id="aiast-body"></div>
      <div class="aiast-quickbar" id="aiast-quickbar">
        <button class="aiast-quick" data-q="강남대로 123 토지로 분석해줘">강남대로 123 분석</button>
        <button class="aiast-quick" data-q="태양광 1MW 설치비 평균이 얼마야?">시공비 질문</button>
        <button class="aiast-quick" data-q="서울 강남구 다소비사업장 전기사용량 상위 10곳 알려줘">강남구 전기사용량 Top10</button>
      </div>
      <form class="aiast-input-row" id="aiast-form" autocomplete="off">
        <textarea id="aiast-text" class="aiast-input" placeholder="주소·질문을 입력 (Shift+Enter 줄바꿈)" rows="1"></textarea>
        <button class="aiast-send" id="aiast-send" type="submit">전송</button>
      </form>
    `;
    document.body.appendChild(panel);

    $("#aiast-close", panel).addEventListener("click", closePanel);
    $("#aiast-clear", panel).addEventListener("click", clearHistory);
    $("#aiast-form", panel).addEventListener("submit", onSubmit);
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

    welcome();
  }

  function welcome() {
    addMessage(
      "assistant",
      "안녕하세요! SCEnergy 태양광 비서입니다.\n• 주소를 입력하면 8체크 분석을 자연어로 요약해 드려요.\n• 여러 줄로 주소를 붙이면 일괄 분석도 가능합니다.\n• \"평택시 다소비사업장 전기사용량\" 처럼 회사·전기사용량 조회도 됩니다.\n\n무엇을 도와드릴까요?"
    );
  }

  function openPanel() {
    if (!document.getElementById("aiast-panel")) renderPanel();
    state.open = true;
    requestAnimationFrame(() => {
      $("#aiast-panel").classList.add("open");
      $("#aiast-text") && $("#aiast-text").focus();
    });
  }
  function closePanel() {
    state.open = false;
    const p = $("#aiast-panel");
    if (p) p.classList.remove("open");
  }
  function clearHistory() {
    state.history = [];
    state.lastIntent = null;
    state.lastResult = null;
    const body = $("#aiast-body");
    if (body) body.innerHTML = "";
    welcome();
  }

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

  // -------- Form submit -----------------------------------------------------
  async function onSubmit(e) {
    e.preventDefault();
    if (state.busy) return;
    const ta = $("#aiast-text");
    const txt = (ta.value || "").trim();
    if (!txt) return;
    ta.value = "";
    addMessage("user", txt);
    state.history.push({ role: "user", content: txt });
    if (state.history.length > MAX_HISTORY) state.history = state.history.slice(-MAX_HISTORY);

    state.busy = true;
    $("#aiast-send").disabled = true;
    const typingNode = pushTyping();

    try {
      await chatStream(txt, typingNode);
    } catch (err) {
      console.error(err);
      typingNode.innerHTML = mdToHtml("죄송합니다. 응답 중 오류가 발생했습니다: " + (err.message || err));
    } finally {
      state.busy = false;
      $("#aiast-send").disabled = false;
    }
  }

  // -------- SSE streaming ---------------------------------------------------
  async function chatStream(message, targetNode) {
    const url = API_BASE + "/api/llm/chat/stream";
    const ctrl = new AbortController();
    state.abort = ctrl;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
      body: JSON.stringify({
        message,
        history: state.history.slice(0, -1).slice(-MAX_HISTORY),
      }),
      signal: ctrl.signal,
    });

    if (!resp.ok || !resp.body) {
      // SSE 가 막혀있으면 비스트리밍으로 fallback
      const j = await fetch(API_BASE + "/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: state.history.slice(0, -1).slice(-MAX_HISTORY) }),
      }).then((r) => r.json());
      const text = j.answer || j.error || "(응답 없음)";
      targetNode.innerHTML = mdToHtml(text);
      state.history.push({ role: "assistant", content: text });
      if (j.result) renderRichResult(j.intent, j.result);
      return;
    }

    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buffer = "";
    let assembled = "";
    let intentMeta = null;

    while (true) {
      const { value, done } = await reader.read();
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

    state.history.push({ role: "assistant", content: assembled });
    if (intentMeta && intentMeta.result) {
      renderRichResult(intentMeta.intent || (intentMeta.result || {}).intent, intentMeta.result);
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
      const html = `
        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">
          📍 ${escapeHtml(result.address || "")}
          ${score != null ? ` · 사업성 점수 <strong style="color:#a855f7">${score}</strong>` : ""}
        </div>
        <div class="aiast-checks">${cards}</div>
        <div class="aiast-actions">
          <button class="aiast-action" data-act="moveMap">🗺️ 지도 이동</button>
          <button class="aiast-action" data-act="openPF">💰 PF 시뮬</button>
        </div>`;
      const el = addMessage("assistant", "", { html });
      el.querySelectorAll(".aiast-action").forEach((b) => {
        b.addEventListener("click", () => {
          const act = b.dataset.act;
          if (act === "moveMap" && result.lat && result.lng && window.map) {
            try { window.map.setView([result.lat, result.lng], 18); } catch (e) {}
          } else if (act === "openPF") {
            try { window.openFinanceModal && window.openFinanceModal(result); } catch (e) {}
          }
        });
      });
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
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
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
    // 전역 API (다른 코드에서 호출 가능)
    window._aiAssistant = { open: openPanel, close: closePanel, ask: (q) => {
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
