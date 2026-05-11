#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
phase_9_3_ai_assistant_ux.py — Phase 9.3
PC 솔비 AI 비서 UX 정비 (3가지 변경 한 번에).

사용자 요청:
  1) 분석 중 "..." 만 보이지 말고 모바일 솔비처럼 progress 단계 표시
  2) 분석 결과 아래 "🗺️ 지도 이동" / "💰 PF 시뮬" 버튼 삭제
     → cross-origin (GitHub Pages → Cloudtype) 환경에서 window.map /
       window.openFinanceModal 못 닿아 클릭 무반응. 사용자가 명시적으로 삭제 요청.
  3) PPA 후보 5곳 표로 렌더링 (현재 ai_summary 텍스트로만 언급되고 카드 없음)

변경 파일: ai_assistant.js (scenergy-pathfinder repo)

Edit 1: chatStream() 에 stage progress 사이클 추가 (모바일 솔비 UX 모사)
        백엔드의 SSE token 이 도착하기 전까지 5단계 (좌표/8체크/조례/PPA/AI) 사이클
        첫 token 도착 시 즉시 중단
Edit 2: renderRichResult single_address 의 actions 영역 제거 (HTML + 이벤트 핸들러)
Edit 3: renderRichResult single_address 에 PPA 5곳 표 추가
        biz_name / distance_km / final_score / re100_status

⚠️ 사용 위치: scenergy-pathfinder repo
  cd C:\\projects\\scenergy-pathfinder
  Copy-Item -Force C:\\kepco-rpa-api\\solar-server-staging\\scripts\\phase_9_3_ai_assistant_ux.py .
  python phase_9_3_ai_assistant_ux.py --check
  python phase_9_3_ai_assistant_ux.py
  git add ai_assistant.js phase_9_3_ai_assistant_ux.py
  git commit -m "Phase 9.3: AI 비서 progress 단계 + 버튼 제거 + PPA 5곳 표"
  git push
