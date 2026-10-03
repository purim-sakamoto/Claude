/* 序盤の「新しく見えたもの」の時刻を出す（開発用）
   使い方: node tools/timeline_node.js [分] */
global.window = global;
var path = require('path');
var js = path.join(__dirname, '..', 'js');
['util.js', 'data.js', 'engine.js', 'sim.js'].forEach(function (f) { require(path.join(js, f)); });
var E = TM.Engine, D = TM.DATA; E.init();
var mins = +(process.argv[2] || 40);
var s = E.newState(), seen = {}, t = 0, nextThink = 0, last = 0;
function chk() {
  var news = [];
  D.buildings.forEach(function (b) { if ((E.bldShown || E.bldVisible)(s, b) && !seen['b' + b.id]) { seen['b' + b.id] = 1; news.push('設備:' + b.name); } });
  D.upgrades.forEach(function (u) { if ((E.upgShown || E.upgVisible)(s, u) && !seen['u' + u.id]) { seen['u' + u.id] = 1; news.push('改善:' + u.name); } });
  D.techs.forEach(function (x) { if ((E.techShown || E.techAvailable)(s, x) && !seen['t' + x.id]) { seen['t' + x.id] = 1; news.push('技術:' + x.name); } });
  D.jobs.forEach(function (j) { if (E.jobVisible(s, j) && !seen['j' + j.id]) { seen['j' + j.id] = 1; news.push('配属:' + j.name); } });
  for (var k in E.actions) { var a = E.actions[k]; if ((!a.vis || a.vis(s)) && !seen['a' + k]) { seen['a' + k] = 1; news.push('手:' + k); } }
  if (s.pop && !seen['p' + s.pop]) { seen['p' + s.pop] = 1; news.push('人' + s.pop); }
  if (news.length) { var mm = (t / 60).toFixed(1); console.log(mm + '分 (+' + ((t - last)).toFixed(0) + 's) era' + s.era + ' ¥' + s.res.money.toFixed(0) + '  ' + news.join(' / ')); last = t; }
}
while (t < mins * 60) {
  if (s.era === 0) { TM.Sim.botIntro(s); E.step(s, 0.5); t += 0.5; }
  else { if (t >= nextThink) { TM.Sim.think(s); nextThink = t + 8; } E.step(s, 1); t += 1; }
  chk();
}
