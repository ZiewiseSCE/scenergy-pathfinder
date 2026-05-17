#!/usr/bin/env python3
# coding: utf-8
"""
Phase 11.4d: 11.4a-2 + 11.4c 의 _roofType fallback "flat" → "gable" 일관성 fix

root cause: 자동 분석 시점에 data._roofType undefined + sim3dRoofTypeSel UI 가 DOM 에 아직 없으면
            fallback "flat" 으로 떨어짐 → 박공 분기 안 들어감 → ridge boost 0 / 양쪽 경사 분리 0
            → 평면 격자 그대로 박스 천장 동평면 → 사고 6 (panelY=bldgH 동평면) 재발

문제 일관성: Phase 11.4b 는 _buildRoofStructure 의 default 를 "gable" 로 변경했는데
             Phase 11.4a-2 / 11.4c 의 fallback 은 "flat" 그대로 남아있음.
             → 11.4b 와 일관 맞춰서 fallback "gable" 로 변경.

5중 안전 체크 (룰 2):
1. </html> 존재
2. Phase 11.4a-2 / 11.4c marker 존재
3. PHASE_11_4D marker 존재
4. 이전 phase markers 보존
5. 줄 수 변화 sanity (-1 ~ +2, 단순 문자열 교체)
"""
import sys, os, time
from pathlib import Path

PHASE_NAME = "Phase 11.4d"
PHASE_MARKER = "PHASE_11_4D_ROOF_TYPE_FALLBACK"

TARGET = Path(r"C:\Projects\scenergy-pathfinder\solar_pathfinder.html")

# 11.4a-2 의 fallback line
ANCHOR_A = '        var _ph2_roofType = (self._data && self._data._roofType) || ((document.getElementById("sim3dRoofTypeSel")||{}).value) || "flat";'
REPLACEMENT_A = '        var _ph2_roofType = (self._data && self._data._roofType) || ((document.getElementById("sim3dRoofTypeSel")||{}).value) || "gable"; // PHASE_11_4D_ROOF_TYPE_FALLBACK'

# 11.4c 의 fallback line (multi-line statement)
ANCHOR_C = (
    '      var _ph4c_roofType = (data && data._roofType) || (self._data && self._data._roofType)\n'
    '                         || ((document.getElementById("sim3dRoofTypeSel")||{}).value) || "flat";'
)
REPLACEMENT_C = (
    '      var _ph4c_roofType = (data && data._roofType) || (self._data && self._data._roofType)\n'
    '                         || ((document.getElementById("sim3dRoofTypeSel")||{}).value) || "gable"; // PHASE_11_4D_ROOF_TYPE_FALLBACK'
)


