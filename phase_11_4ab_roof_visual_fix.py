#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
phase_11_4ab_roof_visual_fix.py — Phase 11.4a + 11.4b 통합
3D 지붕 모드의 두 즉시 가시 문제 해결.

==============================================================================
배경 (사장님 사진 2 + 발언)
==============================================================================
사장님 발언:
  - "지면아래가 아니라 건물안에 바닥에 있어"
  - "실제 지붕모양이 다르잖아.... ㅅ모양인데 병신같이 그냥 flat으로 나온다니까"

코드 분석 (line 14266, 14535, 14550-14560, 12329):
  1. panelY = isRoof ? (self._roofHeight||8) : 0 = bldgH
     반면 박스 top = bldgH, 평지붕 mesh = bldgH+0.05, 난간 = bldgH+1.0
     → 패널이 박스 천장과 동일 평면 → 박스 (opacity 0.85) 가 패널 가림
  2. 지붕 유형 select UI (sim3dRoofTypeLabel) 가 display:none 으로 숨겨짐
     → 사장님이 ㅅ형 박공 선택 불가
  3. roofType default = "flat" → 사장님이 명시 안 하면 평지붕

==============================================================================
수정 내용 (3 edits)
==============================================================================
Edit 1 (Phase 11.4a — panelY clearance):
  line 14266 + 14290 의 panelY 계산에 +0.5m clearance 추가
  → 패널이 박스 위로 올라가서 시각적으로 보임 (난간 1.0m 보다 낮게 유지)

Edit 2 (Phase 11.4b-1 — UI 노출):
  line 12329 의 sim3dRoofTypeLabel display:none 제거
  → 자동 분석 직후부터 지붕 유형 선택 UI 항상 표시

Edit 3 (Phase 11.4b-2 — default gable):
  line 14535 의 `data._roofType||"flat"` → `data._roofType||"gable"`
  + line 12329 의 select 의 selected 도 gable 로 이동
  → 한국 농촌 default = ㅅ형 박공

==============================================================================
영향 영역
==============================================================================
- 3D 자동 분석 직후 패널 배치 / 박스 / 지붕 유형 모두 즉각 시각 개선
- 자동 분석 흐름 자체는 변경 없음 (Phase 11.4c 가 별도)

==============================================================================
사용 위치: scenergy-pathfinder working repo
==============================================================================
  Copy-Item -Force C:\\kepco-rpa-api\\solar-server-staging\\scripts\\phase_11_4ab_roof_visual_fix.py C:\\Projects\\scenergy-pathfinder\\
  cd C:\\Projects\\scenergy-pathfinder
  python phase_11_4ab_roof_visual_fix.py --check
  python phase_11_4ab_roof_visual_fix.py
  git add phase_11_4ab_roof_visual_fix.py
  git commit -m "Phase 11.4a/b: 지붕 패널 clearance + 지붕 유형 UI 노출 + default ㅅ형" -- solar_pathfinder.html phase_11_4ab_roof_visual_fix.py
  git push
