// node safety_shield/test/balance.js  — 手書きの「まともなプラン」で各面が攻略可能か確認する
const path = require('path');
require(path.join(__dirname, '../js/data.js'));
const SS = require(path.join(__dirname, '../js/sim.js'));
const w = (x, y, o) => Object.assign({ x, y, speed: '', roe: '', go: '', action: '' }, o || {});
const RED = ['onizuka', 'ishizaki', 'hanashiro', 'sorachi'];
const GREEN = ['kageyama', 'takahashi', 'yanami', 'miura'];
const PLANS = {
  1: { kits: {}, teams: [
    { id: 'red', members: RED, entry: 0, speed: 'walk', roe: 'infil', wps: [w(3, 7), w(4, 3), w(4, 11), w(7, 13), w(5, 16), w(7, 18), w(20, 15)] },
    { id: 'green', members: GREEN, entry: 1, speed: 'sneak', roe: 'infil', wps: [w(17, 19), w(28, 18), w(30, 16), w(31, 20), w(19, 12), w(12, 7), w(31, 3)] } ] },
  2: { kits: {}, teams: [
    { id: 'red', members: RED, entry: 0, speed: 'sneak', roe: 'infil', wps: [w(3, 5), w(4, 12), w(4, 17), w(5, 19), w(14, 18), w(16, 14)] },
    { id: 'green', members: GREEN, entry: 1, speed: 'sneak', roe: 'infil', wps: [w(33, 2), w(25, 1), w(11, 1), w(9, 6), w(15, 6), w(28, 12), w(27, 15), w(27, 19)] } ] },
  3: { kits: {}, teams: [
    { id: 'red', members: RED, entry: 0, speed: 'sneak', roe: 'infil', wps: [w(4, 5), w(5, 12), w(4, 17), w(12, 15), w(13, 16)] },
    { id: 'green', members: GREEN, entry: 1, speed: 'sneak', roe: 'infil', wps: [w(30, 19), w(26, 18), w(25, 13), w(27, 10), w(32, 8), w(31, 3), w(12, 6)] } ] },
  4: { kits: { miura: 'key', yanami: 'light' }, teams: [
    { id: 'red', members: RED, entry: 0, speed: 'sneak', roe: 'infil', wps: [w(15, 8, { go: 'A', action: 'light' }), w(16, 4, { roe: 'assault', speed: 'run' }), w(16, 9, { roe: 'infil', speed: 'walk' }), w(5, 8), w(4, 4, { roe: 'assault' }), w(5, 9, { roe: 'infil' }), w(5, 13), w(4, 18), w(3, 20), w(16, 20), w(16, 14), w(24, 16), w(28, 17)] },
    { id: 'green', members: GREEN, entry: 1, speed: 'sneak', roe: 'infil', wps: [w(33, 10), w(27, 8, { go: 'A', action: 'light' }), w(27, 3, { roe: 'assault', speed: 'run' }), w(28, 9, { roe: 'infil', speed: 'sneak' }), w(28, 13), w(29, 17), w(27, 20)] } ] },
  5: { kits: { yanami: 'light', miura: 'key' }, teams: [
    { id: 'red', members: RED, entry: 0, speed: 'sneak', roe: 'infil', wps: [w(4, 9), w(12, 8, { go: 'A', action: 'light' }), w(15, 5, { roe: 'assault', speed: 'run' }), w(15, 3, { roe: 'infil' }), w(12, 8), w(4, 8), w(4, 4), w(4, 10), w(5, 13), w(4, 17), w(5, 20), w(13, 20), w(14, 15)] },
    { id: 'green', members: GREEN, entry: 1, speed: 'sneak', roe: 'infil', wps: [w(33, 10), w(27, 12), w(30, 14), w(30, 17), w(27, 11), w(25, 7), w(27, 4), w(22, 4, { go: 'A', action: 'light' }), w(18, 5, { roe: 'assault', speed: 'run' }), w(20, 9, { roe: 'infil' }), w(19, 12), w(21, 15), w(21, 18)] } ] },
};
const only = process.argv[2] ? +process.argv[2] : null;
for (const def of SS.STAGES) {
  if (only && def.id !== only) continue;
  const st = SS.parseStage(def);
  const plan = PLANS[def.id];
  plan.teams.forEach(t => SS.planPaths(st, t, plan.kits).forEach((l, i) => { if (!l) console.log(`  ! ${t.id} wp${i + 1} unreachable`); }));
  const tally = {};
  const rows = [];
  for (let seed = 1; seed <= 20; seed++) {
    const S = SS.runToEnd(st, plan, seed);
    const r = S.result;
    tally[r.rank] = (tally[r.rank] || 0) + 1;
    if (seed <= 4) rows.push(`${r.rank} ${r.recorded}/${r.total} t=${r.t} out=${r.outs}${r.alarm ? ' ALARM@' + S.alarmT : ''} ${r.success ? '' : r.reason}`);
    if (seed === +(process.argv[4] || 1) && process.argv[3]) console.log(S.log.map(l => `${l.t.toFixed(1)} ${l.text}`).join('\n'));
  }
  console.log(`stage ${def.id}: ${JSON.stringify(tally)}`);
  rows.forEach(r => console.log('   ' + r));
}
