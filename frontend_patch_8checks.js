/* === 8대 체크사항 패널 렌더링 + SSE 실시간 진행 상태 ===
 * v2: /api/checks/analyze-stream SSE 엔드포인트 사용
 *     항목별 완료 시 즉시 UI 업데이트
 *     fallback: SSE 실패 시 기존 /api/checks/analyze POST 사용
 */

const __BACKEND_URL_FALLBACK = (typeof BACKEND_URL !== "undefined" && BACKEND_URL) ? BACKEND_URL : (location && location.origin ? location.origin : "");

function __getCurrentAnalysisData(){
  if(typeof currentAnalysisData !== "undefined" && currentAnalysisData) return currentAnalysisData;
  if(window && window.currentAnalysisData) return window.currentAnalysisData;
  return null;
}

const CHECK_ORDER = [
  ["zoning","용도지역"],
  ["ecology","생태자연도"],
  ["heritage","문화재 규제"],
  ["setback","이격거리"],
  ["grid","한전 여유용량"],
  ["slope","경사도"],
  ["insolation","일사량"],
  ["land_price","토지가격"],
];

function statusToClass(st){
  if(st==="PASS") return "pass";
  if(st==="FAIL") return "fail";
  return "warn";
}

function statusToIcon(st){
  if(st==="PASS") return "\u2705";
  if(st==="FAIL") return "\u274C";
  return "\u23F3";
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* 초기 로딩 상태로 패널 렌더링 */
function renderChecksLoading(el){
  el.innerHTML =
    '<div class="checksProgress" id="checksProgressBar">' +
      '<div class="checksProgressInner" style="width:0%"></div>' +
    '</div>' +
    CHECK_ORDER.map(function(pair){
      var k = pair[0], title = pair[1];
      return '<div class="checkRow warn" id="checkRow_' + k + '" data-key="' + k + '">' +
        '<div class="checkIcon" id="checkIcon_' + k + '">\u23F3</div>' +
        '<div class="checkTitle">' + title + '</div>' +
        '<div class="checkValue" id="checkVal_' + k + '">조회 중...</div>' +
        '<div class="checkMsg" id="checkMsg_' + k + '"></div>' +
      '</div>';
    }).join("");
}

/* 개별 항목 업데이트 */
function updateCheckRow(key, status, value, msg){
  var row = document.getElementById("checkRow_" + key);
  if(!row) return;
  row.className = "checkRow " + statusToClass(status);
  var iconEl = document.getElementById("checkIcon_" + key);
  if(iconEl) iconEl.textContent = statusToIcon(status);
  var valEl = document.getElementById("checkVal_" + key);
  if(valEl) valEl.textContent = value || "";
  var msgEl = document.getElementById("checkMsg_" + key);
  if(msgEl) msgEl.textContent = msg || "";
}

/* 프로그레스 바 업데이트 */
function updateProgressBar(progress, total){
  var bar = document.querySelector(".checksProgressInner");
  if(!bar) return;
  var pct = Math.min(100, Math.round((progress / total) * 100));
  bar.style.width = pct + "%";
  if(pct >= 100){
    setTimeout(function(){
      var wrap = document.getElementById("checksProgressBar");
      if(wrap) wrap.style.display = "none";
    }, 600);
  }
}

/* SSE 스트리밍 방식으로 8대 체크 호출 */
async function fetchEightChecksStream(payload){
  var el = document.getElementById("aiChecksContainer");
  if(!el) return false;
  renderChecksLoading(el);

  try {
    var res = await fetch(__BACKEND_URL_FALLBACK + "/api/checks/analyze-stream", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    if(!res.ok || !res.body) return false;

    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";
    var finalData = null;

    while(true){
      var chunk = await reader.read();
      if(chunk.done) break;
      buffer += decoder.decode(chunk.value, {stream:true});

      var lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for(var i = 0; i < lines.length; i++){
        var line = lines[i].trim();
        if(!line.startsWith("data:")) continue;
        try {
          var evt = JSON.parse(line.slice(5).trim());
          if(evt.step === "done"){
            finalData = evt;
          } else {
            updateCheckRow(evt.step, evt.status, evt.value, evt.msg);
            if(evt.progress && evt.total) updateProgressBar(evt.progress, evt.total);
          }
        } catch(e){ /* ignore */ }
      }
    }

    if(finalData){
      if(document.getElementById("aiScore") && finalData.total_score)
        document.getElementById("aiScore").innerText = finalData.total_score;
      if(document.getElementById("aiConfidence") && finalData.confidence)
        document.getElementById("aiConfidence").innerText = finalData.confidence;
    }
    updateProgressBar(8, 8);
    return true;
  } catch(e){
    console.warn("[8checks-stream] SSE failed, falling back:", e);
    return false;
  }
}

/* fallback: 기존 POST 방식 */
async function fetchEightChecksFallback(payload){
  var el = document.getElementById("aiChecksContainer");
  if(!el) return;

  try {
    var res = await fetch(__BACKEND_URL_FALLBACK + "/api/checks/analyze", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    if(!res.ok) throw new Error("HTTP " + res.status);
    var data = await res.json();
    renderEightChecks(data);
    if(document.getElementById("aiScore")) document.getElementById("aiScore").innerText = data.total_score;
    if(document.getElementById("aiConfidence")) document.getElementById("aiConfidence").innerText = data.confidence;
  } catch(e) {
    console.error(e);
    if(el) el.innerHTML = '<div style="padding:14px;color:#ffcc66;">8대 체크 분석 실패 (추가 확인 필요)</div>';
  }
}

/* 기존 일괄 렌더링 (fallback용) */
function renderEightChecks(resp){
  var el = document.getElementById("aiChecksContainer");
  if(!el) return;
  var list = resp.check_list || {};
  el.innerHTML = CHECK_ORDER.map(function(pair){
    var k = pair[0], title = pair[1];
    var it = list[k] || {status:"WARNING", value:"확인 필요", msg:""};
    return '<div class="checkRow ' + statusToClass(it.status) + '">' +
      '<div class="checkIcon">' + statusToIcon(it.status) + '</div>' +
      '<div class="checkTitle">' + title + '</div>' +
      '<div class="checkValue">' + escapeHtml(it.value || "") + '</div>' +
      '<div class="checkMsg">' + escapeHtml(it.msg || "") + '</div>' +
    '</div>';
  }).join("");
}

/* 메인 진입점 */
async function fetchEightChecks() {
  var cad = __getCurrentAnalysisData();
  if(!cad){ console.warn('[8checks] currentAnalysisData missing'); return; }

  var payload = {
    address: cad.address || null,
    lat: cad.lat,
    lng: cad.lng,
    pnu: cad.pnu || null,
    capacity_kw: cad.ac_kw || cad.acKW || null,
    slope_deg: cad.slope_deg || cad.slopeDeg || null,
    sun_hours: cad.sun_hours || cad.sunHours || null,
    dist_road_m: cad.dist_road_m || null,
    dist_residential_m: cad.dist_residential_m || null,
    area_m2: cad.area_m2 || cad.areaM2 || null
  };

  var ok = await fetchEightChecksStream(payload);
  if(!ok) await fetchEightChecksFallback(payload);
}

/* 호출 타이밍: 통합 분석 결과 반영 직후 fetchEightChecks() */
