/* バランス確認用の自動プレイ（開発者モードと Node の両方から使う） */
var TM = window.TM = window.TM || {};

TM.Sim = (function () {
  var E = TM.Engine;

  /* プレイスタイル：1日の遊び方 */
  var STYLES = {
    heavy: { name: 'ヘビー', first: 30, sessions: [[7, 30], [9, 15], [12, 25], [15, 15], [18, 30], [21, 40]], think: 5 },
    normal: { name: 'ふつう', first: 20, sessions: [[8, 10], [12, 10], [17, 8], [21, 10]], think: 8 },
    light: { name: 'ライト', first: 15, sessions: [[8, 5], [19, 6]], think: 10 }
  };

  var KEY = [['acidbuy', 1], ['canbuy', 1], ['acidbuy', 2], ['kei', 1], ['scrapbuy', 1], ['kei', 2], ['reactor', 2], ['chlor', 1], ['study', 2], ['reactor', 4], ['chlor', 2], ['kei', 3],
    ['lab', 1], ['i_refract', 1], ['rlab', 2], ['fork', 2], ['truck2', 2], ['canwasher', 1], ['coag', 1], ['filler', 2], ['line', 1], ['boiler', 1], ['conc', 1], ['truck4', 1], ['drum', 1], ['crane', 1], ['substation', 1], ['rlab', 4],
    ['shiptank', 1], ['dike', 1], ['loader', 1], ['tscale', 1], ['lorry', 2], ['acidtank', 1], ['bigreactor', 2], ['bigchlor', 1], ['rnd', 2], ['lab2', 1],
    ['decopper', 1], ['i_cond', 1], ['pwplant', 2], ['i_aa', 1], ['i_uv', 1], ['i_ic', 1], ['cooler', 1], ['hypoline', 1], ['i_visc', 1], ['pacline', 1], ['psiline', 1],
    ['ureabuy', 1], ['ureadis', 1], ['upwplant', 1], ['i_icp', 1], ['bibline', 1], ['office', 1], ['canline', 1], ['i_ftir', 1], ['lorry', 4], ['depot', 1], ['lorry20', 2], ['rnd', 4],
    ['newplant', 1], ['autowh', 1], ['h2rec', 3], ['msscrub', 2], ['wreuse', 5], ['curefine', 4], ['farm', 3], ['megareactor', 2], ['ureasyn', 1], ['rnd2', 2], ['upwplant2', 1], ['hpline', 1], ['port', 1], ['canline', 3],
    ['heatpump', 2], ['solarfarm', 4], ['charger', 1], ['evlorry', 2], ['dronehub', 2],
    ['battery', 2], ['ctower', 1], ['dc', 2], ['fusion', 1], ['dc', 4], ['ctower', 2], ['ailab', 1], ['aiplant', 1], ['dc', 8],
    ['electrolysis', 2], ['fuelplant', 2], ['launch', 2], ['orbtank', 1], ['sat', 2], ['station', 1], ['orbdc', 2], ['spacelab', 1],
    ['lift', 2], ['moonplant', 2], ['venus', 2], ['orbreactor', 2], ['colonywater', 3], ['marsbase', 1], ['marsplant', 2], ['mirror', 2], ['airfac', 2], ['comet', 2], ['algae', 2],
    ['asteroid', 2], ['asteroidreactor', 2], ['jupscoop', 2], ['fusion2', 1], ['europa', 2], ['titan', 2], ['ch4fuel', 2], ['outercity', 2], ['coldc', 1], ['kuiper', 1],
    ['wfuel', 2], ['wcool', 2], ['warmor', 2], ['wwater', 2], ['wterminal', 2], ['convoy', 3], ['fdepot', 1],
    ['dock', 2], ['fleetdepot', 1], ['shipyard2', 1],
    ['starfurnace', 2], ['starlab', 1], ['ismnet', 1], ['alien', 1], ['galwater', 1], ['starlorry', 1]];

  function botIntro(s) {
    var A = E.actions;
    if (A.grope.vis(s)) return E.doAction(s, 'grope');
    if (A.setkama.vis(s) && A.setkama.ok(s)) return E.doAction(s, 'setkama');
    if (A.hire.vis(s) && A.hire.ok(s) && s.pop < 1) return E.doAction(s, 'hire');
    if (A.give.vis(s) && A.give.ok(s) && s.res.fecl2 >= 3) return E.doAction(s, 'give');
    if (A.sink.vis(s) && A.sink.ok(s) && s.res.fecl2 < 25) return E.doAction(s, 'sink');
    if (A.buyacid.vis(s) && A.buyacid.ok(s) && s.res.hcl < 2 && s.res.fecl2 < 20) return E.doAction(s, 'buyacid');
    if (A.pick.vis(s) && s.res.scrap < 3) return E.doAction(s, 'pick');
  }

  function think(s) {
    var D = TM.DATA, d = E.derive(s);
    if (s.era === 0) return;
    /* 手作業も少し */
    if (s.flags.sold && s.era === 1 && E.actions.give.ok(s)) E.doAction(s, 'give');
    if (E.actions.buyacid.vis(s) && s.res.hcl < 4 && E.actions.buyacid.ok(s) && !(s.bld.acidbuy && s.bld.acidbuy.n)) E.doAction(s, 'buyacid');
    if (E.actions.buycans.vis(s) && s.res.can < 3 && E.actions.buycans.ok(s)) E.doAction(s, 'buycans');
    if (s.evActive) E.claimEvent(s);
    if (s.era === 1) {
      for (var c = 0; c < 4; c++) if (s.res.scrap < d.cap.scrap - 1) E.doAction(s, 'pick');
      if (E.actions.sink.ok(s) && s.res.fecl2 < d.cap.fecl2 - 3) E.doAction(s, 'sink');
    }

    /* 研究：安いものから */
    var techs = D.techs.filter(function (t) { return E.techShown(s, t); }).sort(function (a, b) { return a.cost.research - b.cost.research; });
    techs.forEach(function (t) { E.research(s, t.id); });

    /* 大型設備：解放されていれば最優先で貯める */
    var mega = null;
    D.buildings.forEach(function (b) { if (b.stages && E.bldShown(s, b) && s.bld[b.id].n < b.stages && (!b.buildCond || E.cond(s, b.buildCond))) mega = b; });
    var reserve = 0;
    /* 住む場所が足りなければ先に */
    var salNow = s.pop * TM.DATA.consts.salary * (TM.DATA.eraSalary[s.era] || 1);
    if (s.pop >= d.popCap - 1 && (s.pop < 6 || (s.incAvg || 0) > salNow * 2 + 0.3)) {
      ['house', 'office', 'newplant'].forEach(function (id) { if (E.bldShown(s, E.BLD[id])) E.build(s, id); });
      d = E.derive(s);
    }
    /* 画面の「詰まり」の手当てを見て、買えるものは買う（人が見て直すのと同じ） */
    var g = E.diagnose(s, E.derive(s));
    if (g && g.main && g.main.fixKey) E.fixesFor(s, s._d, g.main.fixKey).some(function (fx) {
      var lim = s.res.money * (s.era >= 2 ? 0.3 : 0.7);
      if (fx[0] === 'bld') { var c0 = E.cost(s, E.BLD[fx[1]]); return (c0.money || 0) <= lim && E.build(s, fx[1]); }
      if (fx[0] === 'upg') return (E.UPG[fx[1]].cost.money || 0) <= lim && E.buyUpg(s, fx[1]);
      return false;
    });
    /* 止まっている工程を見て、足りないものを補う */
    fixBottlenecks(s, E.derive(s));
    d = E.derive(s);
    /* 要になる設備（目標数まで優先して買う） */
    for (var ki = 0; ki < KEY.length; ki++) {
      var kb = E.BLD[KEY[ki][0]];
      if (!kb || !E.bldShown(s, kb) || s.bld[kb.id].n >= KEY[ki][1]) continue;
      if (kb.max && s.bld[kb.id].n >= kb.max) continue;
      if (E.build(s, kb.id)) { ki = -1; continue; }
      var kc = E.cost(s, kb);
      var ok = true; for (var rk in kc) if (rk !== 'money' && (s.res[rk] || 0) < kc[rk]) ok = false;
      if (ok && (kc.money || 0) <= Math.max(50, s.res.money) * 4) { reserve = kc.money || 0; break; }
    }
    if (mega) {
      E.build(s, mega.id);
      var mc = E.cost(s, mega).money || 0;
      if (s.bld[mega.id].n < mega.stages && mc < Math.max(1, s.res.money) * 8) reserve = Math.max(reserve, mc * 0.6);
    }
    var spend = Math.max(0, s.res.money - reserve);

    /* 資格 */
    var want = { geki: 1, fork: s.bld.fork.n, jmid: s.bld.truck2.n, mid: s.bld.truck4.n, big: s.bld.lorry.n + s.bld.lorry20.n, crane: s.bld.crane.n ? 1 : 0 };
    D.licenses.forEach(function (L) {
      var have = s.lic[L.id] + s.training.filter(function (t) { return t.lic === L.id; }).length;
      if (have < (want[L.id] || 0) && spend > L.cost.money * 2) {
        if (E.idle(s) < 1) { for (var jk in s.jobs) if (s.jobs[jk] > 0 && jk !== 'operate') { s.jobs[jk]--; break; } }
        E.train(s, L.id);
      }
    });

    /* 改善 */
    D.upgrades.filter(function (u) { return E.upgShown(s, u); }).sort(function (a, b) { return (a.cost.money || 0) - (b.cost.money || 0); })
      .forEach(function (u) { if ((u.cost.money || 0) <= spend * 0.6 && E.canPay(s, u.cost)) { E.buyUpg(s, u.id); spend = Math.max(0, s.res.money - reserve); } });

    /* 設備：役に立ちそうなものを安い順に */
    var cands = D.buildings.filter(function (b) { return !b.stages && E.bldShown(s, b) && useful(s, d, b); });
    /* 高いもの（効き目が大きいもの）から、手持ちの半分以内で */
    /* 戦時は、軍需と兵站を先に */
    var warNow = (s.era === 9 && !TM.War.frontsWon(s)) || s.era === 10;
    cands.sort(function (a, b) { var wa = warNow && a.ph === 'war' ? 0 : 1, wb = warNow && b.ph === 'war' ? 0 : 1; return wa - wb || (E.cost(s, a).money || 0) - (E.cost(s, b).money || 0); });
    for (var i = 0; i < 25; i++) {
      var bought = false;
      for (var j = 0; j < cands.length; j++) {
        var b = cands[j], c = E.cost(s, b);
        if ((c.money || 0) > Math.max(spend * 0.6, s.res.money * 0.12)) continue;
        if (E.build(s, b.id)) { bought = true; spend = Math.max(0, s.res.money - reserve); d = E.derive(s); break; }
      }
      if (!bought) break;
    }
    /* 全部稼働 */
    D.buildings.forEach(function (b) {
      if (!b.proc || !b.proc.toggle) return;
      var on = s.bld[b.id].n, out = b.proc.out || {};
      /* 作りすぎない・お金が尽きない程度に */
      for (var k in out) if (k !== 'waste' && d.cap[k] !== Infinity && s.res[k] > d.cap[k] * 0.9) on = Math.min(on, Math.ceil(s.bld[b.id].n * 0.3));
      if (b.proc.in && b.proc.in.money && s.res.money < b.proc.in.money * 60) on = Math.floor(on / 2);
      s.bld[b.id].on = on;
    });
    /* 大型設備に要る物を食っている設備は、貯まるまで止める */
    if (mega) {
      var mcost = E.cost(s, mega);
      D.buildings.forEach(function (b) {
        if (!b.proc || !b.proc.toggle || !b.proc.in) return;
        for (var k in b.proc.in) if (k !== 'money' && mcost[k] && s.res[k] < mcost[k] && !(b.proc.out && Object.keys(b.proc.out).some(function (o) { return mcost[o]; }))) { s.bld[b.id].on = 0; return; }
      });
    }
    /* 受託 */
    while (s.contracts.offers.length && s.contracts.active.filter(function (c) { return c.step < TM.DATA.contracts.steps.length; }).length < (s.jobs.sales || 0) + 1) E.acceptOffer(s, s.contracts.offers[0].id);
    if (s.era === 9 && TM.War) {
      /* 前線：いちばん押し返している前線に重点を置いて、一つずつ片づける */
      var w9 = TM.War.ensure(s), top = null;
      for (var fk in w9.fronts) { var F = w9.fronts[fk]; if (!F.won && (!top || F.pos > w9.fronts[top].pos)) top = fk; }
      for (var fk2 in w9.fronts) TM.War.setPrio(s, fk2, fk2 === top ? 3 : 1);
    }
    if (s.era >= 10 && TM.War) warBot(s, E.derive(s));
    assignJobs(s, E.derive(s));
  }

  /* 戦略：造船して、いちばん守りの薄い敵の星系を、隣の味方の星系から攻める */
  function warBot(s, d) {
    var W = TM.DATA.war, w = TM.War.ensure(s), A = TM.War.adj();
    var docks = E.sumEffect(s, 'dock');
    for (var g = 0; g < 10 && w.queue.length < docks * 2; g++) {
      var built = false;
      for (var i = W.ships.length - 1; i >= 0 && !built; i--) {
        var sh = W.ships[i], rich = true;
        for (var k in sh.cost) if ((s.res[k] || 0) < sh.cost[k] * 3) rich = false;
        if (rich) built = TM.War.buildShip(s, sh.id);
      }
      if (!built) break;
    }
    /* 寝ている間もドックを止めない */
    var big = null; W.ships.forEach(function (sh) { var ok = true; for (var k in sh.cost) if ((s.res[k] || 0) < sh.cost[k] * 20) ok = false; if (ok) big = sh.id; });
    TM.War.setAuto(s, big || 'frigate');
    var fm = w.fm || 1, targets = [];
    W.systems.forEach(function (x) {
      var X = w.sys[x.id]; if (X.owner === 'us' || X.battle) return;
      var nb = A[x.id].filter(function (y) { return w.sys[y].owner === 'us'; });
      if (nb.length) targets.push({ id: x.id, sc: X.owner === 'free' ? -1 : X.def, nb: nb, X: X });
    });
    if (!targets.length) return;
    targets.sort(function (a, b) { return a.sc - b.sc; });
    /* 国境の星系には、反撃を受け止められるだけ残す */
    var keep = function (y) { var sd = TM.War.sysDef(y); return y === 'sol' ? 0 : 0.4 * (sd.def || 10); };
    var front = {};
    targets.forEach(function (T) {
      T.nb.forEach(function (y) { front[y] = 1; });
      var incoming = 0; w.moves.forEach(function (mv) { if (mv.side === 'us' && mv.to === T.id) incoming += mv.str; });
      if (T.X.owner === 'free') { if (!incoming) T.nb.some(function (y) { return TM.War.send(s, y, T.id, 0.2); }); return; }
      var avail = 0; T.nb.forEach(function (y) { avail += Math.max(0, w.sys[y].str - keep(y)); });
      if ((avail + incoming) * fm > T.sc * 1.5 && avail > 0) T.nb.forEach(function (y) { var X = w.sys[y], a = X.str - keep(y); if (a > 0.5) TM.War.send(s, y, T.id, a / X.str); });
    });
    /* 後ろの艦を、いちばん近い前線の星系へ寄せる */
    W.systems.forEach(function (x) {
      var X = w.sys[x.id]; if (X.owner !== 'us' || X.str < 2 || front[x.id]) return;
      var prev = {}, q = [x.id], seen = {}; seen[x.id] = 1; var hit = null;
      while (q.length && !hit) { var c = q.shift(); A[c].forEach(function (y) { if (hit || seen[y] || w.sys[y].owner !== 'us') return; seen[y] = 1; prev[y] = c; if (front[y]) hit = y; q.push(y); }); }
      if (!hit) return;
      var stepTo = hit; while (prev[stepTo] !== x.id) stepTo = prev[stepTo];
      TM.War.send(s, x.id, stepTo, 0.9);
    });
  }

  function fixBottlenecks(s, d) {
    var D = TM.DATA, need = {}, power = false, room = {};
    (d.procs || []).forEach(function (p) {
      if (!p.reason) return;
      if (p.reason.indexOf('入力不足') === 0) for (var k in p.inp) if (p.inp[k] > 0 && s.res[k] < p.inp[k] * 5 && k !== 'money') need[k] = (need[k] || 0) + 1;
      if (p.reason === '電力不足') power = true;
      if (p.reason.indexOf('置き場が満杯') === 0) for (var k2 in p.out) if (p.out[k2] > 0 && d.cap[k2] !== Infinity && s.res[k2] >= d.cap[k2] * 0.98 && k2 !== 'waste') room[k2] = 1;
    });
    if (d.powerEff < 0.99) power = true;
    var tries = [];
    D.buildings.forEach(function (b) {
      if (b.stages || !E.bldShown(s, b) || (b.max && s.bld[b.id].n >= b.max)) return;
      var sc = 0;
      if (b.proc && b.proc.out) for (var k in b.proc.out) if (need[k]) sc += need[k] * 2;
      if (power && b.effects && b.effects.power) sc += 3;
      if (b.effects && b.effects.cap) for (var k3 in b.effects.cap) if (room[k3]) sc += 1;
      if (sc > 0) tries.push([sc, b]);
    });
    tries.sort(function (a, b) { return b[0] - a[0] || (E.cost(s, a[1]).money || 0) - (E.cost(s, b[1]).money || 0); });
    var bought = 0;
    for (var i = 0; i < tries.length && bought < 4; i++) {
      var c = E.cost(s, tries[i][1]);
      if ((c.money || 0) > s.res.money * 0.5) continue;
      if (E.build(s, tries[i][1].id)) bought++;
    }
  }

  function nearCap(s, d, ids, f) {
    for (var i = 0; i < ids.length; i++) if (d.cap[ids[i]] !== Infinity && s.res[ids[i]] >= d.cap[ids[i]] * (f || 0.7)) return true;
    return false;
  }

  function useful(s, d, b) {
    var n = s.bld[b.id].n, e = b.effects || {};
    if (b.max && n >= b.max) return false;
    if (b.ph === 'war' && s.era >= 11) return false;
    /* 前線を押し返したら、兵站はもう増やさない */
    if (b.ph === 'war' && s.era >= 9 && TM.War.frontsWon(s) && !e.dock && !e.dockSpeed && !e.fsupply) return false;
    /* お金を食う設備は、収支に余裕があるときだけ増やす */
    if (b.proc && b.proc.in && b.proc.in.money && s.era >= 2) {
      var net = d.rate ? d.rate.money || 0 : 0;
      if (net < b.proc.in.money * (d.glob || 1) * 3) return false;
    }
    switch (b.id) {
      case 'land': return d.used > d.land * 0.75;
      case 'house': case 'office': return s.pop >= d.popCap - 1 && (s.pop < 6 || (s.incAvg || 0) > s.pop * 0.03 + 0.3);
      case 'shed': return nearCap(s, d, ['hcl']) || (nearCap(s, d, ['scrap']) && s.res.hcl > 10);
      case 'desk': case 'study': {
        var maxT = 0; TM.DATA.techs.forEach(function (t) { if (E.techAvailable(s, t) || (!s.techs[t.id] && (t.era || 0) <= s.era)) maxT = Math.max(maxT, t.cost.research); });
        return d.cap.research < maxT * 1.3 || nearCap(s, d, ['research'], 0.8) || b.id === 'study';
      }
      case 'canyard': case 'pallet': case 'rack': return nearCap(s, d, ['can', 'dcan', 'p_fecl2', 'p_fecl3', 'p_hcl', 'p_fecl3h', 'p_uw', 'p_naclo']);
      case 'canbuy': return n < 3 + s.era * 2 && s.res.can < d.cap.can * 0.5;
      case 'scrapbuy': return n < 6 && s.res.scrap < d.cap.scrap * 0.5;
      case 'acidbuy': return n < 6 && s.res.hcl < d.cap.hcl * 0.5;
      case 'powerc': case 'substation': return d.powerDem > d.powerSup * 0.8;
      case 'vent': case 'scrubber': return d.ventEff < 1 || (b.id === 'scrubber' && n < 2);
      case 'kama': return n < 8;
      case 'kei': return n < 4;
      case 'dike': case 'loader': case 'tscale': return n < 1;
      case 'neutral': case 'coag': return s.res.waste > d.cap.waste * 0.4 || n === 0;
      case 'boiler': return n < 1 + (s.bld.conc.n + s.bld.ureadis.n) / 2;
      case 'fork': return n < 6 + s.era * 2;
      case 'h2tank': return nearCap(s, d, ['h2']);
      case 'orbtank': return nearCap(s, d, ['orbit', 'fuel'], 0.8) || n < 1;
      case 'ctower': return n * 4 < (s.bld.dc.n || 0) + 1;
      case 'battery': case 'solarfarm': case 'fusion': case 'fusion2': return d.powerDem > d.powerSup * 0.8;
      case 'charger': return n < 1;
      case 'ailab': case 'spacelab': case 'aiplant': return ((d.rate || {}).compute || 0) > 0.5 * (n + 1) || (s.res.compute || 0) > 1000;
      case 'marsbase': case 'outercity': case 'station': return true;
      case 'farm': return n < 3;
      case 'newplant': return d.used > d.land * 0.7 || s.pop >= d.popCap - 2;
      default: return true;
    }
  }

  function assignJobs(s, d) {
    var D = TM.DATA, m = d.m, P = s.pop - s.training.length;
    var vis = {}; D.jobs.forEach(function (j) { vis[j.id] = E.jobVisible(s, j); });
    var res = {}; D.jobs.forEach(function (j) { res[j.id] = 0; });
    var left = P;
    function fix(k, n) { if (!vis[k]) return; n = Math.max(0, Math.min(left, n)); res[k] += n; left -= n; }
    /* 先に決まった人数が要る配属 */
    var opNeed = 0;
    if (!(m['auto.operate'] > 0)) D.buildings.forEach(function (b) { if (b.proc && b.proc.operator === 'operate') opNeed += s.bld[b.id].on; });
    fix('operate', Math.min(opNeed, Math.floor(P * 0.45)));
    if (vis.fill) fix('fill', 1);
    if (vis.deliver) fix('deliver', 1);
    if (vis.research) fix('research', 1);
    var veh = 0; d.vehicles.forEach(function (v) { veh += v.n; });
    if (!m['auto.drive']) fix('deliver', veh);
    if (!m['auto.line']) fix('fill', s.bld.line.n * 2 + s.bld.filler.n);
    if (!m['auto.fork']) fix('handle', Math.min(s.bld.fork.n, s.lic.fork));
    fix('sales', Math.min(6, s.contracts.active.filter(function (c) { return c.step < D.contracts.steps.length; }).length));
    /* 洗缶：戻ってくる缶に追いつく人数（機械で洗える分は引く） */
    if (vis.wash) {
      var dIn = 0, L = (d.ledS || {}).dcan || {}; for (var ln in L) if (L[ln] > 0) dIn += L[ln];
      var mach = (s.bld.canwasher.on || 0) * 0.35 + (s.bld.canline.on || 0) * 3;
      var per = 0.03 * (1 + (d.m['job.wash'] || 0)) * (d.glob || 1);
      var needW = Math.max(0, dIn * 1.1 - mach) / per + Math.max(0, s.res.dcan - d.cap.dcan * 0.2) / (per * 120);
      fix('wash', Math.min(Math.ceil(needW), Math.floor(left * 0.4)));
    }
    /* 残りを比率で */
    var buyScrap = s.bld.scrapbuy.n > 0 || s.bld.scrapyard.n > 0;
    var w = {};
    if (s.era <= 1) w = { dissolve: 3, gather: buyScrap && s.res.scrap > d.cap.scrap * 0.3 ? 0.3 : 2.5, fill: 1.5, deliver: 1, research: 1.8, wash: 0, check: s.res.fecl3w > 1 ? 1 : 0 };
    else if (s.era === 2) w = { dissolve: 1, gather: buyScrap ? 0.2 : 1, fill: 1, deliver: 0.6, research: 2.5, wash: 0, check: s.res.fecl3w > 5 ? 1.2 : 0.2, handle: d.handEff < 0.95 ? 1.2 : 0.3 };
    else w = { research: 5, check: s.res.fecl3w > d.cap.fecl3w * 0.3 ? 1.5 : 0.3, handle: d.handEff < 0.95 ? 1 : 0.1, fill: 0.3, dissolve: 0.3 };
    var ws = 0, k;
    for (k in w) { if (!vis[k]) w[k] = 0; if (k === 'dissolve') w[k] = Math.min(w[k], (d.slots.dissolve || 0) - res.dissolve > 0 ? w[k] : 0); ws += w[k]; }
    var pool = left, rem = [];
    for (k in w) {
      if (!ws || !w[k]) continue;
      var x = pool * w[k] / ws, n = Math.floor(x);
      if (k === 'dissolve') n = Math.min(n, Math.max(0, (d.slots.dissolve || 0) - res.dissolve));
      fix(k, n); rem.push([k, x - n]);
    }
    rem.sort(function (a, b) { return b[1] - a[1]; });
    rem.forEach(function (r) { if (left > 0 && r[1] > 0.2) fix(r[0], 1); });
    /* 余りは研究（なければ回収） */
    if (vis.research) fix('research', left); else fix('gather', left);
    if (left > 0 && vis.dissolve) fix('dissolve', Math.min(left, (d.slots.dissolve || 0) - res.dissolve));
    if (left > 0) res.gather += left;
    for (k in res) s.jobs[k] = res[k];
  }

  /* 1日の中で遊んでいる時間帯か */
  function inSession(style, tDay, firstDay) {
    var h = tDay / 3600;
    for (var i = 0; i < style.sessions.length; i++) {
      var st = style.sessions[i][0], len = (firstDay && i === 0 ? Math.max(style.first || 0, style.sessions[i][1]) : style.sessions[i][1]) / 60;
      if (h >= st && h < st + len) return { end: (st + len) * 3600 };
    }
    return null;
  }
  function nextSession(style, tDay) {
    var h = tDay / 3600;
    for (var i = 0; i < style.sessions.length; i++) if (style.sessions[i][0] > h) return style.sessions[i][0] * 3600;
    return 86400 + style.sessions[0][0] * 3600;
  }

  /* 実行。maxDays 日まで、または完成まで */
  /* 自動プレイは与信枠で設備を買わない（手持ちの範囲で判断する） */
  function run(styleId, maxDays, opts) {
    if (E.setNoCredit) E.setNoCredit(true);
    try { return run0(styleId, maxDays, opts); } finally { if (E.setNoCredit) E.setNoCredit(false); }
  }
  function run0(styleId, maxDays, opts) {
    opts = opts || {};
    E.init && E.init();
    var style = STYLES[styleId];
    var s = opts.state || E.newState();
    var real = opts.real || style.sessions[0][0] * 3600; /* 1日目の最初の時間帯から始める */
    var milestones = {}, lastEra = -1;
    function mark(k) { if (milestones[k] === undefined) milestones[k] = (real - style.sessions[0][0] * 3600); }
    var guard = 0;
    while (real < maxDays * 86400 + style.sessions[0][0] * 3600 && !s.ending) {
      if (++guard > 5e6) break;
      var tDay = real % 86400;
      var sess = inSession(style, tDay, real < 86400);
      if (sess) {
        var end = real - tDay + sess.end, nextThink = 0;
        while (real < end && !s.ending) {
          var dt = s.era === 0 ? 0.5 : 1;
          if (s.era === 0) botIntro(s);
          else if (real >= nextThink) { think(s); nextThink = real + style.think; }
          E.step(s, dt); real += dt;
          if (s.era !== lastEra) { lastEra = s.era; mark('era' + s.era); }
          if (s.flags.hook) mark('hook');
        }
      } else {
        var nxt = real - tDay + nextSession(style, tDay);
        var away = nxt - real;
        E.simulateAway(s, away);
        real = nxt;
        if (s.era !== lastEra) { lastEra = s.era; mark('era' + s.era); }
        if (opts.onProgress) opts.onProgress(real, s);
        if (opts.stopAtEra !== undefined && s.era >= opts.stopAtEra) break;
      }
    }
    if (s.ending) mark('ending');
    if (opts.stopAtEra !== undefined) milestones._real = real;
    return { style: style.name, milestones: milestones, state: s, realDays: (real - style.sessions[0][0] * 3600) / 86400 };
  }

  return { run: run, STYLES: STYLES, think: think, botIntro: botIntro };
})();
