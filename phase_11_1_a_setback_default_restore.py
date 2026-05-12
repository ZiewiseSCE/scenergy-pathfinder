#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
phase_11_1_a_setback_default_restore.py — Phase 11.1A
PC 솔라패스파인더 (scenergy-pathfinder/solar_pathfinder.html) 의 setbackDist
입력 default value 를 0.0 으로 복원 (3/27 시절 = 533 kW 시점).

증상 (사장님 표 기준 — 충남 천안시 동남구 성남면 대화리 352):
  3/26 자동배치 587 / 실배치 533 → 5/11 자동배치 494 (-8%) / 수동 388 (-37%)
  사장님 목표 = 자동/실배치 양쪽 ~550 kW 회복.

근본 원인 (3가지 동시 변경, 3/27 commit 13c8d68 → 5/10 commit 44fce55):
  1. setbackDist value="0.0" → "2.0"  ← 사장님이 만진 부분 (main 원인)
  2. rowSpacing value="1.2"   → "1.5"  ← 어레이 앞뒤 간격 +25%
  3. installAngle value="20"   → "15"  ← 설치 각도 변경

이번 patch 는 #1 (setbackDist) 만 복원. 사장님 결정에 따라 label/title 의
"경계 이격거리(m) / 통상 2m" 의미는 유지 (default 만 0.0). 사용자가 분석 시
필요하면 직접 2.0 입력해서 사용 가능.

예상 효과:
  - 페이지 첫 로드 시 setbackDist = 0.0 (예전 동작)
  - 자동배치 494 → ~534 kW (~3/26 실배치 533 수준 회복)
  - 사장님 목표 ~550 에 거의 근접
  - rowSpacing/installAngle 추가 보정은 11.1B/C 또는 별도 패치에서

⚠️ 사용 위치: scenergy-pathfinder working repo
  Copy-Item -Force C:\\kepco-rpa-api\\solar-server-staging\\scripts\\phase_11_1_a_setback_default_restore.py C:\\Projects\\scenergy-pathfinder\\
  cd C:\\Projects\\scenergy-pathfinder
  python phase_11_1_a_setback_default_restore.py --check
  python phase_11_1_a_setback_default_restore.py
  git add solar_pathfinder.html phase_11_1_a_setback_default_restore.py
  git commit -m "Phase 11.1A: setbackDist default 0.0 으로 복원 (자동배치 ~550 회복)" -- solar_pathfinder.html phase_11_1_a_setback_default_restore.py
  git push

⚠️ GitHub Pages 자동 배포 — push 후 1-3분 후 pathfinder.scenergy.co.kr 반영.
"""

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path.cwd()
TARGET = ROOT / "solar_pathfinder.html"

# 정확한 anchor — setbackDist input 의 value="2.0" 포함 부분
# 사장님이 변경한 label("경계 이격거리") / title("통상 2m") 은 그대로 유지
ANCHOR_1 = 'placeholder="경계 이격거리(m)" step="0.5" title="지적도 경계에서 안쪽으로 이격하는 거리(m). 통상 2m." type="number" value="2.0"'

REPLACE_1 = 'placeholder="경계 이격거리(m)" step="0.5" title="지적도 경계에서 안쪽으로 이격하는 거리(m). 통상 2m." type="number" value="0.0"'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    if not TARGET.exists():
        print(f"ERROR: {TARGET} 없음 — C:\\Projects\\scenergy-pathfinder 에서 실행하세요")
        sys.exit(1)

    text = TARGET.read_text(encoding="utf-8")

    # 이미 적용 됐는지 (setbackDist value="0.0" 인지)
    if REPLACE_1 in text:
        print(f"이미 적용됨 (setbackDist value=\"0.0\"). 종료.")
        sys.exit(0)

    # anchor 누락 검사
    if ANCHOR_1 not in text:
        print("ERROR: anchor 누락 (setbackDist value=\"2.0\" 못 찾음)")
        print("  → 누군가 다른 값으로 이미 변경했을 가능성. 수동 확인 필요:")
        print('     grep -n \'id="setbackDist"\' solar_pathfinder.html')
        sys.exit(2)

    # anchor unique
    cnt = text.count(ANCHOR_1)
    if cnt != 1:
        print(f"ERROR: anchor 매칭 {cnt}회 (1회여야 안전)")
        sys.exit(2)

    if args.check:
        print("--check OK: setbackDist value=\"2.0\" anchor 1개 발견 + unique")
        sys.exit(0)

    bak = TARGET.with_suffix(".html.bak.before_phase_11_1_a")
    shutil.copy2(TARGET, bak)
    print(f"backup: {bak}")

    before = text
    text = text.replace(ANCHOR_1, REPLACE_1, 1)
    if text == before:
        print("ERROR: replace 변경 없음")
        sys.exit(3)

    # 4중 절단 안전 체크 (Phase 9.7 / 9.9 교훈)
    if "</html>" not in text:
        print("ERROR: </html> 누락 — 파일 절단 의심. 패치 중단.")
        sys.exit(4)
    if "window.reCalculate" not in text:
        print("ERROR: window.reCalculate 사라짐 — 패치 중단.")
        sys.exit(5)
    if "function orientationFactor" not in text:
        print("ERROR: orientationFactor 함수 사라짐 — 패치 중단.")
        sys.exit(6)
    if "function buildPanelsFCFromGeometry" not in text:
        print("ERROR: buildPanelsFCFromGeometry 함수 사라짐 — 패치 중단.")
        sys.exit(7)

    # 줄 수 sanity (5/10 시점 17031 → 약간 변경, 큰 차이 없어야)
    line_count = text.count("\n")
    if line_count < 15000:
        print(f"ERROR: 줄 수 {line_count} 너무 적음 (예상 17000+). 절단 의심.")
        sys.exit(8)

    TARGET.write_text(text, encoding="utf-8")
    print(f"✅ Phase 11.1A 적용 완료 ({TARGET})")
    print(f"   줄 수: {line_count} (이전 동일 ±소량)")
    print()
    print("다음 단계:")
    print("  git add solar_pathfinder.html phase_11_1_a_setback_default_restore.py")
    print('  git commit -m "Phase 11.1A: setbackDist default 0.0 으로 복원 (자동배치 ~550 회복)" -- solar_pathfinder.html phase_11_1_a_setback_default_restore.py')
    print("  git push")
    print()
    print("배포 후 (GitHub Pages 1-3분):")
    print("  pathfinder.scenergy.co.kr 새로고침 (Ctrl+Shift+R)")
    print("  → 충남 천안시 동남구 성남면 대화리 352 분석")
    print("  → 자동배치 ~534 kW 나와야 정상 (3/26 실배치 533 수준 회복)")
    print("  → 다른 지적도도 비례적으로 ~+8% 복원")
    print()
    print("11.1A 검증 끝나면:")
    print("  Phase 11.1B + 11.1C — 지붕형 패널 회전각 → 효율 → PF 사업성 반영")


if __name__ == "__main__":
    main()
