// FRONTEND test (for the frontend repo's tests/ folder; run from the repo root): the studio's calculateFinance must still
// produce the vectors the backend's pf_studio_finance.py is held to (backend tests/fixtures/studio_finance_vectors.json).
// Usage: node tests/studio-finance-vectors.test.cjs [fixture] (default tests/fixtures/studio_finance_vectors.json)
//   (or env STUDIO_FINANCE_FIXTURE). If this fails after a deliberate change to the studio's finance, regenerate the fixture in
//   the backend (tests/tools/studio_finance_vectors.cjs) and update pf_studio_finance.py in the same release.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const fixturePath = path.resolve(process.argv[2] || process.env.STUDIO_FINANCE_FIXTURE || path.join(__dirname, 'fixtures', 'studio_finance_vectors.json'));
assert(fs.existsSync(fixturePath), 'fixture path argument missing: ' + fixturePath);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const html = fs.readFileSync('solar_pathfinder.html', 'utf8');
const extract = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert(i >= 0 && j > i, a); return html.slice(i, j); };

function run(v) {
  const construction = v.construction_man == null ? (v.mode === 'land' ? 150 : 100) : v.construction_man;
  const values = { modPower: 640, modPrice: v.module_price, costPerKw: construction, smp: v.smp, rec: v.rec, pfPrincipal: v.auto_principal ? 0 : v.principal_won,
    pfInterestRate: v.rate_pct, pfTenorYears: v.tenor_years, pfDscrTarget: v.dscr_target, pfLoanRatio: v.loan_ratio_pct, pfLtvPct: v.ltv_pct,
    landTenureMode: v.land_mode, landRentMonthly: v.rent_monthly_won == null ? 0 : v.rent_monthly_won, pfMaintOpexAnnual: v.maint_opex_annual_won == null ? 0 : v.maint_opex_annual_won,
    pfOtherOpexAnnual: v.other_opex_annual_won, pfOtherCapexWon: v.other_capex_won, pfOtherAssetWon: v.other_asset_won, pfLandBuyPrice: v.land_buy_price_won,
    pfDeprRatePct: v.depr_rate_pct == null ? '' : v.depr_rate_pct, installAngle: v.mode === 'land' ? 15 : 10, manualDcKw: '' };
  const els = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { id, value: String(value), style: {}, checked: false, dataset: {}, tagName: 'INPUT', type: 'number' }]));
  els.pfAutoPrincipal = { id: 'pfAutoPrincipal', checked: !!v.auto_principal, value: '', style: {}, dataset: {} };
  els.pfMaintDefault = { id: 'pfMaintDefault', checked: v.maint_opex_annual_won == null, value: '', style: {}, dataset: {} };
  els.pfRentDefault = { id: 'pfRentDefault', checked: v.rent_monthly_won == null, value: '', style: {}, dataset: {} };
  els.pfTenorNote = { textContent: '', classList: { toggle() {} } };
  els.analysisCapacity = { innerText: '', textContent: '' };
  const errors = [], window = {};
  const currentAnalysisData = { mode: v.mode, address: 'QA', solar_opt: { sun_hours: v.sun_hours } };
  if (v.land_price_won) currentAnalysisData.land_estimate = { land_price_won: v.land_price_won };
  const ctx = { window, currentAnalysisData, document: { readyState: 'complete', getElementById: id => els[id], querySelectorAll: () => [], createElement: () => ({}) },
    el: id => els[id], getAnalysisLatLng: () => ({ lat: 37, lng: 127 }), estimateSunHoursHeuristic: () => 3.6, formatNumber: String, formatMillionWon: String,
    _spCapacityLabel: dc => 'DC ' + dc.toFixed(1) + ' kW', console: { error: (...e) => errors.push(e), warn: (...e) => errors.push(e) }, showToast() {}, selectedFeatures: new Map() };
  ctx.PFOrientation = require(path.resolve('assets/pathfinder/orientation.js'));
  window.currentAnalysisData = currentAnalysisData;
  vm.createContext(ctx);
  vm.runInContext(extract('function layoutOrientation(', 'function formatMillionWon('), ctx);
  vm.runInContext(extract('function _spPayback(', '// Finance recalculation helper'), ctx);
  window.calculateFinance(Math.max(1, Math.round(v.dc_kw * 1000 / 640)), v.sun_hours, v.dc_kw);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  return JSON.parse(JSON.stringify(currentAnalysisData.finance));
}

const same = (want, got, at) => {
  if (want && typeof want === 'object') {
    assert(got && typeof got === 'object', at);
    for (const k of Object.keys(want)) same(want[k], got[k], at + '.' + k);
  } else if (typeof want === 'number') assert.ok(Math.abs(want - got) <= 1e-9 * Math.max(1, Math.abs(want)), `${at}: ${want} vs ${got}`);
  else assert.deepEqual(got, want, at);
};
assert.ok(fixture.vectors.length >= 12);
for (const vec of fixture.vectors) same(vec.finance, run(vec.inputs), vec.inputs.name);
console.log(`PASS studio finance vectors: ${fixture.vectors.length} vectors, fixture made at frontend ${fixture.frontend_commit}`);
