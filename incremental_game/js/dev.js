/* 開発者モード（パスワード 1234）。※画面上の簡易な鍵で、セキュリティのためのものではない */
var TM = window.TM = window.TM || {};

TM.Dev = (function () {
  var E = TM.Engine, U = TM.util;
  var PASS = '1234';
  var on = false;
  TM.speed = 1;
  TM.infMoney = false;

  function ask() {
    TM.UI.openModal('<h2>開発者モード</h2><p class="note">パスワードを入れてください。</p><input type="password" id="dv_pw" autocomplete="off"><div class="sect" style="text-align:right"><button class="mini" id="dv_ok">入る</button> <button class="mini" data-a="close">やめる</button></div>', function (b) {
      var inp = b.querySelector('#dv_pw'); inp.focus();
      function go() {
        if (inp.value === PASS) { TM.UI.closeModal(); enable(); }
        else { inp.value = ''; inp.placeholder = 'ちがいます'; }
      }
      b.querySelector('#dv_ok').onclick = go;
      inp.onkeydown = function (e) { if (e.key === 'Enter') go(); };
    });
  }

  function enable() {
    on = true;
    try { localStorage.setItem('taiki-minigame-dev', '1'); } catch (e) { /* 無視 */ }
    draw();
  }
  function disable() {
    on = false; TM.speed = 1; TM.infMoney = false;
    try { localStorage.removeItem('taiki-minigame-dev'); } catch (e) { /* 無視 */ }
    document.getElementById('devpanel').classList.add('hidden');
  }

  function draw() {
    var p = document.getElementById('devpanel');
    p.classList.remove('hidden');
    var sp = [1, 10, 100, 1000, 10000].map(function (x) { return '<button data-dv="speed" data-v="' + x + '" class="' + (TM.speed === x ? 'on' : '') + '">×' + x + '</button>'; }).join('');
    p.innerHTML = '<h4>開発者モード</h4>' +
      '<div>速度 ' + sp + '</div>' +
      '<div><button data-dv="money" class="' + (TM.infMoney ? 'on' : '') + '">お金無限 ' + (TM.infMoney ? 'ON' : 'OFF') + '</button>' +
      '<button data-dv="add" data-v="1e4">+1万円</button><button data-dv="add" data-v="1e6">+100万円</button><button data-dv="add" data-v="1e8">+1億円</button></div>' +
      '<div><button data-dv="fill">資源を満タン</button><button data-dv="research">技術+大量</button></div>' +
      '<div>時間を進める <button data-dv="skip" data-v="600">+10分</button><button data-dv="skip" data-v="3600">+1時間</button><button data-dv="skip" data-v="28800">+8時間</button></div>' +
      '<div><button data-dv="pop">人手+10</button><button data-dv="techs">技術を全部</button><button data-dv="era">次の時代へ</button><button data-dv="reveal">全部見せる</button></div>' +
      '<div>自動プレイで計測 <button data-dv="sim" data-v="heavy">ヘビー</button><button data-dv="sim" data-v="normal">ふつう</button><button data-dv="sim" data-v="light">ライト</button></div>' +
      '<div><button data-dv="dump">状態をコピー</button><button data-dv="off">終了</button></div>' +
      '<pre id="dv_out"></pre>';
  }

  function onClick(e) {
    var t = e.target.closest('[data-dv]'); if (!t || !on) return;
    var a = t.getAttribute('data-dv'), v = t.getAttribute('data-v');
    var s = TM.state, d = E.derive(s);
    var out = document.getElementById('dv_out');
    switch (a) {
      case 'speed': TM.speed = +v; break;
      case 'money': TM.infMoney = !TM.infMoney; break;
      case 'add': s.res.money += +v; break;
      case 'fill':
        for (var k in s.res) { if (d.cap[k] !== undefined && d.cap[k] !== Infinity) s.res[k] = d.cap[k]; }
        s.res.money = Math.max(s.res.money, 1e6 * Math.pow(100, s.era));
        break;
      case 'research': s.res.research += Math.max(1000, (s.res.research || 0)) * 100; if (d.cap.research !== Infinity) s.res.research = Math.max(s.res.research, 0); break;
      case 'skip': out.textContent = '計算中…'; setTimeout(function () { var r = E.simulateAway(s, +v); document.getElementById('dv_out').textContent = U.fmtTime(r.simulated) + ' 進めました'; TM.UI.resetSig(); }, 10); break;
      case 'pop': s.pop += 10; break;
      case 'techs': TM.DATA.techs.forEach(function (t2) { if (!s.techs[t2.id]) { s.techs[t2.id] = true; if (t2.setFlag) s.flags[t2.setFlag] = true; } }); break;
      case 'era':
        if (s.era === 0) { s.bld.kama.n = 1; s.era = 1; s.flags.hired = true; s.pop = Math.max(s.pop, 3); s.flags.kama_reveal = true; }
        else {
          var mega = null; TM.DATA.buildings.forEach(function (b) { if (b.stages && b.onComplete && b.onComplete.era === s.era + 1) mega = b; });
          if (mega) {
            TM.DATA.techs.forEach(function (t3) { if ((t3.era || 0) <= s.era && !s.techs[t3.id]) { s.techs[t3.id] = true; if (t3.setFlag) s.flags[t3.setFlag] = true; } });
            /* 大型設備を完成させたことにする（条件は無視） */
            s.bld[mega.id].n = mega.stages;
            var oc = mega.onComplete || {};
            if (oc.era !== undefined && s.era < oc.era) { s.era = oc.era; s.stats.at['era' + oc.era] = s.t; if (TM.War) TM.War.onEra(s); }
            if (oc.ending) { s.ending = 1; s.stats.ended = 1; }
            s.res.money = Math.max(s.res.money, 10 * (E.cost(s, mega).money || 0));
            E.addLog(s, '（開発者モード）' + mega.name + 'を完成させた。', 'dim');
          } else if (s.era === 10 && TM.War) {
            /* 星図：敵の母星を落としたことにする */
            var w = TM.War.ensure(s); w.sys.cap.owner = 'us'; s.era = 11; s.stats.at.era11 = s.t; TM.War.onEra(s);
          }
        }
        TM.UI.resetSig(); break;
      case 'reveal':
        TM.DATA.buildings.forEach(function (b) { if (E.cond(s, b.unlock)) s.shown['b:' + b.id] = -1e9; });
        TM.DATA.upgrades.forEach(function (u) { if (E.cond(s, u.unlock)) s.shown['u:' + u.id] = -1e9; });
        TM.DATA.techs.forEach(function (t4) { s.shown['t:' + t4.id] = -1e9; });
        ['hook', 'memo', 'research_known', 'cans_known', 'dcan_known', 'smoke', 'power_known', 'acid_known', 'fecl2_known', 'space_tight'].forEach(function (fl) { s.flags[fl] = true; }); TM.UI.resetSig(); break;
      case 'sim':
        out.textContent = '自動プレイ中…（数十秒〜数分かかります）';
        setTimeout(function () {
          var t0 = Date.now(), r = TM.Sim.run(v, 16);
          var lines = [r.style + '（' + ((Date.now() - t0) / 1000).toFixed(0) + '秒で計算）'];
          Object.keys(r.milestones).forEach(function (k) { lines.push(k + '：' + (r.milestones[k] / 3600).toFixed(1) + '時間（' + (r.milestones[k] / 86400).toFixed(2) + '日）'); });
          if (!r.milestones.ending) lines.push('16日でエンディングに届かず（時代' + r.state.era + '）');
          document.getElementById('dv_out').textContent = lines.join('\n');
        }, 30);
        break;
      case 'dump':
        try { navigator.clipboard.writeText(E.exportText(s)); out.textContent = 'セーブ文字列をコピーしました'; } catch (e2) { out.textContent = E.exportText(s); }
        break;
      case 'off': disable(); return;
    }
    var keep = document.getElementById('dv_out').textContent;
    draw();
    document.getElementById('dv_out').textContent = keep;
  }

  function init() {
    document.getElementById('devpanel').addEventListener('click', onClick);
    try { if (localStorage.getItem('taiki-minigame-dev') === '1') enable(); } catch (e) { /* 無視 */ }
  }

  /* 毎ティック：お金無限 */
  function tick(s) { if (on && TM.infMoney) s.res.money = Math.max(s.res.money, 1e15 * Math.pow(1e6, Math.max(0, s.era - 3))); }

  return { ask: ask, init: init, tick: tick, isOn: function () { return on; } };
})();
