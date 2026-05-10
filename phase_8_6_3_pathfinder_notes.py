#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
phase_8_6_3_pathfinder_notes.py — Phase 8.6.3
데스크탑 페이지 (scenergy-pathfinder repo / solar_pathfinder.html) 한전 4행 표 아래에
한전ON "해설" 주석 영역 추가.

대상 위치 2곳:
  1. 정밀분석 탭: renderKepcoDistributionTable (Phase 8.3 / 8.3.1 함수)
     - DOM 에 #kepcoDistributionNotes 추가 + 함수에서 채우기
  2. 종합 리포트 탭: renderAIResult key==="grid" 블록 (Phase 8.5)
     - HTML 빌드 inline 으로 notes 영역 추가

전제: Phase 8.6.1 백엔드 패치가 적용돼서 kepco.notes 가 응답에 포함돼야 함.

수정 (3 edits):
  Edit 1: HTML wrapper — kepcoDistributionWarning 직전에 #kepcoDistributionNotes div
  Edit 2: renderKepcoDistributionTable 의 if(distWarn) 블록 직전에 notes 채우기 + 헬퍼 함수
  Edit 3: renderAIResult 의 grid 분기 if(_warning) 블록 직전에 notes inline HTML

사용:
  cd C:\\projects\\scenergy-pathfinder
  Copy-Item -Force C:\\kepco-rpa-api\\solar-server-staging\\scripts\\phase_8_6_3_pathfinder_notes.py .
  python phase_8_6_3_pathfinder_notes.py --check
  python phase_8_6_3_pathfinder_notes.py
