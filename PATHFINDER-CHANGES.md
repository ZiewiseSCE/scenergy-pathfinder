# Pathfinder 공통 설계/Worker 전환

구현 상세와 운영 확인 목록: `../solar-server/docs/R0-R6-IMPLEMENTATION.md`.
배포·DB·별도 worker·rollback: `../solar-server/docs/PATHFINDER_DEPLOYMENT.md`.

공유 JS의 원본은 서버 `static/pathfinder`이며 이 저장소 `assets/pathfinder`에 복사한다. 양쪽 `manifest.json`의 bundleSha256을 비교한다. `solar_pathfinder.html`의 구형 계산 함수를 다시 활성화하지 말고 공통 엔진·통신·렌더 모듈을 수정한다.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build:css
pnpm test
```

이 변경에는 API 202 응답 처리, 라이선스 인증, layout-v1 저장 revision 계약이 포함된다. 서버/프론트를 같이 배포해야 한다. 운영에 아직 배포되지 않았으며 기존 미커밋 작업을 포함한 작업 트리 상태다.

## 2026-11-10 영업용 파라미터 개편 (스튜디오)

거리 입력을 없애고 **이격 여유율(%)** 하나로 배치한다. 간격 계산은 공통 엔진 `PFLayout.marginGaps` / `PFLayout.withMargin`(layout-core.js)만 사용하고 이 저장소에서 다시 계산하지 않는다.

- **분석 파라미터 패널**: `setbackDist`, `rowSpacing`, `arraySideGap`, `sunAltitude`, `installHeight`, `arrayRows`, `arrayCols` 입력 삭제. `layoutMarginPct`(0–40, 기본 10) 추가. 배치 입력은 `window.onLayoutParamInput(this)`로 재계산하고 "사용자가 고친 값" 표시(`data-pf-user-edited`)를 남긴다.
- **모드 기본값**: `window.pfApplyModeDefaults()` 한 곳. 지붕 10°·2단·가로·10%·시공비 100만/kW, 토지 15°·3단·가로·10%·150만/kW. 페이지 시작, 지붕/토지 전환, 저장 현장·저장 필지 불러오기에서 호출하며 사용자가 이번 접속에서 고친 값은 덮어쓰지 않는다.
- **모드 판별**: `window.PFScanMode()`가 `'roof'|'land'`를 돌려준다. `scanTarget`은 지붕일 때 `'building'`이고 `window.scanTarget`은 존재하지 않으므로 직접 읽지 않는다.
- **기자재**: 기본 선택은 카탈로그 번호 기준 모듈 #1, 인버터 #2. 모듈을 고르면 크기(`width_m`/`height_m`, 없으면 `size` 문자열)가 `modWidth`/`modHeight`에 들어간다. `price_million_won`은 만원 단위다.
- **설치 제외(제척) 영역**: 적용된 설계의 사용자 영역을 `_spDrawExclusionZones`가 메인 지도에 붉은 반투명으로 그리고, 현장·선택·배치가 바뀌면 지운다. 자동 리포트 캡처 이미지에도 포함한다.
- **3D**: 지붕 형태 기본값 평지붕. 앞뒤·좌우 간격 슬라이더와 "권장값 자동" 대신 `sim3dMarginSlider` 하나. 박공·편경사 높이는 2.8 m로 제한.
- **분석 요청**: `setback_m`을 보내지 않는다.
- **스캔 후보 간이 추정**: `(1 − 여유율) × 0.92` 격자 밀도(경사진 토지는 음영 피치 포함). 입력값을 고치지 않는다.
- 저장소 루트의 `phase_*.py`, `frontend_patch_8checks.js`(사이트와 함께 공개되던 예전 패치 스크립트) 삭제.

이전 설계(간격이 직접 저장되고 `marginPct`가 없는 문서)는 그대로 열리고, 배치 입력을 바꾸기 전까지 저장된 간격을 유지한다.

새 테스트: `tests/mode-defaults.test.cjs`, `tests/module-selection.test.cjs`, `tests/exclusion-zones.test.cjs`, `tests/scan-quick-estimate.test.cjs`, `tests/studio-params-markup.test.cjs`, `tests/main-layout-margin.test.cjs`.
