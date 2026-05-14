#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
phase_11_3a_3d_terrain_safety.py — Phase 11.3a
PC 솔라패스파인더 3D 시뮬레이션의 지면 침투 방지 (안전 fix).

증상 (사장님 보고):
  3D 도면 그리기에서 어느 지역은 아직도 패널/장비가 지면을 파고 들어가는
  문제. 일부 지역 (산악/언덕/DEM mesh deform 되는 곳) 에서만 발생.

근본 원인 (코드 추적):
  SolarSim3D._adjustToTerrain() 가 패널/펜스/장비를 지면 평면에 맞춰 재배치하는
  핵심 함수인데, 다음 4가지 결함이 겹쳐서 일부 지역 침투 발생:

  1. 외부 가드 line 13702: `if(this._parcelPlane) this._adjustToTerrain();`
     → _parcelPlane (필지 평면 fit 결과) 이 없으면 호출 자체가 안 됨
  2. 외부 가드 line 14256: 같은 패턴 (OSM 건물 로드 후)
  3. 내부 early return line 14641: `if(!_parcelPlane && !_elevData) return;`
     → 둘 다 없으면 보정 안 됨
  4. clearance 최소값 0.3 — 가파른 지형/DEM 오차에서 부족할 수 있음

수정 (4 edits):
  Edit 1: line 13702 외부 가드 제거 → 무조건 호출 (평지 fallback 으로 안전)
  Edit 2: line 14256 외부 가드 제거 → 같음
  Edit 3: line 14641 내부 early return 제거 → 평지 fallback {a:0,b:0,c:0}
  Edit 4: line 14651 clearance 최소 0.3→0.6, base 0.05→0.15 (안전 마진 강화)

영향:
  - 평지 지역 (대부분): _parcelPlane 평면 fit 정상 → 기존 동작과 동일 (clearance 만 약간 증가, 패널 살짝 더 위)
  - 산악/언덕 지역 (사장님 케이스): _parcelPlane fit 실패 또는 mesh mismatch
    상황에서도 평지 fallback 으로 _adjustToTerrain 가 호출되고 패널이 clearance
    위에 정확히 배치 → 침투 방지
  - 시각: 산악 지역에서 패널이 살짝 평지에 떠 있는 효과 가능 (침투보다는 훨씬 OK)

⚠️ 사용 위치: scenergy-pathfinder working repo
  Copy-Item -Force C:\\kepco-rpa-api\\solar-server-staging\\scripts\\phase_11_3a_3d_terrain_safety.py C:\\Projects\\scenergy-pathfinder\\
  cd C:\\Projects\\scenergy-pathfinder
  python phase_11_3a_3d_terrain_safety.py --check
  python phase_11_3a_3d_terrain_safety.py
  git add phase_11_3a_3d_terrain_safety.py
  git commit -m "Phase 11.3a: 3D 지면 침투 방지 (외부 가드 + early return 제거 + clearance 강화)" -- solar_pathfinder.html phase_11_3a_3d_terrain_safety.py
  git push
