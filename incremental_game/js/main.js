/* 起動・ループ・保存・留守中の進行・エンディング */
(function () {
  var TM = window.TM, E = TM.Engine, U = TM.util;
  E.init(); TM.War.init();
  TM.UI.init();
  TM.Dev.init();

  var storageOk = true;
  try { localStorage.setItem('taiki-minigame-test', '1'); localStorage.removeItem('taiki-minigame-test'); } catch (e) { storageOk = false; }

  var s = E.load();
  var report = null;
  if (s) {
    /* 経過時間はこのPCの時計で数える。進んでいればそのまま、戻っていれば何もしない */
    var nowMs = Date.now(), away = Math.max(0, (nowMs - (s.saved || nowMs)) / 1000);
    E.boostGrant(s, nowMs);
    if (away > 60 && s.era >= 1 && !s.ending) {
      var before = U.deepCopy(s.res);
      var r = E.simulateAway(s, away, E.boostOverlap(s, s.saved, nowMs));
      report = { away: away, sim: r.simulated, before: before };
    }
  } else {
    s = E.newState();
  }
  TM.state = s;
  if (!storageOk) E.addLog(s, '（この環境ではセーブができない。設定から書き出しておくと安心。）', 'dim');

  function showReport(rep) {
    var st = TM.state, rows = '', k;
    var list = [];
    for (k in st.res) {
      var diff = st.res[k] - (rep.before[k] || 0);
      if (Math.abs(diff) > 0.5 && st.flags['r_' + k]) list.push([k, diff]);
    }
    list.sort(function (a, b) { return a[0] === 'money' ? -1 : b[0] === 'money' ? 1 : 0; });
    list.slice(0, 14).forEach(function (x) {
      rows += '<tr><td>' + E.resName(st, x[0]) + '</td><td class="' + (x[1] >= 0 ? 'good' : 'bad') + '">' + (x[1] >= 0 ? '+' : '') + U.fmt(x[1], st.settings.expo) + '</td></tr>';
    });
    TM.UI.openModal('<h2>留守中の記録</h2><p class="note">留守にしていた時間：' + U.fmtTime(rep.away) + '（進んだのは ' + U.fmtTime(rep.sim) + ' ぶん。12時間までは全部、そこから72時間までは4分の1の速さで進む）</p>' +
      '<table class="t">' + rows + '</table><div class="sect" style="text-align:right"><button class="btn" data-a="close">続ける</button></div>');
  }
  if (report && report.away > 120) showReport(report);

  /* ---- ループ ---- */
  var last = Date.now(), saveTimer = 0;
  function loop() {
    var now = Date.now();
    var real = Math.max(0, (now - last) / 1000), last0 = last; last = now;
    var st = TM.state;
    E.boostGrant(st, now);
    if (st.ending === 1 || st.ending === 2) { TM.UI.render(); return; }
    if (real > 120 && st.era >= 1) {
      /* スリープ復帰など：留守扱い */
      var before = U.deepCopy(st.res);
      var r = E.simulateAway(st, real, E.boostOverlap(st, last0, now));
      showReport({ away: real, sim: r.simulated, before: before });
    } else {
      var dt = real * TM.speed * (now < E.boostState(st).to ? 2 : 1);
      var stepSec = TM.speed >= 1000 ? 5 : TM.speed > 1 ? 1 : real > 2 ? 1 : 0.2;
      var n = Math.min(2000, Math.ceil(dt / stepSec));
      for (var i = 0; i < n; i++) { TM.Dev.tick(st); E.step(st, dt / n); }
    }
    TM.UI.render();
    saveTimer += real;
    if (saveTimer > 30) { saveTimer = 0; E.save(st); }
  }
  setInterval(loop, 200);
  TM.UI.render(true);

  document.addEventListener('visibilitychange', function () { if (document.hidden) E.save(TM.state); else last = Date.now() - 200 + Math.min(0, 0); });
  window.addEventListener('beforeunload', function () { E.save(TM.state); });
  window.addEventListener('pagehide', function () { E.save(TM.state); });

  /* ---- エンディング ---- */
  TM.UIEnding = function (st) {
    var box = document.getElementById('ending');
    if (st.ending === 1 && box.getAttribute('data-st') !== '1') {
      box.setAttribute('data-st', '1'); box.classList.remove('hidden');
      box.innerHTML = '<div class="line fade">暗い。</div><div><button class="btn fade" id="end_sink">沈める</button></div>';
      document.getElementById('end_sink').onclick = function () { st.ending = 2; E.save(st); TM.UIEnding(st); };
    }
    if (st.ending === 2 && box.getAttribute('data-st') !== '2') {
      box.setAttribute('data-st', '2'); box.classList.remove('hidden');
      var days = (Date.now() - st.started) / 86400000;
      var lines = ['泡が立つ。', '星が、細くなっていく。', '液が、うすい緑に染まった。', '', '―――', '',
        'タイキ薬品工業　ミニゲーム', '', '遊んでくれて、ありがとうございました。', '',
        '遊び始めてから　' + days.toFixed(1) + '日', '稼いだお金　' + U.fmt(st.stats.earned) + '円', '売った缶　' + U.fmt(st.stats.cansSold) + '缶',
        '洗った缶　' + U.fmt(st.stats.washed) + '缶', '逃がした水素　' + U.fmt(st.stats.h2) + 'kg'];
      box.innerHTML = '<div class="credits">' + lines.map(function (l) { return '<div class="fade">' + (l || '&nbsp;') + '</div>'; }).join('') + '</div>' +
        '<div style="margin-top:20px"><button class="btn" id="end_cont">このまま眺める</button> <button class="btn" id="end_new">はじめから</button></div>';
      document.getElementById('end_cont').onclick = function () { st.ending = 3; box.classList.add('hidden'); E.save(st); };
      document.getElementById('end_new').onclick = function () {
        if (!confirm('セーブを消して、はじめから遊びますか？')) return;
        E.wipe(); TM.state = E.newState(); box.classList.add('hidden'); box.removeAttribute('data-st'); TM.UI.resetSig();
      };
    }
  };
})();
