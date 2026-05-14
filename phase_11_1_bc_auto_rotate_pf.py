#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
phase_11_1_bc_auto_rotate_pf.py — Phase 11.1B + 11.1C 통합
PC 솔라패스파인더 (scenergy-pathfinder/solar_pathfinder.html) 의 자동 배치
모드가 폴리곤(지붕/토지) 모양 따라 회전되어 패널 배치되고, 회전 각도만큼
방위각 효율 감소가 PF 사업성에 자동 반영되도록 구현.

증상 (사장님 요구):
  - 자동배치 시 패널이 항상 지도 격자에 강제 정렬됨 (남북-동서)
  - 지붕 모양이 동서로 길거나 사선이어도 패널은 격자 강제 → 시각적으로
    어색하고, 방위각 효율도 PF 에 반영 안 됨
  - 첨부 스샷처럼 패널이 지붕 모양 그대로 회전되어 설치돼야 함
  - 회전된 각도만큼 일사량 효율 감소가 발전량/매출/PF 에 반영돼야 함

근본 원인:
  buildPanelsFCFromGeometry() 가 bbox 격자 기반 배치 → 회전 무시.
  반면 수동 배치 도구 (openRoofLayoutTool 외부 팝업) 는 사용자가 직접
  회전 가능하고 azimuthAngle/efficiency 캡쳐해서 PF 에 반영 (line 9938
  `_fetchRoofCaptureSync` 의 `sunH = sunH * eff / 100`).

수정 (3 edits, ~70줄):
  Edit 1: 새 wrapper 함수 `buildPanelsFCFromGeometryAligned(geo)` 추가
          (line 5529 의 buildPanelsFCFromGeometry 직전에 삽입)
          - 폴리곤 최장축 bearing 계산 (turf.bearing + turf.distance)
          - 폴리곤을 -bearing 회전 (long axis 가 동서 방향에 정렬)
          - 기존 buildPanelsFCFromGeometry 호출 (회전된 폴리곤으로)
          - 결과 panels 를 +bearing 역회전 (실제 좌표 복원)
          - panel face azimuth = (long axis + 90) % 360 → panelsFC._panelAzimuth 저장

  Edit 2: reCalculate (line 7234) 의 buildPanelsFCFromGeometry → Aligned 교체
          - + baseFC._panelAzimuth → currentAnalysisData._autoPanelAzimuth 저장
            (applyCalibrationToFC 가 turf.clone 으로 panelsFC 만들 때 _panelAzimuth
             보존 안 될 가능성 대비)

  Edit 3: reCalculate 끝의 calculateFinance (line 7273) → 효율 보정 적용
          - currentAnalysisData._autoPanelAzimuth + orientationFactor 로 효율 계산
          - sunH * eff/100 → 발전량 감소 → 매출 감소 → PF 사업성 자동 반영
          - currentAnalysisData.azimuthAngle/Efficiency 도 저장 (UI 표시용)

영향 영역:
  - 자동 배치 (사장님이 재계산 클릭 또는 파라미터 변경 시 발동) 만 적용
  - 수동 배치 도구 (openRoofLayoutTool) 는 영향 없음 (이미 작동 중)
  - 초기 자동 분석 (analyzeFeature line 6968 → calculateFinance line 7082)
    은 별도 Phase 11.1D 로 분리 (안전성 + 검증 가능성 위해)

⚠️ 사용 위치: scenergy-pathfinder working repo
  Copy-Item -Force C:\\kepco-rpa-api\\solar-server-staging\\scripts\\phase_11_1_bc_auto_rotate_pf.py C:\\Projects\\scenergy-pathfinder\\
  cd C:\\Projects\\scenergy-pathfinder
  python phase_11_1_bc_auto_rotate_pf.py --check
  python phase_11_1_bc_auto_rotate_pf.py
  git add phase_11_1_bc_auto_rotate_pf.py
  git commit -m "Phase 11.1B/C: 자동 배치 지붕모양 회전 + 방위각 효율 PF 반영" -- solar_pathfinder.html phase_11_1_bc_auto_rotate_pf.py
  git push