"""

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path.cwd()
TARGET = ROOT / "solar_pathfinder.html"

MARKER_ALREADY = "Phase 11.3: early return 제거"


# ============================================================================
# Edit 1: 외부 가드 line 13702 제거 (배선+인버터 갱신 다음)
# ----------------------------------------------------------------------------
ANCHOR_1 = '''    // 배선+인버터 갱신
    this._showWiring(this._data);
    // 지형 경사면 적용
    if(this._parcelPlane)this._adjustToTerrain();'''

REPLACE_1 = '''    // 배선+인버터 갱신
    this._showWiring(this._data);
    // 지형 경사면 적용
    // Phase 11.3: _parcelPlane 가드 제거 — 평면 fit 실패 시에도 평지 fallback 으로 안전 보정 (지면 침투 방지)
    this._adjustToTerrain();'''


# ============================================================================
# Edit 2: 외부 가드 line 14256 제거 (OSM 건물 로드 후)
# ----------------------------------------------------------------------------
ANCHOR_2 = '''    // 지형 경사 반영: 이미 고도 데이터가 로드된 경우 즉시 패널 높이 보정
    if(this._parcelPlane) this._adjustToTerrain();'''

REPLACE_2 = '''    // 지형 경사 반영: 이미 고도 데이터가 로드된 경우 즉시 패널 높이 보정
    // Phase 11.3: _parcelPlane 가드 제거 — 평면 fit 실패 시에도 평지 fallback 으로 안전 보정
    this._adjustToTerrain();'''


# ============================================================================
# Edit 3: 내부 early return 제거 (line 14641, _adjustToTerrain 함수 시작)
# ----------------------------------------------------------------------------
ANCHOR_3 = '''  _adjustToTerrain:function(){
    if(!this._parcelPlane&&!this._elevData)return;
    var p=this._parcelPlane||{a:0,b:0,c:0};'''

REPLACE_3 = '''  _adjustToTerrain:function(){
    // Phase 11.3: early return 제거 — _parcelPlane/_elevData 둘 다 없어도 평지
    // fallback {a:0,b:0,c:0} 으로 무조건 보정 진행. 이전엔 외부 가드 + 내부 return
    // 이중 차단이라 일부 지역에서 패널이 초기 y=0 위치 그대로 = terrain mesh
    // deform 과 mismatch 시 침투 발생.
    var p=this._parcelPlane||{a:0,b:0,c:0};'''


# ============================================================================
# Edit 4: clearance 안전 마진 강화 (line 14651)
# ----------------------------------------------------------------------------
ANCHOR_4 = '''    var slopeClearance=unitHalfDiag*Math.sin(slopeAng);
    var clearance=Math.max(0.05, 0.3+slopeClearance);'''

REPLACE_4 = '''    var slopeClearance=unitHalfDiag*Math.sin(slopeAng);
    // Phase 11.3: clearance 안전 마진 강화 (min 0.05→0.15, base 0.3→0.6)
    // 가파른 지형 / DEM 오차 / mesh deform 변동 / _parcelPlane 평면 fit 부정확 대비
    var clearance=Math.max(0.15, 0.6+slopeClearance);'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    if not TARGET.exists():
        print(f"ERROR: {TARGET} 없음 — C:\\Projects\\scenergy-pathfinder 에서 실행하세요")
        sys.exit(1)

    text = TARGET.read_text(encoding="utf-8")

    if MARKER_ALREADY in text:
        print(f"이미 적용됨 (marker '{MARKER_ALREADY}'). 종료.")
        sys.exit(0)

    edits = [
        ("Edit 1: 외부 가드 13702 (배선+인버터 다음) 제거", ANCHOR_1, REPLACE_1),
        ("Edit 2: 외부 가드 14256 (OSM 다음) 제거", ANCHOR_2, REPLACE_2),
        ("Edit 3: _adjustToTerrain 내부 early return 제거", ANCHOR_3, REPLACE_3),
        ("Edit 4: clearance 안전 마진 강화", ANCHOR_4, REPLACE_4),
    ]

    missing = [n for n, a, _ in edits if a not in text]
    if missing:
        print("ERROR: anchor 누락:")
        for m in missing:
            print(f"  - {m}")
        sys.exit(2)

    # anchor unique 검증
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

    bak = TARGET.with_suffix(".html.bak.before_phase_11_3a")
    shutil.copy2(TARGET, bak)
    print(f"backup: {bak}")

    for name, anchor, new_text in edits:
        before = text
        text = text.replace(anchor, new_text, 1)
        if text == before:
            print(f"ERROR: '{name}' replace 변경 없음")
            sys.exit(3)
        print(f"  applied: {name}")

    # 6중 절단 안전 체크 (이전 phase 들 보존 + 핵심 함수 유지)
    if "</html>" not in text:
        print("ERROR: </html> 누락 — 파일 절단 의심. 패치 중단.")
        sys.exit(4)
    if "_adjustToTerrain:function" not in text:
        print("ERROR: _adjustToTerrain 함수 사라짐 — 패치 중단.")
        sys.exit(5)
    if "_terrainHeightAt:function" not in text:
        print("ERROR: _terrainHeightAt 함수 사라짐 — 패치 중단.")
        sys.exit(6)
    if "function buildPanelsFCFromGeometryAligned" not in text:
        print("ERROR: Phase 11.1B wrapper 사라짐 — 패치 중단.")
        sys.exit(7)
    if "Phase 11.2: manualDrawMode 가드" not in text:
        print("ERROR: Phase 11.2 보정 사라짐 — 패치 중단.")
        sys.exit(8)
    if "window.reCalculate" not in text:
        print("ERROR: window.reCalculate 사라짐 — 패치 중단.")
        sys.exit(9)

    line_count = text.count("\n")
    if line_count < 17000:
        print(f"ERROR: 줄 수 {line_count} 너무 적음. 절단 의심.")
        sys.exit(10)

    TARGET.write_text(text, encoding="utf-8")
    print(f"✅ Phase 11.3a 적용 완료 ({TARGET})")
    print(f"   줄 수: {line_count}")
    print()
    print("다음 단계:")
    print("  git add phase_11_3a_3d_terrain_safety.py")
    print('  git commit -m "Phase 11.3a: 3D 지면 침투 방지 (외부 가드 + early return 제거 + clearance 강화)" -- solar_pathfinder.html phase_11_3a_3d_terrain_safety.py')
    print("  git push")
    print()
    print("배포 후 (GitHub Pages 1-3분):")
    print("  pathfinder.scenergy.co.kr Ctrl+Shift+R")
    print("  → 3D 시뮬레이션 모드로 들어가서 다양한 지적도 (산악/언덕/평지) 분석")
    print("  → 패널/펜스/장비가 지면을 파고들지 않아야 정상")
    print("  → 산악 지역에서 패널이 살짝 평지에 떠 있는 효과 가능 (침투보다 훨씬 안전)")
    print("  → 그래도 침투하는 케이스가 있으면 Phase 11.3b (정밀 raycaster fix) 진행")


if __name__ == "__main__":
    main()
