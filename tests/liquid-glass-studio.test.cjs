const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// Liquid glass in the design studio (assets/pathfinder/family-glass.css, audit liquid-glass-20261103 SPEC 3.4/3.7):
// the shared file is the last stylesheet, every map-floating surface and control carries its glass class, icon-only
// controls have names, and the studio's inline JS no longer paints dark or cyan surfaces over the glass.
const html=fs.readFileSync('solar_pathfinder.html','utf8');
const extract=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);assert(i>=0&&j>i,a);return html.slice(i,j);};

// 1) family-glass.css is mirrored and linked last.
const sheets=[...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(m=>m[0]);
assert.match(sheets.at(-1),/href="assets\/pathfinder\/family-glass\.css\?v=[0-9a-f]{16}"/,sheets.at(-1));
assert.ok(fs.existsSync('assets/pathfinder/family-glass.css'));
assert.ok(JSON.parse(fs.readFileSync('assets/pathfinder/manifest.json','utf8')).files['family-glass.css']);

// 2) Markup anchors and their classes.
const body=html.slice(html.indexOf('<body'));
const tagOf=needle=>{const i=body.indexOf(needle);assert.ok(i>=0,needle);const s=body.lastIndexOf('<',i);return body.slice(s,body.indexOf('>',i)+1);};
const has=(needle,classes)=>{const tag=tagOf(needle);for(const c of classes.split(' '))assert.ok(new RegExp('class="[^"]*(?<![\\w-])'+c+'(?![\\w-])').test(tag),needle+' needs '+c+': '+tag.slice(0,240));return tag;};
has('title-gradient','pf-glass');
has('settings-button-glass','pf-glass-btn pf-glass-btn--float');
has('glass-toolbar','pf-glass pf-glass--clear');
has('id="btnModeLand"','pf-glass-btn pf-glass-btn--ghost');has('id="btnModeRoof"','pf-glass-btn pf-glass-btn--ghost');
has('id="headerSim3dBtn"','pf-glass-btn');
has('address-glass','pf-glass');has('id="addrInput"','pf-glass-field');
assert.match(has('layer-button-glass','pf-glass-btn pf-glass-btn--icon pf-glass-btn--float'),/aria-label="지도 설정"/);
has('layer-menu-glass','pf-glass pf-glass--strong');has('id="reservoirSearchInput"','pf-glass-field');has('id="reservoirSearchResults"','pf-glass-well');
has('class="workspace-switch','pf-glass-btn pf-glass-btn--primary');
has('crystal-dpad','pf-glass');
for(const [dir,label] of [['up','위로 이동'],['left','왼쪽으로 이동'],['right','오른쪽으로 이동'],['down','아래로 이동']])
  assert.match(has(`window.dpadHoldStart('${dir}')`,'pf-glass-btn pf-glass-btn--icon'),new RegExp('aria-label="'+label+'"'));
for(const [dir,label] of [['rotL','왼쪽으로 회전'],['rotR','오른쪽으로 회전']])
  assert.match(has(`window.dpadHoldStart('${dir}')`,'pf-glass-btn pf-glass-btn--sm'),new RegExp('aria-label="'+label+'"'));
has('>Mov</div>','pf-glass-well');has('onclick="window.resetCalibration()"','pf-glass-btn pf-glass-btn--sm');
has('bottom-status-toggle-glass','pf-glass-btn pf-glass-btn--float pf-glass-btn--pill');
has('class="bottom-status-glass','pf-glass pf-glass--strong pf-glass--sheet');
has('onclick="window.clearLog','pf-glass-btn');
has('id="toastMsg"','pf-glass pf-glass--dark pf-glass--strong pf-glass--chip');
has('id="zoomIndicator"','pf-glass pf-glass--chip');
has('id="sidebar"','pf-glass pf-glass--modal');
assert.match(extract('<div class="pf-glass-seg grid grid-cols-2 gap-2">','</div>'),/id="bsModeLand"[\s\S]*id="bsModeRoof"/);
has('class="shadow-panel-inner','pf-glass pf-glass--strong');
assert.match(extract('<div class="pf-glass-seg flex gap-1 mb-2">','</div>'),/data-season="spring"[\s\S]*data-season="winter"/);
// Glass never sits on a backdrop root: no opacity/filter fades on the wrappers of floating glass.
for(const id of ['bottomStatusPanel','bottomStatusInner','floatingDpadWrapper'])assert.doesNotMatch(tagOf('id="'+id+'"'),/opacity|filter|clip-path/);

// 3) Inline JS: glass by class, layout only inline.
{ // #pfAddressProgress (J6)
  const s=extract("if(!progress){progress=document.createElement('div');","document.body.append(progress);}");
  assert.match(s,/progress\.className='pf-glass pf-glass--chip'/);assert.doesNotMatch(s,/background|color:white|border-radius/);
}
{ // #smartClickLoading (J7): run the real helper
  const made=[];const ctx={document:{getElementById:id=>id==='map'?{appendChild:e=>made.push(e)}:null,createElement:()=>({style:{},set innerHTML(v){this._html=v;},get innerHTML(){return this._html;}}),head:{appendChild(){}}}};
  vm.createContext(ctx);vm.runInContext(extract('function _ensureSmartClickLoader(){','function showSmartClickLoading(on){'),ctx);
  const el=ctx._ensureSmartClickLoader();
  assert.equal(el.className,'pf-glass pf-glass--chip');assert.doesNotMatch(el.style.cssText,/background|color:|box-shadow|border/);assert.match(el.style.cssText,/display:none/);
  assert.doesNotMatch(el.innerHTML,/opacity:\.7/);assert.match(el.innerHTML,/var\(--pf-glass-muted\)/);
}
{ // #mobileSolbiBtn (J8): run the real factory
  const ctx={document:{createElement:()=>({style:{}})},location:{}};vm.createContext(ctx);
  vm.runInContext(extract('  function makeBtn() {','  function tryInject() {')+';this.makeBtn=makeBtn;',ctx);
  const btn=ctx.makeBtn();
  assert.equal(btn.className,'pf-glass-btn');assert.doesNotMatch(btn.style.cssText,/22d3ee|background|border|transition/);
  assert.equal(btn.onmouseover,undefined);assert.equal(btn.onmouseout,undefined);
}
console.log('PASS studio liquid glass: family-glass.css linked last, every floating surface/control classed, D-Pad and layer button named, progress/loader/솔비 모바일 glass by class.');
