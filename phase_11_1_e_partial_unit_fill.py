#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
phase_11_1_e_partial_unit_fill.py — Phase 11.1E
3D 패널 배치에서 부분 유닛 (1×3, 2×2, 1×2, 1×1) 허용 → 2D ≈ 3D 일치 →
지붕/부지 100% 채움.

==============================================================================
배경 (사장님 콘솔 로그 분석으로 root cause 확정)
==============================================================================
사장님 콘솔 로그 (line 14248) 에서 발견:
  [3D] 패널배치: 3D유닛=9 3D모듈=54 2D모듈=86 표시=54  ← 37% 손실
  [3D] 패널배치: 3D유닛=8 3D모듈=48 2D모듈=78 표시=48  ← 38% 손실

= 2D 격자는 개별 모듈 단위로 채움 / 3D 는 완전 유닛 (2×3=6모듈) 단위만 채움
→ 부분 유닛 (1×3, 2×2, 1×2, 1×1) 자리는 reject
→ 사천 1,561 vs 889 (43% 부족) 와 거의 같은 비율 → 12.1 의 진짜 root cause 일 수 있음

==============================================================================
수정 내용 (1 edit)
==============================================================================
line 14223-14240 의 inner loop 에서 rectInPolyWithSetback 통과 못 하면 reject
하는 분기를 → **부분 유닛 fallback 시도** 로 교체.

알고리즘:
  for cell in 격자:
    if 인버터실 / cap 체크: skip / done
    1차: 완전 유닛 (arrayCols × arrayRows) 시도
    실패 시 2차: 부분 유닛 시도 (큰 → 작은)
      후보: (arrayCols-1 × arrayRows), (arrayCols × arrayRows-1),
            (arrayCols-1 × arrayRows-1), (1 × arrayRows), (arrayCols × 1), (1×1)
      첫 통과 사이즈로 유닛 생성

  - 모든 cell 의 partial 시도는 maxModuleCount cap 적용 (overflow 방지)
  - 부분 유닛 카운트를 별도 추적 → console.log 에 출력

==============================================================================
영향 영역
==============================================================================
- 3D 모드의 _buildPanels 메서드 (토지/지붕 공통)
- 2D 모드는 영향 없음 (이미 부분 채움)
- 인버터실 / setback / cap 모두 그대로 적용

==============================================================================
사용 위치: scenergy-pathfinder working repo
==============================================================================
  Copy-Item -Force C:\\kepco-rpa-api\\solar-server-staging\\scripts\\phase_11_1_e_partial_unit_fill.py C:\\Projects\\scenergy-pathfinder\\
  cd C:\\Projects\\scenergy-pathfinder
  python phase_11_1_e_partial_unit_fill.py --check
  python phase_11_1_e_partial_unit_fill.py
  git add phase_11_1_e_partial_unit_fill.py
  git commit -m "Phase 11.1E: 3D 부분 유닛 허용 — 2D ≈ 3D 일치 (37% 손실 회복)" -- solar_pathfinder.html phase_11_1_e_partial_unit_fill.py
  git push

배포 후 (GitHub Pages 1-3분):
  pathfinder.scenergy.co.kr 새로고침 (Ctrl+Shift+R)
  → 사장님 검증 케이스 (경남 사천시 사남면 외국기업로 152-52) 자동 분석
  → F12 콘솔:
       [3D] 패널배치: 3D유닛=N 3D모듈=M 2D모듈=K 표시=L
       [Phase 11.1E] 부분유닛: 1x3=p1, 2x2=p2, 1x2=p3, 1x1=p4 (총 +X 모듈)
  → 3D 표시 패널 수가 2D 결과에 근접 (cap 으로 상한 보장)
