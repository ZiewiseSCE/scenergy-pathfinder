#!/usr/bin/env python3
# coding: utf-8
"""
Phase 11.2b: 수동그리기 두번째 핸들러 호출 사이트 제거 (확대 시 꼭지점 어긋남 fix)

증상: 수동그리기 확대 후 꼭지점 찍으면 화면과 실제 위치 안 맞음
root cause: Phase 11.2 는 handleBlankMapClick (line 10655) 의 중복 호출만 fix.
            하지만 line 5479-5484 의 onEachFeature 안 layer.on("click") 핸들러도
            manualDrawMode 일 때 handleManualDrawClick(e) 를 또 호출함.
            = 클릭 1번 → map.on("click") (line 2884) + layer.on("click") (line 5481) 모두 발동
            → handleManualDrawClick 두 번 호출 → 점 2개 또는 Leaflet 좌표 변환 미세 차이로 어긋남

처방: line 5479-5484 의 manualDrawMode 분기 자체 제거 (또는 호출 부분만 제거).
      이미 map.on("click") 이 manualDrawMode 시 전역 처리하므로 layer click 은 무시해도 됨.
      대신 stopPropagation 만 호출해서 자동 분석 (analyzeFeature) 도 방지.

5중 안전 체크 (룰 2):
1. </html> 존재
2. handleManualDrawClick 존재 (line 2553)
3. PHASE_11_2B marker 존재
4. 이전 phase markers 보존
5. 줄 수 변화 sanity (-1~-5)
"""
import sys, os, time
from pathlib import Path

PHASE_NAME = "Phase 11.2b"
PHASE_MARKER = "PHASE_11_2B_MANUAL_DRAW_SECOND_HANDLER_GUARD"

TARGET = Path(r"C:\Projects\scenergy-pathfinder\solar_pathfinder.html")

# layer.on("click") 안의 manualDrawMode 분기 전체 (5479-5484)
ANCHOR = (
    "        layer.on(\"click\", (e) => {\n"
    "          // 수동 그리기 모드일 때는 자동 분석 대신 꼭짓점으로 사용\n"
    "          if (typeof manualDrawMode !== \"undefined\" && manualDrawMode && typeof window.handleManualDrawClick === \"function\") {\n"
    "            try { window.handleManualDrawClick(e); } catch(_e){}\n"
    "            L.DomEvent.stopPropagation(e);\n"
    "            return;\n"
    "          }\n"
    "          L.DomEvent.stopPropagation(e);\n"
    "          analyzeFeature(feature, true);\n"
    "        });"
)

# Phase 11.2 가드만 보존, handleManualDrawClick 호출은 제거.
# map.on("click") (line 2884) 가 이미 manualDrawMode 시 처리하므로 layer click 은 stopPropagation 만.
REPLACEMENT = (
    "        layer.on(\"click\", (e) => {\n"
    "          // PHASE_11_2B_MANUAL_DRAW_SECOND_HANDLER_GUARD\n"
    "          // 수동 그리기 모드일 때는 map.on(\"click\") (line 2884) 가 이미 handleManualDrawClick 을\n"
    "          // 호출하므로 여기서 또 호출하면 점이 2번 찍히거나 좌표 변환 미세 차이로 어긋남.\n"
    "          // → stopPropagation 만 하고 layer click 의 자동 분석도 방지.\n"
    "          if (typeof manualDrawMode !== \"undefined\" && manualDrawMode) {\n"
    "            L.DomEvent.stopPropagation(e);\n"
    "            return;  // 점은 map.on click 단일 entry-point 에서만 추가\n"
    "          }\n"
    "          L.DomEvent.stopPropagation(e);\n"
    "          analyzeFeature(feature, true);\n"
    "        });"
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

    cnt = text.count(ANCHOR)
    if cnt != 1:
        print(f"❌ {PHASE_NAME}: anchor 매칭 {cnt}회 (1회여야 안전)")
        print(f"   힌트: solar_pathfinder.html 의 line 5478-5488 영역 확인. Phase 11.2 적용 후 anchor 가 달라졌을 수 있음.")
        sys.exit(2)
    print(f"   ✓ anchor unique 발견")

    if check_only:
        print(f"✅ {PHASE_NAME} --check 통과: 적용 가능")
        return

    backup = TARGET.with_suffix(TARGET.suffix + f".bak.before_phase_11_2b.{int(time.time())}")
    backup.write_bytes(TARGET.read_bytes())
    print(f"📦 백업: {backup.name}")

    new_text = text.replace(ANCHOR, REPLACEMENT, 1)
    new_lines = new_text.count("\n")
    diff_lines = new_lines - orig_lines

    fails = []
    if "</html>" not in new_text: fails.append("</html> 누락 (절단)")
    if "handleManualDrawClick" not in new_text: fails.append("handleManualDrawClick 정의 누락 (회귀)")
    if "reCalculate" not in new_text: fails.append("reCalculate 누락 (회귀)")
    if PHASE_MARKER not in new_text: fails.append(f"{PHASE_MARKER} 누락 (적용 실패)")
    for prev in ["Phase 11.1D", "Phase 11.1E", "Phase 11.3a"]:
        if prev not in new_text:
            fails.append(f"{prev} marker 누락 (이전 phase 회귀)")
    if diff_lines < -2 or diff_lines > 5:
        fails.append(f"줄 수 변화 비정상: {diff_lines:+d} (예상 +2)")

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
    print(f"   • onEachFeature 의 layer.on(\"click\") 안에서 manualDrawMode 시 handleManualDrawClick 호출 제거")
    print(f"   • 점 추가는 map.on(\"click\") (line ~2884) 단일 entry-point 로만 처리")
    print(f"   • stopPropagation 은 유지 (analyzeFeature 자동 분석 방지)")
    print(f"")
    print(f"🔍 배포 후 검증 (Ctrl+Shift+R):")
    print(f"   • 수동 그리기 켜고 지도 확대 후 클릭 → 마우스 클릭 위치와 점이 정확히 일치")
    print(f"   • 클릭 1회당 점 1개만 (이전: 2개 또는 미세 어긋남)")
    print(f"   • F12 콘솔에 'handleManualDrawClick' 호출 1회만 (디버거 break 시 확인)")

if __name__ == "__main__":
    main()
