#!/usr/bin/env python3
# coding: utf-8
"""
Phase 11.4c: 자동 분석 시 박공/편경사 패널을 양쪽 경사면에 분리 + 경사각 적용 (근본 처방)

증상: 박공 mode 자동 분석 시 패널이 평면 격자로만 배치됨 → "지붕 결방향 무시" (v10.2 § 12.5)
       Phase 11.4a-2 의 ridge boost 는 패널을 ridge 위에 평평히 띄울 뿐 (떠있는 모양)
root cause: _buildPanels (line 14266) 는 단순 bbox 격자만. roofType 무관.
            changeRoofType (line 14465-14492) 의 gable 분기는 양쪽 경사면 분리 배치 로직을
            가지고 있지만 사용자가 select 변경 시만 호출됨. 자동 분석 시는 안 거침.

처방 방식 (3가지 후보 중):
  ✗ 옵션 A: _buildPanels 안에 roofType 분기 추가 → 로직 두 곳 중복
  ✗ 옵션 B: 자동 분석 직후 changeRoofType() 자동 호출 → mesh/panel 청소 로직 복잡
  ✓ 옵션 C: _buildPanels inner loop 끝난 후 post-processing 으로 패널 position/rotation 재계산
            → buildArrayUnit (2x3 유닛) mesh 는 그대로 두고 위치 + 회전만 박공 경사에 맞춤
            → Phase 11.1E 의 부분 유닛 fallback 효과도 보존됨

5중 안전 체크 (룰 2):
1. </html> 존재
2. _buildPanels / _panels / _panelPositions 정의 존재
3. PHASE_11_4C marker 존재
4. 이전 phase markers (11.1E / 11.4a / 11.4a-2 호환) 보존
5. 줄 수 변화 sanity (+40~70)
"""
import sys, os, time
from pathlib import Path

PHASE_NAME = "Phase 11.4c"
PHASE_MARKER = "PHASE_11_4C_GABLE_PANEL_LAYOUT"

TARGET = Path(r"C:\Projects\scenergy-pathfinder\solar_pathfinder.html")

# Phase 11.1E 통계 로그 직후에 삽입 (모든 패널이 self._panels 에 들어간 상태)
ANCHOR = (
    "    // Phase 11.1E: 부분 유닛 통계 로그\n"
    "    var _p11eBy = Object.keys(_p11eCounts.by).map(function(k){ return k+\"=\"+_p11eCounts.by[k]; }).join(\", \");\n"
    "    console.log(\"[Phase 11.1E] 완전유닛=\"+_p11eCounts.full+\" 부분유닛=\"+_p11eCounts.partial+(_p11eBy?\" (\"+_p11eBy+\")\":\"\"));"
)

