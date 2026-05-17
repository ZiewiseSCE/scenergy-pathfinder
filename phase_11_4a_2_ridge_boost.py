#!/usr/bin/env python3
# coding: utf-8
"""
Phase 11.4a-2: 박공/편경사 mode 시 패널을 ridge 위로 띄움 (mesh wall 묻힘 해소)

증상: 자동 분석에서 박공 (gable) mode 선택 시 mesh 는 잘 그려지지만 패널이 안 보임
       (좌상단 "249장 100%" 표시 = 데이터 있음. 시각화만 안 됨)
root cause: Phase 11.4a 에서 panelY 를 bldgH+0.5 로 띄웠으나
            박공 ridge 는 bldgH + (폭/2) × tan(경사) 만큼 더 높음 (25° 박공 = +2~3m)
            → 평면 격자 패널이 박공 mesh 의 wall 안쪽에 묻혀 안 보임 (z-order)

처방 (빠른 시각 fix):
  roofType 이 gable / shed 일 때 panelY 에 ridge 높이만큼 추가.
  패널이 박공 ridge 위에 평평하게 떠서 일단 시각적으로 보이게 됨.

한계: 패널은 여전히 평면 격자 (박공 결방향 따라 분리 X). 진짜 박공 배치는 Phase 11.4c.

5중 안전 체크 (룰 2):
1. </html> 존재
2. _buildPanels / _buildRoofStructure 정의 존재
3. PHASE_11_4A_2 marker 존재
4. 이전 phase markers (11.1D / 11.1E / 11.2 / 11.4a) 보존
5. 줄 수 변화 sanity (+5~12)
"""
import sys, os, time
from pathlib import Path

PHASE_NAME = "Phase 11.4a-2"
PHASE_MARKER = "PHASE_11_4A_2_RIDGE_BOOST"

TARGET = Path(r"C:\Projects\scenergy-pathfinder\solar_pathfinder.html")

# Phase 11.4a 가 적용된 후의 정확한 anchor (line 14266-14268)
ANCHOR = (
    "        // Phase 11.4a: 지붕 모드 패널 clearance — 박스 천장(bldgH)과 동일 평면이라 묻히는 문제 해결\n"
    "        //   박스 top = bldgH, 평지붕 mesh = bldgH+0.05, 난간 = bldgH+1.0 → 패널 +0.5m 띄움 (난간보다 낮게)\n"
    "        var panelY=isRoof?(self._roofHeight||8)+0.5:0;"
)

