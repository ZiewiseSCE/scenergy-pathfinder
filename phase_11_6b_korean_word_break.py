#!/usr/bin/env python3
# coding: utf-8
"""
Phase 11.6b: CSS word-break: keep-all 추가 (한국어 글자별 줄바꿈 fix)

증상: 제목들이 "상세 리\n포트", "구매\n매력\n도", "한\n전 선\n로용\n량" 처럼 글자 사이에서 줄바꿈됨
root cause: CSS word-break / overflow-wrap 가 default → CJK 한국어는 글자 사이 줄바꿈 허용
처방: <head>의 <style> 안에 :root + 제목 selectors 에 word-break: keep-all + overflow-wrap: normal 추가

5중 안전 체크 표준 (룰 2):
1. </html> 존재
2. reCalculate 존재 (회귀 방지)
3. 새 marker (PHASE_11_6B) 존재
4. 이전 phase markers (Phase 11.1D / 11.1E / 11.2 / 11.3a) 보존
5. 줄 수 sanity (이전 +1~5 범위)
"""
import sys, os, time
from pathlib import Path

PHASE_NAME = "Phase 11.6b"
PHASE_MARKER = "PHASE_11_6B_KOREAN_WORD_BREAK"

TARGET = Path(r"C:\Projects\scenergy-pathfinder\solar_pathfinder.html")

ANCHOR = "body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; font-family: 'Pretendard', sans-serif; }"

REPLACEMENT = (
    ANCHOR + "\n"
    "        /* PHASE_11_6B_KOREAN_WORD_BREAK : 한국어 (CJK) 글자별 줄바꿈 방지 */\n"
    "        :root, body, button, label, input, textarea { word-break: keep-all; overflow-wrap: normal; }\n"
    "        h1, h2, h3, h4, h5, h6, .font-bold, .font-semibold, .text-xs, .text-sm { word-break: keep-all; overflow-wrap: normal; }\n"
    "        .break-keep { word-break: keep-all !important; overflow-wrap: normal !important; }\n"
    "        /* PHASE_11_6B_END */"
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

    # idempotency
    if PHASE_MARKER in text:
        print(f"⏭️  {PHASE_NAME}: 이미 적용됨 (marker 발견). skip.")
        return

    # anchor unique 검증
    cnt = text.count(ANCHOR)
    if cnt != 1:
        print(f"❌ {PHASE_NAME}: anchor 매칭 {cnt}회 (1회여야 안전)")
        sys.exit(2)
    print(f"   ✓ anchor unique 발견")

    if check_only:
        print(f"✅ {PHASE_NAME} --check 통과: 적용 가능")
        return

    # 백업
    backup = TARGET.with_suffix(TARGET.suffix + f".bak.before_phase_11_6b.{int(time.time())}")
    backup.write_bytes(TARGET.read_bytes())
    print(f"📦 백업: {backup.name}")

    # 적용 (line ending 보존)
    new_text = text.replace(ANCHOR, REPLACEMENT, 1)
    new_lines = new_text.count("\n")
    diff_lines = new_lines - orig_lines

    # 5중 안전 체크
    fails = []
    if "</html>" not in new_text: fails.append("</html> 누락 (절단)")
    if "reCalculate" not in new_text: fails.append("reCalculate 누락 (회귀)")
    if PHASE_MARKER not in new_text: fails.append(f"{PHASE_MARKER} 누락 (적용 실패)")
    for prev in ["Phase 11.1D", "Phase 11.1E", "Phase 11.2", "Phase 11.3a"]:
        if prev not in new_text:
            fails.append(f"{prev} marker 누락 (이전 phase 회귀)")
    if diff_lines < 1 or diff_lines > 6:
        fails.append(f"줄 수 변화 비정상: +{diff_lines} (예상 +5)")

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
    print(f"   • <head>의 <style> 안에 word-break: keep-all + overflow-wrap: normal 추가")
    print(f"   • 적용 대상: :root, body, button, label, input, h1~h6, .font-bold, .font-semibold, .text-xs, .text-sm")
    print(f"   • 추가 클래스: .break-keep (필요 시 일부에 강제 적용)")
    print(f"")
    print(f"🔍 배포 후 검증 (Ctrl+Shift+R):")
    print(f"   • '상세 리포트' 제목이 한 줄로 표시")
    print(f"   • '구매 매력도' / '한전 선로용량' 등 한 줄 유지")
    print(f"   • 좁은 컨테이너에서도 단어/구 단위로만 줄바꿈")

if __name__ == "__main__":
    main()