"""

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path.cwd()
TARGET = ROOT / "solar_pathfinder.html"

MARKER_ALREADY = "Phase 11.1E: 부분 유닛 fallback 배치"


# ============================================================================
# Edit 1: 3D 패널 배치 inner loop 의 reject → 부분 유닛 fallback 으로 교체
# ----------------------------------------------------------------------------
# Anchor 전략: console.log("[3D] 패널배치: ...") 직전 + 그 위의 placement
# loop 전체를 정확히 매칭. 매우 unique 한 패턴 사용.
# ----------------------------------------------------------------------------
ANCHOR_1 = '''    var self=this;
    var totalModuleCount=0;
    var placementDone=false;
    // 🔧 BUGFIX: 시작 오프셋에서 불필요한 +0.5m 제거 — PPT 요구사항: "경계선까지 gap 없이"
    for(var gx=minX+unitW/2;gx<=maxX-unitW/2+1e-6&&!placementDone;gx+=stepX){
      for(var gz=minZ+unitD/2;gz<=maxZ-unitD/2+1e-6&&!placementDone;gz+=stepZ){
        // 인버터실 영역 제외
        if(gz+unitD/2>invExclZMin&&gz-unitD/2<invExclZMax)continue;
        // 🔧 BUGFIX: 하드코딩된 +0.15m 내부 여유 대신 — 경계 이격거리(setback)를 정확히 적용
        if(!rectInPolyWithSetback(gx,gz,unitW/2,unitD/2,setbackM))continue;
        // 🔧 BUGFIX: 2D 패널 수 상한 체크 — 기존 off-by-one 버그 수정 (`+modulesPerUnit-1` 제거)
        if(totalModuleCount+modulesPerUnit>maxModuleCount){placementDone=true;continue;}
        var panelY=isRoof?(self._roofHeight||8):0;
        var unit=buildArrayUnit(modW,modH,isRoof?5:tilt,arrayCols,arrayRows,panelGap);
        unit.position.set(gx,panelY,gz);
        unit.visible=false;unit.castShadow=true;
        self._scene.add(unit);
        self._panels.push(unit);
        self._panelPositions.push({x:gx,z:gz,y:panelY});
        totalModuleCount+=modulesPerUnit;
      }
    }'''

REPLACE_1 = '''    var self=this;
    var totalModuleCount=0;
    var placementDone=false;
    // Phase 11.1E: 부분 유닛 fallback 배치 — 완전 유닛 안 들어가는 cell 에 작은 유닛 시도
    // (1×3, 2×2, 1×2, 1×1 등) → 2D ≈ 3D 일치, 지붕/부지 100% 채움
    var _p11eCounts = { full: 0, partial: 0, by: {} };
    // 부분 유닛 후보 (큰 → 작은 순서, 완전 유닛 제외)
    var _p11eCandidates = [];
    for(var _cr = arrayRows; _cr >= 1; _cr--){
      for(var _cc = arrayCols; _cc >= 1; _cc--){
        if(_cc === arrayCols && _cr === arrayRows) continue; // 완전 유닛 제외
        _p11eCandidates.push({c: _cc, r: _cr, m: _cc*_cr,
                              w: _cc*modW + (_cc-1)*panelGap,
                              d: _cr*projH + (_cr-1)*panelGap});
      }
    }
    // 모듈 수 많은 순으로 정렬 (먼저 큰 사이즈 시도)
    _p11eCandidates.sort(function(a,b){ return b.m - a.m; });
    // 🔧 BUGFIX: 시작 오프셋에서 불필요한 +0.5m 제거 — PPT 요구사항: "경계선까지 gap 없이"
    for(var gx=minX+unitW/2;gx<=maxX-unitW/2+1e-6&&!placementDone;gx+=stepX){
      for(var gz=minZ+unitD/2;gz<=maxZ-unitD/2+1e-6&&!placementDone;gz+=stepZ){
        // 인버터실 영역 제외
        if(gz+unitD/2>invExclZMin&&gz-unitD/2<invExclZMax)continue;
        var panelY=isRoof?(self._roofHeight||8):0;
        // 1차: 완전 유닛 시도
        if(rectInPolyWithSetback(gx,gz,unitW/2,unitD/2,setbackM)){
          if(totalModuleCount+modulesPerUnit>maxModuleCount){placementDone=true;continue;}
          var unit=buildArrayUnit(modW,modH,isRoof?5:tilt,arrayCols,arrayRows,panelGap);
          unit.position.set(gx,panelY,gz);
          unit.visible=false;unit.castShadow=true;
          self._scene.add(unit);
          self._panels.push(unit);
          self._panelPositions.push({x:gx,z:gz,y:panelY});
          totalModuleCount+=modulesPerUnit;
          _p11eCounts.full += 1;
          continue;
        }
        // 2차: 부분 유닛 fallback (작은 사이즈)
        for(var _pi=0; _pi<_p11eCandidates.length; _pi++){
          var _cand = _p11eCandidates[_pi];
          // 부분 유닛도 cell 중심 기준 (gx,gz) 그대로 사용 — 격자 위치 보존
          if(!rectInPolyWithSetback(gx,gz,_cand.w/2,_cand.d/2,setbackM)) continue;
          if(totalModuleCount+_cand.m>maxModuleCount){
            placementDone=true;
            break;
          }
          var partUnit=buildArrayUnit(modW,modH,isRoof?5:tilt,_cand.c,_cand.r,panelGap);
          partUnit.position.set(gx,panelY,gz);
          partUnit.visible=false;partUnit.castShadow=true;
          self._scene.add(partUnit);
          self._panels.push(partUnit);
          self._panelPositions.push({x:gx,z:gz,y:panelY});
          totalModuleCount+=_cand.m;
          _p11eCounts.partial += 1;
          var _key = _cand.c + "x" + _cand.r;
          _p11eCounts.by[_key] = (_p11eCounts.by[_key] || 0) + 1;
          break; // 첫 통과 사이즈로 확정, 다음 cell
        }
      }
    }
    // Phase 11.1E: 부분 유닛 통계 로그
    var _p11eBy = Object.keys(_p11eCounts.by).map(function(k){ return k+"="+_p11eCounts.by[k]; }).join(", ");
    console.log("[Phase 11.1E] 완전유닛="+_p11eCounts.full+" 부분유닛="+_p11eCounts.partial+(_p11eBy?" ("+_p11eBy+")":""));'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="anchor 검증만 (변경 없음)")
    args = parser.parse_args()

    if not TARGET.exists():
        print(f"ERROR: {TARGET} 없음 — C:\\Projects\\scenergy-pathfinder 에서 실행하세요")
        sys.exit(1)

    text = TARGET.read_text(encoding="utf-8")

    if MARKER_ALREADY in text:
        print(f"이미 적용됨 (marker '{MARKER_ALREADY}'). 종료.")
        sys.exit(0)

    edits = [
        ("Edit 1: 3D 패널 배치 → 부분 유닛 fallback 추가", ANCHOR_1, REPLACE_1),
    ]

    missing = [n for n, a, _ in edits if a not in text]
    if missing:
        print("ERROR: anchor 누락:")
        for m in missing:
            print(f"  - {m}")
        print()
        print("힌트: solar_pathfinder.html 의 _buildPanels 메서드가 변경됐을 수 있음.")
        print("      grep -n '\\[3D\\] 패널배치' solar_pathfinder.html 로 위치 확인.")
        sys.exit(2)

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

    bak = TARGET.with_suffix(".html.bak.before_phase_11_1_e")
    shutil.copy2(TARGET, bak)
    print(f"backup: {bak}")

    line_count_before = text.count("\n")

    for name, anchor, new_text in edits:
        before = text
        text = text.replace(anchor, new_text, 1)
        if text == before:
            print(f"ERROR: '{name}' replace 변경 없음")
            sys.exit(3)
        print(f"  applied: {name}")

    # 5중 절단 안전 체크 (표준)
    if "</html>" not in text:
        print("ERROR: </html> 누락 — 파일 절단 의심. 패치 중단.")
        sys.exit(4)
    if "function buildPanelsFCFromGeometryAligned" not in text:
        print("ERROR: Phase 11.1B wrapper 사라짐 — 패치 중단.")
        sys.exit(5)
    if "rectInPolyWithSetback" not in text:
        print("ERROR: rectInPolyWithSetback 함수 사라짐 — 패치 중단.")
        sys.exit(6)
    if "buildArrayUnit" not in text:
        print("ERROR: buildArrayUnit 함수 사라짐 — 패치 중단.")
        sys.exit(7)
    if MARKER_ALREADY not in text:
        print(f"ERROR: marker 삽입 실패 — 패치 중단.")
        sys.exit(8)

    line_count_after = text.count("\n")
    delta = line_count_after - line_count_before
    if delta < 30 or delta > 60:
        print(f"ERROR: 줄 수 변화 {delta} 비정상 (예상 +35~50). 절단 의심.")
        sys.exit(9)
    if line_count_after < 17000:
        print(f"ERROR: 최종 줄 수 {line_count_after} 너무 적음. 절단 의심.")
        sys.exit(10)

    TARGET.write_text(text, encoding="utf-8")
    print(f"✅ Phase 11.1E 적용 완료 ({TARGET})")
    print(f"   줄 수: {line_count_before} → {line_count_after} (Δ +{delta})")
    print()
    print("다음 단계:")
    print("  git add phase_11_1_e_partial_unit_fill.py")
    print('  git commit -m "Phase 11.1E: 3D 부분 유닛 허용 — 2D ≈ 3D 일치 (37% 손실 회복)" \\')
    print("    -- solar_pathfinder.html phase_11_1_e_partial_unit_fill.py")
    print("  git push")
    print()
    print("배포 후 (1-3분):")
    print("  pathfinder.scenergy.co.kr Ctrl+Shift+R")
    print("  → 사장님 검증 케이스 (사천 1,561 또는 군위) 자동 분석")
    print("  → F12 콘솔 새 로그:")
    print("       [3D] 패널배치: 3D유닛=N 3D모듈=M 2D모듈=K 표시=L")
    print("       [Phase 11.1E] 완전유닛=N 부분유닛=M (1x3=p1, 2x2=p2 ...)")
    print("  → 3D 표시 패널 수가 2D 결과에 근접 (cap 으로 상한 보장)")


if __name__ == "__main__":
    main()
