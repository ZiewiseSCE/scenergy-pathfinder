/* === 8대 체크사항 패널 렌더링 추가 패치 ===
 * 사용 전제:
 * - 통합 분석/정밀 분석 완료 시 currentAnalysisData에 lat,lng,pnu,address, slope_deg, sun_hours 등이 들어있음
 * - BACKEND_URL 설정되어 있거나 동일 도메인 프록시
 * - HTML에 8대 체크사항 컨테이너가 존재: #aiChecksContainer (없으면 생성 필요)
 */

async function fetchEightChecks() {
  try {
    const payload = {
      address: currentAnalysisData.address || null,
      lat: currentAnalysisData.lat,
      lng: currentAnalysisData.lng,
      pnu: currentAnalysisData.pnu || null,
      capacity_kw: currentAnalysisData.ac_kw || currentAnalysisData.acKW || null,
      slope_deg: currentAnalysisData.slope_deg || currentAnalysisData.slopeDeg || null,
      sun_hours: currentAnalysisData.sun_hours || currentAnalysisData.sunHours || null,
      dist_road_m: currentAnalysisData.dist_road_m || null,
      dist_residential_m: currentAnalysisData.dist_residential_m || null,
      area_m2: currentAnalysisData.area_m2 || currentAnalysisData.areaM2 || null
    };

    const res = await fetch(`${BACKEND_URL}/api/checks/analyze`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderEightChecks(data);
    // 점수/신뢰도도 상단에 반영 가능
    if(document.getElementById("aiScore")) document.getElementById("aiScore").innerText = data.total_score;
    if(document.getElementById("aiConfidence")) document.getElementById("aiConfidence").innerText = data.confidence;
  } catch(e) {
    console.error(e);
    // 패널 오류 표시
    const el = document.getElementById("aiChecksContainer");
    if(el) el.innerHTML = `<div style="padding:14px;color:#ffcc66;">8대 체크 분석 실패 (추가 확인 필요)</div>`;
  }
}

function statusToClass(st){
  if(st==="PASS") return "pass";
  if(st==="FAIL") return "fail";
  return "warn";
}

function renderEightChecks(resp){
  const el = document.getElementById("aiChecksContainer");
  if(!el) return;
  const order = [
    ["zoning","용도지역"],
    ["ecology","생태자연도"],
    ["heritage","문화재 규제"],
    ["setback","이격거리"],
    ["grid","한전 여유용량"],
    ["slope","경사도"],
    ["insolation","일사량"],
    ["land_price","토지가격"],
  ];
  const list = resp.check_list || {};
  el.innerHTML = order.map(([k,title])=>{
    const it = list[k] || {status:"WARNING", value:"확인 필요", msg:""};
    return `
      <div class="checkRow ${statusToClass(it.status)}">
        <div class="checkTitle">${title}</div>
        <div class="checkValue">${escapeHtml(it.value || "")}</div>
        <div class="checkMsg">${escapeHtml(it.msg || "")}</div>
      </div>
    `;
  }).join("");
}

// 아주 단순한 escape
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* 호출 타이밍 예:
 * - 통합 분석 결과가 화면에 반영된 직후 fetchEightChecks() 호출
 */
