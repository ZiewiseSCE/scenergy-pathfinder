#!/usr/bin/env python3
# coding: utf-8
"""
phase_11_7_osm_frontend.py — Phase 11.7 (scenergy-pathfinder / GitHub Pages, 프론트)

증상 (§12.6):
  3D 시뮬레이션 진입 시 _detectBuildingFloors 가 브라우저에서 Overpass 를 직접 호출
  → CORS/timeout 다발("[SolarSim3D] 건물 층수 감지 실패"). 게다가 roofType 은 감지 안 하고
  UI select 기본값 "gable" 고정 → 모든 건물이 박공으로 렌더링.

root cause:
  - 브라우저 → overpass-api.de 직접 fetch (서버 가용성/CORS 취약, 캐시 없음)
  - 지붕형태 자동 인식 자체가 없음 (층수만)

처방 (Phase 11.7 frontend, 2 edits):
  Edit 1: SolarSim3D 에 새 메서드 _detectRoofOSM(lat,lng) 추가
          → 백엔드 GET ${BACKEND_URL}/api/osm/roof?lat=&lng=&radius=50 호출
            (서버사이드 Overpass + 캐시 → §12.6 해소)
          → 응답 {found,type,levels,height_m,shape,count} 으로
            _data._roofType / _data._bldgHeight + 드롭다운(sim3dRoofTypeSel/
            sim3dBldgFloorSel) 자동 세팅 → 열려있으면 changeRoofType() 재렌더
          → 실패/미발견 시 기본값 유지 (no regression)
  Edit 2: 3D open() 흐름의 호출부를 _detectBuildingFloors → _detectRoofOSM 로 교체
          (기존 _detectBuildingFloors 는 미사용 dead code 로 보존 — 회귀 0)

기대 콘솔: [Phase 11.7] OSM 지붕 자동인식: type=... levels=... height=...m shape=... count=...

5중 안전 체크 (룰 2):
  1. </html> 존재 (절단)
  2. reCalculate 존재 (회귀)
  3. 새 marker PHASE_11_7_OSM_ROOF_FRONTEND + _detectRoofOSM 존재
  4. 이전 phase markers (Phase 11.1D / 11.1E / 11.4c) 보존
  5. 줄 수 sanity (+28~+42) + 구 호출부 제거 확인

⚠️ 사용 위치: scenergy-pathfinder working repo (대문자 P)
  Copy-Item -Force C:\kepco-rpa-api\solar-server-staging\scripts\phase_11_7_osm_frontend.py C:\Projects\scenergy-pathfinder\
  cd C:\Projects\scenergy-pathfinder
  python phase_11_7_osm_frontend.py --check
  python phase_11_7_osm_frontend.py
  git add phase_11_7_osm_frontend.py
  git commit -m "Phase 11.7: 3D 지붕 자동인식 — 백엔드 /api/osm/roof 경유 + roofType/층수 자동 세팅" -- solar_pathfinder.html phase_11_7_osm_frontend.py
  git push
"""
import sys, time
from pathlib import Path

PHASE_NAME = "Phase 11.7 (frontend)"
PHASE_MARKER = "PHASE_11_7_OSM_ROOF_FRONTEND"

TARGET = Path(r"C:\Projects\scenergy-pathfinder\solar_pathfinder.html")

# ----------------------------------------------------------------------------
# Edit 1: 새 메서드 _detectRoofOSM 삽입 (기존 _detectBuildingFloors def 앞)
# ----------------------------------------------------------------------------
ANCHOR_1 = "  _detectBuildingFloors:function(lat,lng){"

NEW_METHOD = r'''  _detectRoofOSM:function(lat,lng){
    // PHASE_11_7_OSM_ROOF_FRONTEND : 브라우저 직접 Overpass → 백엔드 /api/osm/roof 경유
    // (§12.6 CORS/timeout 해소 + 서버 캐시 + 지붕형태 gable/flat/shed 자동 인식)
    var self=this;
    var BU=(window.BACKEND_URL||"");
    if(!BU){ console.warn("[Phase 11.7] BACKEND_URL 미설정 → 지붕 자동인식 skip (기본값 유지)"); return; }
    var url=BU+"/api/osm/roof?lat="+encodeURIComponent(lat)+"&lng="+encodeURIComponent(lng)+"&radius=50";
    fetch(url,{credentials:"include",signal:(window.AbortSignal&&AbortSignal.timeout?AbortSignal.timeout(30000):undefined)})
      .then(function(r){return r.json();})
      .then(function(j){
        if(!j||!j.ok){ console.warn("[Phase 11.7] osm roof 응답 비정상 → 기본값 유지"); return; }
        if(!j.found){ console.log("[Phase 11.7] OSM 건물 미발견 (count="+(j.count||0)+") → 기본값 유지"); return; }
        var floors=j.levels||Math.round((j.height_m||9)/3)||3;
        if(floors<1)floors=3; if(floors>20)floors=20;
        var fsel=document.getElementById("sim3dBldgFloorSel");
        if(fsel){
          var options=[1,2,3,4,5,7,10,15,20],closest=3,minDiff=999;
          options.forEach(function(v){var d=Math.abs(v-floors);if(d<minDiff){minDiff=d;closest=v;}});
          fsel.value=String(closest);
        }
        var rtype=j.type||"gable",rsel=document.getElementById("sim3dRoofTypeSel");
        if(rsel){
          var ok=false;for(var i=0;i<rsel.options.length;i++){if(rsel.options[i].value===rtype){ok=true;break;}}
          if(ok)rsel.value=rtype;
        }
        if(self._data){
          self._data._bldgHeight=(j.height_m||floors*3);
          self._data._roofType=rtype;
          var badge=document.getElementById("sim3dModeBadge");
          if(badge){var t=badge.textContent||"";if(t.indexOf("층")<0)badge.textContent=t+" "+floors+"층";}
          if(self._isOpen&&self._isRoofMode&&typeof self.changeRoofType==="function"){ self.changeRoofType(); }
        }
        console.log("[Phase 11.7] OSM 지붕 자동인식: type="+rtype+" levels="+floors+" height="+(j.height_m)+"m shape="+(j.shape||"-")+" count="+j.count+(j.cached?" (cache)":""));
      })
      .catch(function(e){ console.warn("[Phase 11.7] 지붕 자동인식 실패 (기본값 유지):",e.message||e); });
  },

'''

