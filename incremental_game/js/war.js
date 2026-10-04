/* 戦争（時代9〜10）の計算。画面には触れない。
   時代9「兵站」：4つの前線へ物資を送る。補給が足りた前線は押し返し、足りないと押し込まれる。
   時代10「戦略」：ドックで艦を造り、星図の上で艦隊を動かして星系を取る。敵の母星を落とせば終わる。 */
var TM = window.TM = window.TM || {};

TM.War = (function () {
  var E = TM.Engine, D, W;
  var RES4 = ['w_fuel', 'w_cool', 'w_armor', 'w_water'];

  function init() { D = TM.DATA; W = D.war; }

  function fresh(s) {
    if (!W) init();
    var w = { fronts: {}, sys: {}, moves: [], queue: [], raidT: W.raidSec, log: [], bonus: 0, seq: 0, lift: 0, upkeepMul: 1, started: s.t };
    W.fronts.forEach(function (f) { w.fronts[f.id] = { pos: W.frontStart, prio: 1, won: false, r: 0 }; });
    W.systems.forEach(function (x) { w.sys[x.id] = { owner: x.owner, def: x.def || 0, base: x.def || 0, str: 0, battle: null }; });
    return w;
  }
  function ensure(s) { if (!s.war || !s.war.fronts) s.war = fresh(s); if (!W) init(); return s.war; }
  function wlog(s, text, cls) {
    var w = ensure(s);
    w.log.unshift({ t: s.t, text: text, cls: cls || '' });
    if (w.log.length > 40) w.log.length = 40;
  }

  function onEra(s) {
    if (s.era < 9) return;
    var w = ensure(s);
    if (s.era === 9) { w.started9 = s.t; wlog(s, '前線が4つできた。物資を送れ。', 'warn'); }
    if (s.era === 10) { w.sys.sol.str += 20; wlog(s, '造船所が完成した。太陽系に艦隊を集める。', 'warn'); }
    if (s.era === 11) wlog(s, '敵の母星が落ちた。停戦。', 'warn');
  }

  function frontsWon(s) {
    var w = s.war; if (!w || !w.fronts) return false;
    for (var k in w.fronts) if (!w.fronts[k].won) return false;
    return true;
  }

  /* 前線1つが1秒に要る物資（押し込むほど、たくさん要る） */
  function frontNeed(s, f, st) {
    var out = {}, sc = (W.needScale || 1) * (1 + st.pos / 25);
    for (var k in f.need) out[k] = f.need[k] * sc;
    return out;
  }

  /* ================= 1ティック ================= */
  function step(s, d, dt) {
    var w = ensure(s);
    var m = d.m || {};
    /* 細かく刻む（留守中は大きな刻みで来るので） */
    var n = Math.max(1, Math.ceil(dt / 5)), h = dt / n;
    for (var i = 0; i < n; i++) {
      if (s.era === 9) stepFronts(s, d, w, h, m);
      if (s.era >= 10) stepStrategy(s, d, w, h, m);
    }
  }

  function stepFronts(s, d, w, dt, m) {
    var glob = d.glob || 1;
    var lift = E.sumEffect(s, 'wlift') * (1 + (m.wlift || 0)) * glob;
    var load = E.sumEffect(s, 'wload') * glob;
    var cap = Math.min(lift, load);
    w.lift = lift; w.load = load; w.cap = cap;
    var depot = Math.min(0.5, 0.1 * E.sumEffect(s, 'wbuf'));
    /* 送る量を、重点の重みと必要量で配る */
    var act = W.fronts.filter(function (f) { return !w.fronts[f.id].won; });
    var wsum = 0, needs = {};
    act.forEach(function (f) { var st = w.fronts[f.id], nd = frontNeed(s, f, st), tot = 0; for (var k in nd) tot += nd[k]; needs[f.id] = { nd: nd, tot: tot }; wsum += tot * st.prio; });
    var lost = false;
    act.forEach(function (f) {
      var st = w.fronts[f.id], N = needs[f.id];
      var share = wsum > 0 ? cap * N.tot * st.prio / wsum : 0;
      /* 船に積める量の範囲で、物資ごとに必要量の割合で積む */
      var f1 = Math.min(1, share / Math.max(1e-9, N.tot));
      var minR = 1, sumR = 0, cnt = 0;
      for (var k in N.nd) {
        var want = N.nd[k] * f1 * dt;
        var got = Math.min(want, Math.max(0, s.res[k]));
        s.res[k] -= got;
        if (d.ledf) d.ledf(k, f.name, -got);
        var r = N.nd[k] > 0 ? got / (N.nd[k] * dt) : 1;
        minR = Math.min(minR, r); sumR += r; cnt++;
      }
      var r0 = cnt ? 0.5 * (sumR / cnt) + 0.5 * minR : 0;
      var rEff = Math.min(1.2, r0 * (1 + depot));
      st.r = st.r + (rEff - st.r) * Math.min(1, dt / 30);
      var hold = W.frontHold;
      /* 押し込まれるのは、押し返すよりゆっくり。始まって1時間は相手も様子を見ている */
      var grace = s.t - (w.started9 || 0) < 3600;
      if (rEff >= hold || !grace) st.pos += W.frontSpeed * (rEff - hold) / (1 - hold) * dt * (rEff >= hold ? 1 : 0.3);
      if (st.pos <= 0) { st.pos = 0; lost = true; if (!st.fell) { st.fell = true; wlog(s, f.name + 'が押し込まれた。工場の生産が落ちる。', 'bad'); } }
      else if (st.pos > 15) st.fell = false;
      if (st.pos >= 100) {
        st.pos = 100; st.won = true; s.flags.front_won = true;
        wlog(s, f.name + 'を押し返した。', 'good');
        E.addLog(s, f.name + 'を押し返した。', 'story');
        w.bonus += 0.05;
      }
    });
    w.fall = lost;
    if (frontsWon(s) && !s.flags.fronts_all) { s.flags.fronts_all = true; wlog(s, '4つの前線をすべて押し返した。反攻の準備を。', 'good'); }
  }

  /* ================= 星図 ================= */
  var ADJ = null;
  function adj() {
    if (ADJ) return ADJ;
    ADJ = {}; W.systems.forEach(function (x) { ADJ[x.id] = []; });
    W.lanes.forEach(function (l) { ADJ[l[0]].push(l[1]); ADJ[l[1]].push(l[0]); });
    return ADJ;
  }
  function sysDef(id) { for (var i = 0; i < W.systems.length; i++) if (W.systems[i].id === id) return W.systems[i]; return null; }
  function dist(a, b) { var A = sysDef(a), B = sysDef(b); return Math.sqrt((A.x - B.x) * (A.x - B.x) + (A.y - B.y) * (A.y - B.y)); }
  function laneTime(a, b) { return W.laneSec * dist(a, b) / 20; }
  /* 太陽系からつながっている自分の星系（補給が届く） */
  function supplied(s) {
    var w = s.war, A = adj(), seen = { sol: true }, q = ['sol'];
    while (q.length) { var x = q.shift(); A[x].forEach(function (y) { if (!seen[y] && w.sys[y].owner === 'us') { seen[y] = true; q.push(y); } }); }
    return seen;
  }
  function totalStr(s) {
    var w = s.war, t = 0, k;
    for (k in w.sys) { t += w.sys[k].str; if (w.sys[k].battle) t += w.sys[k].battle.att; }
    w.moves.forEach(function (mv) { if (mv.side === 'us') t += mv.str; });
    return t;
  }
  function fleetMul(s, d) {
    var m = d.m || {}, w = s.war;
    return (1 + (m.fleet || 0)) * (1 + 0.05 * E.sumEffect(s, 'fsupply')) * (0.4 + 0.6 * (w.upkeepMul === undefined ? 1 : w.upkeepMul));
  }

  function stepStrategy(s, d, w, dt, m) {
    var glob = d.glob || 1;
    /* 造船 */
    var docks = E.sumEffect(s, 'dock'), sp = (1 + E.sumEffect(s, 'dockSpeed')) * Math.sqrt(glob);
    for (var qi = 0; qi < w.queue.length && qi < docks; qi++) w.queue[qi].left -= dt * sp;
    for (var qj = w.queue.length - 1; qj >= 0; qj--) {
      if (w.queue[qj].left <= 0) {
        var sh = shipDef(w.queue[qj].type);
        w.sys.sol.str += sh.str; w.built = (w.built || 0) + 1;
        w.queue.splice(qj, 1);
      }
    }
    /* 補給（艦の維持） */
    var str = totalStr(s), ratio = 1;
    if (str > 0) {
      for (var k in W.upkeep) {
        var need = str * W.upkeep[k] * dt / (1 + 0.1 * E.sumEffect(s, 'fsupply'));
        var got = Math.min(need, Math.max(0, s.res[k]));
        s.res[k] -= got; if (d.ledf) d.ledf(k, '艦隊の補給', -got);
        ratio = Math.min(ratio, need > 0 ? got / need : 1);
      }
    }
    w.upkeepMul = (w.upkeepMul === undefined ? 1 : w.upkeepMul) + (ratio - (w.upkeepMul === undefined ? 1 : w.upkeepMul)) * Math.min(1, dt / 20);
    var fm = fleetMul(s, d);
    w.fm = fm;
    /* 移動 */
    for (var i = w.moves.length - 1; i >= 0; i--) {
      var mv = w.moves[i];
      mv.t += dt;
      if (mv.t >= mv.dur) { w.moves.splice(i, 1); arrive(s, w, mv); }
    }
    /* 戦闘（ランチェスター：互いの強さに比例して減る） */
    var K = W.battleK;
    for (var id in w.sys) {
      var X = w.sys[id], B = X.battle; if (!B) continue;
      var atkUs = B.side === 'us';
      var a = B.att, def = atkUs ? X.def : X.str + X.def;
      var aEff = atkUs ? a * fm : a, dEff = atkUs ? def : def * fm;
      var da = K * dEff * dt, dd = K * aEff * dt;
      B.att = Math.max(0, a - da);
      B.t = (B.t || 0) + dt;
      if (atkUs) X.def = Math.max(0, X.def - dd);
      else {
        /* 守り：先に駐留艦隊が減り、次に星系の守り */
        var hit = dd; var s1 = Math.min(X.str, hit); X.str -= s1; hit -= s1; X.def = Math.max(0, X.def - hit);
      }
      var defLeft = atkUs ? X.def : X.str + X.def;
      if (B.att <= 1e-6 || defLeft <= 1e-6) endBattle(s, w, id, X, B);
    }
    /* 敵の守りの回復 */
    W.systems.forEach(function (x) {
      var X = w.sys[x.id];
      if (X.owner === 'enemy' && !X.battle && X.def < X.base) X.def = Math.min(X.base, X.def + X.base * W.regen * dt);
      if (X.owner === 'us' && !x.home && !X.battle) X.def = Math.min(10 * (x.reward || 1), X.def + 0.01 * dt);
    });
    /* 敵の反撃 */
    w.raidT -= dt;
    if (w.raidT <= 0) { w.raidT = W.raidSec * (0.8 + 0.4 * Math.random()); raid(s, w); }
  }
  function shipDef(id) { for (var i = 0; i < W.ships.length; i++) if (W.ships[i].id === id) return W.ships[i]; return null; }

  function arrive(s, w, mv) {
    var X = w.sys[mv.to], nm = sysDef(mv.to).name;
    if (mv.side === 'us') {
      if (X.owner === 'us') { X.str += mv.str; return; }
      if (X.owner === 'free') { X.owner = 'us'; X.str += mv.str; X.def = 0; capture(s, w, mv.to); return; }
      if (X.battle && X.battle.side === 'us') { X.battle.att += mv.str; return; }
      X.battle = { side: 'us', att: mv.str, t: 0, start: X.def };
      wlog(s, nm + 'で交戦。', 'warn');
    } else {
      if (X.owner !== 'us') { X.def += mv.str; return; }
      if (X.battle && X.battle.side === 'enemy') { X.battle.att += mv.str; return; }
      X.battle = { side: 'enemy', att: mv.str, t: 0, start: X.str + X.def };
      wlog(s, '敵が' + nm + 'に来た。', 'bad');
    }
  }
  function endBattle(s, w, id, X, B) {
    var nm = sysDef(id).name;
    X.battle = null;
    if (B.side === 'us') {
      if (X.def <= 1e-6) { X.owner = 'us'; X.str += B.att; X.def = 0; capture(s, w, id); }
      else { wlog(s, nm + 'の攻撃は失敗した。', 'bad'); }
    } else {
      if (X.str + X.def <= 1e-6) {
        X.owner = 'enemy'; X.def = B.att; X.base = Math.max(X.base, sysDef(id).def || B.att); X.str = 0;
        wlog(s, nm + 'を奪われた。', 'bad');
      } else wlog(s, nm + 'を守りきった。', 'good');
    }
  }
  function capture(s, w, id) {
    var sd = sysDef(id);
    w.bonus += 0.04 * (sd.reward || 1);
    s.flags.sys_captured = true;
    wlog(s, sd.name + 'を取った。', 'good');
    if (sd.capital) {
      wlog(s, '敵の母星が落ちた。', 'good');
      if (s.era < 11) { s.era = 11; s.stats.at.era11 = s.t; onEra(s); }
    }
  }
  function raid(s, w) {
    var A = adj(), cands = [];
    W.systems.forEach(function (x) {
      var X = w.sys[x.id]; if (X.owner !== 'us' || x.home || X.battle) return;
      A[x.id].forEach(function (y) { if (w.sys[y].owner === 'enemy' && !w.sys[y].battle) cands.push([y, x.id]); });
    });
    if (!cands.length) return;
    var c = cands[Math.floor(Math.random() * cands.length)];
    var src = w.sys[c[0]], str = Math.max(5, src.base * W.raidStr);
    w.moves.push({ id: ++w.seq, side: 'enemy', from: c[0], to: c[1], str: str, t: 0, dur: laneTime(c[0], c[1]) });
    wlog(s, sysDef(c[0]).name + 'から敵の艦隊が出た。行き先は' + sysDef(c[1]).name + '。', 'bad');
  }

  /* ================= 操作 ================= */
  function setPrio(s, fid, v) { var w = ensure(s); if (w.fronts[fid]) w.fronts[fid].prio = Math.max(1, Math.min(3, v)); }
  function canBuild(s, type) { var sh = shipDef(type); return sh && s.era >= 10 && E.sumEffect(s, 'dock') > 0 && s.war.queue.length < 30 && E.canPay(s, sh.cost); }
  function buildShip(s, type) {
    var w = ensure(s), sh = shipDef(type);
    if (!canBuild(s, type)) return false;
    for (var k in sh.cost) s.res[k] -= sh.cost[k];
    w.queue.push({ type: type, left: sh.sec });
    return true;
  }
  /* 艦隊を送る。frac：送る割合 */
  function send(s, from, to, frac) {
    var w = ensure(s), A = adj();
    if (!w.sys[from] || w.sys[from].owner !== 'us' || A[from].indexOf(to) < 0) return false;
    var X = w.sys[from], amt = X.str * (frac || 1);
    if (amt < 0.5) return false;
    X.str -= amt;
    w.moves.push({ id: ++w.seq, side: 'us', from: from, to: to, str: amt, t: 0, dur: laneTime(from, to) });
    return true;
  }

  return {
    init: init, step: step, onEra: onEra, frontsWon: frontsWon, frontNeed: frontNeed, ensure: ensure,
    setPrio: setPrio, buildShip: buildShip, canBuild: canBuild, send: send, adj: adj, sysDef: sysDef, supplied: supplied,
    totalStr: totalStr, laneTime: laneTime, shipDef: shipDef, RES4: RES4
  };
})();
