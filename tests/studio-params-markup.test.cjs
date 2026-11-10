// Markup contract of the sales-parameter rework in the studio page: the "분석 파라미터" panel, the 3D settings,
// the detailed-drawing button, the feature guide and the clean-up that went with it.
const assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('solar_pathfinder.html','utf8');
const guide=JSON.parse(fs.readFileSync('assets/pathfinder/feature-guide.json','utf8')).features;
const tagOf=id=>{const m=html.match(new RegExp('<[a-zA-Z0-9]+\\b[^>]*\\bid="'+id+'"[^>]*>'));return m?m[0]:null;};

// 1) Panel structure: every div is closed inside the accordion, the module box and the finance box are
//    siblings under param-body, and the equipment block is a full-width child of the module box.
const open='<details class="bg-white rounded-lg border border-slate-200 shadow-sm group mb-4 crystal-accordion">',from=html.indexOf(open);
assert.ok(from>0,'parameter accordion present');
const VOID=new Set(['input','br','hr','img','meta','link']),stack=[],parents={};let closedAt=-1;
for(const m of html.slice(from).matchAll(/<(\/?)([a-zA-Z0-9]+)\b([^>]*)>/g)){
  const [,closing,name,attrs]=m;
  if(!closing){
    const node={name,cls:(attrs.match(/\bclass="([^"]*)"/)||[])[1]||'',id:(attrs.match(/\bid="([^"]*)"/)||[])[1]||''};
    for(const key of [node.id,...node.cls.split(/\s+/)].filter(Boolean))if(!(key in parents))parents[key]=stack.map(n=>n.cls||n.name);
    if(!VOID.has(name)&&!attrs.endsWith('/'))stack.push(node);
    continue;
  }
  if(VOID.has(name))continue;
  assert.equal(stack.at(-1).name,name,'Unbalanced </'+name+'> after '+JSON.stringify(stack.at(-1)));stack.pop();
  if(!stack.length){closedAt=m.index;break;}
}
assert.ok(closedAt>0,'The accordion closes with every element inside it closed');
const parentOf=key=>(parents[key]||[]).at(-1)||'';
assert.match(parentOf('param-body'),/crystal-accordion/);assert.match(parentOf('bg-indigo-50'),/param-body/);
assert.match(parentOf('bg-green-50'),/param-body/,'The finance box is a sibling of the module box, not nested in it');
assert.match(parentOf('bg-white/60'),/bg-indigo-50/,'The equipment block spans the module box, not half a grid row');
for(const id of ['moduleSelect','inverterSelect','invCap','invPrice'])assert.ok(parents[id].some(c=>/bg-white\/60/.test(c)),id+' in the equipment block');
for(const id of ['modWidth','modHeight','modPower','installAngle','arrayStackRows','moduleOrient','layoutMarginPct'])assert.ok(parents[id].some(c=>/bg-indigo-50/.test(c))&&!parents[id].some(c=>/bg-green-50|bg-white\/60/.test(c)),id+' in the module box');
for(const id of ['modPrice','costPerKw','smp','pfInterestRate','pfRoofDefaultsBtn'])assert.ok(parents[id].some(c=>/bg-green-50/.test(c))&&!parents[id].some(c=>/bg-indigo-50/.test(c)),id+' in the finance box');
// The roof reference reset has an id so the mode defaults can hide it in land mode.
assert.match(tagOf('pfRoofDefaultsBtn'),/onclick="window\.applyRoofFinanceDefaults\(\)"/);
// The removed inputs are not in the page at all (also not hidden).
for(const id of ['setbackDist','rowSpacing','arraySideGap','sunAltitude','installHeight','arrayRows','arrayCols','equipDeductionInfo','form_price'])assert.equal(tagOf(id),null,id+' is removed');
assert.equal(tagOf('setbackRowBlock')!==null,true,'The ordinance 이격거리 result row is a different thing and stays');