REPLACE_1 = NEW_METHOD + ANCHOR_1

# ----------------------------------------------------------------------------
# Edit 2: 3D open() 호출부 rewire (_detectBuildingFloors → _detectRoofOSM)
# ----------------------------------------------------------------------------
ANCHOR_2 = "      SolarSim3D._detectBuildingFloors(data.lat,data.lng);"
REPLACE_2 = "      SolarSim3D._detectRoofOSM(data.lat,data.lng);"


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
    if (PHASE_MARKER in text) or ("_detectRoofOSM" in text):
        print(f"⏭️  {PHASE_NAME}: 이미 적용됨. skip.")
        return

    edits = [
        ("Edit 1: _detectRoofOSM 메서드 삽입", ANCHOR_1, REPLACE_1),
        ("Edit 2: open() 호출부 rewire", ANCHOR_2, REPLACE_2),
    ]

    # anchor 존재 + unique
    for n, a, _ in edits:
        c = text.count(a)
        if c != 1:
            print(f"❌ {PHASE_NAME}: anchor '{n}' 매칭 {c}회 (1회여야 안전)")
            sys.exit(2)
    print("   ✓ anchor 2개 모두 unique")

    if check_only:
        print(f"✅ {PHASE_NAME} --check 통과: 적용 가능")
        for n, _a, _ in edits:
            print(f"   ✓ {n}")
        return

    # 백업
    backup = TARGET.with_suffix(TARGET.suffix + f".bak.before_phase_11_7.{int(time.time())}")
    backup.write_bytes(TARGET.read_bytes())
    print(f"📦 백업: {backup.name}")

    # 적용 (line ending 보존)
    new_text = text
    for name, anchor, repl in edits:
        before = new_text
        new_text = new_text.replace(anchor, repl, 1)
        if new_text == before:
            print(f"❌ '{name}' replace 변경 없음")
            sys.exit(3)
        print(f"   applied: {name}")

    new_lines = new_text.count("\n")
    diff_lines = new_lines - orig_lines

    # 5중 안전 체크
    fails = []
    if "</html>" not in new_text: fails.append("</html> 누락 (절단)")
    if "reCalculate" not in new_text: fails.append("reCalculate 누락 (회귀)")
    if PHASE_MARKER not in new_text: fails.append(f"{PHASE_MARKER} 누락 (적용 실패)")
    if "_detectRoofOSM:function(lat,lng){" not in new_text: fails.append("_detectRoofOSM 정의 누락")
    if "SolarSim3D._detectRoofOSM(data.lat,data.lng);" not in new_text: fails.append("호출부 rewire 실패")
    if "SolarSim3D._detectBuildingFloors(data.lat,data.lng);" in new_text: fails.append("구 호출부 잔존 (rewire 누락)")
    for prev in ["Phase 11.1D", "Phase 11.1E", "Phase 11.4c"]:
        if prev not in new_text:
            fails.append(f"{prev} marker 누락 (이전 phase 회귀)")
    if diff_lines < 28 or diff_lines > 42:
        fails.append(f"줄 수 변화 비정상: +{diff_lines} (예상 +34 안팎)")

    if fails:
        print("❌ 5중 안전 체크 실패:")
        for f in fails:
            print(f"   - {f}")
        print(f"❗ 백업 복원: copy {backup.name} {TARGET.name}")
        sys.exit(4)

    TARGET.write_text(new_text, encoding="utf-8")
    print(f"✅ {PHASE_NAME} 적용 완료: {orig_lines} → {new_lines} (+{diff_lines}줄)")
    print()
    print("📝 변경 요약:")
    print("   • SolarSim3D._detectRoofOSM 신규 — 백엔드 /api/osm/roof 경유")
    print("   • 3D open() 호출부를 새 메서드로 rewire")
    print("   • _roofType/_bldgHeight + 드롭다운 자동 세팅 → 지붕형태 자동 인식")
    print()
    print("🔍 배포 후 검증 (Ctrl+Shift+R → 건물 선택 → 3D):")
    print("   • F12 콘솔: [Phase 11.7] OSM 지붕 자동인식: type=... levels=... count=...")
    print("   • flat 건물은 평지붕, 농가는 박공 등 실제 형태 반영")
    print("   • [SolarSim3D] 건물 층수 감지 실패 / [OSM] Server skip 빈도 감소")
    print("   ⚠️ 백엔드 Phase 11.7(/api/osm/roof) 먼저 배포되어 있어야 함")


if __name__ == "__main__":
    main()
