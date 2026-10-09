// node safety_shield/test/validate.js
// 全ステージのマップ整合性・到達可能性を検査し、サンプルプランで最後まで回す
const path = require('path');
require(path.join(__dirname, '../js/data.js'));
const SS = require(path.join(__dirname, '../js/sim.js'));

let errors = 0;
const fail = msg => { errors++; console.error('NG', msg); };

for (const def of SS.STAGES) {
  let st;
  try { st = SS.parseStage(def); } catch (e) { fail(e.message); continue; }
  const used = new Set();
  for (const e of Object.values(def.enemies)) (e.route || '').split('').forEach(c => used.add(c));
  for (const e of Object.values(def.enemies)) if (e.at) used.add(e.at);
  for (const p of Object.keys(st.points)) if (!used.has(p)) fail(`stage ${def.id}: point ${p} unused`);
  if (st.entries.length !== def.entries.length) fail(`stage ${def.id}: entries ${st.entries.length} vs names ${def.entries.length}`);
  for (const k of Object.keys(def.hazards)) if (!st.hazards.find(h => h.id === k)) fail(`stage ${def.id}: hazard ${k} not on map`);
  // 進入口0から(合鍵あり)全地点に到達できるか
  const e0 = st.entries[0];
  // 不安全箇所: 到達できる床から3マス以内で見えればよい(設備の中にあるもの)
  for (const h of st.hazards) {
    let ok = false;
    for (let dy = -3; dy <= 3 && !ok; dy++) for (let dx = -3; dx <= 3 && !ok; dx++) {
      const x = h.x + dx, y = h.y + dy;
      if (SS.tileAt(st, st.tiles, x, y) !== SS.TILE.FLOOR) continue;
      if (!SS.findPath(st, st.tiles, e0.x, e0.y, x, y, true)) continue;
      if (SS.los(st, st.tiles, x + 0.5, y + 0.5, h.x + 0.5, h.y + 0.5)) ok = true;
    }
    if (!ok) fail(`stage ${def.id}: hazard ${h.id} not observable`);
  }
  const targets = [...st.enemies, ...Object.values(st.points), ...st.entries];
  for (const t of targets) {
    const p = SS.findPath(st, st.tiles, e0.x, e0.y, t.x, t.y, true);
    if (!p) fail(`stage ${def.id}: ${t.id || t.name || JSON.stringify(t)} unreachable`);
  }
  // 敵の巡回経路(合鍵なし)
  for (const en of st.enemies) {
    let cur = en;
    for (const p of en.route) {
      if (!SS.findPath(st, st.tiles, cur.x, cur.y, p.x, p.y, false)) fail(`stage ${def.id}: enemy ${en.id} cannot reach route point`);
      cur = p;
    }
  }
  // 全員突入の単純プランで最後まで回るか
  const plan = {
    kits: {},
    teams: [
      { id: 'red', members: ['onizuka', 'ishizaki', 'hanashiro', 'sorachi'], entry: 0, speed: 'walk', roe: 'assault',
        wps: st.hazards.slice(0, 4).map(h => ({ x: h.x, y: h.y, speed: 'walk', roe: 'assault', go: '', action: '' })) },
      { id: 'green', members: ['kageyama', 'takahashi', 'yanami', 'miura'], entry: st.entries.length - 1, speed: 'sneak', roe: 'infil',
        wps: st.hazards.slice(4).map(h => ({ x: h.x, y: h.y, speed: 'sneak', roe: 'infil', go: '', action: '' })) },
    ],
  };
  const results = [];
  for (let seed = 1; seed <= 5; seed++) {
    const S = SS.runToEnd(st, plan, seed);
    if (!S.over) fail(`stage ${def.id}: did not end`);
    results.push(`${S.result.rank}(${S.result.recorded}/${S.result.total} t=${S.result.t} out=${S.result.outs}${S.result.alarm ? ' alarm' : ''})`);
  }
  console.log(`stage ${def.id} ${def.name}: hazards=${st.hazards.length} enemies=${st.enemies.length} -> ${results.join(' ')}`);
}
if (errors) { console.error(`${errors} error(s)`); process.exit(1); }
console.log('OK');
