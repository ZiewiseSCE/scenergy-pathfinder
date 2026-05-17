#!/usr/bin/env python3
# coding: utf-8
"""
Phase 11.6c: 수동그리기 컨트롤에 지적도 단축 토글 추가 (사장님 토지 모드 워크플로우)

증상: 토지 수동그리기 시 지적도 경계선이 안 보임 → 헤더 layers 메뉴 일일이 열어야 함
실제: 지적도 토글은 line 1646 헤더 메뉴에 정상 존재 (cadastralToggle). 사라진 게 아님.
processed: 수동그리기 켜졌을 때 manualDrawButtons (line 1604) 안에 단축 토글 추가.
           헤더 cadastralToggle 과 sync (둘 중 어느 것 바꿔도 다른 것도 반영).

5중 안전 체크 (룰 2):
1. </html> 존재
2. cadastralToggle 존재 (line 1646)
3. PHASE_11_6C marker 존재
4. 이전 phase markers 보존
5. 줄 수 변화 sanity (+5~10)
"""
import sys, os, time
from pathlib import Path

PHASE_NAME = "Phase 11.6c"
PHASE_MARKER = "PHASE_11_6C_CADASTRAL_SHORTCUT_IN_DRAW"

TARGET = Path(r"C:\Projects\scenergy-pathfinder\solar_pathfinder.html")

# manualDrawButtons div 의 닫는 </div> 직전에 단축 토글 추가
ANCHOR = (
    "<div id=\"manualDrawButtons\" class=\"pl-6 mt-1 flex gap-2 hidden\">\n"
    "  <button type=\"button\" class=\"px-2 py-1 rounded border border-emerald-500/70 text-[10px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100\" onclick=\"window.finishManualDraw()\">\n"
    "    배치완료\n"
    "  </button>\n"
    "  <button type=\"button\" class=\"px-2 py-1 rounded border border-slate-300 text-[10px] text-slate-600 bg-white hover:bg-slate-50\" onclick=\"window.cancelManualDraw()\">\n"
    "    취소\n"
    "  </button>\n"
    "</div>"
)

REPLACEMENT = (
    "<div id=\"manualDrawButtons\" class=\"pl-6 mt-1 flex gap-2 flex-wrap items-center hidden\">\n"
    "  <button type=\"button\" class=\"px-2 py-1 rounded border border-emerald-500/70 text-[10px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100\" onclick=\"window.finishManualDraw()\">\n"
    "    배치완료\n"
    "  </button>\n"
    "  <button type=\"button\" class=\"px-2 py-1 rounded border border-slate-300 text-[10px] text-slate-600 bg-white hover:bg-slate-50\" onclick=\"window.cancelManualDraw()\">\n"
    "    취소\n"
    "  </button>\n"
    "  <!-- PHASE_11_6C_CADASTRAL_SHORTCUT_IN_DRAW : 수동그리기 시 지적도 단축 토글 -->\n"
    "  <label class=\"inline-flex items-center gap-1 text-[10px] text-slate-700 cursor-pointer ml-1 px-2 py-1 rounded border border-amber-400/70 bg-amber-50/80 hover:bg-amber-100\" title=\"지적도 (VWorld) 경계 표시 토글 — 헤더 메뉴와 동기화\">\n"
    "    <input id=\"manualDrawCadastralToggle\" type=\"checkbox\" onchange=\"(function(cb){try{var h=document.getElementById('cadastralToggle');if(h){h.checked=cb.checked;if(typeof window.toggleLayer==='function')window.toggleLayer('cadastral');}}catch(_e){}})(this)\"/>\n"
    "    <span>📐 지적도</span>\n"
    "  </label>\n"
    "</div>\n"
    "<script>\n"
    "(function(){\n"
    "  // PHASE_11_6C: 헤더 cadastralToggle 변경 시 단축 토글도 sync (양방향)\n"
    "  try{\n"
    "    document.addEventListener('DOMContentLoaded', function(){\n"
    "      var head = document.getElementById('cadastralToggle');\n"
    "      var draw = document.getElementById('manualDrawCadastralToggle');\n"
    "      if(head && draw){\n"
    "        draw.checked = head.checked;\n"
    "        head.addEventListener('change', function(){ try{ draw.checked = head.checked; }catch(_e){} });\n"
    "      }\n"
    "    });\n"
    "  }catch(_e){}\n"
    "})();\n"
    "</script>"
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
        print(f"   힌트: line 1604-1611 의 manualDrawButtons div 영역 확인.")
        sys.exit(2)
    print(f"   ✓ anchor unique 발견")

    if check_only:
        print(f"✅ {PHASE_NAME} --check 통과: 적용 가능")
        return

    backup = TARGET.with_suffix(TARGET.suffix + f".bak.before_phase_11_6c.{int(time.time())}")
    backup.write_bytes(TARGET.read_bytes())
    print(f"📦 백업: {backup.name}")

    new_text = text.replace(ANCHOR, REPLACEMENT, 1)
    new_lines = new_text.count("\n")
    diff_lines = new_lines - orig_lines

    fails = []
    if "</html>" not in new_text: fails.append("</html> 누락 (절단)")
    if "cadastralToggle" not in new_text: fails.append("cadastralToggle 정의 누락 (회귀)")
    if "manualDrawCadastralToggle" not in new_text: fails.append("manualDrawCadastralToggle 추가 실패")
    if PHASE_MARKER not in new_text: fails.append(f"{PHASE_MARKER} 누락 (적용 실패)")
    for prev in ["Phase 11.1D", "Phase 11.1E", "Phase 11.2", "Phase 11.3a"]:
        if prev not in new_text:
            fails.append(f"{prev} marker 누락 (이전 phase 회귀)")
    if diff_lines < 10 or diff_lines > 25:
        fails.append(f"줄 수 변화 비정상: +{diff_lines} (예상 +15)")

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
    print(f"   • manualDrawButtons (line 1604) 안에 '📐 지적도' 단축 토글 추가")
    print(f"   • 단축 토글 ↔ 헤더 cadastralToggle 양방향 동기화 (script)")
    print(f"   • flex-wrap items-center 추가로 좁은 패널에서도 잘 배치됨")
    print(f"")
    print(f"🔍 배포 후 검증 (Ctrl+Shift+R):")
    print(f"   • 수동 그리기 토글 ON → 배치완료/취소 옆에 '📐 지적도' 체크박스 표시")
    print(f"   • 체크 ON → 지적도 레이어 즉시 표시 (헤더 토글과 동일 동작)")
    print(f"   • 헤더 메뉴에서 지적도 ON/OFF 시 단축 토글도 동기화")

if __name__ == "__main__":
    main()
