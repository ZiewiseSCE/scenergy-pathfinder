#!/usr/bin/env python3
# coding: utf-8
"""
Phase 11.6a: 이격거리 카드 OSM 실측 OK 우선 격상 ("확인 필요" 모순 fix)

증상: 카드 안에 "[OSM 실측] 도로: 실측 351m ✓ OK" 라고 표시되는데 badge 는 "확인 필요"
root cause: finishOrdinanceProgress(ok) 의 ok 가 자체 조례 검색 결과만 반영.
            OSM 실측 OK 신호는 텍스트로만 표시되고 badge 결정에 안 들어감.
            → 자체 조례 없는 지자체 (제주시 등) 는 OSM 으로 충분히 확인되어도 항상 "확인 필요"

처방: finishOrdinanceProgress 안에서 analysisSetback 의 텍스트에 "✓ OK" 가 있으면
      badge 를 "실측 확인" (또는 "확인 반영 (실측)") 으로 격상.
      자체 조례 못 찾았지만 OSM 실측 OK + 상위법 기준 만족 시 카드 status 도 ✅ 인정.

5중 안전 체크 (룰 2):
1. </html> 존재
2. finishOrdinanceProgress 정의 존재
3. PHASE_11_6A marker 존재
4. 이전 phase markers 보존
5. 줄 수 변화 sanity (+5~15)
"""
import sys, os, time
from pathlib import Path

PHASE_NAME = "Phase 11.6a"
PHASE_MARKER = "PHASE_11_6A_SETBACK_OSM_PRIORITY"

TARGET = Path(r"C:\Projects\scenergy-pathfinder\solar_pathfinder.html")

# finishOrdinanceProgress 의 badge 결정 라인 (line 4117 부근)
ANCHOR = (
    "    if(bar) bar.style.width = \"100%\";\n"
    "    if(txt) txt.textContent = text || (ok ? \"조례 기준 확인을 마쳤습니다.\" : \"조례 확인에 시간이 더 필요하거나 별도 확인이 필요합니다.\");\n"
    "    if(badge) badge.textContent = ok ? \"확인 반영\" : \"확인 필요\";"
)

REPLACEMENT = (
    "    if(bar) bar.style.width = \"100%\";\n"
    "    // PHASE_11_6A_SETBACK_OSM_PRIORITY : OSM 실측 OK 면 자체 조례 없어도 \"실측 확인\" 으로 격상\n"
    "    var _osmOk = false;\n"
    "    try{\n"
    "      var _sbCard = document.getElementById(\"analysisSetback\");\n"
    "      var _sbTxt = _sbCard ? String(_sbCard.textContent || \"\") : \"\";\n"
    "      // \"✓ OK\" / \"실측\" / \"OK\" 키워드가 텍스트에 있으면 OSM 실측이 카드에 박힌 것\n"
    "      _osmOk = /\\u2713\\s*OK|\\bOK\\b|실측[^\\n]*OK|OSM[^\\n]*OK/i.test(_sbTxt);\n"
    "    }catch(_e){}\n"
    "    var _badgeText, _txtText;\n"
    "    if(ok){\n"
    "      _badgeText = \"확인 반영\";\n"
    "      _txtText = text || \"조례 기준 확인을 마쳤습니다.\";\n"
    "    }else if(_osmOk){\n"
    "      // 자체 조례 못 찾음 + OSM 실측 OK = 상위법 + 실측 기준 만족 → 격상\n"
    "      _badgeText = \"실측 확인\";\n"
    "      _txtText = text || \"자체 조례는 미확인이나 OSM 실측 기준 이격 OK (상위법 참고).\";\n"
    "    }else{\n"
    "      _badgeText = \"확인 필요\";\n"
    "      _txtText = text || \"조례 확인에 시간이 더 필요하거나 별도 확인이 필요합니다.\";\n"
    "    }\n"
    "    if(txt) txt.textContent = _txtText;\n"
    "    if(badge){\n"
    "      badge.textContent = _badgeText;\n"
    "      // 색상도 OSM 격상 시 노란색 (amber) → 녹색 계열 톤다운\n"
    "      try{\n"
    "        badge.classList.remove(\"text-amber-300\", \"text-yellow-200\", \"bg-amber-500/20\");\n"
    "        if(_badgeText === \"확인 반영\" || _badgeText === \"실측 확인\"){\n"
    "          badge.classList.add(\"text-emerald-200\");\n"
    "        }else{\n"
    "          badge.classList.add(\"text-amber-300\");\n"
    "        }\n"
    "      }catch(_e){}\n"
    "    }"
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
        print(f"   힌트: finishOrdinanceProgress 함수 안 (line 4115-4117) 영역 확인.")
        sys.exit(2)
    print(f"   ✓ anchor unique 발견")

    if check_only:
        print(f"✅ {PHASE_NAME} --check 통과: 적용 가능")
        return

    backup = TARGET.with_suffix(TARGET.suffix + f".bak.before_phase_11_6a.{int(time.time())}")
    backup.write_bytes(TARGET.read_bytes())
    print(f"📦 백업: {backup.name}")

    new_text = text.replace(ANCHOR, REPLACEMENT, 1)
    new_lines = new_text.count("\n")
    diff_lines = new_lines - orig_lines

    fails = []
    if "</html>" not in new_text: fails.append("</html> 누락 (절단)")
    if "finishOrdinanceProgress" not in new_text: fails.append("finishOrdinanceProgress 정의 누락 (회귀)")
    if "analysisSetback" not in new_text: fails.append("analysisSetback element 누락")
    if PHASE_MARKER not in new_text: fails.append(f"{PHASE_MARKER} 누락 (적용 실패)")
    for prev in ["Phase 11.1D", "Phase 11.1E", "Phase 11.2", "Phase 11.3a"]:
        if prev not in new_text:
            fails.append(f"{prev} marker 누락 (이전 phase 회귀)")
    if diff_lines < 15 or diff_lines > 35:
        fails.append(f"줄 수 변화 비정상: +{diff_lines} (예상 +25)")

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
    print(f"   • finishOrdinanceProgress 의 badge 결정 로직에 OSM 실측 OK 검사 추가")
    print(f"   • 자체 조례 못 찾음 + OSM 실측 OK = \"실측 확인\" badge (녹색 계열)")
    print(f"   • 자체 조례 OK = \"확인 반영\" (기존)")
    print(f"   • 둘 다 fail = \"확인 필요\" (기존)")
    print(f"")
    print(f"🔍 배포 후 검증 (Ctrl+Shift+R):")
    print(f"   • 제주시 처럼 자체 조례 없는 지역 분석 → 카드 badge '실측 확인' 녹색")
    print(f"   • 카드 텍스트: '자체 조례는 미확인이나 OSM 실측 기준 이격 OK (상위법 참고)'")
    print(f"   • 조례 정확히 찾힌 지역 → 기존 '확인 반영' 유지")
    print(f"")
    print(f"⚠️ 한계: 이 패치는 finishOrdinanceProgress badge 만 fix. analysisSetback 카드의")
    print(f"   상위 컨테이너 (.text-amber-200 클래스) 색상은 별도 위치에서 결정될 수 있음.")
    print(f"   사장님 화면에서 badge 색상이 안 바뀌면 추가 진단 필요 (Phase 11.6a-2 후속).")

if __name__ == "__main__":
    main()
