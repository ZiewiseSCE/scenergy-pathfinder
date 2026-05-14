#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
phase_11_2_manual_draw_duplicate_fix.py — Phase 11.2
PC 솔라패스파인더 수동그리기 모드의 클릭 중복 처리 fix.

증상 (사장님 보고):
  지적도 불러온 뒤 지붕/토지 확대해서 수동그리기 모드에서 포인트 찍으려고
  하면 "포인트 그리기가 화면과 안 맞음". 줌 깊을수록 어긋나 보임. 사장님이
  과거에 보정했던 fix 가 회귀 (regression).

근본 원인 — handleManualDrawClick 가 클릭 한 번에 2번 호출:
  1. Handler 1 (line 2884 map.on("click")):
     manualDrawMode 면 handleManualDrawClick(e) 호출 + return  ← OK (1번째)
  2. Handler 2 (line 10707 map.on("click") __blankClickAttached):
     __featureClickLock 만 체크하고 handleBlankMapClick(e) 호출
  3. handleBlankMapClick (line 10631) 내부에서 다시 manualDrawMode 체크 →
     handleManualDrawClick(e) 또 호출  ← 사고 (2번째 중복)

결과: 클릭 1번 → manualDrawPoints.push([lat, lng]) 가 두 번 실행 →
같은 좌표 마커 2장 + L.polygon setLatLngs 두 번 update → 시각적으로 점이
어긋난 것처럼 보임. 줌 깊을수록 픽셀 단위 어긋남이 눈에 띔.

수정 (1 edit):
  handleBlankMapClick (line 10631) 의 manualDrawMode 분기에서
  handleManualDrawClick(e) 재호출 코드 제거. silent return 만 유지.
  Handler 1 (map.on click 2884) 이 이미 호출하므로 충분.

⚠️ 사용 위치: scenergy-pathfinder working repo
  Copy-Item -Force C:\\kepco-rpa-api\\solar-server-staging\\scripts\\phase_11_2_manual_draw_duplicate_fix.py C:\\Projects\\scenergy-pathfinder\\
  cd C:\\Projects\\scenergy-pathfinder
  python phase_11_2_manual_draw_duplicate_fix.py --check
  python phase_11_2_manual_draw_duplicate_fix.py
  git add phase_11_2_manual_draw_duplicate_fix.py
  git commit -m "Phase 11.2: 수동그리기 클릭 중복 호출 제거 (좌표 misalignment fix)" -- solar_pathfinder.html phase_11_2_manual_draw_duplicate_fix.py
  git push
"""

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path.cwd()
TARGET = ROOT / "solar_pathfinder.html"

MARKER_ALREADY = "Phase 11.2: manualDrawMode 가드"


# ============================================================================
# Edit 1: handleBlankMapClick 의 manualDrawMode 분기 → handleManualDrawClick 재호출 제거
# ----------------------------------------------------------------------------
ANCHOR_1 = '''async function handleBlankMapClick(e){
  const latlng = e?.latlng;
  if (!latlng) return;

  // Manual module drawing: consume map click as polygon vertex
  if(window.manualDrawMode){
    try{
      if(typeof window.handleManualDrawClick === "function") window.handleManualDrawClick(e);
    }catch(_e){}
    return;
  }'''

REPLACE_1 = '''async function handleBlankMapClick(e){
  const latlng = e?.latlng;
  if (!latlng) return;

  // Phase 11.2: manualDrawMode 가드 — Handler 1 (line 2884 map.on click) 가 이미
  // handleManualDrawClick(e) 를 호출하므로 여기서 또 호출하면 클릭 한 번에 점이
  // 2번 찍힘 (같은 좌표 마커 2장 + polygon setLatLngs 중복 update). 줌 깊을수록
  // 시각적으로 점이 어긋난 것처럼 보임. silent return 으로 중복 호출 차단.
  if(window.manualDrawMode){
    return;
  }'''


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
        ("Edit 1: handleBlankMapClick 의 manualDrawMode 분기 중복 호출 제거", ANCHOR_1, REPLACE_1),
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
        print("--check OK: anchor 1개 발견 + unique.")
        for n, _a, _ in edits:
            print(f"  ✓ {n}")
        sys.exit(0)

    bak = TARGET.with_suffix(".html.bak.before_phase_11_2")
    shutil.copy2(TARGET, bak)
    print(f"backup: {bak}")

    for name, anchor, new_text in edits:
        before = text
        text = text.replace(anchor, new_text, 1)
        if text == before:
            print(f"ERROR: '{name}' replace 변경 없음")
            sys.exit(3)
        print(f"  applied: {name}")

    # 4중 절단 안전 체크
    if "</html>" not in text:
        print("ERROR: </html> 누락 — 파일 절단 의심. 패치 중단.")
        sys.exit(4)
    if "function handleManualDrawClick" not in text and "handleManualDrawClick =" not in text:
        print("ERROR: handleManualDrawClick 사라짐 — 패치 중단.")
        sys.exit(5)
    if "async function handleBlankMapClick" not in text:
        print("ERROR: handleBlankMapClick 사라짐 — 패치 중단.")
        sys.exit(6)
    if "function buildPanelsFCFromGeometryAligned" not in text:
        print("ERROR: Phase 11.1B wrapper 사라짐 — 패치 중단.")
        sys.exit(7)

    line_count = text.count("\n")
    if line_count < 17000:
        print(f"ERROR: 줄 수 {line_count} 너무 적음. 절단 의심.")
        sys.exit(8)

    TARGET.write_text(text, encoding="utf-8")
    print(f"✅ Phase 11.2 적용 완료 ({TARGET})")
    print(f"   줄 수: {line_count}")
    print()
    print("다음 단계:")
    print("  git add phase_11_2_manual_draw_duplicate_fix.py")
    print('  git commit -m "Phase 11.2: 수동그리기 클릭 중복 호출 제거 (좌표 misalignment fix)" -- solar_pathfinder.html phase_11_2_manual_draw_duplicate_fix.py')
    print("  git push")
    print()
    print("배포 후 (GitHub Pages 1-3분):")
    print("  pathfinder.scenergy.co.kr Ctrl+Shift+R 강력 새로고침")
    print("  → 수동그리기 모드 켜고 지붕 확대해서 점 찍기")
    print("  → 각 클릭마다 마커가 정확히 클릭 위치에 1장씩 찍혀야 정상")
    print("  → manualDrawPoints 도 클릭당 1번씩 push (이전엔 2번 중복)")


if __name__ == "__main__":
    main()
