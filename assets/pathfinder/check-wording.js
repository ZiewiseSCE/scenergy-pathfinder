/* Check wording for every browser surface (studio 8-check panel, score, summary, explore map card, saved-check table, mobile
   Solbi grid): the owner's rule — the real value, or the closest value plus '추가 상세 확인 권장', never a bare '확인 필요'.
   A port of pf_permit_report.display_label / business_display / report_text, so results stored before the source wording
   changed (pf_evidence, pf_map_points, scan rows) read the same as new ones. The stored enums are never changed. */
(function (root) {
  'use strict';
  var STORED = '확인 필요', MORE = '추가 상세 확인 권장', UNKNOWN = '미확인';
  var UNKNOWN_CHECK = UNKNOWN + ' — ' + MORE;
  var KEPCO_UNKNOWN = UNKNOWN + ' — 한전ON ' + MORE;
  var BUSINESS_AMBER = '검토 가능 · ' + MORE;
  var KEPCO_REF_STORED = '접속 가능 용량을 확정하는 값이 아닙니다. 한전 확인 필요.';
  var KEPCO_REF_SHOWN = '접속 가능 용량을 확정하는 값이 아닙니다 — 한전 추가 상세 확인 권장.';
  var ADDRESS_RECHECK = '주소 재확인 필요', ADDRESS_RECHECK_SHOWN = '주소 일치 미확인 — 한전ON ' + MORE;
  var SHOWN = {};
  SHOWN[STORED] = UNKNOWN_CHECK;
  SHOWN['한전 여유용량 확인 필요'] = KEPCO_UNKNOWN;
  SHOWN['일사량 자료 확인 필요'] = UNKNOWN + ' — 기상청 일사량 자료 ' + MORE;
  SHOWN['필지별 배전선로 확인 필요'] = '필지별 배전선로 ' + KEPCO_UNKNOWN;
  SHOWN['한전 필지별 배전선로 확인 필요'] = '한전 필지별 배전선로 ' + KEPCO_UNKNOWN;
  var NAMED = ['한전 필지별 배전선로 확인 필요', '한전 여유용량 확인 필요', '일사량 자료 확인 필요', '필지별 배전선로 확인 필요'];
  // A named placeholder standing as a value: line start, after ': ', or between ' / ' and ' · ' parts (no lookbehind: older Safari).
  var WORDS = new RegExp('(^|: | / | · )(' + NAMED.join('|') + ')(?=$| / | · | \\(|[.,)\\n])', 'gm');
  var LABELS = ['PNU', '면적', '위도', '경도', '지목', '용도지역', '한전 여유용량', '한전 여유용량(MW)', '한전 출처', '한전 메시지',
    '경사도', '일사량', '토지가격', '토지금액', '토지단가'];
  var VALUE = new RegExp('^(' + LABELS.map(function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + '): ' + STORED + '$', 'gm');
  // The word '확인 필요' (with a leading '추가 ' as one word); the particle '로' becomes '으로'. '확인 필요합니다' is another word.
  var BARE = /(^|[^가-힣])((?:추가 )?확인 필요)(로)?(?![가-힣])/g;

  function str(v) { return v == null ? '' : String(v).trim(); }

  /* A badge (8대 체크 card, 인허가 row, 판정): an amber '확인 필요' reads '추가 상세 확인 권장'; other labels as they are. */
  function label(v) { var t = str(v); return t === STORED ? MORE : t; }

  /* The 사업성 판정 (pf_permit_report.business_display, then report_text as the reports print it): an amber '확인 필요' reads
     '검토 가능 · 추가 상세 확인 권장' (with a critical item, '추가 상세 확인 권장'); a scan export's '계통 확인 필요' reads
     '계통 추가 상세 확인 권장'; no label at all is '미확인'. */
  function business(v, critical) {
    var t = str(v);
    if (t === STORED) return critical ? MORE : BUSINESS_AMBER;
    return text(t) || UNKNOWN;
  }

  /* A stored value or sentence as the reports print it (pf_permit_report.report_text). */
  function text(v) {
    var t = str(v);
    if (t.indexOf(STORED) < 0) return t;
    t = t.split(KEPCO_REF_STORED).join(KEPCO_REF_SHOWN).split(ADDRESS_RECHECK).join(ADDRESS_RECHECK_SHOWN);
    t = t.split(' · ').map(function (part) { var k = part.trim(); return Object.prototype.hasOwnProperty.call(SHOWN, k) ? SHOWN[k] : part; }).join(' · ');
    t = t.replace(WORDS, function (_, lead, word) { return lead + SHOWN[word]; });
    t = t.replace(VALUE, function (_, name) { return name + ': ' + UNKNOWN_CHECK; });
    return t.replace(BARE, function (_, lead, word, ro) { return lead + MORE + (ro ? '으로' : ''); });
  }

  /* True when a stored text asks for a check in either wording (for code that used to look for '확인 필요'). */
  function needs(v) { var t = str(v); return t.indexOf(STORED) >= 0 || t.indexOf(MORE) >= 0; }

  /* The analysis summary ('생태자연도: 지점 등급 도형 없음(WARNING) / 보호구역·문화재: PASS', stored before 2026-11-02): text()
     and each raw state in Korean, as app._analyze_checks writes it now. */
  var STATE = { PASS: '정상', WARNING: MORE, FAIL: '주의' };
  function summary(v) {
    return text(v).replace(/\((PASS|WARNING|FAIL)\)/g, function (_, s) { return '(' + STATE[s] + ')'; })
      .replace(/: (PASS|WARNING|FAIL)(?=$| \/ |\n)/gm, function (_, s) { return ': ' + STATE[s]; });
  }

  var api = { STORED: STORED, MORE: MORE, UNKNOWN: UNKNOWN, UNKNOWN_CHECK: UNKNOWN_CHECK, BUSINESS_AMBER: BUSINESS_AMBER,
    label: label, business: business, text: text, needs: needs, summary: summary };
  root.PFWording = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
