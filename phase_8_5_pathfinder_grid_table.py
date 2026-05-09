#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
phase_8_5_pathfinder_grid_table.py — Phase 8.5
데스크탑 페이지 (solar_pathfinder.html) 의 "종합 리포트" 탭에서
8대 체크 카드 리스트 중 "한전 여유용량" 항목만 4행 테이블로 렌더링.

문제:
  현재 renderAIResult 의 map 콜백이 모든 체크 항목을 단순 텍스트 카드로 렌더링.
  → 한전 여유용량은 "배전선로 여유용량 567kW (출력제어 조건부 0kW) ..." 형태로
     긴 한 줄 텍스트로만 표시됨.
  사용자 요청: 정밀분석 탭의 distribution 4행 표와 동일하게 표시.

수정:
  renderAIResult 의 map 콜백 시작 부분에 key==="grid" 분기 추가:
   - currentAnalysisData.kepco 에서 dist_table 빌드 (haeseol fallback 포함)
   - facility_label + 4행 테이블 (구분/시설명/여유/접속기준/접수기준/접속계획/여유용량)
   - warning 박스
   - 데이터 없으면 기존 텍스트 카드로 fallback

실행:
  cd C:\\projects\\scenergy-pathfinder
  Copy-Item -Force C:\\kepco-rpa-api\\solar-server-staging\\scripts\\phase_8_5_pathfinder_grid_table.py .
  python phase_8_5_pathfinder_grid_table.py --check
  python phase_8_5_pathfinder_grid_table.py
