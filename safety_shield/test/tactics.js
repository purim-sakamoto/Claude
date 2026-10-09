// node safety_shield/test/tactics.js — 「待機(合図)+ライト」を1回ずつ入れただけのプランの勝率
const path = require('path');
require(path.join(__dirname, '../js/data.js'));
const SS = require(path.join(__dirname, '../js/sim.js'));
const w = (x, y, o) => Object.assign({ x, y, speed: '', roe: '', go: '', action: '' }, o || {});
const TACTICS = {
  3: [[w(13, 6, { go: 'A', action: 'light' })], [w(31, 10, { go: 'A', action: 'light' })]],
  4: [[w(15, 8, { go: 'A', action: 'light' }), w(16, 4)], [w(27, 8, { go: 'A', action: 'light' }), w(27, 3)]],
  5: [[w(12, 8, { go: 'A', action: 'light' }), w(15, 5)], [w(25, 8, { go: 'A', action: 'light' }), w(25, 5)]],
};
const N = +(process.argv[2] || 30);
for (const def of SS.STAGES) {
  if (!TACTICS[def.id]) continue;
  const st = SS.parseStage(def);
  const plan = SS.defaultPlan(def);
  plan.teams[0].wps = TACTICS[def.id][0];
  plan.teams[1].wps = TACTICS[def.id][1];
  plan.teams = plan.teams.filter(t => t.members.length);
  plan.teams.forEach(t => SS.planPaths(st, t, plan.kits).forEach((l, i) => { if (!l) console.log(`  ! ${t.id} wp${i + 1} unreachable`); }));
  const tally = {};
  for (let seed = 1; seed <= N; seed++) { const r = SS.runToEnd(st, plan, seed).result; tally[r.rank] = (tally[r.rank] || 0) + 1; }
  console.log(`stage ${def.id} 合図+ライト: 成功 ${N - (tally.D || 0)}/${N} ${JSON.stringify(tally)}`);
}