"""

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path.cwd()
TARGET = ROOT / "solar_pathfinder.html"

MARKER_ALREADY = "Phase 11.4a: 지붕 모드 패널 clearance"


# ============================================================================
# Edit 1 (Phase 11.4a): panelY clearance +0.5m
# Phase 11.1E 적용 후 panelY 는 cell loop 시작 부분의 한 줄로 정의됨 (부분 유닛도 같은 변수 사용)
# ----------------------------------------------------------------------------
ANCHOR_1 = '''        if(gz+unitD/2>invExclZMin&&gz-unitD/2<invExclZMax)continue;
        var panelY=isRoof?(self._roofHeight||8):0;'''

REPLACE_1 = '''        if(gz+unitD/2>invExclZMin&&gz-unitD/2<invExclZMax)continue;
        // Phase 11.4a: 지붕 모드 패널 clearance — 박스 천장(bldgH)과 동일 평면이라 묻히는 문제 해결
        //   박스 top = bldgH, 평지붕 mesh = bldgH+0.05, 난간 = bldgH+1.0 → 패널 +0.5m 띄움 (난간보다 낮게)
        var panelY=isRoof?(self._roofHeight||8)+0.5:0;'''


# ============================================================================
# Edit 2 (Phase 11.4b-1): UI 노출 + Edit 3 (default gable)
# ----------------------------------------------------------------------------
# sim3dRoofTypeLabel 의 display:none 제거 + selected 를 gable 로 이동
ANCHOR_2 = '''<label id="sim3dRoofTypeLabel" style="display:none;"><span>지붕 유형</span><select id="sim3dRoofTypeSel" onchange="SolarSim3D.changeRoofType()"><option value="flat" selected>평지붕 (옥상)</option><option value="gable">ㅅ형 (박공지붕)</option><option value="shed">편경사 (한쪽)</option><option value="mansard">맨사드 (절충형)</option></select></label>'''

REPLACE_2 = '''<label id="sim3dRoofTypeLabel"><span>지붕 유형</span><select id="sim3dRoofTypeSel" onchange="SolarSim3D.changeRoofType()"><option value="flat">평지붕 (옥상)</option><option value="gable" selected>ㅅ형 (박공지붕)</option><option value="shed">편경사 (한쪽)</option><option value="mansard">맨사드 (절충형)</option></select></label>'''


# ============================================================================
# Edit 3 (Phase 11.4b-2): _buildRoofStructure 의 default roofType
# ----------------------------------------------------------------------------
ANCHOR_3 = '''    var floors=data._bldgHeight?Math.round(data._bldgHeight/3):3;
    var bldgH=floors*3;
    var roofType=data._roofType||"flat";
    var roofPitch=data._roofPitch||25;
    this._roofHeight=bldgH;'''

REPLACE_3 = '''    var floors=data._bldgHeight?Math.round(data._bldgHeight/3):3;
    var bldgH=floors*3;
    // Phase 11.4b: 한국 농촌/주택 default = ㅅ형 박공 (이전 "flat" 이었음). UI select 의 selected 와 일치.
    var roofType=data._roofType||"gable";
    var roofPitch=data._roofPitch||25;
    this._roofHeight=bldgH;'''


# ============================================================================
# Edit 4 (Phase 11.4b-3): changeRoofType 함수 안의 default 도 gable 로
# ----------------------------------------------------------------------------
ANCHOR_4 = '''    var roofType=(document.getElementById("sim3dRoofTypeSel")||{}).value||"flat";'''

REPLACE_4 = '''    // Phase 11.4b: default = gable (UI select 의 selected 와 일치)
    var roofType=(document.getElementById("sim3dRoofTypeSel")||{}).value||"gable";'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="anchor 검증만")
    args = parser.parse_args()

    if not TARGET.exists():
        print(f"ERROR: {TARGET} 없음 — C:\\Projects\\scenergy-pathfinder 에서 실행하세요")
        sys.exit(1)

    text = TARGET.read_text(encoding="utf-8")

    if MARKER_ALREADY in text:
        print(f"이미 적용됨 (marker '{MARKER_ALREADY}'). 종료.")
        sys.exit(0)

    edits = [
        ("Edit 1: panelY +0.5m clearance (메인 격자)", ANCHOR_1, REPLACE_1),
        ("Edit 2: sim3dRoofTypeLabel UI 노출 + selected → gable", ANCHOR_2, REPLACE_2),
        ("Edit 3: _buildRoofStructure default roofType → gable", ANCHOR_3, REPLACE_3),
        ("Edit 4: changeRoofType default roofType → gable", ANCHOR_4, REPLACE_4),
    ]

    missing = [n for n, a, _ in edits if a not in text]
    if missing:
        print("ERROR: anchor 누락:")
        for m in missing:
            print(f"  - {m}")
        sys.exit(2)

    for n, a, _ in edits:
        cnt = text.count(a)
        if cnt != 1:
            print(f"ERROR: anchor '{n}' 매칭 {cnt}회 (1회여야 안전)")
            sys.exit(2)

    if args.check:
        print("--check OK: anchor 4개 모두 발견 + unique.")
        for n, _a, _ in edits:
            print(f"  ✓ {n}")
        sys.exit(0)

    bak = TARGET.with_suffix(".html.bak.before_phase_11_4ab")
    shutil.copy2(TARGET, bak)
    print(f"backup: {bak}")

    line_count_before = text.count("\n")

    for name, anchor, new_text in edits:
        before = text
        text = text.replace(anchor, new_text, 1)
        if text == before:
            print(f"ERROR: '{name}' replace 변경 없음")
            sys.exit(3)
        print(f"  applied: {name}")

    # 5중 안전 체크
    if "</html>" not in text:
        print("ERROR: </html> 누락. 패치 중단.")
        sys.exit(4)
    if "function buildPanelsFCFromGeometryAligned" not in text:
        print("ERROR: Phase 11.1B wrapper 사라짐. 패치 중단.")
        sys.exit(5)
    if "_buildRoofStructure" not in text:
        print("ERROR: _buildRoofStructure 함수 사라짐. 패치 중단.")
        sys.exit(6)
    if 'value="gable" selected' not in text:
        print("ERROR: select 의 gable selected 적용 실패. 패치 중단.")
        sys.exit(7)
    if MARKER_ALREADY not in text:
        print("ERROR: marker 삽입 실패. 패치 중단.")
        sys.exit(8)

    line_count_after = text.count("\n")
    delta = line_count_after - line_count_before
    # 줄 추가는 주석 2-3줄 정도만 (Edit 2 는 단일 줄, Edit 1/3/4 는 주석 1-2줄 추가)
    if delta < 2 or delta > 15:
        print(f"ERROR: 줄 수 변화 {delta} 비정상 (예상 +3~10). 절단 의심.")
        sys.exit(9)

    TARGET.write_text(text, encoding="utf-8")
    print(f"✅ Phase 11.4a/b 적용 완료 ({TARGET})")
    print(f"   줄 수: {line_count_before} → {line_count_after} (Δ +{delta})")
    print()
    print("다음 단계:")
    print("  git add phase_11_4ab_roof_visual_fix.py")
    print('  git commit -m "Phase 11.4a/b: 지붕 패널 clearance + 지붕 유형 UI 노출 + default ㅅ형" \\')
    print("    -- solar_pathfinder.html phase_11_4ab_roof_visual_fix.py")
    print("  git push")
    print()
    print("배포 후 (1-3분):")
    print("  pathfinder.scenergy.co.kr Ctrl+Shift+R")
    print("  → 지붕 모드 분석 시 default ㅅ형 박공 + 지붕 유형 select UI 표시")
    print("  → 패널이 박스 위 0.5m 에 올라가서 시각적으로 보임")
    print("  → 사장님이 select 에서 [평지붕/ㅅ형/편경사/맨사드] 직접 선택 가능")
    print()
    print("⚠️ Phase 11.4c (자동 분석 시 roofType 따른 경사면 패널 배치) 는 다음 patch.")


if __name__ == "__main__":
    main()