"""

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path.cwd()
TARGET = ROOT / "solar_pathfinder.html"

MARKER_ALREADY = "Phase 11.1B: 자동 배치 지붕모양 정렬"


# ============================================================================
# Edit 1: 새 wrapper 함수 정의 (line 5529 직전)
# ----------------------------------------------------------------------------
ANCHOR_1 = '''function buildPanelsFCFromGeometry(geo){'''

REPLACE_1 = '''// ============================================================================
// Phase 11.1B: 자동 배치 지붕모양 정렬 (wrapper 함수)
// ----------------------------------------------------------------------------
// buildPanelsFCFromGeometry 는 bbox 격자 기반이라 폴리곤 방향 무시. 이 wrapper
// 가 폴리곤 최장축 bearing 으로 폴리곤을 미리 회전시킨 후 기존 함수에 격자
// 배치를 맡기고, 결과 panels 를 역회전해서 원래 좌표계로 복원. 시각적으로
// panels 가 지붕/토지 방향 따라 정렬되며, panelsFC._panelAzimuth 메타로
// 회전 각도를 전달해서 PF 사업성에 자동 반영됨 (Phase 11.1C 와 연결).
// ============================================================================
function buildPanelsFCFromGeometryAligned(geo) {
  // Fallback: turf 미사용 / 비폴리곤 → 기존 함수 그대로
  if (!window.turf || !geo || (geo.type !== "Polygon" && geo.type !== "MultiPolygon")) {
    return buildPanelsFCFromGeometry(geo);
  }
  let longBearing = 0;
  let pivotCoords = null;
  try {
    const polyF = turf.feature(geo);
    pivotCoords = turf.center(polyF).geometry.coordinates;
    const coords = (geo.type === "Polygon") ? geo.coordinates[0] : geo.coordinates[0][0];
    let maxLen = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const a = turf.point(coords[i]);
      const b = turf.point(coords[i+1]);
      const len = turf.distance(a, b, {units: 'meters'});
      if (len > maxLen) {
        maxLen = len;
        longBearing = turf.bearing(a, b);
      }
    }
  } catch (e) {
    return buildPanelsFCFromGeometry(geo);
  }
  // 회전 의미 없는 경우 (격자와 거의 정렬됨, 5도 미만) 기존 함수 그대로 + azimuth 만 메타로
  const ROT_THRESHOLD_DEG = 5;
  const _absB = Math.abs(longBearing);
  if (!pivotCoords || _absB < ROT_THRESHOLD_DEG || Math.abs(_absB - 90) < ROT_THRESHOLD_DEG || Math.abs(_absB - 180) < ROT_THRESHOLD_DEG) {
    const fc = buildPanelsFCFromGeometry(geo);
    if (fc && fc.features && fc.features.length) {
      fc._panelAzimuth = ((longBearing + 90) % 360 + 360) % 360;
    }
    return fc;
  }
  // 폴리곤을 -longBearing 만큼 회전 → 격자 X 축에 정렬
  let rotGeo;
  try {
    const rotated = turf.transformRotate(turf.feature(geo), -longBearing, {pivot: pivotCoords});
    rotGeo = rotated.geometry;
  } catch (e) {
    return buildPanelsFCFromGeometry(geo);
  }
  // 회전된 폴리곤에 격자 배치 (기존 함수 사용)
  const fc = buildPanelsFCFromGeometry(rotGeo);
  if (!fc || !fc.features || !fc.features.length) return fc;
  // panels 를 +longBearing 만큼 역회전 → 원래 좌표계 복원
  let rotatedBack;
  try {
    rotatedBack = turf.transformRotate(fc, longBearing, {pivot: pivotCoords});
  } catch (e) {
    return fc;
  }
  // 메타 정보 보존 + panel face azimuth 저장 (long axis + 90, 정규화 0~360)
  if (fc._equipDeduction) rotatedBack._equipDeduction = fc._equipDeduction;
  rotatedBack._panelAzimuth = ((longBearing + 90) % 360 + 360) % 360;
  console.log("[Phase 11.1B] aligned: longBearing=" + longBearing.toFixed(1) + "° → panelFace=" + rotatedBack._panelAzimuth.toFixed(1) + "°");
  return rotatedBack;
}

function buildPanelsFCFromGeometry(geo){'''


# ============================================================================
# Edit 2: reCalculate (line 7234) 의 buildPanelsFCFromGeometry → Aligned 교체
# ----------------------------------------------------------------------------
ANCHOR_2 = '''    const baseFC = buildPanelsFCFromGeometry(v.feature.geometry);
    // Only apply calibration to the currently focused feature
    const fc = (currentAnalysisFeature && id === getFeatureId(currentAnalysisFeature))
      ? applyCalibrationToFC(baseFC)
      : baseFC;'''

REPLACE_2 = '''    // Phase 11.1B: 지붕모양 정렬 wrapper 사용 (panels 가 폴리곤 방향 따라 회전)
    const baseFC = buildPanelsFCFromGeometryAligned(v.feature.geometry);
    // Phase 11.1C: panel azimuth 저장 (applyCalibrationToFC 의 turf.clone 후 보존 보장)
    if (baseFC && typeof baseFC._panelAzimuth === "number") {
      window.currentAnalysisData = window.currentAnalysisData || {};
      window.currentAnalysisData._autoPanelAzimuth = baseFC._panelAzimuth;
    }
    // Only apply calibration to the currently focused feature
    const fc = (currentAnalysisFeature && id === getFeatureId(currentAnalysisFeature))
      ? applyCalibrationToFC(baseFC)
      : baseFC;'''


# ============================================================================
# Edit 3: reCalculate 끝의 calculateFinance (line 7273) → 효율 보정
# ----------------------------------------------------------------------------
ANCHOR_3 = '''  window.calculateFinance(total, (currentAnalysisData.solar_opt?.sun_hours ?? currentAnalysisData.ai_analysis?.sun_hours));
  showToast("재계산 완료");
};'''

REPLACE_3 = '''  // === Phase 11.1C: 자동 배치 panel azimuth → 효율 → 일조시간 → PF 자동 반영 ===
  // _autoPanelAzimuth 가 있으면 orientationFactor 로 효율 계산 → sunH * eff/100
  // (수동 배치 도구의 _fetchRoofCaptureSync line 9938 와 동일 패턴)
  let _sunHForCalc = (currentAnalysisData.solar_opt?.sun_hours ?? currentAnalysisData.ai_analysis?.sun_hours);
  try {
    const _az = currentAnalysisData?._autoPanelAzimuth;
    if (typeof _az === "number" && isFinite(_az)) {
      const _lat = currentAnalysisData?.lat || 36;
      const _tilt = parseFloat(el("installAngle")?.value || "15") || 15;
      const _oriF = (typeof orientationFactor === "function") ? orientationFactor(_lat, _az, _tilt) : 1.0;
      const _effPct = Math.round(_oriF * 100);
      currentAnalysisData.azimuthAngle = Math.round(_az);
      currentAnalysisData.azimuthEfficiency = _effPct;
      if (typeof _sunHForCalc === "number" && isFinite(_sunHForCalc) && _sunHForCalc > 0 && _effPct < 100) {
        _sunHForCalc = _sunHForCalc * _effPct / 100;
      }
      console.log("[Phase 11.1C] auto-layout azimuth=" + Math.round(_az) + "° efficiency=" + _effPct + "%");
    }
  } catch (e) { console.warn("[Phase 11.1C] azimuth eff failed", e); }
  window.calculateFinance(total, _sunHForCalc);
  showToast("재계산 완료");
};'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    if not TARGET.exists():
        print(f"ERROR: {TARGET} 없음 — C:\\Projects\\scenergy-pathfinder 에서 실행하세요")
        sys.exit(1)

    text = TARGET.read_text(encoding="utf-8")

    if MARKER_ALREADY in text:
        print(f"이미 적용됨 (marker '{MARKER_ALREADY}'). 종료.")
        sys.exit(0)

    edits = [
        ("Edit 1: wrapper 함수 buildPanelsFCFromGeometryAligned 추가", ANCHOR_1, REPLACE_1),
        ("Edit 2: reCalculate 의 호출 → Aligned + azimuth 저장", ANCHOR_2, REPLACE_2),
        ("Edit 3: reCalculate 끝 calculateFinance → 효율 보정", ANCHOR_3, REPLACE_3),
    ]

    missing = [n for n, a, _ in edits if a not in text]
    if missing:
        print("ERROR: anchor 누락:")
        for m in missing:
            print(f"  - {m}")
        sys.exit(2)

    # anchor unique 검증
    for n, a, _ in edits:
        cnt = text.count(a)
        if cnt != 1:
            print(f"ERROR: anchor '{n}' 매칭 {cnt}회 (1회여야 안전)")
            sys.exit(2)

    if args.check:
        print("--check OK: anchor 3개 모두 발견 + unique.")
        for n, _a, _ in edits:
            print(f"  ✓ {n}")
        sys.exit(0)

    bak = TARGET.with_suffix(".html.bak.before_phase_11_1_bc")
    shutil.copy2(TARGET, bak)
    print(f"backup: {bak}")

    for name, anchor, new_text in edits:
        before = text
        text = text.replace(anchor, new_text, 1)
        if text == before:
            print(f"ERROR: '{name}' replace 변경 없음")
            sys.exit(3)
        print(f"  applied: {name}")

    # 5중 절단 안전 체크
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
    if "function buildPanelsFCFromGeometryAligned" not in text:
        print("ERROR: 새 wrapper 함수 사라짐 — 패치 중단.")
        sys.exit(8)

    # 줄 수 sanity (이전 17031 → 약 17100, ±10)
    line_count = text.count("\n")
    if line_count < 17000:
        print(f"ERROR: 줄 수 {line_count} 너무 적음. 절단 의심.")
        sys.exit(9)

    TARGET.write_text(text, encoding="utf-8")
    print(f"✅ Phase 11.1B/C 적용 완료 ({TARGET})")
    print(f"   줄 수: {line_count} (이전 17031 + ~70)")
    print()
    print("다음 단계:")
    print("  git add phase_11_1_bc_auto_rotate_pf.py")
    print('  git commit -m "Phase 11.1B/C: 자동 배치 지붕모양 회전 + 방위각 효율 PF 반영" -- solar_pathfinder.html phase_11_1_bc_auto_rotate_pf.py')
    print("  git push")
    print()
    print("배포 후 (GitHub Pages 1-3분):")
    print("  pathfinder.scenergy.co.kr 새로고침 (Ctrl+Shift+R)")
    print("  → 충남 천안 대화리 352 또는 다른 지붕 분석")
    print("  → 자동 배치 패널이 지붕 모양 따라 회전되어 표시")
    print("  → 콘솔 (F12) 에 '[Phase 11.1B] aligned: longBearing=... → panelFace=...°' 로그")
    print("  → '[Phase 11.1C] auto-layout azimuth=... efficiency=...%' 로그")
    print("  → 사업성/PF 결과가 회전 효율 감소 반영됨 (남향 100% / 동서 ~85% / 북향 ~75%)")


if __name__ == "__main__":
    main()
