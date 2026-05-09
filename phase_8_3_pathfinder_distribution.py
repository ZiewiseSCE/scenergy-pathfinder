#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
phase_8_3_pathfinder_distribution.py — Phase 8.3
데스크탑 페이지 (scenergy-pathfinder repo 의 solar_pathfinder.html) 한전 영역 정리.

변경:
  1. HTML #1: 한전 선로용량 영역 (송전망 3탭 카드 영역) → distribution 4행 표 wrapper
  2. HTML #2: 8대 체크 패널 송전망 3탭 영역 (kepcoVisualCards) → 빈 wrapper (hidden)
  3. JS: renderKepcoVisualCards 시작 부분에 distribution 우선 처리 + 새 표 렌더링 함수 추가

사용:
  cd C:\\projects\\scenergy-pathfinder
  Copy-Item -Force C:\\kepco-rpa-api\\solar-server-staging\\scripts\\phase_8_3_pathfinder_distribution.py .
  python phase_8_3_pathfinder_distribution.py --check
  python phase_8_3_pathfinder_distribution.py
"""

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path.cwd()
HTML = ROOT / "solar_pathfinder.html"

MARKER_ALREADY = "Phase 8.3: distribution 4행 표"


# ============================================================================
# Edit 1: 한전 영역 (한전 선로용량 + 향후계획 + 송전망 3탭) → distribution 4행 표
# ============================================================================
ANCHOR_1 = '''<!-- [F-25] 한전용량 확인필요 표시 -->
<div class="flex justify-between items-center border-t border-slate-700 pt-2"><span class="text-slate-400">⚡ 한전 선로용량:</span><span class="font-bold text-yellow-400 font-mono whitespace-pre-line text-right" id="kepcoCapacity">확인 필요</span></div>
  <div class="bg-slate-800/40 p-2 rounded border border-slate-700 text-[10px] space-y-2" id="kepcoPlanBlock">
    <div class="text-slate-300 font-bold">향후 계획(연도별 여유용량)</div>
    <div id="kepcoPlanTables" class="space-y-2">
      <div class="text-slate-400">표시할 정보가 없습니다.</div>
    </div>
  </div>
  <!-- ✅ 한전 여유용량 상세 테이블 (한전 선로용량 바로 아래) -->
  <div class="bg-slate-800/40 p-2 rounded border border-slate-700 mt-2">
    <div class="text-[11px] text-slate-300 font-bold mb-2">⚡ 한전 여유용량 상세 (3개 탭)</div>
    <div id="kepcoVisualCardsBodyDetail" class="space-y-2">
      <div class="rounded border border-slate-700/50 bg-slate-900/40 p-2">
        <div class="text-[11px] text-cyan-200 font-semibold mb-1">🌱 재생e 연계 여유용량</div>
        <div class="text-[10px] text-slate-400">데이터를 기다리는 중입니다.</div>
      </div>
      <div class="rounded border border-slate-700/50 bg-slate-900/40 p-2">
        <div class="text-[11px] text-cyan-200 font-semibold mb-1">⚡ 전력공급 여유용량</div>
        <div class="text-[10px] text-slate-400">데이터를 기다리는 중입니다.</div>
      </div>
      <div class="rounded border border-slate-700/50 bg-slate-900/40 p-2">
        <div class="text-[11px] text-cyan-200 font-semibold mb-1">🔌 차단기 여유 Bay</div>
        <div class="text-[10px] text-slate-400">데이터를 기다리는 중입니다.</div>
      </div>
    </div>
  </div>'''

REPLACE_1 = '''<!-- Phase 8.3: distribution 4행 표 (배전망 단독 모드) — 송전망 3탭 카드 제거 -->
<div class="border-t border-slate-700 pt-2 space-y-2">
  <div class="flex justify-between items-center">
    <span class="text-slate-400">⚡ 한전 선로용량:</span>
    <span class="font-bold text-yellow-400 font-mono text-right text-[11px]" id="kepcoCapacity">확인 필요</span>
  </div>
  <div class="bg-slate-800/40 p-2 rounded border border-slate-700 text-[10px] space-y-2" id="kepcoDistributionBlock">
    <div class="flex items-center justify-between">
      <span class="text-slate-300 font-bold">🔌 한전 배전망 여유용량</span>
      <span class="text-[10px] text-slate-400" id="kepcoFacilityLabel"></span>
    </div>
    <div id="kepcoDistributionTable" class="space-y-2">
      <div class="text-slate-400">데이터를 기다리는 중입니다.</div>
    </div>
    <div class="hidden mt-1 rounded-md bg-amber-900/40 border border-amber-700/40 p-2 text-[10px] text-amber-200" id="kepcoDistributionWarning"></div>
  </div>
  <!-- 호환: 옛 ID 들 hidden wrapper (다른 코드가 참조해도 에러 안 나도록) -->
  <div id="kepcoPlanTables" class="hidden"></div>
  <div id="kepcoVisualCardsBodyDetail" class="hidden"></div>
</div>'''


# ============================================================================
# Edit 2: 8대 체크 패널의 송전망 3탭 영역 → 빈 hidden wrapper
# ============================================================================
ANCHOR_2 = '''<!-- 8대 체크 상세 패널: 한전 테이블 + 이격거리 상세 -->
<div class="mt-3" id="kepcoVisualCards">
  <div class="text-[11px] text-slate-300 font-semibold mb-1">⚡ 한전 여유용량 상세 (3개 탭)</div>
  <div id="kepcoVisualCardsBody" class="space-y-2">
    <div class="rounded border border-slate-700/50 bg-slate-900/40 p-2">
      <div class="text-[11px] text-cyan-200 font-semibold mb-1">🌱 재생e 연계 여유용량</div>
      <div class="text-[10px] text-slate-400">데이터를 기다리는 중입니다.</div>
    </div>
    <div class="rounded border border-slate-700/50 bg-slate-900/40 p-2">
      <div class="text-[11px] text-cyan-200 font-semibold mb-1">⚡ 전력공급 여유용량</div>
      <div class="text-[10px] text-slate-400">데이터를 기다리는 중입니다.</div>
    </div>
    <div class="rounded border border-slate-700/50 bg-slate-900/40 p-2">
      <div class="text-[11px] text-cyan-200 font-semibold mb-1">🔌 차단기 여유 Bay</div>
      <div class="text-[10px] text-slate-400">데이터를 기다리는 중입니다.</div>
    </div>
  </div>
</div>'''

REPLACE_2 = '''<!-- Phase 8.3: 송전망 3탭 영역 제거 — 한전 정보는 정밀분석 탭의 distribution 표에서 통합 표시 -->
<div class="hidden mt-3" id="kepcoVisualCards">
  <div id="kepcoVisualCardsBody" class="hidden"></div>
</div>'''


# ============================================================================
# Edit 3: renderKepcoVisualCards 시작 부분에 distribution 우선 처리
# ============================================================================
ANCHOR_3 = '''window.renderKepcoVisualCards = function(kepcoData){
  try {
    var wrap = document.getElementById("kepcoVisualCards");
    var body = document.getElementById("kepcoVisualCardsBody");
    var bodyDetail = document.getElementById("kepcoVisualCardsBodyDetail");
    if(!wrap || !body){ return; }
    /* 항상 열려있음 */
    wrap.style.display = "";'''

REPLACE_3 = '''/* Phase 8.3: distribution 4행 표 (배전망 단독 모드) 렌더링 함수 */
window.renderKepcoDistributionTable = function(kepcoData){
  var distWrap = document.getElementById("kepcoDistributionTable");
  var distFac = document.getElementById("kepcoFacilityLabel");
  var distWarn = document.getElementById("kepcoDistributionWarning");
  if(!distWrap) return false;

  var dist = null;
  if(kepcoData && kepcoData.sections && kepcoData.sections.distribution){
    dist = kepcoData.sections.distribution;
  } else if(kepcoData && Array.isArray(kepcoData.table)){
    dist = kepcoData;
  }

  var table = (dist && Array.isArray(dist.table)) ? dist.table : [];
  if(!table.length){
    distWrap.innerHTML = '<div class="text-slate-400">한전ON 배전망 정보가 일시적으로 확인되지 않았습니다.</div>';
    if(distWarn){ distWarn.classList.add("hidden"); distWarn.textContent = ""; }
    if(distFac) distFac.textContent = "";
    return false;
  }

  function _esc(s){ return String(s == null ? "" : s).replace(/[<>&"]/g, function(c){ return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]; }); }
  function _fmt(kw){
    if(kw === null || kw === undefined) return "-";
    var n = Number(kw);
    if(!isFinite(n)) return "-";
    return n.toLocaleString("ko-KR");
  }

  var html = '<div class="overflow-x-auto"><table class="w-full text-[10px] border-collapse">';
  html += '<tr class="bg-slate-700/50">';
  html += '<th class="border border-slate-600 px-1 py-0.5 text-left">구분</th>';
  html += '<th class="border border-slate-600 px-1 py-0.5 text-left">시설명</th>';
  html += '<th class="border border-slate-600 px-1 py-0.5 text-center">여유</th>';
  html += '<th class="border border-slate-600 px-1 py-0.5 text-center">접속기준</th>';
  html += '<th class="border border-slate-600 px-1 py-0.5 text-center">접수기준</th>';
  html += '<th class="border border-slate-600 px-1 py-0.5 text-center">접속계획</th>';
  html += '<th class="border border-slate-600 px-1 py-0.5 text-center">여유용량</th>';
  html += '</tr>';
  for(var i=0; i<table.length; i++){
    var r = table[i] || {};
    var availLabel = r.available_label || "-";
    var availCls = "text-slate-400";
    if(r.available === true) availCls = "text-emerald-300 font-bold";
    else if(r.available === false) availCls = "text-rose-300 font-bold";
    var curCls = (r.current_kw && Number(r.current_kw) > 0) ? "text-emerald-300 font-bold" : "text-slate-400";
    html += '<tr>';
    html += '<td class="border border-slate-600 px-1 py-0.5 text-slate-200 font-bold">' + _esc(r.label || "-") + '</td>';
    html += '<td class="border border-slate-600 px-1 py-0.5 text-slate-300">' + _esc(r.name || "-") + '</td>';
    html += '<td class="border border-slate-600 px-1 py-0.5 text-center ' + availCls + '">' + _esc(availLabel) + '</td>';
    html += '<td class="border border-slate-600 px-1 py-0.5 text-center text-slate-300">' + _fmt(r.base_kw) + '</td>';
    html += '<td class="border border-slate-600 px-1 py-0.5 text-center text-slate-300">' + _fmt(r.received_kw) + '</td>';
    html += '<td class="border border-slate-600 px-1 py-0.5 text-center text-slate-300">' + _fmt(r.planned_kw) + '</td>';
    html += '<td class="border border-slate-600 px-1 py-0.5 text-center ' + curCls + '">' + _fmt(r.current_kw) + '</td>';
    html += '</tr>';
  }
  html += '</table></div>';
  distWrap.innerHTML = html;

  if(distFac){ distFac.textContent = (dist && dist.facility_label) ? ("📍 " + dist.facility_label) : ""; }
  if(distWarn){
    var warnText = (dist && dist.warning) ? String(dist.warning) : "";
    if(warnText){
      distWarn.textContent = "⚠️ " + warnText;
      distWarn.classList.remove("hidden");
    } else {
      distWarn.classList.add("hidden");
      distWarn.textContent = "";
    }
  }
  return true;
};

window.renderKepcoVisualCards = function(kepcoData){
  try {
    /* Phase 8.3: distribution 4행 표 우선 — 배전망 단독 모드 데이터가 있으면 새 표 사용 */
    var hasDist = false;
    try {
      var _distTable = null;
      if(kepcoData && kepcoData.table) _distTable = kepcoData.table;
      else if(kepcoData && kepcoData.sections && kepcoData.sections.distribution && Array.isArray(kepcoData.sections.distribution.table)) _distTable = kepcoData.sections.distribution.table;
      if(Array.isArray(_distTable) && _distTable.length > 0){
        window.renderKepcoDistributionTable(kepcoData);
        hasDist = true;
      }
    } catch(_distErr) { console.warn("[kepco-dist render]", _distErr); }
    if(hasDist) return;  /* 옛 송전망 카드 렌더링 skip */

    var wrap = document.getElementById("kepcoVisualCards");
    var body = document.getElementById("kepcoVisualCardsBody");
    var bodyDetail = document.getElementById("kepcoVisualCardsBodyDetail");
    if(!wrap || !body){ return; }
    /* 항상 열려있음 */
    wrap.style.display = "";'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    if not HTML.exists():
        print(f"ERROR: {HTML} 없음 — C:\\projects\\scenergy-pathfinder 에서 실행하세요")
        sys.exit(1)

    text = HTML.read_text(encoding="utf-8")

    if MARKER_ALREADY in text:
        print(f"이미 적용됨 (marker '{MARKER_ALREADY}'). 종료.")
        sys.exit(0)

    edits = [
        ("Edit 1: 한전 영역 → distribution 4행 표 wrapper", ANCHOR_1, REPLACE_1),
        ("Edit 2: 8대 체크 패널 송전망 3탭 → hidden", ANCHOR_2, REPLACE_2),
        ("Edit 3: renderKepcoVisualCards 에 distribution 우선 처리", ANCHOR_3, REPLACE_3),
    ]

    missing = [n for n, a, _ in edits if a not in text]
    if missing:
        print("ERROR: anchor 누락:")
        for m in missing:
            print(f"  - {m}")
        sys.exit(2)

    if args.check:
        print("--check OK: 모든 anchor 3개 발견. 적용 시:")
        for n, _a, _ in edits:
            print(f"  ✓ {n}")
        sys.exit(0)

    bak = HTML.with_suffix(".html.bak.before_phase_8_3")
    shutil.copy2(HTML, bak)
    print(f"backup: {bak}")

    for name, anchor, new_text in edits:
        text = text.replace(anchor, new_text, 1)
        print(f"  applied: {name}")

    HTML.write_text(text, encoding="utf-8")
    print(f"✅ Phase 8.3 적용 완료 ({HTML})")


if __name__ == "__main__":
    main()