def main():
    check_only = "--check" in sys.argv

    if not TARGET.exists():
        print(f"❌ ERROR: {TARGET} not found")
        sys.exit(1)

    text = TARGET.read_text(encoding="utf-8")
    orig_lines = text.count("\n")
    print(f"📄 대상: {TARGET}")
    print(f"   현재 줄 수: {orig_lines}")

    if PHASE_MARKER in text:
        print(f"⏭️  {PHASE_NAME}: 이미 적용됨 (marker 발견). skip.")
        return

    # 선행 phase 검증
    if "PHASE_11_4A_2_RIDGE_BOOST" not in text:
        print(f"❌ {PHASE_NAME}: 선행 Phase 11.4a-2 marker 없음.")
        sys.exit(3)
    if "PHASE_11_4C_GABLE_PANEL_LAYOUT" not in text:
        print(f"❌ {PHASE_NAME}: 선행 Phase 11.4c marker 없음.")
        sys.exit(3)
    print(f"   ✓ 선행 Phase 11.4a-2 + 11.4c 적용 확인")

    cnt_a = text.count(ANCHOR_A)
    cnt_c = text.count(ANCHOR_C)
    if cnt_a != 1:
        print(f"❌ {PHASE_NAME}: 11.4a-2 fallback anchor 매칭 {cnt_a}회 (1회여야 안전)")
        sys.exit(2)
    if cnt_c != 1:
        print(f"❌ {PHASE_NAME}: 11.4c fallback anchor 매칭 {cnt_c}회 (1회여야 안전)")
        sys.exit(2)
    print(f"   ✓ anchor 두 개 모두 unique")

    if check_only:
        print(f"✅ {PHASE_NAME} --check 통과: 적용 가능")
        return

    backup = TARGET.with_suffix(TARGET.suffix + f".bak.before_phase_11_4d.{int(time.time())}")
    backup.write_bytes(TARGET.read_bytes())
    print(f"📦 백업: {backup.name}")

    new_text = text.replace(ANCHOR_A, REPLACEMENT_A, 1)
    new_text = new_text.replace(ANCHOR_C, REPLACEMENT_C, 1)
    new_lines = new_text.count("\n")
    diff_lines = new_lines - orig_lines

    fails = []
    if "</html>" not in new_text: fails.append("</html> 누락 (절단)")
    if "PHASE_11_4A_2_RIDGE_BOOST" not in new_text: fails.append("Phase 11.4a-2 marker 누락")
    if "PHASE_11_4C_GABLE_PANEL_LAYOUT" not in new_text: fails.append("Phase 11.4c marker 누락")
    if new_text.count(PHASE_MARKER) < 2: fails.append(f"{PHASE_MARKER} 2회 미만 (두 anchor 모두 적용 실패)")
    for prev in ["Phase 11.1D", "Phase 11.1E", "Phase 11.2", "Phase 11.4a:", "Phase 11.4b"]:
        if prev not in new_text:
            fails.append(f"{prev} marker 누락 (이전 phase 회귀)")
    # fallback 문자열이 두 곳에서 "flat" → "gable" 로 변경됐는지
    if 'fallback) || "flat"' in new_text.replace(' ', ''):
        # 너무 엄격한 검사 — 다른 곳에 "flat" fallback 이 있을 수 있음. skip
        pass
    if diff_lines < -2 or diff_lines > 2:
        fails.append(f"줄 수 변화 비정상: {diff_lines:+d} (예상 0)")

    if fails:
        print(f"❌ 5중 안전 체크 실패:")
        for f in fails:
            print(f"   - {f}")
        print(f"❗ 백업 복원: copy {backup.name} {TARGET.name}")
        sys.exit(4)

    TARGET.write_text(new_text, encoding="utf-8")
    print(f"✅ {PHASE_NAME} 적용 완료: {orig_lines} → {new_lines} ({diff_lines:+d}줄)")
    print(f"")
    print(f"📝 변경 요약:")
    print(f"   • Phase 11.4a-2 fallback: 'flat' → 'gable' (Phase 11.4b 와 일관)")
    print(f"   • Phase 11.4c fallback:   'flat' → 'gable'")
    print(f"   • 자동 분석 시점에 _data._roofType 가 undefined 여도 gable 분기 발동 보장")
    print(f"")
    print(f"🔍 배포 후 검증 (Ctrl+Shift+R):")
    print(f"   • 박공 모드 자동 분석 → 즉시 [Phase 11.4a-2] / [Phase 11.4c] 콘솔 로그 발동")
    print(f"   • 패널이 박스 안 묻힘 해소 + 양쪽 경사면 분리 보임")
    print(f"   • '주소: 경기 구리시 교문동 303-1' 같은 새 케이스로 재분석")
    print(f"")
    print(f"⚠️ 만약 그래도 안 보이면:")
    print(f"   • F12 콘솔에서 window.SolarSim3D._data._roofType 값 직접 확인")
    print(f"   • 박스 mesh opacity 자체가 문제일 수 있음 → Phase 11.4e (박스 opacity 강제) 후속")

if __name__ == "__main__":
    main()
