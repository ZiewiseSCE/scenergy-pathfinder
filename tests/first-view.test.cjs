'use strict';
// The studio's first map view (owner, 2026-11-22: "처음 접속하면 … 전국지도가 딱 보이게 … 8이 좋겠다"): the whole country
// at zoom 8 on a PC, 7 on a phone-width screen where 8 would show only part of it.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'solar_pathfinder.html'), 'utf8');
const views = html.match(/L\.map\("map", \{[^}]*\}\)\.setView\(\[([\d.]+), ([\d.]+)\], ([^;]+)\);/g) || [];
assert.equal(views.length, 1, 'one first view');
const [, lat, lng, zoomExpr] = views[0].match(/setView\(\[([\d.]+), ([\d.]+)\], ([^;]+)\);$/);
assert.deepEqual([Number(lat), Number(lng)], [36.5, 127.5], 'centred on the country');
const zoomAt = width => Function('window', 'return ' + zoomExpr.replace(/\)$/, ''))({ innerWidth: width });
assert.equal(zoomAt(1920), 8, 'PC: zoom 8');
assert.equal(zoomAt(1280), 8);
assert.equal(zoomAt(768), 8);
assert.equal(zoomAt(390), 7, 'phone width: zoom 7');
assert.equal(zoomAt(0), 8, 'unknown width: PC');
console.log('PASS first view: the whole country at zoom 8 (phone width 7)');
