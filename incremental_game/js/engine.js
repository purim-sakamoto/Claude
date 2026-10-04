/* ゲームの計算部分。画面には触れない（シミュレータからも同じものを使う） */
var TM = window.TM = window.TM || {};

TM.Engine = (function () {
  var D, C, U = TM.util;
  var RES = {}, BLD = {}, BLDN = {}, JOB = {}, TECH = {}, UPG = {}, LIC = {}, PROD = {}, MOD = {};

  function init() {
    D = TM.DATA; C = D.consts;
    D.resources.forEach(function (r) { RES[r.id] = r; });
    D.buildings.forEach(function (b) { BLD[b.id] = b; BLDN[b.name] = b; });
    D.jobs.forEach(function (j) { JOB[j.id] = j; });
    D.techs.forEach(function (t) { TECH[t.id] = t; });
    D.upgrades.forEach(function (u) { UPG[u.id] = u; });
    D.licenses.forEach(function (l) { LIC[l.id] = l; });
    D.products.forEach(function (p) { PROD[p.id] = p; });
    D.lineModules.forEach(function (m) { MOD[m.id] = m; });
  }

  /* ================= 状態 ================= */
  function newState() {
    var s = {
      v: D.version, seed: 12345, t: 0, started: Date.now(), saved: Date.now(), era: 0,
      res: {}, flags: {}, bld: {}, jobs: {}, pop: 0, popTimer: 0, lic: {}, training: [],
      techs: {}, upg: {}, manual: { dissolve: 0, step: 0 }, walkin: 0, custCans: 0, spentPipe: 0,
      shown: {}, playT: 0, heat: { gather: 0, dissolve: 0, sell: 0 },
      cal: { yf: 0, y0Earned: 0, salesDone: {}, last: 0 },
      log: [], storySeen: {}, evTimer: 600, evActive: null,
      stats: { batches: 0, acidBuys: 0, cansSold: 0, washed: 0, fecl3: 0, fecl3h: 0, forkUsed: 0, h2: 0, produced: {}, sold: {}, at: {}, earned: 0, offline: 0, clicks: 0 },
      fin: { cur: { inc: {}, exp: {}, dep: 0, cash0: 0, debt0: 0 }, hist: [], monthT: 0, book: 0 },
      contracts: { offers: [], active: [], timer: 120, done: 0, seq: 0 },
      ending: 0, settings: { expo: false, anim: true, theme: 'auto' }
    };
    D.resources.forEach(function (r) { s.res[r.id] = 0; });
    D.buildings.forEach(function (b) { s.bld[b.id] = { n: 0, on: 0 }; });
    D.jobs.forEach(function (j) { s.jobs[j.id] = 0; });
    D.licenses.forEach(function (l) { s.lic[l.id] = 0; });
    s.res.hcl = 12;
    addLog(s, '暗い。');
    return s;
  }

  function addLog(s, text, cls, ev) {
    s.log.unshift({ t: s.t, text: text, cls: cls || '', ev: ev || null });
    if (s.log.length > 80) s.log.length = 80;
  }

  /* ================= 条件判定 ================= */
  function cond(s, c) {
    if (!c) return true;
    if (c.all) { for (var i = 0; i < c.all.length; i++) if (!cond(s, c.all[i])) return false; }
    if (c.any) { var ok = false; for (var j = 0; j < c.any.length; j++) if (cond(s, c.any[j])) ok = true; if (!ok) return false; }
    if (c.flag && !s.flags[c.flag]) return false;
    if (c.notFlag && s.flags[c.notFlag]) return false;
    if (c.tech && !s.techs[c.tech]) return false;
    if (c.upg && !s.upg[c.upg]) return false;
    if (c.era !== undefined && s.era < c.era) return false;
    if (c.pop !== undefined && s.pop < c.pop) return false;
    if (c.time !== undefined && s.t < c.time) return false;
    var k;
    if (c.res) for (k in c.res) if ((s.res[k] || 0) < c.res[k]) return false;
    if (c.bld) for (k in c.bld) if (!s.bld[k] || s.bld[k].n < c.bld[k]) return false;
    if (c.lic) for (k in c.lic) if ((s.lic[k] || 0) < c.lic[k]) return false;
    if (c.job) for (k in c.job) if ((s.jobs[k] || 0) < c.job[k]) return false;
    if (c.stat) for (k in c.stat) if ((s.stats[k] || 0) < c.stat[k]) return false;
    if (c.circ !== undefined && (s._d ? s._d.circ : 0) < c.circ) return false;
    if (c.war === 'fronts' && !(TM.War && TM.War.frontsWon(s))) return false;
    return true;
  }

  /* ================= 倍率 ================= */
  function mods(s) {
    var m = {};
    function add(k, v) { m[k] = (m[k] || 0) + v; }
    for (var id in s.upg) if (s.upg[id] && UPG[id]) UPG[id].effects.forEach(function (e) { add(e[0], e[1]); });
    for (var tid in s.techs) if (s.techs[tid] && TECH[tid] && TECH[tid].effects) TECH[tid].effects.forEach(function (e) { add(e[0], e[1]); });
    return m;
  }
  function mul(m, k) { return 1 + (m[k] || 0); }

  function cost(s, b, nOverride) {
    var n = nOverride !== undefined ? nOverride : s.bld[b.id].n;
    var out = {}, f = Math.pow(b.ratio || 1.15, n);
    for (var k in b.cost) out[k] = b.cost[k] * (b.ratioRes && b.ratioRes[k] ? Math.pow(b.ratioRes[k], n) : f);
    return out;
  }
  /* お金は与信枠の分まで使える（自動プレイの計測では使わない） */
  var noCredit = false;
  function canPay(s, c) {
    for (var k in c) {
      var have = (s.res[k] || 0) + (k === 'money' && !noCredit ? creditLimit(s) : 0);
      if (have < c[k] - 1e-9) return false;
    }
    return true;
  }
  function pay(s, c, cat) {
    for (var k in c) {
      s.res[k] -= c[k];
      if (k === 'money') { finExp(s, cat || '設備', c[k]); if (CAPEX[cat || '設備']) s.fin.book = (s.fin.book || 0) + c[k]; }
    }
  }
  /* 帳簿：設備・大型設備・改善は投資（簿価に積み、少しずつ減価償却する） */
  var CAPEX = { '設備': 1, '大型設備': 1, '改善': 1 };
  function finInc(s, cat, v) { if (v > 0) { s.fin.cur.inc[cat] = (s.fin.cur.inc[cat] || 0) + v; s.stats.earned += v; } }
  function finExp(s, cat, v) { if (v > 0) s.fin.cur.exp[cat] = (s.fin.cur.exp[cat] || 0) + v; }

  /* ================= 表示・解放 ================= */
  function resName(s, id) {
    var r = RES[id];
    if (r.alias && !s.flags[r.alias.untilFlag]) return r.alias.name;
    return r.name;
  }
  function bldVisible(s, b) { return s.bld[b.id].n > 0 || cond(s, b.unlock); }
  function techAvailable(s, t) {
    if (s.techs[t.id]) return false;
    if (t.era !== undefined && s.era < t.era) return false;
    if (t.req) for (var i = 0; i < t.req.length; i++) if (!s.techs[t.req[i]]) return false;
    return cond(s, t.unlock);
  }
  function upgVisible(s, u) { return !s.upg[u.id] && cond(s, u.unlock); }
  function jobVisible(s, j) { return cond(s, j.unlock); }

  /* ---- 出し惜しみ：まだ買っていない選択肢は、一度に数個ずつしか見せない ----
     見せたものは見せたまま。買う（研究する）と枠が空き、次が現れる。
     しばらく（遊んでいる時間で FRESH 秒）放っておいたものは枠から外れ、次が一つ現れる。 */
  var FRESH = 300;
  function limits(s) { return s.era <= 1 ? 2 : 3; }
  function bldShown(s, b) {
    if (s.bld[b.id].n > 0) return true;
    if (!cond(s, b.unlock)) return false;
    return !!b.stages || s.shown['b:' + b.id] !== undefined;
  }
  function upgShown(s, u) { return upgVisible(s, u) && s.shown['u:' + u.id] !== undefined; }
  function techShown(s, t) { return techAvailable(s, t) && s.shown['t:' + t.id] !== undefined; }
  function admit(s, pre, list, costOf) {
    var lim = limits(s), fresh = 0, cands = [];
    list.forEach(function (x) {
      var at = s.shown[pre + ':' + x.id];
      if (at === undefined) cands.push(x);
      else if (s.playT - at < FRESH) fresh++;
    });
    if (fresh >= lim || !cands.length) return;
    cands.sort(function (a, b) { return costOf(a) - costOf(b); });
    for (var i = 0; i < cands.length && fresh < lim; i++, fresh++) s.shown[pre + ':' + cands[i].id] = s.playT;
  }
  function refreshShown(s) {
    if (s.era < 1) return;
    admit(s, 'b', D.buildings.filter(function (b) { return !b.stages && s.bld[b.id].n === 0 && cond(s, b.unlock); }), function (b) { return b.cost.money || 0; });
    admit(s, 'u', D.upgrades.filter(function (u) { return upgVisible(s, u); }), function (u) { return u.cost.money || 0; });
    if (s.flags.research_known) admit(s, 't', D.techs.filter(function (t) { return techAvailable(s, t); }), function (t) { return t.cost.research || 0; });
  }

  /* ---- 手伝い：手作業のボタンを押すと、しばらくその工程が速くなる ---- */
  var HEAT_TAU = 4, HEAT_MAX = 10, HEAT_K = 0.1;
  function heatMul(s, k) { return 1 + HEAT_K * Math.min(HEAT_MAX, (s.heat && s.heat[k]) || 0); }
  function addHeat(s, k) { if (!s.heat) s.heat = {}; s.heat[k] = Math.min(HEAT_MAX, (s.heat[k] || 0) + 1); }

  function assigned(s) { var n = 0; for (var k in s.jobs) n += s.jobs[k]; return n; }
  function idle(s) { return s.pop - assigned(s) - s.training.length; }

  /* ================= 派生値（上限など） ================= */
  function derive(s) {
    var d = s._d || (s._d = {});
    var m = d.m = mods(s);
    d.cap = {};
    D.resources.forEach(function (r) { d.cap[r.id] = r.cap === null ? Infinity : r.cap; });
    d.popCap = C.basePop; d.land = C.baseLand; d.used = 0; d.powerSup = C.basePower; d.vent = C.baseVent;
    d.slots = {}; d.checkCapB = 0; d.qualityB = 0; d.forkRate = 0; d.fillerRate = 0; d.lines = 0; d.hclRecover = 0;
    d.vehicles = []; d.globalB = 0; d.gmul = 1; d.h2rec = 0; d.circParts = {};
    D.buildings.forEach(function (b) {
      var n = s.bld[b.id].n; if (!n) return;
      if (b.stages) { d.used += 0; return; }
      d.used += (b.space || 0) * n;
      var e = b.effects; if (!e) return;
      if (e.needs && !(s.bld[e.needs] && s.bld[e.needs].n > 0)) return;
      if (e.cap) for (var k in e.cap) d.cap[k] += e.cap[k] * n;
      if (e.popCap) d.popCap += e.popCap * n;
      if (e.land) d.land += e.land * n;
      if (e.power) d.powerSup += e.power * n * mul(m, 'power');
      if (e.slots) for (var j in e.slots) d.slots[j] = (d.slots[j] || 0) + e.slots[j] * n;
      if (e.transport) d.vehicles.push({ b: b, n: n, t: e.transport });
      if (e.global) d.globalB += e.global * n;
      if (e.gmul) d.gmul *= Math.pow(e.gmul, n);
      if (e.circ) for (var ck in e.circ) d.circParts[ck] = (d.circParts[ck] || 0) + e.circ[ck] * n;
    });
    D.buildings.forEach(function (b) {
      if (b.stages && s.bld[b.id].n >= b.stages && b.onComplete && b.onComplete.land) d.land += b.onComplete.land;
      if (b.stages && b.onComplete && b.onComplete.popCap && s.bld[b.id].n >= b.stages) d.popCap += b.onComplete.popCap;
    });
    if (s.war) d.globalB += s.war.bonus || 0;
    if (s.era >= 3) d.cap.research = Infinity;
    for (var ck2 in m) if (ck2.indexOf('cap.') === 0) { var rid = ck2.slice(4); if (d.cap[rid] !== undefined) d.cap[rid] *= 1 + m[ck2]; }
    if (m['cap.all']) D.resources.forEach(function (r) { if (r.cap !== null && r.id !== 'research') d.cap[r.id] *= 1 + m['cap.all']; });
    /* 循環率 */
    var circ = 0, wsum = 0;
    (D.circ || []).forEach(function (c) { wsum += c.weight; circ += c.weight * Math.min(1, (d.circParts[c.id] || 0) / c.need); });
    d.circ = wsum ? circ / wsum : 0;
    return d;
  }

  /* ================= 1ティック ================= */
  function step(s, dt) {
    var d = derive(s), m = d.m;
    s.t += dt;
    var eraSal = (D.eraSalary || [1])[s.era] || 1;
    var morale = 1;
    d.creditLimit = creditLimit(s);
    var jobAll = mul(m, 'job.all') * morale;
    if (d.gmul > 1e55) d.gmul = 1e55; /* 数が大きくなりすぎないように */
    var glob = (1 + d.globalB) * d.gmul * mul(m, 'global') * (s.era >= 4 ? 1 + d.circ * (D.circBonus || 1) : 1);
    if (s.war && s.war.fall && s.era === 9) glob *= 0.8;
    d.glob = glob;
    d.rate = {}; d.procs = []; d.led = {}; d.heatX = {};
    var before = {}; for (var r in s.res) before[r] = s.res[r];
    /* 帳面（毎秒の内訳）。hf：手伝い（クリック）の倍率。表示は手伝いを除いた「自動の分」だけにする */
    function led(k, name, amt, hf) {
      if (!amt || dt <= 0) return;
      if (hf > 1) { d.heatX[k] = (d.heatX[k] || 0) + amt * (1 - 1 / hf) / dt; amt /= hf; }
      var L = d.led[k] || (d.led[k] = {});
      L[name] = (L[name] || 0) + amt / dt;
    }
    d.ledf = led;
    if (!s._away) s.playT = (s.playT || 0) + dt;
    for (var hk in s.heat) { s.heat[hk] *= Math.exp(-dt / HEAT_TAU); if (s.heat[hk] < 0.01) s.heat[hk] = 0; }

    /* ---- 電力 ---- */
    var pDem = 0;
    D.buildings.forEach(function (b) {
      if (!b.proc || !b.proc.power || b.stages) return;
      var n = s.bld[b.id].n; if (!n) return;
      var active = b.proc.toggle ? s.bld[b.id].on : n;
      pDem += b.proc.power * active;
    });
    d.powerDem = pDem;
    d.powerEff = pDem > 0 ? Math.min(1, d.powerSup / pDem) : 1;
    if (d.powerEff < 0.999 && pDem > 0) s.flags.power_short = true;

    /* ---- 運転員の割り当て ---- */
    var opLeft = s.jobs.operate || 0;
    var noOp = m['auto.operate'] > 0;
    var opActive = {};
    D.buildings.forEach(function (b) {
      if (!b.proc || b.proc.operator !== 'operate') return;
      var on = b.proc.toggle ? s.bld[b.id].on : s.bld[b.id].n;
      if (noOp) { opActive[b.id] = on; return; }
      var a = Math.min(on, Math.floor(opLeft / (b.proc.opPer || 1)));
      opActive[b.id] = a; opLeft -= a * (b.proc.opPer || 1);
    });

    /* ---- 換気（前ティックの発生量で判定） ---- */
    var fumes = d.fumesPrev || 0;
    d.ventCap = (C.baseVent + sumEffect(s, 'vent') * d.powerEff) * mul(m, 'vent');
    d.ventEff = fumes > d.ventCap ? Math.max(0.5, d.ventCap / fumes) : 1;
    if (d.ventEff < 0.85 && s.era >= 1) s.flags.fumes_bad = true;
    var fumesNow = 0;

    /* ---- 荷役（需要を先に見積もる） ---- */
    var handleW = s.jobs.handle || 0;
    var forks = Math.min(s.bld.fork ? s.bld.fork.n : 0, handleW, s.lic.fork || 0);
    if (m['auto.fork']) forks = s.bld.fork ? s.bld.fork.n : 0;
    if (forks > 0) s.stats.forkUsed = 1;
    d.forkStat = { n: s.bld.fork ? s.bld.fork.n : 0, manned: forks };
    var handSup = (C.baseHandling + Math.max(0, handleW - (m['auto.fork'] ? 0 : forks)) * JOB.handle.rate * mul(m, 'job.handle') * jobAll
      + forks * sumEffectPer('fork', 'forklift') * d.powerEff * mul(m, 'forklift') + ((s.lic.crane > 0 || m['auto.fork']) ? sumEffect(s, 'crane') : 0) * d.powerEff + sumEffect(s, 'autohandle') * d.powerEff) * mul(m, 'handling');
    d.handSup = handSup;
    var handDem = 0;
    D.buildings.forEach(function (b) {
      if (!b.proc || !b.proc.handling) return;
      var on = b.proc.toggle ? s.bld[b.id].on : s.bld[b.id].n;
      handDem += b.proc.handling * on * glob;
    });
    var shipPlan = planShipping(s, d, m, glob);
    handDem += shipPlan.handling;
    d.handDem = handDem;
    d.handEff = handDem > 0 ? Math.min(1, handSup / handDem) : 1;
    if (d.handEff < 0.9 && s.era >= 1 && handDem > 0.5) s.flags.handling_short = true;

    /* ---- 汎用プロセス ---- */
    function run(key, name, inp, out, units, reasonPre, spill, hf) {
      /* units: 1秒あたりの実行量 × dt を掛ける前 */
      var want = units * dt, ratio = 1, reason = reasonPre || null, k, wk = null, wt = reasonPre ? 'other' : null;
      if (want <= 0) { d.procs.push({ key: key, name: name, inp: inp, out: out, rate: 0, want: units, eff: 0, reason: reason || '停止', wt: 'other' }); return 0; }
      for (k in inp) {
        var need = inp[k] * want;
        var avail = k === 'money' ? s.res.money + d.creditLimit * 0.95 : s.res[k];
        if (need > 0 && avail < need) { var rr = Math.max(0, avail) / need; if (rr < ratio) { ratio = rr; reason = '入力不足：' + resName(s, k); wk = k; wt = 'in'; } }
      }
      for (k in out) {
        if (out[k] <= 0 || (spill && spill.indexOf(k) >= 0)) continue;
        var space = d.cap[k] - s.res[k], prod = out[k] * want;
        if (prod > space) { var r2 = Math.max(0, space) / prod; if (r2 < ratio) { ratio = r2; reason = '置き場が満杯：' + resName(s, k); wk = k; wt = 'full'; } }
      }
      for (k in inp) { s.res[k] -= inp[k] * want * ratio; led(k, name, -inp[k] * want * ratio, hf); if (k === 'money') finExp(s, name, inp[k] * want * ratio); }
      for (k in out) { s.res[k] += out[k] * want * ratio; led(k, name, out[k] * want * ratio, hf); s.stats.produced[k] = (s.stats.produced[k] || 0) + out[k] * want * ratio; if (k === 'money') finInc(s, name, out[k] * want * ratio); }
      /* 排水処理は、処理する水がないだけなら止まっていても問題ない */
      if (wk === 'waste' && wt === 'in') { reason = '排水待ち（余裕あり）'; wk = null; wt = null; }
      var ok = ratio >= 0.999;
      d.procs.push({ key: key, name: name, inp: inp, out: out, rate: units * ratio, want: units, eff: ratio, reason: ok ? (reasonPre || null) : reason, wk: ok ? null : wk, wt: ok ? (reasonPre ? 'other' : null) : wt });
      return ratio;
    }

    /* 店売り（壺の時代から） */
    d.walkinInc = 0;
    if (s.flags.sold) {
      var hs = heatMul(s, 'sell');
      s.walkin = Math.min(C.walkinCap * mul(m, 'shop'), s.walkin + C.walkinRefill * mul(m, 'shop') * hs * dt);
      if (s.era >= 1) {
        var sell = Math.min(s.walkin, s.res.fecl2, C.walkinRefill * (m.shop ? 2 : 1) * hs * dt);
        if (sell > 0) {
          s.walkin -= sell; s.res.fecl2 -= sell; var inc = sell * C.walkinPrice; s.res.money += inc; finInc(s, '店売り', inc);
          led('fecl2', '店先の客', -sell, hs); led('money', '店売り', inc, hs); d.walkinInc = inc / dt;
        }
      }
      if (s.walkin < 0.5 && s.res.fecl2 >= 20 && s.era >= 1) { s.flags.walkin_empty = true; if (s.upg.shopsign) s.flags.walkin_empty2 = true; }
    }

    /* 洗缶の水：ためすすぎなどで減らせる */
    function washWater(out) {
      var f = mul(m, 'washwater'); if (f === 1) return out;
      var o = {}, k; for (k in out) o[k] = out[k]; o.waste = out.waste * Math.max(0.1, f); return o;
    }
    /* 製造の洗浄水（時代2から）。排水が満水だと、流せる分しか作れない */
    function rinsed(on, out) {
      if (!on || s.era < 2) return out;
      var o = {}, liq = 0, k; for (k in out) { o[k] = out[k]; if (k !== 'cu') liq += out[k]; }
      o.waste = (o.waste || 0) + liq * (C.rinse || 0);
      return o;
    }

    d.coolCap = 0; d.coolUsed = 0;
    /* 仕入れの設備を先に動かす（後に回すと、使う側が毎ティック空振りして揺れる） */
    D.buildings.forEach(function (b) { if (IN_PROCS['bld.' + b.id] || TREAT[b.id]) runBld(b); });

    /* 配属（汎用の入出力） */
    D.jobs.forEach(function (j) { if (j.id !== 'wash') runJob(j); });
    function runJob(j) {
      if (j.special) return;
      var w = s.jobs[j.id] || 0; if (!w) return;
      if (j.slotsFrom) w = Math.min(w, d.slots[j.slotsFrom] || 0);
      var rate = w * mul(m, 'job.' + j.id) * jobAll * glob, jh = 1;
      if (j.id === 'gather') jh = heatMul(s, 'gather');
      if (j.fumes) { rate *= d.ventEff; jh = heatMul(s, 'dissolve'); }
      rate *= jh;
      var r = run('job.' + j.id, j.name, j.in, j.id === 'wash' ? washWater(j.out) : rinsed(j.rinse, j.out), rate, (j.slotsFrom && s.jobs[j.id] > w) ? '釜が足りない' : null, null, jh);
      if (j.fumes) fumesNow += j.out.fecl2 * rate * r;
      if (j.id === 'wash') s.stats.washed += j.out.can * rate * r * dt;
    }

    /* 設備のプロセス（製造が先、洗缶が後：排水の余裕は製造に回す） */
    D.buildings.forEach(function (b) { if (!IN_PROCS['bld.' + b.id] && !TREAT[b.id] && b.group !== '容器') runBld(b); });
    runJob(JOB.wash);
    D.buildings.forEach(function (b) { if (b.group === '容器') runBld(b); });
    function runBld(b) {
      var p = b.proc; if (!p || !p.out || b.stages) return;
      var n = s.bld[b.id].n; if (!n) return;
      var on = p.toggle ? s.bld[b.id].on : n;
      var reason = null;
      /* 新缶は補充だけ：空き缶が置き場の3割を超えている間は買わない */
      if (b.id === 'canbuy' && s.res.can >= d.cap.can * 0.3) { on = 0; reason = '缶は足りている'; }
      if (p.operator === 'operate') { if (opActive[b.id] < on) reason = '運転の人手が足りない'; on = opActive[b.id]; }
      if (p.needs && !hasBld(s, p.needs)) { on = 0; reason = '必要な設備がない'; }
      /* データセンターは冷却塔で冷やせる分だけ動く */
      if (p.cooled) { var cl = Math.floor((d.coolCap || 0) - (d.coolUsed || 0) + 1e-9); if (cl < on) { on = Math.max(0, cl); reason = reason || '冷やしきれない（冷却塔が足りない）'; } d.coolUsed = (d.coolUsed || 0) + on; }
      var eff = mul(m, 'bld.' + b.id) * glob;
      if (p.power) { eff *= d.powerEff; if (d.powerEff < 0.999) reason = reason || '電力不足'; }
      if (p.handling) { eff *= d.handEff; if (d.handEff < 0.999) reason = reason || '荷役が足りない'; }
      if (p.fumes) eff *= d.ventEff;
      var bh = 1;
      if (p.fumes && p.out.fecl2) bh = heatMul(s, 'dissolve');
      if (b.id === 'scrapbuy' || b.id === 'scrapyard') bh = heatMul(s, 'gather');
      eff *= bh;
      var outM = mul(m, 'bld.' + b.id + '.out');
      var outs = p.out;
      if (outM !== 1) { outs = {}; for (var k in p.out) outs[k] = p.out[k] * outM; }
      outs = rinsed(p.rinse, outs);
      if (b.group === '容器' && outs.waste) outs = washWater(outs);
      var r = run('bld.' + b.id, b.name, p.in || {}, outs, on * eff, on === 0 && n > 0 ? (reason || '停止中') : reason, p.spill, bh);
      if (p.fumes) fumesNow += (p.out.fecl2 || p.out.fecl3w || 0) * on * eff * r;
      if (b.effects && b.effects.cool) d.coolCap = (d.coolCap || 0) + b.effects.cool * on * r;
      if (b.id === 'chlor') s.stats.fecl3 += p.out.fecl3w * on * eff * r * dt;
      if (b.id === 'conc') s.stats.fecl3h += p.out.fecl3h * on * eff * r * dt;
    }

    /* スクラバーで回収した希塩酸、水素の回収 */
    if (d.hclRecoverEff === undefined) d.hclRecoverEff = 0;
    var hclRec = sumEffect(s, 'hclRecover') * d.powerEff;
    if (hclRec > 0 && fumesNow > 0) { var hr = Math.min(d.cap.hcl - s.res.hcl, fumesNow * Math.min(0.3, hclRec) * dt * 0.66); if (hr > 0) { s.res.hcl += hr; led('hcl', 'スクラバーの回収', hr); } }
    var h2cap = sumEffect(s, 'h2rec') * d.powerEff * glob;
    s.stats.h2 += fumesNow * 0.02 * dt;
    if (h2cap > 0 && RES.h2) {
      var h2 = Math.min(fumesNow * 0.02 + (d.h2Extra || 0), h2cap) * dt;
      s.res.h2 = Math.min(d.cap.h2, s.res.h2 + h2);
    }
    d.fumesPrev = fumesNow; d.fumes = fumesNow;

    /* 検査（ロット判定） */
    var checkW = s.jobs.check || 0;
    var checkCap = (checkW * 0.6 * mul(m, 'job.check') * jobAll + sumEffect(s, 'checkCap') * d.powerEff * mul(m, 'job.check')) * mul(m, 'check') * glob;
    d.checkCap = checkCap;
    var lots = D.lots || [];
    var waitTot = 0; lots.forEach(function (l) { waitTot += Math.max(0, s.res[l.wait]); });
    var checked = 0;
    lots.forEach(function (l) {
      if (waitTot <= 0) return;
      var share = checkCap * dt * (Math.max(0, s.res[l.wait]) / waitTot);
      var mv = Math.min(share, s.res[l.wait], Math.max(0, d.cap[l.ok] - s.res[l.ok]));
      s.res[l.wait] -= mv; s.res[l.ok] += mv; checked += mv;
      led(l.wait, '検査', -mv); led(l.ok, '検査', mv);
    });
    d.checkUsed = dt > 0 ? checked / dt : 0;

    /* 充填 */
    doFill(s, d, m, dt, jobAll, glob);

    /* 出荷・販売 */
    doShipping(s, d, m, dt, shipPlan, glob);

    /* 戻り缶・使用済み液 */
    if (RES.spent) {
      var spMove = s.spentPipe * Math.min(1, 0.004 * dt);
      s.spentPipe -= spMove; var smv = Math.min(spMove, d.cap.spent - s.res.spent); if (smv > 0) { s.res.spent += smv; led('spent', '客先から戻る液', smv); }
    }

    /* 排水 */
    var allow = wasteFree(s) * dt;
    led('waste', 'そのまま流せる分', -Math.min(allow, s.res.waste));
    s.res.waste = Math.max(0, s.res.waste - allow);
    if (s.res.waste >= d.cap.waste * 0.95) s.flags.waste_full = true;

    /* 受託 */
    doContracts(s, d, m, dt, glob);

    /* 戦争（時代9から） */
    if (s.era >= 9 && TM.War) TM.War.step(s, d, dt);

    /* 給与と人の増加 */
    /* 給料はいつも払う（足りなければ与信枠から借りる） */
    var sal = s.pop * C.salary * eraSal * mul(m, 'salary') * dt;
    s.res.money -= sal; finExp(s, '給与', sal); led('money', '給料', -sal);
    d.salary = dt > 0 ? sal / dt : 0;
    s.flags.broke = false;
    /* 借りている間は利息がつく */
    d.interest = 0;
    if (s.res.money < 0) {
      s.flags.oncredit = true;
      var intr = -s.res.money * (C.creditRate || 0.0001) * dt;
      s.res.money -= intr; finExp(s, '利息', intr); led('money', '利息', -intr); d.interest = dt > 0 ? intr / dt : 0;
    }
    /* 与信枠を超えたら、猶予のあと設備を1つずつ手放す */
    if (s.res.money < -d.creditLimit) {
      s.overT = (s.overT || 0) + dt;
      if (!s.flags.over_warned) { s.flags.over_warned = true; addLog(s, '与信枠を超えた。銀行から電話が来た。「このままだと、設備を売ってもらうことになります」', 'warn'); }
      if (s.overT >= (C.overGrace || 60)) { s.overT = 0; forcedSale(s, d); }
    } else { s.overT = 0; s.flags.over_warned = false; }
    d.overLeft = s.overT ? Math.max(0, (C.overGrace || 60) - s.overT) : null;
    s.incAvg = (s.incAvg || 0) + ((d.income || 0) - (s.incAvg || 0)) * Math.min(1, dt / 600);
    if (s.era >= 1 && s.pop < d.popCap && s.flags.hired && !s.flags.broke && s.res.money > 0) {
      s.popTimer += dt * mul(m, 'arrival');
      var need = C.arrivalSec * (1 + s.pop * 0.02) * (s.pop < 8 ? 0.6 : 1);
      d.arrivalLeft = (need - s.popTimer) / mul(m, 'arrival');
      if (s.popTimer >= need) { s.popTimer = 0; s.pop++; if (s.pop <= 12 || s.pop % 10 === 0) addLog(s, '人がひとり増えた。（' + s.pop + '人）', 'dim'); }
    }

    /* 講習 */
    for (var i = s.training.length - 1; i >= 0; i--) {
      s.training[i].remain -= dt;
      if (s.training[i].remain <= 0) { var L = LIC[s.training[i].lic]; s.lic[L.id]++; addLog(s, L.name + 'の資格を取った。'); s.training.splice(i, 1); }
    }

    /* 手作業の溶解（壺） */
    if (s.manual.dissolve > 0) {
      s.manual.dissolve -= dt * mul(m, 'manual.dissolve');
      if (s.manual.dissolve <= 0) {
        s.manual.dissolve = 0;
        s.res.fecl2 = Math.min(d.cap.fecl2 + 3, s.res.fecl2 + C.manualBatch.fecl2);
        s.stats.batches++;
        if (s.stats.batches === 1) addLog(s, '液が、うすい緑に染まった。');
      }
    }

    /* 上限処理 */
    for (var rid in s.res) {
      if (s.res[rid] !== s.res[rid] || s.res[rid] === Infinity) s.res[rid] = 0; /* NaN・無限大の保険 */
      if (s.res[rid] < 0 && rid !== 'money') s.res[rid] = 0;
      if (d.cap[rid] !== undefined && s.res[rid] > d.cap[rid] && rid !== 'fecl2') s.res[rid] = d.cap[rid];
    }
    if (s.res.fecl2 > d.cap.fecl2 + 3) s.res.fecl2 = d.cap.fecl2 + 3;
    if (s.res.research > d.cap.research) s.res.research = d.cap.research;

    /* 毎秒の増減。一度でも手にした資源は表示する */
    for (var r2 in s.res) {
      d.rate[r2] = dt > 0 ? (s.res[r2] - before[r2]) / dt - (d.heatX[r2] || 0) : 0;
      if (s.res[r2] > 0.0001 && !s.flags['r_' + r2]) s.flags['r_' + r2] = true;
    }
    smooth(s, d, dt);

    /* 敷地 */
    if (d.used >= d.land * 0.85 && s.era >= 1) s.flags.space_tight = true;
    if (s.era >= 1 && (s.res.scrap >= d.cap.scrap * 0.99 || s.res.hcl >= d.cap.hcl * 0.99)) s.flags.raw_full = true;
    if (!s._away) refreshShown(s);

    /* 暦・月次・物語・出来事 */
    s.fin.monthT += dt;
    var dep = (s.fin.book || 0) * Math.min(1, dt / (C.depSec || 6000));
    s.fin.book = (s.fin.book || 0) - dep; s.fin.cur.dep = (s.fin.cur.dep || 0) + dep;
    if (s.fin.monthT >= C.monthSec) {
      s.fin.monthT -= C.monthSec;
      var inc = 0, exp = 0, k2;
      for (k2 in s.fin.cur.inc) inc += s.fin.cur.inc[k2];
      for (k2 in s.fin.cur.exp) exp += s.fin.cur.exp[k2];
      s.fin.cur.total = { inc: inc, exp: exp };
      s.fin.cur.cash1 = Math.max(0, s.res.money); s.fin.cur.debt1 = Math.max(0, -s.res.money); s.fin.cur.book1 = s.fin.book; s.fin.cur.inv1 = invValue(s, d);
      s.fin.hist.unshift(s.fin.cur); if (s.fin.hist.length > 12) s.fin.hist.length = 12;
      s.fin.cur = { inc: {}, exp: {}, dep: 0, cash0: Math.max(0, s.res.money), debt0: Math.max(0, -s.res.money) };
    }
    doCalendar(s, dt);
    checkStory(s);
    checkHook(s);
    doEvents(s, dt);
    if (s.flags.claimPending) { s.flags.claimed = true; s.flags.claimPending = false; }
  }

  /* ---- 暦：創業年から。1年の長さは時代ごとに違う（だいたい史実っぽい年に時代が変わるように） ---- */
  function seasonIdx(s) { var yf = s.cal ? s.cal.yf : 0; return Math.floor((yf - Math.floor(yf)) * 4) % 4; }
  function calYear(s) { return D.calendar.founded + Math.floor(s.cal ? s.cal.yf : 0); }
  function doCalendar(s, dt) {
    var K = D.calendar, cal = s.cal;
    if (s.era < 1) return;
    var before = Math.floor(cal.yf);
    cal.yf += dt / (K.yearSec[s.era] || K.yearSec[K.yearSec.length - 1]);
    var after = Math.floor(cal.yf);
    for (var y = before + 1; y <= after; y++) {
      var year = K.founded + y;
      /* 年商（その1年の売上） */
      var sales = s.stats.earned - (cal.y0Earned || 0);
      cal.y0Earned = s.stats.earned; cal.last = sales;
      K.sales.forEach(function (m) {
        if (sales >= m[0] && !cal.salesDone[m[0]]) { cal.salesDone[m[0]] = 1; addLog(s, year + '年　' + m[1], 'special'); }
      });
      /* 周年 */
      if (y >= 50 && y % (y < 100 ? 10 : y < 300 ? 50 : 100) === 0) {
        var txt = K.anniv[y] || K.annivDefault[(y / 10) % K.annivDefault.length];
        addLog(s, '創業' + y + '周年（' + year + '年）。' + txt, 'special anniv');
      }
    }
  }

  /* 酸も液もお金もなく、手が止まっている（ツケで酸を分けてもらえる） */
  function stuck(s) { return s.res.hcl < 2 && s.res.fecl2 < 3 && s.res.money < C.acidBuy.cost; }

  /* 在庫の評価（売値の半分＝原価のつもり） */
  function invValue(s, d) {
    var seen = {}, v = 0;
    ((d && d.sales) || []).forEach(function (x) { if (seen[x.stock]) return; seen[x.stock] = 1; v += Math.max(0, s.res[x.stock] || 0) * x.price * 0.5; });
    if (s.era >= 1 && !seen.fecl2) v += Math.max(0, s.res.fecl2 || 0) * C.walkinPrice * 0.5;
    return v;
  }
  /* 財務三表（月ごと）。p：s.fin.cur か s.fin.hist[i] */
  function statements(s, d, p, live) {
    var R = 0, other = 0, saleIn = 0, cogs = 0, sga = 0, rnd = 0, intr = 0, capex = 0, k, v;
    for (k in p.inc) { v = p.inc[k]; if (k === '臨時') other += v; else if (k === '設備の売却') saleIn += v; else R += v; }
    for (k in p.exp) {
      v = p.exp[k];
      if (CAPEX[k]) capex += v;
      else if (k === '利息') intr += v;
      else if (k === '給与' || k === '人件費' || k === '講習') sga += v;
      else if (k === '研究' || (BLDN[k] && BLDN[k].group === '研究')) rnd += v;
      else cogs += v;
    }
    var dep = p.dep || 0, gross = R - cogs, op = gross - sga - rnd - dep, ord = op + other - intr;
    var cash1 = live ? Math.max(0, s.res.money) : p.cash1, debt1 = live ? Math.max(0, -s.res.money) : p.debt1;
    var cfo = R + other - cogs - sga - rnd - intr, cfi = saleIn - capex, cff = (debt1 || 0) - (p.debt0 || 0);
    return {
      pl: { sales: R, cogs: cogs, gross: gross, sga: sga, rnd: rnd, dep: dep, op: op, other: other, intr: intr, ord: ord },
      cf: { op: cfo, inv: cfi, fin: cff, net: cfo + cfi + cff, cash0: p.cash0 || 0, cash1: cash1 || 0, capex: capex, saleIn: saleIn },
      bs: { cash: cash1 || 0, inv: live ? invValue(s, d) : (p.inv1 || 0), book: live ? (s.fin.book || 0) : (p.book1 || 0), debt: debt1 || 0 }
    };
  }

  /* 与信枠：借りられる上限（信用と稼ぎに応じて） */
  function creditLimit(s) {
    if (s.era < 1) return 0;
    return 60 + (s.res.credit || 0) * 5 + Math.max(0, s.incAvg || 0) * 1800;
  }

  /* 画面に出す毎秒の値はならす（工程どうしの取り合いで毎ティック揺れるため） */
  var SMOOTH_TAU = 6, snapT = 0;
  /* 人や設備を動かした直後は、ならしを短くしてすぐ数字に出す（計画が立てやすいように） */
  var snapN = 0;
  function snap() { snapT = 2; snapN++; }
  function smooth(s, d, dt) {
    var tau = snapT > 0 ? 0.35 : SMOOTH_TAU; if (!s._away) snapT = Math.max(0, snapT - dt);
    var a = 1 - Math.exp(-dt / tau), k, n;
    if (!d.rateS) { d.rateS = {}; d.ledS = {}; a = 1; }
    for (k in d.rate) { var o = d.rateS[k]; d.rateS[k] = o === undefined ? d.rate[k] : o + (d.rate[k] - o) * a; }
    for (k in d.led) { var L = d.ledS[k] || (d.ledS[k] = {}); for (n in d.led[k]) if (L[n] === undefined) L[n] = 0; }
    for (k in d.ledS) {
      var LS = d.ledS[k], cur = d.led[k] || {};
      for (n in LS) { LS[n] += ((cur[n] || 0) - LS[n]) * a; if (Math.abs(LS[n]) < 1e-12 && !cur[n]) delete LS[n]; }
    }
    var inc = (d.income || 0) + (d.walkinInc || 0);
    d.incomeS = d.incomeS === undefined ? inc : d.incomeS + (inc - d.incomeS) * a;
    d.filledS = d.filledS === undefined ? (d.filled || 0) : d.filledS + ((d.filled || 0) - d.filledS) * a;
    var mo = 0; (d.procs || []).forEach(function (p) { if (procStage(p.key) === 'make') for (var o in p.out) if (D.flow.liquid.indexOf(o) >= 0) mo += p.out[o] * p.rate; });
    d.makeOutS = d.makeOutS === undefined ? mo : d.makeOutS + (mo - d.makeOutS) * a;
  }

  /* 「必要な設備」：ボイラーはヒートポンプでもよい */
  var NEEDS_ALT = { boiler: ['heatpump'] };
  function hasBld(s, id) {
    if (s.bld[id] && s.bld[id].n > 0) return true;
    return (NEEDS_ALT[id] || []).some(function (a) { return s.bld[a] && s.bld[a].n > 0; });
  }
  function sumEffect(s, key) {
    var t = 0;
    D.buildings.forEach(function (b) {
      if (!b.effects || b.effects[key] === undefined || b.stages) return;
      var n = s.bld[b.id].n; if (!n) return;
      if (b.effects.needs && !(s.bld[b.effects.needs] && s.bld[b.effects.needs].n > 0)) return;
      if (b.effects.needsRes && (s.res[b.effects.needsRes] || 0) < 1) return;
      t += b.effects[key] * n;
    });
    return t;
  }
  function sumEffectPer(bid, key) { return BLD[bid] && BLD[bid].effects ? BLD[bid].effects[key] || 0 : 0; }

  /* ---------------- 充填 ---------------- */
  function lineCap(s, m) {
    var mn = Infinity, worst = null, det = [];
    D.lineModules.forEach(function (mod) {
      var lv = Math.min(mod.levels.length - 1, Math.round(m['line.' + mod.id] || 0));
      var rate = mod.levels[lv][1] * mul(m, 'linespeed');
      det.push({ id: mod.id, name: mod.name, lv: lv, label: mod.levels[lv][0], rate: rate });
      if (rate < mn) { mn = rate; worst = mod.id; }
    });
    return { rate: mn, worst: worst, det: det };
  }

  function doFill(s, d, m, dt, jobAll, glob) {
    var w = s.jobs.fill || 0;
    var lines = s.bld.line ? s.bld.line.n : 0, fillers = s.bld.filler ? s.bld.filler.n : 0;
    var autoLine = m['auto.line'] > 0;
    var lc = lineCap(s, m); d.lineInfo = lc;
    var linesManned = autoLine ? lines : Math.min(lines, Math.floor(w / 2)); w -= autoLine ? 0 : linesManned * 2;
    var fillersManned = autoLine ? fillers : Math.min(fillers, w); w -= autoLine ? 0 : fillersManned;
    var handRate = Math.max(0, w) * JOB.fill.rate * mul(m, 'job.fill') * jobAll;
    var fRate = fillersManned * sumEffectPer('filler', 'filler') * d.powerEff * mul(m, 'filler');
    var lRate = linesManned * lc.rate * d.powerEff;
    var cap = (handRate + fRate + lRate) * glob;
    d.fillCap = cap; d.linesManned = linesManned; d.lineRate = lRate * glob; d.fillersManned = fillersManned;
    if (cap <= 0) return;
    var budget = cap * dt;
    var cands = [];
    D.products.forEach(function (p) {
      if (p.kind !== 'can') return;
      if (p.license && !(s.lic[p.license] > 0)) return;
      if (p.unlock && !cond(s, p.unlock)) return;
      var kg = p.kg || C.canKg;
      var maxBy = Math.min(s.res[p.liquid] / kg, d.cap[p.id] - s.res[p.id]);
      if (p.container === 'can') maxBy = Math.min(maxBy, s.res.can);
      if (maxBy <= 0) return;
      var room = 1 - s.res[p.id] / Math.max(1, d.cap[p.id]);
      cands.push({ p: p, kg: kg, max: maxBy, w: Math.max(0.05, room) * (p.fillWeight || 1) });
    });
    var wsum = 0; cands.forEach(function (c) { wsum += c.w; });
    var filled = 0, lineShare = cap > 0 ? lRate * glob / cap : 0;
    cands.forEach(function (c) {
      var amt = Math.min(budget * c.w / wsum, c.max);
      if (c.p.container === 'can') amt = Math.min(amt, s.res.can);
      if (amt <= 0) return;
      s.res[c.p.liquid] -= amt * c.kg; d.ledf(c.p.liquid, '充填', -amt * c.kg);
      if (c.p.container === 'can') { s.res.can -= amt; d.ledf('can', '充填', -amt); }
      else if (c.p.containerCost) { var cc = amt * c.p.containerCost; s.res.money -= cc; finExp(s, '容器', cc); d.ledf('money', '容器', -cc); }
      s.res[c.p.id] += amt; filled += amt; d.ledf(c.p.id, '充填', amt);
    });
    d.filled = dt > 0 ? filled / dt : 0;
    /* ラインのクレーム（重量検査が抜き取りのとき） */
    if (lines > 0 && Math.round(m['line.weigh'] || 0) < 1) {
      var lineCans = filled * lineShare;
      s._claimAcc = (s._claimAcc || 0) + lineCans * 0.01;
      if (s._claimAcc >= 1) {
        s._claimAcc -= 1;
        var loss = Math.max(1, s.res.credit * 0.01) * (m.claimHalf ? 0.5 : 1);
        s.res.credit = Math.max(0, s.res.credit - loss);
        s.flags.claimPending = true;
      }
    }
  }

  /* ---------------- 出荷 ---------------- */
  function zoneInfo(s, d, m) {
    /* 缶の輸送力・ゾーン、バルク輸送力・ゾーン */
    var drivers = s.jobs.deliver || 0;
    var lic = {}; for (var k in s.lic) lic[k] = s.lic[k];
    var autoDrv = m['auto.drive'] > 0;
    var vs = d.vehicles.slice().sort(function (a, b) { return (b.t.rate || 0) - (a.t.rate || 0); });
    var canRate = 0, bulkRate = 0, canZone = 0, bulkZone = -1, used = 0, missing = [];
    d.vehStat = {};
    vs.forEach(function (v) {
      var t = v.t, n = v.n;
      var why = null;
      if (t.requires) { for (var i = 0; i < t.requires.length; i++) if (!(s.bld[t.requires[i]] && s.bld[t.requires[i]].n > 0)) { missing.push(t.requires[i]); n = 0; why = '足りない設備：' + BLD[t.requires[i]].name; } }
      var manned = n;
      if (!autoDrv && !t.auto) {
        manned = Math.min(n, drivers - used);
        if (t.license) {
          var pool = t.license === 'jmid' ? (lic.jmid || 0) + (lic.mid || 0) + (lic.big || 0) : t.license === 'mid' ? (lic.mid || 0) + (lic.big || 0) : (lic[t.license] || 0);
          manned = Math.min(manned, pool);
          /* 使った免許を減らす（上位から順に） */
          var left = manned, order = t.license === 'jmid' ? ['jmid', 'mid', 'big'] : t.license === 'mid' ? ['mid', 'big'] : [t.license];
          order.forEach(function (o) { var u2 = Math.min(left, lic[o] || 0); lic[o] = (lic[o] || 0) - u2; left -= u2; });
        }
        manned = Math.max(0, manned); used += manned;
        if (manned < n) why = why || (t.license && manned >= 0 ? '運転手（' + LIC[t.license].name + '・配達の人手）が足りない' : '運転手（配達の人手）が足りない');
      }
      d.vehStat[v.b.id] = { n: v.n, manned: manned, why: why };
      if (manned <= 0) return;
      if (t.kind === 'bulk') { bulkRate += t.rate * manned; bulkZone = Math.max(bulkZone, t.zone); }
      else { canRate += t.rate * manned; canZone = Math.max(canZone, t.zone); }
    });
    var walkers = autoDrv ? 0 : Math.max(0, drivers - used);
    canRate += walkers * JOB.deliver.rate * mul(m, 'walk') * mul(m, 'job.deliver');
    canRate *= heatMul(s, 'sell');
    canZone += (m.zone || 0); bulkZone = bulkZone >= 0 ? bulkZone + (m.zone || 0) : -1;
    var maxZ = D.zones.length - 1;
    return { canRate: canRate * mul(m, 'transport'), bulkRate: bulkRate * mul(m, 'transport') * mul(m, 'bulk'),
      canZone: Math.min(maxZ, canZone), bulkZone: Math.min(maxZ, bulkZone), walkers: walkers, missing: missing };
  }

  function demandOf(s, d, m, p, zone) {
    if (zone < 0) return 0;
    var z = D.zones[zone];
    var season = p.season ? p.season[seasonIdx(s)] : 1;
    var credit = 1 + Math.log(1 + s.res.credit) / Math.LN10 * 0.6;
    var big = 1 + 0.25 * Math.min(8, sumEffect(s, 'bigpack'));
    return big * p.demand * z.demand * mul(m, 'demand') * mul(m, 'demand.' + p.id) * credit * season;
  }
  function priceOf(s, d, m, p, zone) {
    var z = D.zones[Math.max(0, zone)];
    var q = p.quality ? 1 + (m.quality || 0) + sumEffect(s, 'quality') : 1;
    return p.price * z.price * mul(m, 'price') * mul(m, 'price.' + p.id) * q * (s.era >= 4 ? 1 + d.circ * 0.5 : 1);
  }

  function planShipping(s, d, m, glob) {
    var zi = zoneInfo(s, d, m); d.zi = zi;
    var plan = { handling: 0, items: [] };
    var canLeft = zi.canRate * glob, bulkLeft = zi.bulkRate * glob;
    var list = D.products.filter(function (p) { return !p.unlock || cond(s, p.unlock); });
    list = list.slice().sort(function (a, b) { return priceOf(s, d, m, b, 0) / (b.kg || C.canKg) - priceOf(s, d, m, a, 0) / (a.kg || C.canKg); });
    list.forEach(function (p) {
      if (p.license && !(s.lic[p.license] > 0)) return;
      var zone = p.kind === 'bulk' ? zi.bulkZone : p.kind === 'direct' ? (p.zone || 0) : zi.canZone;
      if (p.kind === 'bulk' && zone < 0) return;
      var dem = demandOf(s, d, m, p, zone);
      var stockRes = p.kind === 'bulk' || p.kind === 'direct' ? p.src : p.id;
      var rate = dem;
      if (p.kind === 'can') { rate = Math.min(rate, canLeft); canLeft -= rate; }
      if (p.kind === 'bulk') { rate = Math.min(rate, bulkLeft); bulkLeft -= rate; }
      plan.items.push({ p: p, zone: zone, rate: rate, dem: dem, stock: stockRes });
      if (p.kind === 'can') plan.handling += rate;
      if (p.kind === 'direct') plan.handling += rate * (p.handling || 0);
    });
    plan.canLeft = canLeft; plan.bulkLeft = bulkLeft;
    return plan;
  }

  function doShipping(s, d, m, dt, plan, glob) {
    d.sales = []; d.dcanBlock = false;
    var totalInc = 0;
    plan.items.forEach(function (it) {
      var p = it.p;
      var want = it.rate * dt;
      if (p.kind === 'can' || p.kind === 'direct') want *= d.handEff;
      var amt = Math.min(want, s.res[it.stock]);
      /* 缶は配達の帰りに、前に届けた缶（空き缶）を引き取ってくる。置き場がなければ配達に出られない */
      var ret = 0;
      if (p.kind === 'can' && p.container === 'can' && amt > 0) {
        ret = Math.min(s.custCans || 0, amt);
        var room = Math.max(0, d.cap.dcan - s.res.dcan);
        if (ret > room) { amt = Math.max(0, amt - (ret - room)); ret = Math.min(ret, room); d.dcanBlock = true; }
      }
      var price = priceOf(s, d, m, p, it.zone);
      var inc = amt * price;
      if (amt > 0) {
        var sh = p.kind === 'can' && it.rate < it.dem * 0.999 ? heatMul(s, 'sell') : 1;
        s.res[it.stock] -= amt; d.ledf(it.stock, '出荷', -amt, sh);
        s.res.money += inc; totalInc += inc; d.ledf('money', p.kind === 'bulk' ? 'ローリー出荷' : p.kind === 'direct' ? '引き取り' : '缶の出荷', inc, sh);
        finInc(s, p.name, inc);
        s.stats.sold[p.id] = (s.stats.sold[p.id] || 0) + amt;
        if (p.kind === 'bulk') s.stats.lorryUsed = 1;
        if (p.id === 'cloud') s.stats.cloudSold = 1;
        if (p.kind === 'can') {
          s.stats.cansSold += amt;
          s.res.credit += amt * 0.02 * mul(m, 'credit');
          if (p.container === 'can') {
            var rr = Math.min(0.97, C.returnRate * mul(m, 'return'));
            s.custCans = Math.max(0, (s.custCans || 0) - ret) + amt * rr;
            s.stats.cansLost = (s.stats.cansLost || 0) + amt * (1 - rr);
            if (ret > 0) { s.res.dcan += ret; d.ledf('dcan', '配達の帰りに回収', ret); }
          }
        } else s.res.credit += amt * (p.creditPer || 0.001) * mul(m, 'credit');
        if (p.spent && s.flags.spent_on) s.spentPipe += amt * (p.kind === 'can' ? 20 : 1) * p.spent;
      }
      d.sales.push({ p: p, zone: it.zone, dem: it.dem, rate: dt > 0 ? amt / dt : 0, price: price, cap: it.rate, stock: it.stock });
    });
    d.income = dt > 0 ? totalInc / dt : 0;
  }

  /* ---------------- 受託 ---------------- */
  function doContracts(s, d, m, dt, glob) {
    var K = s.contracts; if (!D.contracts || !s.techs[D.contracts.tech]) return;
    K.timer -= dt;
    if (K.timer <= 0) {
      K.timer = D.contracts.offerSec;
      if (K.offers.length < 3) {
        var pool = D.contracts.templates.filter(function (t) { return cond(s, t.unlock); });
        if (pool.length) {
          var tpl = pool[Math.floor(U.rng(s) * pool.length)];
          var scale = Math.pow(D.contracts.scaleBase, s.era) * (1 + K.done * 0.15);
          K.offers.push({ id: ++K.seq, tpl: tpl.id, scale: scale });
        }
      }
    }
    var slots = (s.jobs.sales || 0) + (m['sales.slots'] || 0);
    d.contractSlots = slots;
    var running = 0;
    K.active.forEach(function (c) {
      var tpl = tplById(c.tpl);
      if (c.step >= D.contracts.steps.length) {
        /* 継続受託：毎秒の収入と消費 */
        var ok = 1, k;
        for (k in tpl.use) { var need = tpl.use[k] * c.scale * dt; if (need > 0 && s.res[k] < need) ok = Math.min(ok, s.res[k] / need); }
        for (k in tpl.use) { s.res[k] -= tpl.use[k] * c.scale * dt * ok; d.ledf(k, '受託', -tpl.use[k] * c.scale * dt * ok); }
        var inc = tpl.income * c.scale * ok * glob * dt * mul(m, 'contract');
        s.res.money += inc; finInc(s, '受託', inc); d.ledf('money', '受託', inc);
        c.eff = ok;
        return;
      }
      if (running >= slots) { c.waiting = '営業の人手が足りない'; return; }
      running++;
      var st = D.contracts.steps[c.step];
      var need2 = st.needs ? (tpl.needs || {})[st.id] : null;
      if (need2 && !cond(s, need2)) { c.waiting = '保留：必要な設備・分析がない'; return; }
      c.waiting = null;
      c.prog += dt * mul(m, 'contract.speed');
      if (c.prog >= st.sec) {
        c.prog = 0;
        if (st.id === 'eval') {
          var q = 0.55 + (m.quality || 0) + sumEffect(s, 'quality');
          if (U.rng(s) > Math.min(0.95, q)) { c.step = 1; addLog(s, '受託「' + tpl.name + '」：サンプルが不合格。検討からやり直し。', 'dim'); return; }
        }
        c.step++;
        if (c.step >= D.contracts.steps.length) { K.done++; s.stats.contractsDone = K.done; addLog(s, '受託「' + tpl.name + '」が製品化された。毎月の収入になる。'); }
      }
    });
  }
  function tplById(id) { for (var i = 0; i < D.contracts.templates.length; i++) if (D.contracts.templates[i].id === id) return D.contracts.templates[i]; return null; }

  /* ---------------- 物語・フック・出来事 ---------------- */
  function checkStory(s) {
    D.story.forEach(function (st) {
      if (s.storySeen[st.id]) return;
      if (!cond(s, st.cond)) return;
      s.storySeen[st.id] = true;
      if (st.setFlag) s.flags[st.setFlag] = true;
      s.stats.at[st.id] = s.t;
      addLog(s, st.text, st.cls || 'story');
    });
  }
  function checkHook(s) {
    if (s.era >= 1 && !s.flags.hook && s.t >= Math.max(C.hookSec, (s.stats.at.era1 || 0) + 120)) {
      s.flags.hook = true; s.flags.research_known = true; s.stats.at.hook = s.t;
      addLog(s, '帳面をつけ始めた。考えることが増えた。');
      addLog(s, '夜、釜の液面に星が映っていた。', 'story');
    }
    if (s.flags.hook && !s.flags.memo && s.t >= Math.max(C.memoSec, s.stats.at.hook + 150)) {
      s.flags.memo = true; s.stats.at.memo = s.t;
      addLog(s, '留守のあいだも、釜は溶かし続ける。', 'story');
    }
  }
  function doEvents(s, dt) {
    if (s.era < 1) return;
    if (s.evActive) { s.evActive.left -= dt; if (s.evActive.left <= 0) s.evActive = null; return; }
    s.evTimer -= dt;
    if (s.evTimer > 0) return;
    s.evTimer = 400 + U.rng(s) * 600;
    var pool = D.events.filter(function (e) { return cond(s, e.cond); });
    if (!pool.length) return;
    var e = pool[Math.floor(U.rng(s) * pool.length)];
    s.evActive = { id: e.id, left: 90 };
  }
  function claimEvent(s) {
    if (!s.evActive) return;
    var e = null; D.events.forEach(function (x) { if (x.id === s.evActive.id) e = x; });
    s.evActive = null; if (!e) return;
    var d = derive(s);
    for (var k in e.give) {
      var v = e.give[k];
      var amt = v === 'cap' ? (isFinite(d.cap[k]) ? Math.max(0, d.cap[k] - s.res[k]) * 0.5 : Math.max(10, (d.rate && d.rate[k] > 0 ? d.rate[k] : 0) * 600))
        : v === 'income60' ? Math.max(20, (d.income || 0) * 60) : v;
      s.res[k] += amt;
      if (k === 'money') finInc(s, '臨時', amt);
    }
    addLog(s, e.text + '（受け取った）', 'dim');
  }

  /* ================= プレイヤーの操作 ================= */
  /* 手作業。時代1からは、押すたびにその工程を「手伝う」（しばらく速くなる） */
  var actions = {
    grope: { vis: function (s) { return !s.flags.groped; }, run: function (s) { s.flags.groped = true; addLog(s, '冷たい。釘が一本。'); } },
    pick: {
      vis: function (s) { return s.flags.groped && s.era < 3; },
      label: function (s) { return s.era >= 1 ? '鉄くずを拾う' : '拾う'; },
      heat: 'gather',
      run: function (s) {
        var d = derive(s);
        if (s.era >= 1) addHeat(s, 'gather');
        if (s.res.scrap >= d.cap.scrap) return;
        s.res.scrap = Math.min(d.cap.scrap, s.res.scrap + 1 * (s.era >= 1 ? mul(d.m, 'job.gather') : 1));
        if (!s.flags.picked) { s.flags.picked = true; addLog(s, '鼻を刺す匂い。壺がある。'); }
      }
    },
    sink: {
      vis: function (s) { return s.flags.picked && s.era < 3; },
      label: function (s) { return s.era >= 1 ? (s.flags.acid_known ? '塩酸で溶かす' : '酸で溶かす') : '沈める'; },
      heat: 'dissolve',
      busy: function (s) { return s.manual.dissolve > 0; },
      /* 溶かした液を置く場所がなければ溶かさない（作りすぎて捨てることはしない） */
      can: function (s) { var d = derive(s); return s.res.scrap >= 1 && s.res.hcl >= 2 && s.res.fecl2 + C.manualBatch.fecl2 * (s.era >= 1 ? mul(d.m, 'manual.dissolve') : 1) <= d.cap.fecl2 + 3; },
      ok: function (s) { return s.era >= 1 || (actions.sink.can(s) && s.manual.dissolve <= 0); },
      run: function (s) {
        if (!actions.sink.ok(s)) return;
        if (s.era >= 1) {
          /* 待たずにその場で溶かし、溶解の工程も手伝う */
          addHeat(s, 'dissolve');
          if (!actions.sink.can(s)) return;
          var d = derive(s);
          s.res.scrap -= C.manualBatch.scrap; s.res.hcl -= C.manualBatch.hcl;
          s.res.fecl2 = Math.min(d.cap.fecl2 + 3, s.res.fecl2 + C.manualBatch.fecl2 * mul(d.m, 'manual.dissolve'));
          s.stats.batches++;
          return;
        }
        s.res.scrap -= C.manualBatch.scrap; s.res.hcl -= C.manualBatch.hcl;
        s.manual.dissolve = C.manualDissolveSec;
        if (!s.flags.sunk) { s.flags.sunk = true; addLog(s, '泡が立つ。釘が、細くなっていく。'); }
      }
    },
    give: {
      vis: function (s) { return s.flags.knock && s.era < 3; },
      label: function (s) { return s.era >= 2 ? '売り込みに回る' : s.era >= 1 ? '店先で売る' : '渡す'; },
      heat: 'sell',
      ok: function (s) { return s.era >= 1 || (s.res.fecl2 >= 1 && s.walkin >= 1); },
      run: function (s) {
        if (s.era >= 1) addHeat(s, 'sell');
        var amt = Math.min(s.res.fecl2, s.walkin); if (amt <= 0) return;
        s.res.fecl2 -= amt; s.walkin -= amt;
        var inc = amt * C.walkinPrice; s.res.money += inc; finInc(s, '店売り', inc);
        if (!s.flags.sold) { s.flags.sold = true; addLog(s, '硬貨が手に残る。'); }
      }
    },
    buyacid: {
      vis: function (s) { return s.flags.sold && s.era < 3; },
      label: function (s) { return s.flags.acid_known ? '塩酸を買う' : '酸を買う'; },
      ok: function (s) { var d = derive(s); return (s.res.money + creditLimit(s) >= C.acidBuy.cost || stuck(s)) && s.res.hcl + C.acidBuy.kg <= d.cap.hcl; },
      cost: function () { return { money: C.acidBuy.cost }; },
      run: function (s) {
        var d = derive(s); if (!actions.buyacid.ok(s)) return;
        if (s.res.money + creditLimit(s) < C.acidBuy.cost && !s.flags.tab) { s.flags.tab = true; addLog(s, '店の主人が「ツケでいいよ」と塩酸を分けてくれた。'); }
        s.res.money -= C.acidBuy.cost; finExp(s, '仕入れ', C.acidBuy.cost);
        s.res.hcl += C.acidBuy.kg;
        s.flags.bought_acid = true; s.stats.acidBuys = (s.stats.acidBuys || 0) + 1;
      }
    },
    hire: {
      vis: function (s) { return s.flags.hire_reveal && s.era === 0; },
      label: '人を呼ぶ',
      cost: function (s) { return { money: C.hireBase * Math.pow(C.hireRatio, s.pop) }; },
      ok: function (s) { return s.pop < C.basePop && canPay(s, actions.hire.cost(s)); },
      run: function (s) {
        if (!actions.hire.ok(s)) return;
        pay(s, actions.hire.cost(s), '人件費'); s.pop++; s.jobs.gather++;
        if (!s.flags.hired) { s.flags.hired = true; addLog(s, '近所の若いのが手伝いに来た。鉄くずを集めてくれる。'); }
      }
    },
    setkama: {
      vis: function (s) { return s.flags.kama_reveal && s.era === 0; },
      label: '釜を据える',
      cost: function () { return { money: 60 }; },
      ok: function (s) { return canPay(s, { money: 60 }); },
      run: function (s) {
        if (!actions.setkama.ok(s)) return;
        pay(s, { money: 60 }); s.bld.kama.n = 1; s.era = 1; s.stats.at.era1 = s.t;
        addLog(s, '釜を据えた。湯気の向こうで、何かが始まる。', 'story');
      }
    },
    buycans: {
      vis: function (s) { return s.flags.cans_known && s.era < 2; },
      label: 'ポリ缶を買う（5個）',
      cost: function () { return { money: C.canBuy.cost }; },
      ok: function (s) { var d = derive(s); return canPay(s, { money: C.canBuy.cost }) && s.res.can + C.canBuy.n <= d.cap.can; },
      run: function (s) {
        if (!actions.buycans.ok(s)) return;
        s.res.money -= C.canBuy.cost; finExp(s, '容器', C.canBuy.cost); s.res.can += C.canBuy.n;
      }
    }
  };
  function actLabel(s, id) { var a = actions[id]; return id === 'grope' ? '手探りする' : typeof a.label === 'function' ? a.label(s) : a.label; }

  function doAction(s, id) {
    var a = actions[id]; if (!a) return;
    if (a.vis && !a.vis(s)) return;
    s.stats.clicks++;
    a.run(s);
    if (!s.flags.knock && s.stats.batches >= 2) {
      s.flags.knock = true; s.walkin = 12;
      addLog(s, '戸を叩く音。「その緑の液、譲ってもらえないか」');
    }
    checkStory(s);
  }

  /* 建てられない理由（建てられるなら ''） */
  function whyNot(s, b) {
    if (!bldShown(s, b)) return 'まだ見えていない';
    if (b.stages && s.bld[b.id].n >= b.stages) return '完成済み';
    if (b.max && s.bld[b.id].n >= b.max) return 'これ以上は置けない';
    var d = derive(s);
    if ((b.space || 0) > 0 && d.used + b.space > d.land) return '敷地が足りない';
    if (b.buildCond && !cond(s, b.buildCond)) return condText(b.buildCond);
    if (!canPay(s, cost(s, b))) return 'お金・資材が足りない';
    return '';
  }
  function condText(c) {
    if (c.war === 'fronts') return '条件：4つの前線をすべて押し返す';
    return '条件：循環率' + Math.round((c.circ || 0) * 100) + '%以上';
  }
  function build(s, id) {
    var b = BLD[id]; if (!b || whyNot(s, b)) return false;
    var c = cost(s, b);
    pay(s, c, b.stages ? '大型設備' : '設備');
    s.bld[id].n++;
    if (b.proc && b.proc.toggle) s.bld[id].on++;
    if (b.stages && s.bld[id].n >= b.stages && b.onComplete) {
      var oc = b.onComplete;
      if (oc.era !== undefined && s.era < oc.era) { s.era = oc.era; s.stats.at['era' + oc.era] = s.t; if (TM.War) TM.War.onEra(s); }
      if (oc.flag) s.flags[oc.flag] = true;
      if (oc.ending) { s.ending = 1; s.stats.at.ending = s.t; s.stats.ended = 1; }
      addLog(s, b.name + 'が完成した。', 'story');
    }
    return true;
  }
  /* 与信枠を超えたときの強制売却：住まい・土地・大型設備以外で、いちばん高く売れるものを1つ */
  function forcedSale(s, d) {
    var best = null, bv = 0;
    D.buildings.forEach(function (b) {
      var n = s.bld[b.id].n; if (!n || b.stages) return;
      var e = b.effects || {}; if (e.land || e.popCap) return;
      var v = (cost(s, b, n - 1).money || 0) * 0.5;
      if (v > bv) { bv = v; best = b; }
    });
    if (!best) return;
    sell(s, best.id);
    s.stats.forced = (s.stats.forced || 0) + 1;
    addLog(s, '与信枠を超えたので、' + best.name + 'を1つ手放した（+' + U.fmt(bv) + '円）。', 'warn');
  }
  function sell(s, id) {
    var b = BLD[id]; if (!b || b.stages || s.bld[id].n <= 0) return;
    s.bld[id].n--;
    if (s.bld[id].on > s.bld[id].n) s.bld[id].on = s.bld[id].n;
    var c = cost(s, b, s.bld[id].n);
    for (var k in c) s.res[k] += c[k] * 0.5;
    if (c.money) { finInc(s, '設備の売却', c.money * 0.5); s.stats.earned -= c.money * 0.5; s.fin.book = Math.max(0, (s.fin.book || 0) - c.money * 0.5); }
  }
  function setOn(s, id, delta) {
    var b = s.bld[id]; if (!b) return;
    b.on = U.clamp(b.on + delta, 0, b.n);
  }
  function research(s, id) {
    var t = TECH[id]; if (!t || !techShown(s, t) || !canPay(s, t.cost)) return false;
    pay(s, t.cost, '研究'); s.techs[id] = true; s.stats.at['tech_' + id] = s.t;
    if (t.setFlag) s.flags[t.setFlag] = true;
    if (t.log) addLog(s, t.log, 'story');
    return true;
  }
  function buyUpg(s, id) {
    var u = UPG[id]; if (!u || !upgShown(s, u) || !canPay(s, u.cost)) return false;
    pay(s, u.cost, '改善'); s.upg[id] = true; return true;
  }
  function setJob(s, id, delta) {
    var j = JOB[id]; if (!j || !jobVisible(s, j)) return;
    if (delta > 0) delta = Math.min(delta, idle(s));
    if (delta < 0) delta = Math.max(delta, -s.jobs[id]);
    s.jobs[id] += delta;
  }
  /* 配属を1人増やす。手すきがいなければ、一番人の多い配属から1人まわす */
  function moveJob(s, id) {
    var j = JOB[id]; if (!j || !jobVisible(s, j)) return false;
    if (idle(s) < 1) {
      var from = null;
      for (var k in s.jobs) if (k !== id && s.jobs[k] > 0 && (!from || s.jobs[k] > s.jobs[from])) from = k;
      if (!from) return false;
      s.jobs[from]--;
    }
    s.jobs[id]++;
    return true;
  }
  function train(s, id) {
    var L = LIC[id]; if (!L || !cond(s, L.unlock)) return false;
    if (idle(s) < 1 || !canPay(s, L.cost)) return false;
    pay(s, L.cost, '講習'); s.training.push({ lic: id, remain: L.time });
    return true;
  }
  function acceptOffer(s, oid) {
    var K = s.contracts;
    for (var i = 0; i < K.offers.length; i++) if (K.offers[i].id === oid) {
      var o = K.offers.splice(i, 1)[0];
      var tpl = tplById(o.tpl);
      var c = { id: o.id, tpl: o.tpl, scale: o.scale, step: 0, prog: 0 };
      K.active.push(c);
      addLog(s, '受託「' + tpl.name + '」のヒアリングを始めた。', 'dim');
      return true;
    }
    return false;
  }
  function declineOffer(s, oid) {
    var K = s.contracts; K.offers = K.offers.filter(function (o) { return o.id !== oid; });
  }

  /* ================= 流れの診断（どこが詰まっているか） =================
     仕入れ → つくる → 詰める → 売る。下流から見て、たまっている所のすぐ後ろが詰まりの元。 */
  /* 排水処理：先に動かして、作る側の置き場を空ける */
  var TREAT = { neutral: 1, coag: 1, wreuse: 1 };
  var IN_PROCS = { 'job.gather': 1, 'bld.scrapbuy': 1, 'bld.acidbuy': 1, 'bld.acidtank': 1, 'bld.scrapyard': 1, 'bld.ureabuy': 1, 'bld.ureasyn': 1 };
  function procStage(key) {
    if (IN_PROCS[key]) return 'in';
    if (key === 'job.dissolve') return 'make';
    if (key.indexOf('bld.') === 0) { var b = BLD[key.slice(4)]; if (b && b.group === '製造') return 'make'; }
    return 'other';
  }
  function frac(s, d, k) { var c = d.cap[k]; return c && c !== Infinity && c > 0 ? s.res[k] / c : 0; }
  function sumLed(d, k, sign) { var L = (d.ledS || d.led || {})[k], t = 0; if (L) for (var n in L) if (L[n] * sign > 0) t += L[n]; return t; }

  function wasteFree(s) { var a = D.consts.wasteFreeEra; return (a ? a[Math.min(s.era, a.length - 1)] : (D.consts.wasteFree || 0.05)) + sumEffect(s, 'drain'); }

  function diagnose(s, d) {
    if (!d || !d.procs || s.era < 1) return null;
    var F = D.flow, hasFill = !!s.flags.cans_known, lots = {};
    (D.lots || []).forEach(function (l) { lots[l.wait] = l.ok; });
    var main = null;
    function set(stage, title, detail, fixKey, extra) { if (!main) main = { stage: stage, title: title, detail: detail, fixKey: fixKey, extra: extra || null }; }

    /* 0. 排水が満水：流せない水は出せないので、排水を出す工程が止まる */
    if (s.flags.r_waste && frac(s, d, 'waste') >= 0.95) {
      var wp = d.procs.filter(function (p) { return p.wk === 'waste' && p.wt === 'full' && p.want > 0; });
      var wMake = wp.some(function (p) { return procStage(p.key) === 'make'; });
      if (wp.length) set(wMake ? 'make' : (hasFill ? 'fill' : 'make'), '排水が満水', '流せない排水がたまり、' + wp.slice(0, 3).map(function (p) { return p.name; }).join('・') + 'が止まりかけている。', 'waste');
    }
    /* 0b. 汚れた缶があふれて、配達に出られない */
    if (d.dcanBlock && frac(s, d, 'dcan') >= 0.95) set('sell', '汚れた缶があふれている', '戻ってきた缶の置き場がいっぱいで、配達の帰りに空き缶を引き取れない。洗わないと出荷できない。', 'dcan');
    /* 1. 売る：売り物が置き場いっぱい */
    var full = null, transport = false, handling = d.handEff < 0.9;
    (d.sales || []).forEach(function (x) {
      if (x.p.kind === 'bulk' && x.zone < 0) return;
      if (!s.flags['r_' + x.stock] || frac(s, d, x.stock) < 0.9) return;
      if (x.p.kind === 'can' && !hasFill) return;
      /* 売上の小さい品は気にしない（注文で頭打ちなのは、よほど大きい品だけ） */
      var tcap = x.cap < x.dem * 0.98;
      if (x.dem * x.price < (tcap ? 0.03 : 0.15) * (d.income || 0)) return;
      if (x.p.kind !== 'can' && lots[x.stock] === undefined && D.products.some(function (q) { return q.kind === 'can' && q.liquid === x.stock && frac(s, d, q.id) < 0.9 && s.flags['r_' + q.id]; }) && x.cap >= x.dem * 0.98) return;
      if (!full) full = x;
      if (x.cap < x.dem * 0.98) transport = true;
    });
    if (!hasFill && frac(s, d, 'fecl2') >= 0.9 && s.flags.sold) full = full || { walkin: true };
    if (full) {
      var nm = full.walkin ? resName(s, 'fecl2') : resName(s, full.stock);
      if (handling && !full.walkin) set('sell', '荷役が追いつかない', nm + 'が置き場いっぱい。運び出す手（荷役）が足りない。', 'handling');
      else if (full.walkin) set('sell', '店先の客が足りない', nm + 'が置き場いっぱい。店先に来る客だけでは売り切れない。', 'walkin');
      else if (transport) set('sell', '運ぶのが追いつかない', nm + 'が置き場いっぱい。注文はあるのに、運ぶ手・車が足りない。', full.p.kind === 'bulk' ? 'bulk' : 'transport');
      else set('sell', '注文が足りない', nm + 'が置き場いっぱい。届く範囲の注文は、もう出し切っている。', 'demand');
    }
    /* 2. 詰める：液はあるのに缶入りが増えない */
    var nextBehind = null;
    if (!main && hasFill) {
      var canShort = false, fillShort = null;
      D.products.forEach(function (p) {
        if (p.kind !== 'can' || !s.flags['r_' + p.liquid]) return;
        if (p.license && !(s.lic[p.license] > 0)) return;
        if (p.unlock && !cond(s, p.unlock)) return;
        if (frac(s, d, p.liquid) < 0.9 || frac(s, d, p.id) >= 0.9) return;
        /* 次の工程（塩素化など）の原料でもある液なら、詰めるより次の工程の詰まり */
        var usedNext = (d.procs || []).some(function (q) { return procStage(q.key) === 'make' && q.want > 0 && q.inp && q.inp[p.liquid] > 0 && q.key !== 'job.dissolve'; });
        if (usedNext) { nextBehind = nextBehind || p.liquid; return; }
        var sx = null; (d.sales || []).forEach(function (x) { if (x.p.id === p.id) sx = x; });
        if (sx && sx.dem * sx.price < 0.03 * (d.income || 0)) return;
        if (p.container === 'can' && s.res.can < 1) canShort = true; else fillShort = fillShort || p;
      });
      if (canShort) set('fill', '空き缶が足りない', '液はあるのに、詰める缶がない。', 'cans');
      else if (fillShort) set('fill', '詰めるのが追いつかない', resName(s, fillShort.liquid) + 'が置き場いっぱい。缶に詰める手が足りない。', 'fill');
    }
    if (!main && nextBehind) set('make', '次の工程が追いつかない', resName(s, nextBehind) + 'が置き場いっぱい。使う側（塩素化など）を増やす。', 'next');
    /* 3. 仕入れ・つくる：つくる工程が止まっている理由 */
    var starved = null, other = null, waitFull = null;
    d.procs.forEach(function (p) {
      if (procStage(p.key) !== 'make' || !p.wt || p.want <= 0) return;
      if (p.wt === 'in' && p.wk) { if (!starved) starved = p; }
      else if (p.wt === 'full' && p.wk && lots[p.wk] !== undefined) { if (!waitFull) waitFull = p; }
      else if (p.wt === 'other' && p.reason !== '停止中' && p.reason !== '停止') { if (!other) other = p; }
    });
    if (!main && waitFull) set('make', '検査が追いつかない', resName(s, waitFull.wk) + 'がたまっている。検査しないと売り物にならない。', 'check');
    if (!main && starved) {
      var k = starved.wk, raw = F.raw.indexOf(k) >= 0;
      if (k === 'money') set('in', 'お金が足りない', starved.name + 'に払うお金が足りない（与信枠もほぼ使い切った）。', 'money');
      else if (raw) set('in', resName(s, k) + 'が足りない', starved.name + 'が' + resName(s, k) + '待ちで止まりがち。', k);
      else set('make', resName(s, k) + 'が足りない', starved.name + 'が' + resName(s, k) + '待ち。手前の工程を増やす。', F.fixes[k] ? k : 'make');
    }
    if (!main && other) {
      var r = other.reason, fk = r.indexOf('釜') >= 0 ? 'slots' : r.indexOf('運転') >= 0 ? 'operator' : r.indexOf('電力') >= 0 ? 'power' : r.indexOf('荷役') >= 0 ? 'handling' : 'make';
      set('make', r, other.name + '：' + r + '。', fk);
    }
    if (!main && d.ventEff < 0.85) set('make', '換気が足りない', '酸の霧がこもって、溶かす手が鈍っている。', 'vent');
    if (!main && d.powerEff < 0.95) set('make', '電力が足りない', '電気を使う設備がすべて遅くなっている。', 'power');
    /* 4. 原料がたまっている → つくる手が足りない */
    if (!main && (frac(s, d, 'scrap') >= 0.9 || frac(s, d, 'hcl') >= 0.9)) {
      var idleSlots = (d.slots.dissolve || 0) - (s.jobs.dissolve || 0);
      set('make', 'つくる手が足りない', '原料がたまっている。溶かす量を増やせば、そのまま売り物が増える。', idleSlots > 0 ? 'make' : 'slots');
    }
    /* 5. どこもたまっていない：売れる分だけつくれているか */
    if (!main) {
      var short = false;
      (d.sales || []).forEach(function (x) { if (x.rate < x.dem * 0.7 && s.res[x.stock] < (x.p.kind === 'can' ? 1 : 20) && s.flags['r_' + x.stock]) short = true; });
      if (!hasFill && s.res.fecl2 < 3 && s.walkin > 3) short = true;
      if (short) {
        var rawLow = frac(s, d, 'scrap') < 0.1 || frac(s, d, 'hcl') < 0.1;
        if (rawLow) set('in', '原料が足りない', '注文に対して、つくる量が足りない。原料が細っている。', frac(s, d, 'hcl') < frac(s, d, 'scrap') ? 'hcl' : 'scrap');
        else set('make', 'つくる量が足りない', '売れる分だけつくれていない。', 'make');
      } else set('ok', '流れは順調', '詰まっている所はない。どこかを広げれば、全体が伸びる。', null);
    }
    /* 各段の数字 */
    var makeOut = d.makeOutS || 0;
    var inScrap = sumLed(d, 'scrap', 1), inHcl = sumLed(d, 'hcl', 1);
    var stages = [
      { id: 'in', name: '仕入れ', v: s.era >= 3 ? [['塩酸', inHcl]] : [['鉄くず', inScrap], ['塩酸', inHcl]] },
      { id: 'make', name: 'つくる', v: [['液', makeOut, 'kg']] }
    ];
    if (hasFill) stages.push({ id: 'fill', name: '詰める', v: [['', d.filledS || 0, '缶']] });
    stages.push({ id: 'sell', name: '売る', v: [['', d.incomeS || 0, '円']] });
    return { stages: stages, main: main };
  }

  /* 手当ての候補（今見えていて、効きそうなもの） */
  function fixesFor(s, d, key) {
    var list = (D.flow.fixes[key] || []), hands = [], gear = [];
    var reach = Math.max(1, s.res.money) * 4 + Math.max(0, d.income || 0) * 900;
    list.forEach(function (f) {
      var kind = f[0], id = f[1];
      if (kind === 'job') {
        if (!JOB[id] || !jobVisible(s, JOB[id])) return;
        if (id === 'dissolve' && (d.slots.dissolve || 0) <= (s.jobs.dissolve || 0)) return;
        if (id === 'fill' && s.bld.line && s.bld.line.n && m2(d, 'auto.line')) return;
        if (id === 'operate' && m2(d, 'auto.operate')) return;
        hands.push(f);
      } else if (kind === 'act') { var a = actions[id]; if (a && (!a.vis || a.vis(s))) hands.push(f); }
      else if (kind === 'bld') { var b = BLD[id]; if (b && bldShown(s, b) && !(b.max && s.bld[id].n >= b.max) && !b.stages) gear.push([f, cost(s, b).money || 0, b.cost.money || 0]); }
      else if (kind === 'upg') { if (UPG[id] && upgShown(s, UPG[id])) gear.push([f, UPG[id].cost.money || 0, UPG[id].cost.money || 0]); }
      else if (kind === 'tech') { if (TECH[id] && techShown(s, TECH[id])) gear.push([f, 0, 1e30]); }
    });
    /* 設備は「手が届く範囲で、いちばん大がかりなもの」から。届かないものは安い順に後ろへ */
    var near = gear.filter(function (g) { return g[1] <= reach; }).sort(function (a, b) { return b[2] - a[2]; });
    var far = gear.filter(function (g) { return g[1] > reach; }).sort(function (a, b) { return a[1] - b[1]; });
    var out = (s.era >= 3 ? [] : hands.slice(0, 2)).concat(near.map(function (g) { return g[0]; }), far.map(function (g) { return g[0]; }), s.era >= 3 ? hands : []);
    out = out.slice(0, 3);
    /* 敷地が足りなくて置けないなら、先に土地を */
    var landBlocked = out.some(function (f) { return f[0] === 'bld' && whyNot(s, BLD[f[1]]) === '敷地が足りない'; });
    if (landBlocked && BLD.land && bldShown(s, BLD.land)) out = [['bld', 'land']].concat(out).slice(0, 3);
    return out;
  }
  function m2(d, k) { return d.m && d.m[k] > 0; }

  /* ================= オフライン進行 ================= */
  /* bonus：休憩チケットで倍速だった秒数（上限とは別に足す） */
  function simulateAway(s, sec, bonus) {
    var full = Math.min(sec, C.offlineFull);
    var half = Math.max(0, Math.min(sec, C.offlineHalf) - C.offlineFull) * C.offlineHalfRate;
    var total = full + half + Math.max(0, Math.min(bonus || 0, sec));
    var before = U.deepCopy(s.res);
    var dtStep = Math.max(1, Math.min(15, total / 6000));
    var t = 0;
    s._away = true;
    try { while (t < total) { var dd = Math.min(dtStep, total - t); step(s, dd); t += dd; } } finally { s._away = false; }
    s.stats.offline += total;
    return { away: sec, simulated: total, before: before };
  }

  /* ================= 休憩チケット =================
     使うと、それから4時間は倍速で進む（留守中も）。チケットは20時間ごとに1枚もらえる（3枚まで） */
  var BOOST = { sec: 4 * 3600, grant: 20 * 3600, max: 3 };
  function boostState(s) {
    if (!s.boost) s.boost = { n: 1, from: 0, to: 0, last: Date.now() };
    return s.boost;
  }
  function boostGrant(s, now) {
    var b = boostState(s);
    if (s.era < 1) { b.last = now; return; }
    if (now > b.last + BOOST.grant * 1000) {
      var k = Math.floor((now - b.last) / (BOOST.grant * 1000));
      b.n = Math.min(BOOST.max, b.n + k); b.last += k * BOOST.grant * 1000;
      if (b.n >= BOOST.max) b.last = now;
    }
  }
  function useBoost(s, now) {
    var b = boostState(s); if (b.n <= 0) return false;
    b.n--;
    if (now < b.to) b.to += BOOST.sec * 1000; else { b.from = now; b.to = now + BOOST.sec * 1000; }
    addLog(s, '休憩チケットを使った。これから4時間、工場が倍の速さで動く。', 'story');
    return true;
  }
  /* [a, b] の間で倍速だった秒数 */
  function boostOverlap(s, a, b) { var x = boostState(s); return Math.max(0, Math.min(b, x.to) - Math.max(a, x.from)) / 1000; }

  /* ================= セーブ ================= */
  var KEY = 'taiki-minigame-save';
  function serialize(s) {
    var copy = {}; for (var k in s) if (k !== '_d' && k !== '_away') copy[k] = s[k];
    /* 時計が戻っていたら知らんぷり（最後に見た時刻より前には戻さない） */
    copy.saved = Math.max(s.saved || 0, Date.now());
    return JSON.stringify(copy);
  }
  function save(s) {
    try { s.saved = Math.max(s.saved || 0, Date.now()); localStorage.setItem(KEY, serialize(s)); return true; } catch (e) { return false; }
  }
  function load() {
    try { var raw = localStorage.getItem(KEY); if (!raw) return null; var o = JSON.parse(raw); if ((o.v || 1) < 2) return null; /* 缶の循環を入れる前のセーブは、最初から */ return migrate(o); } catch (e) { return null; }
  }
  function migrate(o) {
    var s = newState();
    for (var k in o) {
      if (typeof o[k] === 'object' && o[k] !== null && !Array.isArray(o[k]) && s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) {
        for (var k2 in o[k]) s[k][k2] = o[k][k2];
      } else s[k] = o[k];
    }
    /* データに新しく増えた項目を補う */
    D.resources.forEach(function (r) { if (s.res[r.id] === undefined) s.res[r.id] = 0; });
    D.buildings.forEach(function (b) { if (!s.bld[b.id]) s.bld[b.id] = { n: 0, on: 0 }; });
    D.jobs.forEach(function (j) { if (s.jobs[j.id] === undefined) s.jobs[j.id] = 0; });
    D.licenses.forEach(function (l) { if (s.lic[l.id] === undefined) s.lic[l.id] = 0; });
    if (!o.shown) {
      /* 出し惜しみの仕組みより前のセーブ：見えていたものはそのまま見せる */
      D.buildings.forEach(function (b) { if (cond(s, b.unlock)) s.shown['b:' + b.id] = -1e9; });
      D.upgrades.forEach(function (u) { if (upgVisible(s, u)) s.shown['u:' + u.id] = -1e9; });
      D.techs.forEach(function (t) { if (techAvailable(s, t)) s.shown['t:' + t.id] = -1e9; });
    }
    if (!s.heat) s.heat = { gather: 0, dissolve: 0, sell: 0 };
    if (o.returnPipe !== undefined && o.custCans === undefined) s.custCans = o.returnPipe;
    delete s.returnPipe;
    if (!o.fin || o.fin.book === undefined) {
      /* 帳簿の仕組みより前のセーブ：今ある設備を、建てた値段の3割で簿価に入れておく */
      var bk = 0; D.buildings.forEach(function (b) { for (var i = 0; i < (s.bld[b.id].n || 0); i++) bk += cost(s, b, i).money || 0; });
      s.fin.book = bk * 0.3;
      if (s.fin.cur.debt0 === undefined) { s.fin.cur.cash0 = Math.max(0, s.res.money); s.fin.cur.debt0 = Math.max(0, -s.res.money); s.fin.cur.dep = 0; }
    }
    if (!o.cal) s.cal = { yf: s.t / 4800, y0Earned: s.stats.earned, salesDone: {}, last: 0 };
    s.v = D.version;
    return s;
  }
  function exportText(s) { return btoa(unescape(encodeURIComponent(serialize(s)))); }
  function importText(txt) { return migrate(JSON.parse(decodeURIComponent(escape(atob(txt.trim()))))); }
  function wipe() { try { localStorage.removeItem(KEY); } catch (e) { /* 無視 */ } }

  return {
    pay: pay, condText: condText, hasBld: hasBld,
    snap: snap, snapCount: function () { return snapN; }, setNoCredit: function (v) { noCredit = !!v; }, forcedSale: forcedSale, statements: statements, invValue: invValue,
    init: init, newState: newState, step: step, derive: derive, cond: cond, cost: cost, canPay: canPay,
    actions: actions, doAction: doAction, build: build, sell: sell, setOn: setOn, research: research, buyUpg: buyUpg,
    setJob: setJob, train: train, acceptOffer: acceptOffer, declineOffer: declineOffer, claimEvent: claimEvent,
    resName: resName, bldVisible: bldVisible, techAvailable: techAvailable, upgVisible: upgVisible, jobVisible: jobVisible,
    idle: idle, assigned: assigned, moveJob: moveJob, whyNot: whyNot, actLabel: actLabel, heatMul: heatMul,
    bldShown: bldShown, upgShown: upgShown, techShown: techShown, diagnose: diagnose, fixesFor: fixesFor, procStage: procStage,
    creditLimit: creditLimit, sumEffect: sumEffect, calYear: calYear, wasteFree: wasteFree, seasonIdx: seasonIdx, lineCap: lineCap, mods: mods, priceOf: priceOf, demandOf: demandOf, tplById: tplById,
    simulateAway: simulateAway, boostState: boostState, boostGrant: boostGrant, useBoost: useBoost, boostOverlap: boostOverlap, BOOST: BOOST, save: save, load: load, exportText: exportText, importText: importText, wipe: wipe,
    addLog: addLog, KEY: KEY,
    get RES() { return RES; }, get BLD() { return BLD; }, get JOB() { return JOB; }, get TECH() { return TECH; },
    get UPG() { return UPG; }, get LIC() { return LIC; }, get PROD() { return PROD; }
  };
})();