"""

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path.cwd()
JS = ROOT / "ai_assistant.js"

MARKER_ALREADY = "Phase 9.3: progress stages"


# ============================================================================
# Edit 1: chatStream 에 stage progress 추가
# ----------------------------------------------------------------------------
# fetch 호출 직전에 stage 사이클 시작. 첫 token 도착 시 stopStages() 호출.
# ============================================================================
ANCHOR_1 = '''  async function chatStream(message, targetNode) {
    const url = API_BASE + "/api/llm/chat/stream";
    const ctrl = new AbortController();
    state.abort = ctrl;

    // Phase 9.1: credentials include — wake-word solbi_token 쿠키 전달 위해
    const resp = await fetch(url, {'''

REPLACE_1 = '''  // Phase 9.3: progress stages — 모바일 솔비처럼 단계 표시
  function startStages(targetNode) {
    const stages = [
      "☀️ 📍 좌표 잡는 중",
      "☀️ 🗺️ 8체크 분석 (DEM·PVGIS·이격거리)",
      "☀️ 📜 법/조례 분석",
      "☀️ 🏭 PPA 후보 매칭",
      "☀️ ✨ AI 요약 생성",
    ];
    let idx = 0;
    const render = () => {
      targetNode.innerHTML =
        "<div style=\\"font-size:11.5px;color:#cbd5e1;display:flex;align-items:center;gap:8px;\\">"
        + "<span>" + stages[idx % stages.length] + "</span>"
        + "<span class=\\"aiast-typing\\"><span></span><span></span><span></span></span>"
        + "</div>";
    };
    render();
    const timer = setInterval(() => { idx++; render(); }, 2500);
    return { stop: () => clearInterval(timer) };
  }

  async function chatStream(message, targetNode) {
    const url = API_BASE + "/api/llm/chat/stream";
    const ctrl = new AbortController();
    state.abort = ctrl;
    const stageCtrl = startStages(targetNode);

    // Phase 9.1: credentials include — wake-word solbi_token 쿠키 전달 위해
    const resp = await fetch(url, {'''


# ============================================================================
# Edit 2: 첫 token 도착 시 stage 중단 — SSE token handler
# ============================================================================
ANCHOR_2 = '''          } else if (event === "token") {
            assembled += obj.t || "";
            targetNode.innerHTML = mdToHtml(assembled);
            $("#aiast-body").scrollTop = $("#aiast-body").scrollHeight;
          } else if (event === "error") {'''

REPLACE_2 = '''          } else if (event === "token") {
            // Phase 9.3: 첫 token 도착 시 stage progress 즉시 중단
            if (stageCtrl) { try { stageCtrl.stop(); } catch (_) {} }
            assembled += obj.t || "";
            targetNode.innerHTML = mdToHtml(assembled);
            $("#aiast-body").scrollTop = $("#aiast-body").scrollHeight;
          } else if (event === "error") {'''


# ============================================================================
# Edit 3: 비스트리밍 fallback 흐름에서도 stage 중단
# ============================================================================
ANCHOR_3 = '''    if (!resp.ok || !resp.body) {
      // SSE 가 막혀있으면 비스트리밍으로 fallback
      // Phase 9.1: credentials include — fallback 도 동일하게 쿠키 전달
      const j = await fetch(API_BASE + "/api/llm/chat", {'''

REPLACE_3 = '''    if (!resp.ok || !resp.body) {
      // Phase 9.3: fallback 진입 시 stage 중단 (응답 받기 직전)
      if (stageCtrl) { try { stageCtrl.stop(); } catch (_) {} }
      // SSE 가 막혀있으면 비스트리밍으로 fallback
      // Phase 9.1: credentials include — fallback 도 동일하게 쿠키 전달
      const j = await fetch(API_BASE + "/api/llm/chat", {'''


# ============================================================================
# Edit 4: stream 끝난 후에도 stage 가 살아있으면 중단 (token 한 개도 못 받은 케이스)
# ============================================================================
ANCHOR_4 = '''    state.history.push({ role: "assistant", content: assembled });
    if (intentMeta && intentMeta.result) {
      renderRichResult(intentMeta.intent || (intentMeta.result || {}).intent, intentMeta.result);
    }
  }'''

REPLACE_4 = '''    // Phase 9.3: stream 종료 시 stage progress 안전 중단
    if (stageCtrl) { try { stageCtrl.stop(); } catch (_) {} }
    state.history.push({ role: "assistant", content: assembled });
    if (intentMeta && intentMeta.result) {
      renderRichResult(intentMeta.intent || (intentMeta.result || {}).intent, intentMeta.result);
    }
  }'''


# ============================================================================
# Edit 5: 두 버튼 (지도 이동 / PF 시뮬) 삭제 + 클릭 이벤트 핸들러 제거 + PPA 표 추가
# ============================================================================
ANCHOR_5 = '''    if (intent === "single_address" && Array.isArray(result.checks)) {
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
    }'''

REPLACE_5 = '''    if (intent === "single_address" && Array.isArray(result.checks)) {
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
    }'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    if not JS.exists():
        print(f"ERROR: {JS} 없음 — C:\\projects\\scenergy-pathfinder 에서 실행하세요")
        sys.exit(1)

    text = JS.read_text(encoding="utf-8")

    if MARKER_ALREADY in text:
        print(f"이미 적용됨 (marker '{MARKER_ALREADY}'). 종료.")
        sys.exit(0)

    edits = [
        ("Edit 1: startStages 함수 + chatStream stage 시작", ANCHOR_1, REPLACE_1),
        ("Edit 2: token 도착 시 stage 중단", ANCHOR_2, REPLACE_2),
        ("Edit 3: fallback 진입 시 stage 중단", ANCHOR_3, REPLACE_3),
        ("Edit 4: stream 종료 시 stage 중단 (안전망)", ANCHOR_4, REPLACE_4),
        ("Edit 5: 버튼 제거 + PPA 5곳 표 추가", ANCHOR_5, REPLACE_5),
    ]

    missing = [n for n, a, _ in edits if a not in text]
    if missing:
        print("ERROR: anchor 누락:")
        for m in missing:
            print(f"  - {m}")
        sys.exit(2)

    if args.check:
        print(f"--check OK: anchor 5개 모두 발견.")
        for n, _a, _ in edits:
            print(f"  ✓ {n}")
        sys.exit(0)

    bak = JS.with_suffix(".js.bak.before_phase_9_3")
    shutil.copy2(JS, bak)
    print(f"backup: {bak}")

    for name, anchor, new_text in edits:
        before = text
        text = text.replace(anchor, new_text, 1)
        if text == before:
            print(f"ERROR: '{name}' replace 가 변경을 일으키지 않음 (anchor 일치는 했지만)")
            sys.exit(3)
        print(f"  applied: {name}")

    JS.write_text(text, encoding="utf-8")
    print(f"✅ Phase 9.3 적용 완료 ({JS})")
    print()
    print("다음 단계:")
    print("  git add ai_assistant.js phase_9_3_ai_assistant_ux.py")
    print("  git commit -m \"Phase 9.3: AI 비서 progress 단계 + 버튼 제거 + PPA 5곳 표\"")
    print("  git push")
    print()
    print("배포 후 (GitHub Pages 1-3분):")
    print("  데스크탑 Ctrl+Shift+R → 💬 AI 비서 → '솔비야 일하자' →")
    print("  '부항면 어전리 884 분석해줘'")
    print("  → '☀️ 📍 좌표 잡는 중...' 단계 사이클 → 결과 → 8체크 grid + PPA 5곳 표")


if __name__ == "__main__":
    main()
