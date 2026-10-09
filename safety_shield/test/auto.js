// node safety_shield/test/auto.js — 地点を置かずに「実行」だけ押した場合の勝率
const path = require('path');
require(path.join(__dirname, '../js/data.js'));
const SS = require(path.join(__dirname, '../js/sim.js'));
const N = +(process.argv[2] || 30);
const out = {};
for (const def of SS.STAGES) {
  const st = SS.parseStage(def);
  const plan = SS.defaultPlan(def);
  plan.teams = plan.teams.filter(t => t.members.length);
  const tally = {}; let t = 0;
  const reasons = {};
  for (let seed = 1; seed <= N; seed++) {
    const S = SS.runToEnd(st, plan, seed);
    tally[S.result.rank] = (tally[S.result.rank] || 0) + 1;
    t += S.result.t;
    if (!S.result.success) reasons[S.result.reason] = (reasons[S.result.reason] || 0) + 1;
  }
  const win = N - (tally.D || 0);
  out[def.id] = win / N;
  console.log(`stage ${def.id} ${def.name}: 成功 ${win}/${N} ${JSON.stringify(tally)} 平均${(t / N).toFixed(0)}秒 ${JSON.stringify(reasons)}`);
}
module.exports = out;