"""

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path.cwd()
HTML = ROOT / "solar_pathfinder.html"

MARKER_ALREADY = "Phase 8.5: grid item 4-row table"


# ============================================================================
# Anchor: renderAIResult map 콜백 시작 (item => { 직후)
# ============================================================================
ANCHOR = '''    }).map(item => {
      if(!item) return "";
      const key = item.key || item.code || item.id || "";
      const title = safeText(item.title || item.category, "");
      let result = safeText(item.message || item.result || item.status || "", "확인 필요");
      let link = (item.link || item.url || __deriveCheckLink(title) || "");
      if(item.key === "setback" && ordinance && ordinance.url) link = ordinance.url;
      const needs = item.needs_confirm || item.confirm_needed || (String(result).includes("확인") && String(result).includes("필요"));
      const severity = String(item.severity || (needs ? "amber" : "green")).toLowerCase();'''

REPLACE = '''    }).map(item => {
      if(!item) return "";
      const key = item.key || item.code || item.id || "";
      const title = safeText(item.title || item.category, "");
      let result = safeText(item.message || item.result || item.status || "", "확인 필요");
      let link = (item.link || item.url || __deriveCheckLink(title) || "");
      if(item.key === "setback" && ordinance && ordinance.url) link = ordinance.url;
      const needs = item.needs_confirm || item.confirm_needed || (String(result).includes("확인") && String(result).includes("필요"));
      const severity = String(item.severity || (needs ? "amber" : "green")).toLowerCase();

      // Phase 8.5: 한전 여유용량 (key==="grid") 만 4행 테이블로 렌더링
      if(key === "grid" || (title && title.indexOf("한전") >= 0)){
        try {
          const _cad = window.currentAnalysisData || {};
          const _kep = _cad.kepco || (_cad.ai_analysis && _cad.ai_analysis.kepco) || {};
          // dist 객체 위치 다양성 대응
          let _dist = null;
          if(_kep && typeof _kep === "object"){
            if(_kep.sections && _kep.sections.distribution) _dist = _kep.sections.distribution;
            else if(_kep.capacity_detail && _kep.capacity_detail.sections && _kep.capacity_detail.sections.distribution) _dist = _kep.capacity_detail.sections.distribution;
            else if(_kep.meta && _kep.meta.sections && _kep.meta.sections.distribution) _dist = _kep.meta.sections.distribution;
            else if(Array.isArray(_kep.table)) _dist = _kep;
          }
          // table 우선순위: kep.table → dist.table → haeseol → 4행 빌드
          let _table = (Array.isArray(_kep.table) && _kep.table.length) ? _kep.table : null;
          if(!_table && _dist){
            if(Array.isArray(_dist.table) && _dist.table.length) _table = _dist.table;
            else if(_dist.haeseol && typeof _dist.haeseol === "object"){
              const _hae = _dist.haeseol;
              const _rrows = Array.isArray(_dist.result_rows) ? _dist.result_rows : [];
              const _r0 = (_rrows.length && typeof _rrows[0] === "object") ? _rrows[0] : {};
              const _subN = String((_r0 && _r0.substation) || "").trim();
              const _trN = String((_r0 && _r0.transformer) || "").trim();
              const _lnN = String((_r0 && _r0.line_name) || "").trim();
              const _bldRow = (label, name, d) => (d && typeof d === "object") ? {
                label, name,
                available: d.available,
                available_label: d.available_label || "확인 필요",
                base_kw: d.base_kw, received_kw: d.received_kw,
                planned_kw: d.planned_kw, current_kw: d.current_kw, total_kw: d.total_kw,
              } : null;
              const _built = [];
              let _r;
              if((_r = _bldRow("변전소", _subN, _hae.substation))) _built.push(_r);
              if((_r = _bldRow("주변압기", _trN, _hae.transformer))) _built.push(_r);
              if((_r = _bldRow("배전선로", _lnN, _hae.distribution_line))) _built.push(_r);
              if((_r = _bldRow("출력제어 조건부", _lnN, _hae.distribution_line_curtailable))) _built.push(_r);
              if(_built.length) _table = _built;
            }
          }

          if(_table && _table.length){
            const _facility = (_kep.facility_label) || (_dist && _dist.facility_label) || "";
            const _warning = (_kep.warning) || (_dist && _dist.warning) || "";
            const _esc = (s) => String(s == null ? "" : s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
            const _fmt = (kw) => {
              if(kw === null || kw === undefined) return "-";
              const n = Number(kw);
              if(!isFinite(n)) return "-";
              return n.toLocaleString("ko-KR");
            };
            // severity 기반 border/badge
            let _bcls = "border-slate-600", _bdg = "";
            if(severity === "critical"){
              _bcls = "border-red-500/70";
              _bdg = `<span class="ml-1 inline-flex items-center rounded-full border border-red-500/70 px-1.5 py-0.5 text-[9px] font-bold text-red-300">사업성 없음</span>`;
            } else if(severity === "amber"){
              _bcls = "border-yellow-500/60";
              _bdg = `<span class="ml-1 inline-flex items-center rounded-full border border-yellow-500/60 px-1.5 py-0.5 text-[9px] font-bold text-yellow-200">확인 필요</span>`;
            }
            let _html = `<div class="bg-slate-700/50 p-2 rounded border ${_bcls} text-[10px]">`;
            _html += `<div class="flex items-start justify-between gap-2 mb-2">`;
            _html += `<div class="flex items-center gap-2 flex-1 min-w-0">`;
            _html += `<div class="text-cyan-400">✓</div>`;
            _html += `<div class="flex-1"><div class="text-slate-300 font-bold">🔌 ${_esc(title)}${_bdg}</div>`;
            if(_facility) _html += `<div class="text-[10px] text-slate-400 mt-0.5">📍 ${_esc(_facility)}</div>`;
            _html += `</div></div>`;
            if(link) _html += `<a href="${_esc(link)}" target="_blank" class="bg-slate-600 px-2 py-1 rounded hover:bg-slate-500 whitespace-nowrap shrink-0 text-[10px]">링크</a>`;
            _html += `</div>`;
            // 4행 테이블
            _html += `<div class="overflow-x-auto"><table class="w-full text-[10px] border-collapse">`;
            _html += `<tr class="bg-slate-700/50">`;
            _html += `<th class="border border-slate-600 px-1 py-0.5 text-left">구분</th>`;
            _html += `<th class="border border-slate-600 px-1 py-0.5 text-left">시설명</th>`;
            _html += `<th class="border border-slate-600 px-1 py-0.5 text-center">여유</th>`;
            _html += `<th class="border border-slate-600 px-1 py-0.5 text-center">접속기준</th>`;
            _html += `<th class="border border-slate-600 px-1 py-0.5 text-center">접수기준</th>`;
            _html += `<th class="border border-slate-600 px-1 py-0.5 text-center">접속계획</th>`;
            _html += `<th class="border border-slate-600 px-1 py-0.5 text-center">여유용량</th>`;
            _html += `</tr>`;
            for(let i=0; i<_table.length; i++){
              const r = _table[i] || {};
              const availLabel = r.available_label || "-";
              let availCls = "text-slate-400";
              if(r.available === true) availCls = "text-emerald-300 font-bold";
              else if(r.available === false) availCls = "text-rose-300 font-bold";
              const curCls = (r.current_kw && Number(r.current_kw) > 0) ? "text-emerald-300 font-bold" : "text-slate-400";
              _html += `<tr>`;
              _html += `<td class="border border-slate-600 px-1 py-0.5 text-slate-200 font-bold">${_esc(r.label || "-")}</td>`;
              _html += `<td class="border border-slate-600 px-1 py-0.5 text-slate-300">${_esc(r.name || "-")}</td>`;
              _html += `<td class="border border-slate-600 px-1 py-0.5 text-center ${availCls}">${_esc(availLabel)}</td>`;
              _html += `<td class="border border-slate-600 px-1 py-0.5 text-center text-slate-300">${_fmt(r.base_kw)}</td>`;
              _html += `<td class="border border-slate-600 px-1 py-0.5 text-center text-slate-300">${_fmt(r.received_kw)}</td>`;
              _html += `<td class="border border-slate-600 px-1 py-0.5 text-center text-slate-300">${_fmt(r.planned_kw)}</td>`;
              _html += `<td class="border border-slate-600 px-1 py-0.5 text-center ${curCls}">${_fmt(r.current_kw)}</td>`;
              _html += `</tr>`;
            }
            _html += `</table></div>`;
            if(_warning){
              _html += `<div class="mt-2 rounded-md bg-amber-900/40 border border-amber-700/40 p-2 text-[10px] text-amber-200">⚠️ ${_esc(_warning)}</div>`;
            }
            _html += `</div>`;
            return _html;
          }
        } catch(_gridErr) { console.warn("[grid-table render]", _gridErr); }
        // table 빌드 실패 시 기본 텍스트 카드로 폴백
      }'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    if not HTML.exists():
        print(f"ERROR: {HTML} 없음 — C:\\projects\\scenergy-pathfinder 에서 실행하세요")
        sys.exit(1)

    text = HTML.read_text(encoding="utf-8")

    if MARKER_ALREADY in text:
        print(f"이미 적용됨 (marker '{MARKER_ALREADY}'). 종료.")
        sys.exit(0)

    if ANCHOR not in text:
        print("ERROR: anchor 못 찾음 — renderAIResult map 콜백 구조 변경됐을 수 있음.")
        sys.exit(2)

    if args.check:
        print("--check OK: anchor 발견. 적용 시:")
        print("  ✓ Phase 8.5: 종합 리포트 탭 8대 체크 카드의 '한전 여유용량' 만 4행 테이블로 렌더링")
        print("  ✓ kepco.table → dist.table → haeseol → 4행 빌드 우선순위")
        print("  ✓ facility_label + warning 박스 포함")
        print("  ✓ 데이터 없으면 기존 텍스트 카드로 폴백")
        sys.exit(0)

    bak = HTML.with_suffix(".html.bak.before_phase_8_5")
    shutil.copy2(HTML, bak)
    print(f"backup: {bak}")

    text = text.replace(ANCHOR, REPLACE, 1)
    HTML.write_text(text, encoding="utf-8")
    print(f"✅ Phase 8.5 적용 완료 ({HTML})")


if __name__ == "__main__":
    main()
