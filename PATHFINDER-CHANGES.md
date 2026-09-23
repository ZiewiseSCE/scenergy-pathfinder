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
