#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
phase_11_1_d_analyze_feature_aligned.py — Phase 11.1D
PC 솔라패스파인더 (scenergy-pathfinder/solar_pathfinder.html) 의 **초기 자동 분석**
(analyzeFeature, line ~7036) 에서도 지붕모양 회전 wrapper + 방위각 효율 PF 반영을
적용. Phase 11.1B/C 가 reCalculate 만 처리한 한계 보완.

==============================================================================
배경 (12.1 진단 결과)
==============================================================================
사장님 검증 케이스 (경남 사천시 사남면 외국기업로 152-52):
  - CAD 정답: 한국엠코 500W × 3,122장 = 1,561 kW
  - 솔라패스파인더 자동 분석 직후: 889 kW (~57% 만 인식)
  - 차이 43% 부족 — 사장님 보고

코드 검증으로 확정된 root cause:
  - Phase 11.1B/C 는 reCalculate (line 7303) 만 buildPanelsFCFromGeometryAligned
    로 교체했음
  - analyzeFeature (line 7036) 는 원본 buildPanelsFCFromGeometry 그대로 사용
  - = 사장님이 지붕 그리고 자동 분석 직후 본 889 kW 는 회전 wrapper 가 발동
    안 한 격자 강제 배치 결과 (콘솔에 [Phase 11.1B] aligned 로그 안 떴을 것)
  - 사장님이 "재계산" 버튼 별도 누르면 wrapper 발동 가능했음

Phase 11.1B 스크립트 docstring 도 명시했음:
  > 초기 자동 분석 (analyzeFeature line 6968 → calculateFinance line 7082)
  > 은 별도 Phase 11.1D 로 분리 (안전성 + 검증 가능성 위해)

==============================================================================
수정 내용 (2 edits)
==============================================================================
Edit 1: analyzeFeature line 7036 의 buildPanelsFCFromGeometry → Aligned
        + _autoPanelAzimuth 저장 (reCalculate 와 동일 패턴)

Edit 2: line 7098-7099 의 calculateFinance 호출 직전에 효율 보정 적용
        - _autoPanelAzimuth 가 있으면 orientationFactor 로 효율 계산
        - sunH * eff/100 → 발전량 감소 → 매출 감소 → PF 사업성 자동 반영
        - currentAnalysisData.azimuthAngle / azimuthEfficiency 저장 (UI 표시용)
        - reCalculate 의 Phase 11.1C 와 동일 패턴

==============================================================================
영향 영역
==============================================================================
- 초기 자동 분석 (사장님이 지붕 그리고 자동 결과 본 경로) 만 적용
- reCalculate (line 7303) 는 이미 Phase 11.1B/C 로 적용됨 — 영향 없음
- 수동 배치 도구 (openRoofLayoutTool) 는 자체 회전 도구 있음 — 영향 없음
- recomputeTotalsAfterSelectionChange (line 7150) 는 panel count 만 다시 합산하는
  경로라서 별도 phase 로 미루기 (큰 영향 없음, sunH 효율 보정만 분리 가능)

==============================================================================
사용 위치: scenergy-pathfinder working repo
==============================================================================
  Copy-Item -Force C:\\kepco-rpa-api\\solar-server-staging\\scripts\\phase_11_1_d_analyze_feature_aligned.py C:\\Projects\\scenergy-pathfinder\\
  cd C:\\Projects\\scenergy-pathfinder
  python phase_11_1_d_analyze_feature_aligned.py --check
  python phase_11_1_d_analyze_feature_aligned.py
  git add phase_11_1_d_analyze_feature_aligned.py
  git commit -m "Phase 11.1D: analyzeFeature 도 회전 wrapper + 방위각 효율 PF 반영" -- solar_pathfinder.html phase_11_1_d_analyze_feature_aligned.py
  git push

배포 후 (GitHub Pages 1-3분):
  pathfinder.scenergy.co.kr 새로고침 (Ctrl+Shift+R)
  → 지붕 그리고 자동 분석
  → 자동 배치 패널이 지붕 모양 따라 회전되어 표시
  → 콘솔 (F12):
       [Phase 11.1B] aligned: longBearing=X° → panelFace=Y°
       [Phase 11.1D] auto-layout azimuth=Y° efficiency=Z%
  → 자동 분석 직후 결과부터 회전 + 효율 보정 반영 (재계산 안 눌러도)