"""

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path.cwd()
HTML = ROOT / "solar_pathfinder.html"

MARKER_ALREADY = "Phase 8.6.3: kepco notes (frontend)"


# ============================================================================
# Edit 1: HTML wrapper — kepcoDistributionWarning 직전에 notes div 추가
# ============================================================================
ANCHOR_1 = '''    <div id="kepcoDistributionTable" class="space-y-2">
      <div class="text-slate-400">데이터를 기다리는 중입니다.</div>
    </div>
    <div class="hidden mt-1 rounded-md bg-amber-900/40 border border-amber-700/40 p-2 text-[10px] text-amber-200" id="kepcoDistributionWarning"></div>'''

REPLACE_1 = '''    <div id="kepcoDistributionTable" class="space-y-2">
      <div class="text-slate-400">데이터를 기다리는 중입니다.</div>
    </div>
    <!-- Phase 8.6.3: kepco notes (frontend) — 한전ON 해설 영역 (표 아래 ※ 주석) -->
    <div class="hidden mt-1" id="kepcoDistributionNotes"></div>
    <div class="hidden mt-1 rounded-md bg-amber-900/40 border border-amber-700/40 p-2 text-[10px] text-amber-200" id="kepcoDistributionWarning"></div>'''


# ============================================================================
# Edit 2: renderKepcoDistributionTable — if(distWarn) 직전에 notes 처리 + 헬퍼
# ============================================================================
ANCHOR_2 = '''  if(distFac){ distFac.textContent = (dist && dist.facility_label) ? ("📍 " + dist.facility_label) : ""; }
  if(distWarn){
    var warnText = (dist && dist.warning) ? String(dist.warning) : "";'''

REPLACE_2 = '''  if(distFac){ distFac.textContent = (dist && dist.facility_label) ? ("📍 " + dist.facility_label) : ""; }

  /* Phase 8.6.3: kepco notes — 표 아래 한전ON "해설" 영역 (※ 주석 / 운영 룰) */
  try {
    var distNotes = document.getElementById("kepcoDistributionNotes");
    if(distNotes){
      var _notesRaw = (kepcoData && kepcoData.notes)
                   || (dist && dist.notes)
                   || (dist && dist.haeseol && dist.haeseol.notes)
                   || null;
      var _notesList = [];
      if(typeof _notesRaw === "string"){
        var _lines = _notesRaw.split(/\\r?\\n/);
        for(var _li = 0; _li < _lines.length; _li++){
          var _ln = String(_lines[_li] || "").trim();
          if(_ln) _notesList.push(_ln);
        }
      } else if(Array.isArray(_notesRaw)){
        for(var _ni = 0; _ni < _notesRaw.length; _ni++){
          var _it = _notesRaw[_ni];
          if(typeof _it === "string"){
            var _s = _it.trim();
            if(_s) _notesList.push(_s);
          } else if(_it && typeof _it === "object"){
            var _t = String(_it.text || _it.value || _it.message || "").trim();
            if(_t) _notesList.push(_t);
          }
        }
      }
      if(_notesList.length > 0){
        var _esc = function(s){ return String(s == null ? "" : s).replace(/[<>&"]/g, function(c){ return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]; }); };
        var _itemsHtml = "";
        for(var _i = 0; _i < _notesList.length; _i++){
          var _n = _notesList[_i];
          var _isHi = (_n.charAt(0) === "※") || (_n.indexOf("잠정보류") >= 0) || (_n.indexOf("추후 대책") >= 0);
          if(_isHi){
            _itemsHtml += '<li class="text-amber-200 font-semibold">' + _esc(_n) + '</li>';
          } else {
            _itemsHtml += '<li>' + _esc(_n) + '</li>';
          }
        }
        distNotes.className = "mt-2 rounded-md bg-slate-800/60 border border-slate-600/40 p-2 text-[10px] text-slate-200";
        distNotes.innerHTML = '<div class="font-bold text-slate-100 mb-1">📋 한전ON 해설</div><ul class="list-disc pl-4 space-y-0.5">' + _itemsHtml + '</ul>';
      } else {
        distNotes.className = "mt-2 text-[10px] text-slate-500";
        distNotes.textContent = "📋 한전ON 해설: 특이점 없음";
      }
    }
  } catch(_notesErr) { try{ console.warn("[kepco-notes render]", _notesErr); }catch(_){} }

  if(distWarn){
    var warnText = (dist && dist.warning) ? String(dist.warning) : "";'''


# ============================================================================
# Edit 3: renderAIResult grid 분기 — if(_warning){ ... } 직전에 notes HTML 추가
#  Phase 8.5 의 REPLACE 마지막 부분 (warning 박스) 을 anchor 로 사용
# ============================================================================
ANCHOR_3 = '''            _html += `</table></div>`;
            if(_warning){
              _html += `<div class="mt-2 rounded-md bg-amber-900/40 border border-amber-700/40 p-2 text-[10px] text-amber-200">⚠️ ${_esc(_warning)}</div>`;
            }
            _html += `</div>`;
            return _html;'''

REPLACE_3 = '''            _html += `</table></div>`;
            // Phase 8.6.3: 한전ON 해설 영역 (표 아래 ※ 주석)
            try {
              const _notesRaw3 = (_kep && _kep.notes) || (_dist && _dist.notes)
                              || (_dist && _dist.haeseol && _dist.haeseol.notes) || null;
              let _notesList3 = [];
              if(typeof _notesRaw3 === "string"){
                _notesList3 = _notesRaw3.split(/\\r?\\n/).map(s => String(s||"").trim()).filter(Boolean);
              } else if(Array.isArray(_notesRaw3)){
                for(const _it3 of _notesRaw3){
                  if(typeof _it3 === "string"){
                    const _s3 = _it3.trim();
                    if(_s3) _notesList3.push(_s3);
                  } else if(_it3 && typeof _it3 === "object"){
                    const _t3 = String(_it3.text || _it3.value || _it3.message || "").trim();
                    if(_t3) _notesList3.push(_t3);
                  }
                }
              }
              if(_notesList3.length > 0){
                let _itemsHtml3 = "";
                for(const _n3 of _notesList3){
                  const _isHi3 = (_n3.charAt(0) === "※") || (_n3.indexOf("잠정보류") >= 0) || (_n3.indexOf("추후 대책") >= 0);
                  _itemsHtml3 += _isHi3
                    ? `<li class="text-amber-200 font-semibold">${_esc(_n3)}</li>`
                    : `<li>${_esc(_n3)}</li>`;
                }
                _html += `<div class="mt-2 rounded-md bg-slate-800/60 border border-slate-600/40 p-2 text-[10px] text-slate-200"><div class="font-bold text-slate-100 mb-1">📋 한전ON 해설</div><ul class="list-disc pl-4 space-y-0.5">${_itemsHtml3}</ul></div>`;
              } else {
                _html += `<div class="mt-2 text-[10px] text-slate-500">📋 한전ON 해설: 특이점 없음</div>`;
              }
            } catch(_grdNotesErr) { try { console.warn("[grid-notes render]", _grdNotesErr); } catch(_){} }
            if(_warning){
              _html += `<div class="mt-2 rounded-md bg-amber-900/40 border border-amber-700/40 p-2 text-[10px] text-amber-200">⚠️ ${_esc(_warning)}</div>`;
            }
            _html += `</div>`;
            return _html;'''


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
        ("Edit 1: HTML wrapper #kepcoDistributionNotes div", ANCHOR_1, REPLACE_1),
        ("Edit 2: renderKepcoDistributionTable notes 채우기", ANCHOR_2, REPLACE_2),
        ("Edit 3: renderAIResult grid 항목 inline notes HTML", ANCHOR_3, REPLACE_3),
    ]

    missing = [n for n, a, _ in edits if a not in text]
    if missing:
        print("ERROR: anchor 누락:")
        for m in missing:
            print(f"  - {m}")
        print("       (Phase 8.3 / 8.3.1 / 8.5 가 모두 먼저 적용돼 있어야 함)")
        sys.exit(2)

    if args.check:
        print("--check OK: anchor 3개 발견. 적용 시:")
        for n, _a, _ in edits:
            print(f"  ✓ {n}")
        print()
        print("적용 후 영암군 삼호읍 산호리 산 27 분석:")
        print("  - 정밀분석 탭 → 4행 표 + 한전ON 해설 박스 (※ 잠정보류 라인 amber)")
        print("  - 종합 리포트 탭 → grid 한전 카드 안에도 동일 표시")
        sys.exit(0)

    bak = HTML.with_suffix(".html.bak.before_phase_8_6_3")
    shutil.copy2(HTML, bak)
    print(f"backup: {bak}")

    for name, anchor, new_text in edits:
        text = text.replace(anchor, new_text, 1)
        print(f"  applied: {name}")

    HTML.write_text(text, encoding="utf-8")
    print(f"✅ Phase 8.6.3 적용 완료 ({HTML})")


if __name__ == "__main__":
    main()
