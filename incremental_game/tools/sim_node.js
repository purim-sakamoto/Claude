/* Node でバランスシミュレーションを回す（開発用）
   使い方: node tools/sim_node.js [heavy|normal|light] [最大日数] */
global.window = global;
var path = require('path');
var js = path.join(__dirname, '..', 'js');
['util.js', 'data.js', 'data_late.js', 'engine.js', 'war.js', 'sim.js'].forEach(function (f) { require(path.join(js, f)); });
TM.Engine.init(); TM.War.init();

var style = process.argv[2] || 'normal';
var days = +(process.argv[3] || 16);
var verbose = process.argv.indexOf('-v') >= 0;
var lastDay = -1;
var t0 = Date.now();
var r = TM.Sim.run(style, days, {
  onProgress: function (real, s) {
    var day = Math.floor(real / 86400);
    if (verbose && day !== lastDay) {
      lastDay = day;
      var d = s._d || {};
      console.log('day', day, 'era', s.era, 'money', s.res.money.toExponential(2), 'pop', s.pop, 'research', (s.res.research || 0).toExponential(2),
        'circ', (d.circ || 0).toFixed(2), 'income/s', (d.income || 0).toExponential(2));
    }
  }
});
function h(sec) { return sec === undefined ? '-' : (sec / 3600).toFixed(1) + 'h (' + (sec / 86400).toFixed(2) + 'd)'; }
console.log('style', r.style, 'elapsed', ((Date.now() - t0) / 1000).toFixed(1) + 's');
Object.keys(r.milestones).forEach(function (k) { console.log('  ', k, h(r.milestones[k])); });
var s = r.state;
console.log('final era', s.era, 'money', s.res.money.toExponential(2), 'pop', s.pop, 'forced', s.stats.forced || 0);
if (verbose) {
  var b = []; for (var k in s.bld) if (s.bld[k].n) b.push(k + ':' + s.bld[k].n);
  console.log(b.join(' '));
  console.log('techs', Object.keys(s.techs).length, '/', TM.DATA.techs.length);
}