"""

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path.cwd()
TARGET = ROOT / "solar_pathfinder.html"

MARKER_ALREADY = "Phase 11.1D: 초기 자동 분석도 회전 wrapper 적용"


# ============================================================================
# Edit 1: analyzeFeature 의 buildPanelsFCFromGeometry → Aligned + azimuth 저장
# ----------------------------------------------------------------------------
ANCHOR_1 = '''  // Build panels (base -> apply calibration)
  const baseFC = buildPanelsFCFromGeometry(feature.geometry);
  const fc = applyCalibrationToFC(baseFC);'''

REPLACE_1 = '''  // Build panels (base -> apply calibration)
  // Phase 11.1D: 초기 자동 분석도 회전 wrapper 적용 (Phase 11.1B/C 와 일관, reCalculate 와 동일 패턴)
  const baseFC = buildPanelsFCFromGeometryAligned(feature.geometry);
  // Phase 11.1D: panel azimuth 저장 (applyCalibrationToFC 의 turf.clone 후 보존 보장)
  if (baseFC && typeof baseFC._panelAzimuth === "number") {
    window.currentAnalysisData = window.currentAnalysisData || {};
    window.currentAnalysisData._autoPanelAzimuth = baseFC._panelAzimuth;
  }
  const fc = applyCalibrationToFC(baseFC);'''


# ============================================================================
# Edit 2: analyzeFeature 의 calculateFinance 호출 직전 효율 보정
# ----------------------------------------------------------------------------
# 주의: anchor 가 unique 해야 안전. line 7150 (recomputeTotalsAfterSelectionChange) 의
# calculateFinance 호출 패턴은 다르므로 (pc 대신 total, sunH 처리 다름) unique 보장.
ANCHOR_2 = '''  try{
    const sunH = (currentAnalysisData.solar_opt?.sun_hours ?? currentAnalysisData.ai_analysis?.sun_hours);
    window.calculateFinance(pc, (typeof sunH === "number" && isFinite(sunH) && sunH > 0) ? sunH : undefined);
  }catch(e){'''

REPLACE_2 = '''  try{
    let sunH = (currentAnalysisData.solar_opt?.sun_hours ?? currentAnalysisData.ai_analysis?.sun_hours);
    // === Phase 11.1D: analyzeFeature 도 _autoPanelAzimuth → 효율 보정 → PF 자동 반영 ===
    // _autoPanelAzimuth 가 있으면 orientationFactor 로 효율 계산 → sunH * eff/100
    // (reCalculate 의 Phase 11.1C line 7347-7365 와 동일 패턴)
    try {
      const _az = currentAnalysisData?._autoPanelAzimuth;
      if (typeof _az === "number" && isFinite(_az)) {
        const _lat = currentAnalysisData?.lat || 36;
        const _tilt = parseFloat(el("installAngle")?.value || "15") || 15;
        const _oriF = (typeof orientationFactor === "function") ? orientationFactor(_lat, _az, _tilt) : 1.0;
        const _effPct = Math.round(_oriF * 100);
        currentAnalysisData.azimuthAngle = Math.round(_az);
        currentAnalysisData.azimuthEfficiency = _effPct;
        if (typeof sunH === "number" && isFinite(sunH) && sunH > 0 && _effPct < 100) {
          sunH = sunH * _effPct / 100;
        }
        console.log("[Phase 11.1D] auto-layout azimuth=" + Math.round(_az) + "° efficiency=" + _effPct + "%");
      }
    } catch (eD) { console.warn("[Phase 11.1D] azimuth eff failed", eD); }
    window.calculateFinance(pc, (typeof sunH === "number" && isFinite(sunH) && sunH > 0) ? sunH : undefined);
  }catch(e){'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="anchor 검증만 (변경 없음)")
    args = parser.parse_args()

    if not TARGET.exists():
        print(f"ERROR: {TARGET} 없음 — C:\\Projects\\scenergy-pathfinder 에서 실행하세요")
        sys.exit(1)

    text = TARGET.read_text(encoding="utf-8")

    # 선행 의존: Phase 11.1B/C 가 이미 적용돼 있어야 함 (Aligned wrapper 존재)
    if "function buildPanelsFCFromGeometryAligned" not in text:
        print("ERROR: buildPanelsFCFromGeometryAligned 함수가 없음.")
        print("       Phase 11.1B/C 가 먼저 적용돼야 함 (phase_11_1_bc_auto_rotate_pf.py).")
        sys.exit(1)

    if MARKER_ALREADY in text:
        print(f"이미 적용됨 (marker '{MARKER_ALREADY}'). 종료.")
        sys.exit(0)

    edits = [
        ("Edit 1: analyzeFeature 의 호출 → Aligned + azimuth 저장", ANCHOR_1, REPLACE_1),
        ("Edit 2: analyzeFeature 의 calculateFinance 직전 효율 보정", ANCHOR_2, REPLACE_2),
    ]

    # anchor 존재 + unique 검증 (5중 안전 체크 의무화)
    missing = [n for n, a, _ in edits if a not in text]
    if missing:
        print("ERROR: anchor 누락:")
        for m in missing:
            print(f"  - {m}")
        print()
        print("힌트: Phase 11.2 / 11.3a / 다른 후속 phase 가 anchor 영역 변경했을 수 있음.")
        print("      git diff 9a46568..HEAD -- solar_pathfinder.html 로 회귀 확인 가능.")
        sys.exit(2)

    for n, a, _ in edits:
        cnt = text.count(a)
        if cnt != 1:
            print(f"ERROR: anchor '{n}' 매칭 {cnt}회 (1회여야 안전)")
            print("       다른 호출 site 와 충돌 가능 — 수동 확인 필요")
            sys.exit(2)

    if args.check:
        print("--check OK: anchor 2개 모두 발견 + unique.")
        for n, _a, _ in edits:
            print(f"  ✓ {n}")
        sys.exit(0)

    # backup
    bak = TARGET.with_suffix(".html.bak.before_phase_11_1_d")
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

    # 5중 절단 안전 체크 (표준 패턴)
    if "</html>" not in text:
        print("ERROR: </html> 누락 — 파일 절단 의심. 패치 중단.")
        sys.exit(4)
    if "function buildPanelsFCFromGeometryAligned" not in text:
        print("ERROR: Phase 11.1B wrapper 함수 사라짐 — 패치 중단.")
        sys.exit(5)
    if "function orientationFactor" not in text:
        print("ERROR: orientationFactor 함수 사라짐 — 패치 중단.")
        sys.exit(6)
    if "window.calculateFinance" not in text:
        print("ERROR: window.calculateFinance 사라짐 — 패치 중단.")
        sys.exit(7)
    if MARKER_ALREADY not in text:
        print(f"ERROR: marker '{MARKER_ALREADY}' 삽입 실패 — 패치 중단.")
        sys.exit(8)

    # 줄 수 sanity (이전 ±30 줄 이내, Phase 11.1D 가 ~25줄 추가)
    line_count_after = text.count("\n")
    delta = line_count_after - line_count_before
    if delta < 15 or delta > 35:
        print(f"ERROR: 줄 수 변화 {delta} 비정상 (예상 +20~30). 절단 의심.")
        sys.exit(9)
    if line_count_after < 17000:
        print(f"ERROR: 최종 줄 수 {line_count_after} 너무 적음. 절단 의심.")
        sys.exit(10)

    TARGET.write_text(text, encoding="utf-8")
    print(f"✅ Phase 11.1D 적용 완료 ({TARGET})")
    print(f"   줄 수: {line_count_before} → {line_count_after} (Δ +{delta})")
    print()
    print("다음 단계:")
    print("  git add phase_11_1_d_analyze_feature_aligned.py")
    print('  git commit -m "Phase 11.1D: analyzeFeature 도 회전 wrapper + 방위각 효율 PF 반영" \\')
    print("    -- solar_pathfinder.html phase_11_1_d_analyze_feature_aligned.py")
    print("  git push")
    print()
    print("배포 후 (GitHub Pages 1-3분):")
    print("  pathfinder.scenergy.co.kr 새로고침 (Ctrl+Shift+R)")
    print("  → 사장님 검증 케이스 (경남 사천시 사남면 외국기업로 152-52) 자동 분석")
    print("  → 패널이 지붕 모양 따라 회전되어 표시 (자동 분석 직후부터)")
    print("  → 콘솔 (F12) 두 로그 확인:")
    print("       [Phase 11.1B] aligned: longBearing=X° → panelFace=Y°")
    print("       [Phase 11.1D] auto-layout azimuth=Y° efficiency=Z%")
    print("  → 용량 / 매출 / PF 결과가 회전 효율 반영됨")


if __name__ == "__main__":
    main()