REPLACEMENT = (
    "    // Phase 11.1E: 부분 유닛 통계 로그\n"
    "    var _p11eBy = Object.keys(_p11eCounts.by).map(function(k){ return k+\"=\"+_p11eCounts.by[k]; }).join(\", \");\n"
    "    console.log(\"[Phase 11.1E] 완전유닛=\"+_p11eCounts.full+\" 부분유닛=\"+_p11eCounts.partial+(_p11eBy?\" (\"+_p11eBy+\")\":\"\"));\n"
    "\n"
    "    // PHASE_11_4C_GABLE_PANEL_LAYOUT : 박공/편경사 mode 시 패널을 양쪽 경사면에 분리 + 경사각 적용\n"
    "    //   _buildPanels 가 평면 격자로 만들어 놓은 패널들의 position/rotation 을 박공 형상에 맞춤.\n"
    "    //   buildArrayUnit (2x3 유닛) mesh 자체는 그대로 두고 위치+회전만 조정 → Phase 11.1E 부분유닛 효과도 보존.\n"
    "    try{\n"
    "      var _ph4c_roofType = (data && data._roofType) || (self._data && self._data._roofType)\n"
    "                         || ((document.getElementById(\"sim3dRoofTypeSel\")||{}).value) || \"flat\";\n"
    "      if(isRoof && (_ph4c_roofType === \"gable\" || _ph4c_roofType === \"shed\")){\n"
    "        var _ph4c_pitchEl = document.getElementById(\"sim3dRoofPitchSel\");\n"
    "        var _ph4c_pitch = parseFloat((_ph4c_pitchEl && _ph4c_pitchEl.value) || 25);\n"
    "        if(!isFinite(_ph4c_pitch) || _ph4c_pitch <= 0) _ph4c_pitch = 25;\n"
    "        var _ph4c_pitchRad = _ph4c_pitch * Math.PI / 180;\n"
    "        var _ph4c_midZ = (minZ + maxZ) / 2;\n"
    "        var _ph4c_halfDepth = (maxZ - minZ) / 2;\n"
    "        var _ph4c_ridgeH = _ph4c_halfDepth * Math.tan(_ph4c_pitchRad);\n"
    "        var _ph4c_baseY = (self._roofHeight || 8);\n"
    "        var _ph4c_north = 0, _ph4c_south = 0;\n"
    "        var _ph4c_gableCover = (self._data && self._data._gableCover)\n"
    "                              || ((document.getElementById(\"sim3dGableCoverSel\")||{}).value) || \"both\";\n"
    "        for(var _ph4c_i = 0; _ph4c_i < self._panels.length; _ph4c_i++){\n"
    "          var _ph4c_p = self._panels[_ph4c_i];\n"
    "          var _ph4c_pp = self._panelPositions[_ph4c_i];\n"
    "          if(!_ph4c_p || !_ph4c_pp) continue;\n"
    "          var _ph4c_gx = _ph4c_pp.x;\n"
    "          var _ph4c_gz = _ph4c_pp.z;\n"
    "          if(_ph4c_roofType === \"shed\"){\n"
    "            // 편경사: 남(낮음) → 북(높음) 한 방향 (changeRoofType 의 line 14499 와 일관)\n"
    "            var _ph4c_shedT = (maxZ - minZ) > 0 ? (_ph4c_gz - minZ) / (maxZ - minZ) : 0;\n"
    "            var _ph4c_shedY = _ph4c_baseY + _ph4c_shedT * (maxZ - minZ) * Math.tan(_ph4c_pitchRad) * 0.3;\n"
    "            _ph4c_p.position.set(_ph4c_gx, _ph4c_shedY, _ph4c_gz);\n"
    "            _ph4c_p.rotation.x = -_ph4c_pitchRad * 0.5;\n"
    "            _ph4c_pp.y = _ph4c_shedY;\n"
    "            _ph4c_pp.isNorth = false;\n"
    "            _ph4c_south++;\n"
    "          } else {\n"
    "            // gable: 양쪽 경사면 (changeRoofType 의 line 14471-14492 와 일관)\n"
    "            var _ph4c_isNorthSide = (_ph4c_gz > _ph4c_midZ);\n"
    "            // gableCover=south_only 일 때 북쪽 패널 숨김 (시각/효율 모두 반영)\n"
    "            if(_ph4c_isNorthSide && _ph4c_gableCover === \"south_only\"){\n"
    "              _ph4c_p.visible = false;\n"
    "              _ph4c_pp.isNorth = true;\n"
    "              _ph4c_pp.skipped = true;\n"
    "              continue;\n"
    "            }\n"
    "            var _ph4c_slopeT;\n"
    "            if(_ph4c_isNorthSide){\n"
    "              _ph4c_slopeT = (maxZ - _ph4c_gz) / Math.max(1e-6, maxZ - _ph4c_midZ);\n"
    "            } else {\n"
    "              _ph4c_slopeT = (_ph4c_gz - minZ) / Math.max(1e-6, _ph4c_midZ - minZ);\n"
    "            }\n"
    "            _ph4c_slopeT = Math.max(0, Math.min(1, _ph4c_slopeT));\n"
    "            var _ph4c_py = _ph4c_baseY + _ph4c_slopeT * _ph4c_ridgeH;\n"
    "            _ph4c_p.position.set(_ph4c_gx, _ph4c_py, _ph4c_gz);\n"
    "            // tilt: 남쪽 면은 -pitchRad (남향으로 누움), 북쪽 면은 +pitchRad (북향으로 누움)\n"
    "            _ph4c_p.rotation.x = _ph4c_isNorthSide ? _ph4c_pitchRad : -_ph4c_pitchRad;\n"
    "            _ph4c_pp.y = _ph4c_py;\n"
    "            _ph4c_pp.isNorth = _ph4c_isNorthSide;\n"
    "            if(_ph4c_isNorthSide){ _ph4c_north++; } else { _ph4c_south++; }\n"
    "          }\n"
    "          // visible:true 강제 (위에서 false 처리한 경우 제외)\n"
    "          if(!_ph4c_pp.skipped){ _ph4c_p.visible = true; }\n"
    "        }\n"
    "        try{\n"
    "          console.log(\"[Phase 11.4c] \" + _ph4c_roofType + \" layout: 남쪽=\" + _ph4c_south + \" 북쪽=\" + _ph4c_north\n"
    "                      + \" ridge=\" + _ph4c_ridgeH.toFixed(2) + \"m pitch=\" + _ph4c_pitch + \"° cover=\" + _ph4c_gableCover);\n"
    "        }catch(_e){}\n"
    "        // 북향면 효율 감소 (changeRoofType 의 line 14521 와 동일)\n"
    "        try{\n"
    "          var _ph4c_northRatio = 0.58;\n"
    "          var _ph4c_effPanels = _ph4c_south + (_ph4c_north * _ph4c_northRatio);\n"
    "          if(data){\n"
    "            data._northPanelCount = _ph4c_north;\n"
    "            data._gableEffectiveRatio = _ph4c_effPanels / Math.max(1, (_ph4c_south + _ph4c_north));\n"
    "          }\n"
    "        }catch(_e){}\n"
    "      }\n"
    "    }catch(_ph4cErr){ try{ console.warn(\"[Phase 11.4c] gable layout failed\", _ph4cErr); }catch(_e){} }"
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
    if "[Phase 11.1E] 완전유닛=" not in text:
        print(f"❌ {PHASE_NAME}: 선행 Phase 11.1E 가 적용 안 됨. d8c558b commit 확인.")
        sys.exit(3)
    print(f"   ✓ 선행 Phase 11.1E 적용 확인")

    cnt = text.count(ANCHOR)
    if cnt != 1:
        print(f"❌ {PHASE_NAME}: anchor 매칭 {cnt}회 (1회여야 안전)")
        print(f"   힌트: Phase 11.1E 통계 로그 영역 (line 14324-14326) 확인.")
        sys.exit(2)
    print(f"   ✓ anchor unique 발견")

    if check_only:
        print(f"✅ {PHASE_NAME} --check 통과: 적용 가능")
        return

    backup = TARGET.with_suffix(TARGET.suffix + f".bak.before_phase_11_4c.{int(time.time())}")
    backup.write_bytes(TARGET.read_bytes())
    print(f"📦 백업: {backup.name}")

    new_text = text.replace(ANCHOR, REPLACEMENT, 1)
    new_lines = new_text.count("\n")
    diff_lines = new_lines - orig_lines

    fails = []
    if "</html>" not in new_text: fails.append("</html> 누락 (절단)")
    if "_buildPanels" not in new_text and "self._panels" not in new_text:
        fails.append("self._panels 누락 (회귀)")
    if "_buildRoofStructure" not in new_text: fails.append("_buildRoofStructure 누락 (회귀)")
    if PHASE_MARKER not in new_text: fails.append(f"{PHASE_MARKER} 누락 (적용 실패)")
    for prev in ["Phase 11.1D", "Phase 11.1E", "Phase 11.2", "Phase 11.4a:", "Phase 11.4b"]:
        if prev not in new_text:
            fails.append(f"{prev} marker 누락 (이전 phase 회귀)")
    if diff_lines < 50 or diff_lines > 90:
        fails.append(f"줄 수 변화 비정상: +{diff_lines} (예상 +65)")

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
    print(f"   • Phase 11.1E 통계 로그 직후 박공/편경사 후처리 추가")
    print(f"   • self._panels 전체를 순회하며 position + rotation 박공 형상에 맞춤")
    print(f"   • gable: 양쪽 경사면 분리 (남/북), 각 패널 -pitch/+pitch 회전")
    print(f"   • shed: 남(낮음) → 북(높음) 한 방향 기울기, 회전 -pitch×0.5 (changeRoofType 일관)")
    print(f"   • gableCover=south_only 일 때 북쪽 패널 visible=false 처리")
    print(f"   • 북향면 효율 0.58 ratio 적용 (data._gableEffectiveRatio 저장)")
    print(f"")
    print(f"🔍 배포 후 검증 (Ctrl+Shift+R):")
    print(f"   • 박공 mode 자동 분석 → 패널이 양쪽 경사면에 누워있음 (떠 있지 않음)")
    print(f"   • 좌상단 발전량 + 실제 박공 패널 시각 일치")
    print(f"   • F12 콘솔: [Phase 11.4c] gable layout: 남쪽=N 북쪽=M ridge=X.XXm pitch=25° cover=both")
    print(f"   • 편경사 (shed) 도 한쪽 기울기 적용된 패널")
    print(f"   • 평지붕 (flat) / 맨사드 (mansard) 는 기존 동작 (보정 없음)")
    print(f"")
    print(f"⚠️ Phase 11.4a-2 와 호환:")
    print(f"   • 11.4a-2 의 ridge boost (panelY +ridgeH) 가 자동 적용된 후 11.4c 가 position 을 다시 박공 경사면으로 재배치")
    print(f"   • 11.4a-2 의 효과는 11.4c 가 dominant 하게 덮어씀 → 최종 결과는 진짜 박공 layout")
    print(f"")
    print(f"⚠️ 추후 검토:")
    print(f"   • 패널 rotation.x 방향이 실제 박공과 맞는지 시각 확인 (혹은 +/- 반대일 수도)")
    print(f"   • PF 사업성 계산에 _gableEffectiveRatio 가 사용되는지 별도 확인 (calculateFinance 흐름)")

if __name__ == "__main__":
    main()
