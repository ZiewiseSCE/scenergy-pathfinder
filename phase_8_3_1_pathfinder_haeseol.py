#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
phase_8_3_1_pathfinder_haeseol.py — Phase 8.3.1
데스크탑 페이지 (solar_pathfinder.html) JS 의 renderKepcoDistributionTable 보강.

문제:
  /api/infra/kepco 응답은 { kepco_capacity, capacity_detail: { sections: {distribution: {haeseol}} } }
  형태. 8.3 JS 는 kepcoData.table / kepcoData.sections.distribution.table 만 봐서 못 받음.
  sections.distribution 안에는 'haeseol' 만 있고 'table' 은 없음.

수정:
  1. sections 위치 다양성 대응 (sections | capacity_detail.sections | meta.sections)
  2. table 누락 시 haeseol 4 facility 로 직접 4행 build
  3. result_rows 에서 facility_label build

사용:
  cd C:\\projects\\scenergy-pathfinder
  Copy-Item -Force C:\\kepco-rpa-api\\solar-server-staging\\scripts\\phase_8_3_1_pathfinder_haeseol.py .
  python phase_8_3_1_pathfinder_haeseol.py --check
  python phase_8_3_1_pathfinder_haeseol.py
"""

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path.cwd()
HTML = ROOT / "solar_pathfinder.html"

MARKER_ALREADY = "Phase 8.3.1: haeseol → table build (frontend)"


# ============================================================================
# Edit: renderKepcoDistributionTable 함수 — sections 위치 다양성 + haeseol build
# ============================================================================
ANCHOR = '''/* Phase 8.3: distribution 4행 표 (배전망 단독 모드) 렌더링 함수 */
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
  if(!table.length){'''

REPLACE = '''/* Phase 8.3.1: distribution 4행 표 — sections 위치 다양성 + haeseol → table build */
window.renderKepcoDistributionTable = function(kepcoData){
  var distWrap = document.getElementById("kepcoDistributionTable");
  var distFac = document.getElementById("kepcoFacilityLabel");
  var distWarn = document.getElementById("kepcoDistributionWarning");
  if(!distWrap) return false;

  /* sections 위치 다양성 대응 */
  var dist = null;
  if(kepcoData){
    if(kepcoData.sections && kepcoData.sections.distribution){
      dist = kepcoData.sections.distribution;
    } else if(kepcoData.capacity_detail && kepcoData.capacity_detail.sections && kepcoData.capacity_detail.sections.distribution){
      dist = kepcoData.capacity_detail.sections.distribution;
    } else if(kepcoData.meta && kepcoData.meta.sections && kepcoData.meta.sections.distribution){
      dist = kepcoData.meta.sections.distribution;
    } else if(Array.isArray(kepcoData.table)){
      dist = kepcoData;
    }
  }

  /* table 우선순위: kepcoData.table → dist.table → haeseol 4 facility 로 build */
  var table = [];
  if(kepcoData && Array.isArray(kepcoData.table) && kepcoData.table.length > 0){
    table = kepcoData.table;
  } else if(dist && Array.isArray(dist.table) && dist.table.length > 0){
    table = dist.table;
  } else if(dist && dist.haeseol && typeof dist.haeseol === "object"){
    var hae = dist.haeseol;
    var rrows = Array.isArray(dist.result_rows) ? dist.result_rows : [];
    var r0 = (rrows.length && typeof rrows[0] === "object") ? rrows[0] : {};
    var subN = String((r0 && r0.substation) || "").trim();
    var trN = String((r0 && r0.transformer) || "").trim();
    var lnN = String((r0 && r0.line_name) || "").trim();
    function _bldRow(label, name, data){
      if(!data || typeof data !== "object") return null;
      return {
        label: label, name: name,
        available: data.available,
        available_label: data.available_label || "확인 필요",
        base_kw: data.base_kw, received_kw: data.received_kw,
        planned_kw: data.planned_kw,
        current_kw: data.current_kw, total_kw: data.total_kw
      };
    }
    var built = [];
    var rr;
    if((rr = _bldRow("변전소", subN, hae.substation))) built.push(rr);
    if((rr = _bldRow("주변압기", trN, hae.transformer))) built.push(rr);
    if((rr = _bldRow("배전선로", lnN, hae.distribution_line))) built.push(rr);
    if((rr = _bldRow("출력제어 조건부", lnN, hae.distribution_line_curtailable))) built.push(rr);
    if(built.length) table = built;
  }

  if(!table.length){'''


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

    # Edit 2: renderKepcoVisualCards 의 distribution 우선 검사도 robust 하게
    ANCHOR_2 = '''    /* Phase 8.3: distribution 4행 표 우선 — 배전망 단독 모드 데이터가 있으면 새 표 사용 */
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
    if(hasDist) return;  /* 옛 송전망 카드 렌더링 skip */'''

    REPLACE_2 = '''    /* Phase 8.3.1: renderKepcoDistributionTable 가 sections 위치 다양성 + haeseol → table build 모두 처리 */
    try {
      if(window.renderKepcoDistributionTable && window.renderKepcoDistributionTable(kepcoData)){
        return;  /* 옛 송전망 카드 렌더링 skip */
      }
    } catch(_distErr) { console.warn("[kepco-dist render]", _distErr); }'''

    if ANCHOR not in text:
        print("ERROR: anchor (renderKepcoDistributionTable 시작) 못 찾음 — Phase 8.3 먼저 적용돼야 합니다.")
        sys.exit(2)
    if ANCHOR_2 not in text:
        print("ERROR: anchor 2 (renderKepcoVisualCards distribution 우선 검사) 못 찾음 — Phase 8.3 먼저 적용돼야 합니다.")
        sys.exit(2)

    if args.check:
        print("--check OK: anchor 2개 발견. 적용 시:")
        print("  ✓ Edit 1: renderKepcoDistributionTable — sections 위치 다양성 + haeseol → table build")
        print("  ✓ Edit 2: renderKepcoVisualCards — distribution 우선 검사 단순화")
        sys.exit(0)

    bak = HTML.with_suffix(".html.bak.before_phase_8_3_1")
    shutil.copy2(HTML, bak)
    print(f"backup: {bak}")

    text = text.replace(ANCHOR, REPLACE, 1)
    text = text.replace(ANCHOR_2, REPLACE_2, 1)
    HTML.write_text(text, encoding="utf-8")
    print(f"✅ Phase 8.3.1 적용 완료 ({HTML})")


if __name__ == "__main__":
    main()