REPLACEMENT = (
    "        // Phase 11.4a: 지붕 모드 패널 clearance — 박스 천장(bldgH)과 동일 평면이라 묻히는 문제 해결\n"
    "        //   박스 top = bldgH, 평지붕 mesh = bldgH+0.05, 난간 = bldgH+1.0 → 패널 +0.5m 띄움 (난간보다 낮게)\n"
    "        // PHASE_11_4A_2_RIDGE_BOOST: 박공/편경사 모드 시 ridge 위로 패널 띄움 (mesh wall 묻힘 해소)\n"
    "        //   박공 ridge = bldgH + (폭/2) × tan(경사) → 25° 박공 = +2~3m. panelY 가 bldgH+0.5 면 mesh 안 묻힘.\n"
    "        //   임시 시각 fix. 진짜 박공 패널 배치는 Phase 11.4c (양쪽 경사면 분리).\n"
    "        var _ph2_roofType = (self._data && self._data._roofType) || ((document.getElementById(\"sim3dRoofTypeSel\")||{}).value) || \"flat\";\n"
    "        var _ph2_ridgeBoost = 0;\n"
    "        if(isRoof && (_ph2_roofType === \"gable\" || _ph2_roofType === \"shed\")){\n"
    "          var _ph2_pitchEl = document.getElementById(\"sim3dRoofPitchSel\");\n"
    "          var _ph2_pitch = parseFloat((_ph2_pitchEl && _ph2_pitchEl.value) || 25);\n"
    "          var _ph2_w = Math.max((typeof maxX !== \"undefined\" ? maxX : 0) - (typeof minX !== \"undefined\" ? minX : 0),\n"
    "                                 (typeof maxZ !== \"undefined\" ? maxZ : 0) - (typeof minZ !== \"undefined\" ? minZ : 0));\n"
    "          if(_ph2_w > 0 && isFinite(_ph2_pitch)){\n"
    "            _ph2_ridgeBoost = (_ph2_w / 2) * Math.tan(_ph2_pitch * Math.PI / 180);\n"
    "            // shed (편경사) 는 한쪽만 높음 → 박공의 1/2\n"
    "            if(_ph2_roofType === \"shed\") _ph2_ridgeBoost *= 0.5;\n"
    "          }\n"
    "        }\n"
    "        var panelY=isRoof?(self._roofHeight||8)+0.5 + _ph2_ridgeBoost:0;\n"
    "        if(_ph2_ridgeBoost > 0){\n"
    "          try{ if(typeof console!=='undefined') console.log('[Phase 11.4a-2] roofType=' + _ph2_roofType + ' ridgeBoost=' + _ph2_ridgeBoost.toFixed(2) + 'm panelY=' + panelY.toFixed(2)); }catch(_e){}\n"
    "        }"
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

    # 의존 phase 검증: Phase 11.4a 가 적용된 상태여야 함
    if "Phase 11.4a:" not in text or "박스 천장(bldgH)과 동일 평면" not in text:
        print(f"❌ {PHASE_NAME}: 선행 Phase 11.4a 가 적용 안 됨. 먼저 phase_11_4ab_roof_visual_fix.py 실행 필요.")
        sys.exit(3)
    print(f"   ✓ 선행 Phase 11.4a 적용 확인")

    cnt = text.count(ANCHOR)
    if cnt != 1:
        print(f"❌ {PHASE_NAME}: anchor 매칭 {cnt}회 (1회여야 안전)")
        print(f"   힌트: line 14266-14268 영역. Phase 11.4a 적용 후 정확한 형태인지 확인.")
        sys.exit(2)
    print(f"   ✓ anchor unique 발견")

    if check_only:
        print(f"✅ {PHASE_NAME} --check 통과: 적용 가능")
        return

    backup = TARGET.with_suffix(TARGET.suffix + f".bak.before_phase_11_4a_2.{int(time.time())}")
    backup.write_bytes(TARGET.read_bytes())
    print(f"📦 백업: {backup.name}")

    new_text = text.replace(ANCHOR, REPLACEMENT, 1)
    new_lines = new_text.count("\n")
    diff_lines = new_lines - orig_lines

    fails = []
    if "</html>" not in new_text: fails.append("</html> 누락 (절단)")
    if "_buildPanels" not in new_text and "buildPanelsFCFromGeometry" not in new_text: fails.append("_buildPanels 누락 (회귀)")
    if "_buildRoofStructure" not in new_text: fails.append("_buildRoofStructure 누락 (회귀)")
    if PHASE_MARKER not in new_text: fails.append(f"{PHASE_MARKER} 누락 (적용 실패)")
    for prev in ["Phase 11.1D", "Phase 11.1E", "Phase 11.2", "Phase 11.4a:", "Phase 11.4b"]:
        if prev not in new_text:
            fails.append(f"{prev} marker 누락 (이전 phase 회귀)")
    if diff_lines < 12 or diff_lines > 25:
        fails.append(f"줄 수 변화 비정상: +{diff_lines} (예상 +17)")

    if fails:
        print(f"❌ 5중 안전 체크 실패:")
        for f in fails:
            print(f"   - {f}")
        print(f"❗ 백업 복원: copy {backup.name} {TARGET.name}")
        sys.exit(4)

    TARGET.write_text(new_text, encoding="utf-8")
    print(f"✅ {PHASE_NAME} 적용 완료: {orig_lines} → {new_lines} (+{diff_lines}줄)")
    print(f"")
    print(f"📝 변경 요약:")
    print(f"   • _buildPanels 의 panelY 계산에 roofType=gable/shed 일 때 ridge boost 추가")
    print(f"   • gable 25° → 패널이 ridge 위로 약 2~3m 띄워짐")
    print(f"   • shed → 박공의 1/2 (한쪽만 높음)")
    print(f"   • flat / mansard → 보정 X (기존 동작)")
    print(f"")
    print(f"🔍 배포 후 검증 (Ctrl+Shift+R):")
    print(f"   • 박공 mode 자동 분석 → 패널이 박공 ridge 위에 평평하게 보임 (mesh 안 묻힘)")
    print(f"   • F12 콘솔: [Phase 11.4a-2] roofType=gable ridgeBoost=X.XXm panelY=Y.YY 출력")
    print(f"   • 좌상단 발전량 (249장 100%) 정상 표시 + 시각도 보임")
    print(f"")
    print(f"⚠️ 한계 (Phase 11.4c 까지 남는 부분):")
    print(f"   • 패널은 여전히 평면 격자 — 박공 결방향 (남/북 분리) 무시")
    print(f"   • 패널이 박공 위에 떠 있는 모습 (실제 설치는 양쪽 경사면)")
    print(f"   • Phase 11.4c 가 진짜 박공 패널 배치 (~30~40분 작업)")

if __name__ == "__main__":
    main()