// 2) 3D settings: flat roof by default, one margin slider, no dead controls.
const roofSelect=html.slice(html.indexOf('<select id="sim3dRoofTypeSel"'),html.indexOf('</select>',html.indexOf('<select id="sim3dRoofTypeSel"')));
assert.match(roofSelect,/<option value="flat" selected>평지붕/);assert.equal((roofSelect.match(/ selected/g)||[]).length,1);
for(const kind of ['gable','shed','mansard'])assert.ok(roofSelect.includes('<option value="'+kind+'">'),kind+' stays selectable');
assert.doesNotMatch(html,/\|\|\s*"gable"/,'No fallback picks a gable roof');assert.doesNotMatch(html,/\?"flat":"gable"/,'No size rule infers a gable roof');
const slider=tagOf('sim3dMarginSlider');assert.ok(slider);for(const attribute of ['type="range"','min="0"','max="40"','step="1"','value="10"','onchange="SolarSim3D.updateLayout()"'])assert.ok(slider.includes(attribute),attribute);
assert.ok(tagOf('sim3dMarginVal'));assert.match(html,/<span>이격 여유율<\/span><b id="sim3dMarginInfo">/);
for(const id of ['sim3dRowGapSlider','sim3dPanelGapSlider','sim3dRowGapVal','sim3dPanelGapVal','sim3dRowGap','sim3dGableCoverSel','sim3dGableCoverLabel','sim3dInvCapSel'])assert.equal(tagOf(id),null,id+' is removed');
assert.equal(html.includes('recommendSpacing'),false);assert.equal(html.includes('_sim3dRowGapManual'),false);assert.equal(html.includes('<span>행간 거리</span>'),false);
// The monitoring panel counts inverters with the studio's selected inverter, not the removed 3D select.
assert.match(html,/var invCap=parseFloat\(\(document\.getElementById\("invCap"\)\|\|\{\}\)\.value\)\|\|60;/);

// 3) Detailed drawing button: same handler, new label, the title names the exclusion zones.
const button=html.match(/<button\b[^>]*onclick="window\.openRoofLayoutTool\(\)"[^>]*>([^<]*)<\/button>/);
assert.ok(button);assert.equal(button[1],'✏️ 상세 그리기 (수동 배치)');assert.match(button[0],/title="[^"]*설치 제외\(제척\) 영역[^"]*"/);

// 4) Feature guide: the removed input is not a target and the texts describe the new parameter.
const targets=guide.flatMap(f=>f.steps.map(s=>s.target));
assert.equal(targets.includes('#rowSpacing'),false);assert.ok(targets.includes('#layoutMarginPct'));
const hardware=guide.find(f=>f.id==='hardware'),editor=guide.find(f=>f.id==='editor');
for(const step of hardware.steps)assert.ok(tagOf(step.target.slice(1)),step.target+' exists in the studio');
assert.match(hardware.steps.find(s=>s.target==='#layoutMarginPct').text,/이격 여유율\(%\).*기본 10%/);assert.match(hardware.steps[0].text,/크기·출력/);
assert.match(editor.steps[0].text,/상세 그리기 \(수동 배치\)/);assert.match(editor.steps.map(s=>s.text).join(' '),/설치 제외\(제척\) 영역/);
assert.ok(editor.aliases.includes('수동 배치')&&editor.aliases.includes('상세 그리기'));
assert.equal(JSON.stringify(guide).includes('앞뒤·좌우 간격'),false,'No guide text explains the removed gap inputs');

// 5) Clean-up: debug logs, dead helpers and the stale patch scripts that were served with the site.
assert.doesNotMatch(html,/console\.log\("\[report-fill\]/);
for(const dead of ['_syncArrayStackByOrient','_moduleOrientStackState','_getModuleOrientKey','_spStoreRoofCaptureForReport','_panelAzimuth','_equipDeduction','lastEquipDeduction','window.scanTarget ==='])assert.equal(html.includes(dead),false,dead);
assert.deepEqual(fs.readdirSync('.').filter(name=>/^phase_.*\.py$/.test(name)||name==='frontend_patch_8checks.js'),[],'Patch scripts are not published with the site');
console.log('PASS studio parameter markup: balanced panel with sibling module/finance boxes, removed distance inputs, flat roof default, one 3D margin slider, detailed-drawing button, feature guide and clean-up.');
