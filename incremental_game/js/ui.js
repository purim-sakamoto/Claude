/* 画面の描画。状態(TM.state)を読み、操作はエンジンの関数を呼ぶ */
var TM = window.TM = window.TM || {};

TM.UI = (function () {
  var E = TM.Engine, U = TM.util, D, el = U.el;
  var tab = 'site', lastSig = {}, refs = {}, seenTabs = {};
  var $ = function (id) { return document.getElementById(id); };

  function S() { return TM.state; }
  function RT(d) { return d.rateS || d.rate || {}; }
  function f(n) { return U.fmt(n, S().settings.expo); }
  function fr(r) { return U.fmtRate(r, S().settings.expo); }

  function init() {
    D = TM.DATA;
    /* クリックはまとめて受ける（描き直しでボタンが入れ替わっても取りこぼさない） */
    document.body.addEventListener('click', onClick);
    $('gear').addEventListener('click', openSettings);
    initTip();
    try { tab = localStorage.getItem('taiki-minigame-tab') || 'site'; } catch (e) { /* 無視 */ }
  }

  function onClick(e) {
    var t = e.target.closest('[data-a]'); if (!t) return;
    var a = t.getAttribute('data-a'), id = t.getAttribute('data-id'), v = +t.getAttribute('data-v') || 0;
    var s = S();
    switch (a) {
      case 'act': E.doAction(s, id); break;
      case 'build': E.build(s, id); break;
      case 'sell': if (confirm('1つ解体しますか？（費用の半分が戻ります）')) E.sell(s, id); break;
      case 'on': E.setOn(s, id, v); break;
      case 'job': E.setJob(s, id, v); break;
      case 'train': E.train(s, id); break;
      case 'tech': E.research(s, id); break;
      case 'upg': E.buyUpg(s, id); break;
      case 'tab': tab = id; try { localStorage.setItem('taiki-minigame-tab', tab); } catch (e2) { /* 無視 */ } lastSig.panel = null; break;
      case 'accept': E.acceptOffer(s, +id); break;
      case 'decline': E.declineOffer(s, +id); break;
      case 'event': E.claimEvent(s); break;
      case 'fix': doFix(s, id); break;
      case 'goto': goto(t.getAttribute('data-tab'), id); break;
      case 'close': closeModal(); break;
      default: if (TM.UIActions && TM.UIActions[a]) TM.UIActions[a](t, id, v);
    }
    render(true);
  }

  /* ============ 全体 ============ */
  function render(force) {
    var s = S(); if (!s) return;
    var d = s._d || E.derive(s);
    document.body.setAttribute('data-era', s.era);
    document.body.classList.toggle('intro', s.era === 0);
    document.body.classList.toggle('noanim', !s.settings.anim);
    document.body.classList.toggle('hasresources', s.era === 0 && !!s.flags.picked);
    renderTitle(s);
    renderTop(s, d);
    renderLog(s);
    renderResources(s, d);
    renderActions(s, d);
    renderAlerts(s, d);
    renderFlow(s, d);
    renderTabs(s);
    renderPanel(s, d, force);
    flashPending();
    updateTip();
    if (s.ending && TM.UIEnding) TM.UIEnding(s);
  }

  function renderTitle(s) {
    var m = $('mini');
    var want = s.era >= 6 && s.settings.gag !== false ? 'gone' : s.era >= 5 && s.settings.gag !== false ? 'strike' : 'plain';
    if (m.getAttribute('data-st') === want) return;
    m.setAttribute('data-st', want);
    m.innerHTML = want === 'gone' ? '' : want === 'strike' ? '<s>ミニ</s>' : 'ミニ';
  }

  function renderTop(s, d) {
    var C = D.consts;
    var memo = '';
    if (s.flags.memo) {
      var open = [];
      for (var i = 0; i < D.memos.length && open.length < 3; i++) if (!E.cond(s, D.memos[i].done)) open.push(D.memos[i].text);
      if (open.length) memo = '<b>作業メモ</b>' + open[0] + (open[1] ? '<span class="dim">　／　' + open[1] + '</span>' : '');
      if (!memo) memo = '<b>作業メモ</b>……';
    }
    setHTML($('memo'), memo);
    var year = E.calYear(s), season = D.seasons[E.seasonIdx(s)];
    setHTML($('cal'), s.era >= 1 ? year + '年（' + wareki(year) + '）　' + season : '');
  }

  function wareki(y) {
    var n, e;
    if (y >= 2019) { e = '令和'; n = y - 2018; } else if (y >= 1989) { e = '平成'; n = y - 1988; } else { e = '昭和'; n = y - 1925; }
    return e + (n === 1 ? '元' : n) + '年';
  }
  function renderLog(s) {
    var sig = s.log.length + ':' + (s.log[0] ? s.log[0].t + s.log[0].text : '');
    if (sig !== lastSig.log) {
      lastSig.log = sig;
      var box = $('log'); box.innerHTML = '';
      s.log.slice(0, 40).forEach(function (l, i) { box.appendChild(el('div', { class: (l.cls || '') + (i === 0 ? ' fade' : ''), text: l.text })); });
    }
    var ev = $('event'), evSig = s.evActive ? s.evActive.id : '';
    if (evSig !== lastSig.ev) {
      lastSig.ev = evSig; ev.innerHTML = '';
      if (s.evActive) {
        var e = null; D.events.forEach(function (x) { if (x.id === s.evActive.id) e = x; });
        if (e) ev.appendChild(el('div', { class: 'ev fade' }, [e.text, el('br'), el('button', { class: 'btn', 'data-a': 'event', text: e.button })]));
      }
    }
  }

  /* ============ 資源 ============ */
  function renderResources(s, d) {
    var rows = [];
    D.resources.forEach(function (r) {
      if (!s.flags['r_' + r.id]) return;
      if (r.id === 'research' && !s.flags.research_known) return;
      rows.push(r.id);
    });
    var extra = [];
    if (s.pop > 0) extra.push('pop');
    if (s.era >= 1) extra.push('land');
    if (s.flags.power_known) extra.push('power');
    if (s.era >= 2 || s.flags.handling_short) extra.push('handling');
    if (s.flags.smoke) extra.push('vent');
    if (s.era >= 4) extra.push('circ');
    if (s.res.money < 0 || s.flags.oncredit) extra.push('creditline');
    var sig = rows.join(',') + '|' + extra.join(',');
    var box = $('resources');
    if (sig !== lastSig.res) {
      lastSig.res = sig; box.innerHTML = ''; refs.res = {};
      rows.forEach(function (id) {
        var nm = el('span', { class: 'nm' }), v = el('span', { class: 'v' }), r = el('span', { class: 'r' });
        var row = el('div', { class: 'res fade', 'data-tip': 'res:' + id }, [nm, v, r]);
        refs.res[id] = { row: row, nm: nm, v: v, r: r };
        box.appendChild(row);
      });
      if (extra.length) box.appendChild(el('div', { class: 'resgroup', text: '状況' }));
      extra.forEach(function (id) {
        var nm = el('span', { class: 'nm' }), v = el('span', { class: 'v' }), r = el('span', { class: 'r' });
        var row = el('div', { class: 'res fade', 'data-tip': 'x:' + id }, [nm, v, r]);
        refs.res['x_' + id] = { row: row, nm: nm, v: v, r: r };
        box.appendChild(row);
      });
    }
    rows.forEach(function (id) {
      var x = refs.res[id], R = E.RES[id], cap = d.cap[id];
      setText(x.nm, E.resName(s, id));
      var unit = (id === 'hcl' && !s.flags.acid_known) || (id === 'fecl2' && !s.flags.fecl2_known) ? '' : R.unit;
      var val = f(s.res[id]) + (cap !== undefined && cap !== Infinity && cap !== null ? ' / ' + f(cap) : '') + (unit && unit !== '円' ? ' ' + unit : unit === '円' ? '円' : '');
      setText(x.v, val);
      var rate = RT(d)[id] || 0;
      var hk = id === 'scrap' ? 'gather' : id === 'fecl2' ? 'dissolve' : id === 'money' ? 'sell' : null;
      var hm = hk && s.era >= 1 ? E.heatMul(s, hk) : 1;
      setText(x.r, fr(rate) + (hm > 1.05 ? '　手伝い ×' + hm.toFixed(1) : '') + (id === 'money' && s.res.money < 0 ? '　掛け' : ''));
      x.row.classList.toggle('hot', hm > 1.05);
      x.row.classList.toggle('full', cap !== Infinity && cap > 0 && s.res[id] >= cap * 0.999);
      x.row.classList.toggle('neg', rate < -1e-9);
      if (id === 'money') x.v.classList.toggle('bad', s.res.money < 0);
    });
    extra.forEach(function (id) {
      var x = refs.res['x_' + id];
      if (id === 'pop') { setText(x.nm, '人手'); setText(x.v, s.pop + ' / ' + d.popCap + '人'); setText(x.r, (s.flags.broke ? '手が鈍っている ×0.5　' : '') + (E.idle(s) > 0 ? '手すき ' + E.idle(s) + '人' : '')); x.row.classList.toggle('alert', !!s.flags.broke); }
      if (id === 'land') { setText(x.nm, '敷地'); setText(x.v, f(d.used) + ' / ' + f(d.land)); x.row.classList.toggle('full', d.used >= d.land * 0.95); setText(x.r, ''); }
      if (id === 'power') { setText(x.nm, '電力'); setText(x.v, f(d.powerDem) + ' / ' + f(d.powerSup)); x.row.classList.toggle('full', d.powerEff < 1); setText(x.r, d.powerEff < 1 ? '足りない（' + Math.round(d.powerEff * 100) + '%）' : ''); }
      if (id === 'handling') { setText(x.nm, '荷役'); setText(x.v, f(d.handDem) + ' / ' + f(d.handSup)); x.row.classList.toggle('full', d.handEff < 1); setText(x.r, d.handEff < 1 ? '足りない（' + Math.round(d.handEff * 100) + '%）' : ''); }
      if (id === 'vent') { setText(x.nm, '換気'); setText(x.v, Math.round((d.ventEff || 1) * 100) + '%'); x.row.classList.toggle('full', d.ventEff < 1); setText(x.r, ''); }
      if (id === 'circ') { setText(x.nm, '循環率'); setText(x.v, Math.round(d.circ * 100) + '%'); setText(x.r, ''); }
      if (id === 'creditline') { setText(x.nm, '掛けの枠'); setText(x.v, s.res.money < 0 ? '残り ' + f(Math.max(0, d.creditLimit + s.res.money)) + '円' : f(d.creditLimit) + '円'); setText(x.r, s.res.money < 0 ? '掛けで仕入れ中：給料が払えず、作業が半分に' : ''); x.row.classList.toggle('alert', s.res.money < 0); }
    });
  }

  /* ============ 手作業のボタン ============ */
  var ACTION_ORDER = ['grope', 'pick', 'sink', 'give', 'buyacid', 'hire', 'setkama', 'buycans'];
  function renderActions(s) {
    var vis = ACTION_ORDER.filter(function (id) { var a = E.actions[id]; return !a.vis || a.vis(s); });
    if (s.era >= 1 && tab !== 'site') vis = [];
    var box = $('actions'), sig = vis.join(',');
    if (sig !== lastSig.act) {
      lastSig.act = sig; box.innerHTML = ''; refs.act = {};
      vis.forEach(function (id) {
        var b = el('button', { class: 'btn fade', 'data-a': 'act', 'data-id': id, 'data-tip': 'act:' + id });
        var lab = el('span'), sm = el('small'), pr = el('span', { class: 'prog' });
        b.appendChild(lab); b.appendChild(sm); b.appendChild(pr);
        refs.act[id] = { b: b, lab: lab, sm: sm, pr: pr };
        box.appendChild(b);
      });
    }
    vis.forEach(function (id) {
      var a = E.actions[id], r = refs.act[id];
      setText(r.lab, E.actLabel(s, id));
      var c = a.cost ? a.cost(s) : null;
      var hm = a.heat && s.era >= 1 ? E.heatMul(s, a.heat) : 1;
      setText(r.sm, c ? costText(s, c, true) : hm >= 1.05 ? '手伝い中 ×' + hm.toFixed(1) : a.heat && s.era >= 1 ? '押すと速くなる' : '');
      r.b.classList.toggle('na', !!(a.ok && !a.ok(s)));
      r.b.classList.toggle('hot', hm >= 1.05);
      var p = id === 'sink' && s.manual.dissolve > 0 ? (1 - s.manual.dissolve / D.consts.manualDissolveSec) * 100 : a.heat && s.era >= 1 ? (hm - 1) * 100 : 0;
      r.pr.style.width = p + '%';
    });
  }

  /* ============ 警告 ============
     給料が払えない状態は、流れの帯の「詰まり」の行に一番優先で出す（行の高さは変えない） */
  function renderAlerts() { /* 帯に統合 */ }
  function brokeMain(s, d) {
    var drains = [];
    D.buildings.forEach(function (b) { if (b.proc && b.proc.toggle && b.proc.in && b.proc.in.money && s.bld[b.id].on > 0) drains.push(['off', b.id]); });
    return { stage: 'broke', title: '給料が払えていない', detail: 'みんなの作業が半分（×0.5）、新しい人も来ない。' + (s.res.money < 0 ? '掛けでお金がマイナス（残りの枠 ' + f(Math.max(0, d.creditLimit + s.res.money)) + '円）。' : '') + 'お金がプラスに戻れば元に戻る。', fixes: [['act', 'give']].filter(function (x) { var a = E.actions.give; return a.vis(s); }).concat(drains).slice(0, 3) };
  }

  /* ============ 流れ（仕入れ → つくる → 詰める → 売る）と、詰まりの手当て ============
     帯の高さは常に3行ぶん（段・詰まり・手当て）で固定。中身が変わってもボタンの位置がずれない。
     詰まりの表示は2.5秒続いたときだけ切り替える（行ったり来たりでチカチカしない） */
  var flowCur = null, flowPend = null, flowPendAt = 0;
  function flowVisible(s) {
    if (s.era < 1) return false;
    if (s.era <= 4 && (s.flags.hook || s.flags.cans_known)) s.flags.flow_seen = true;
    return !!s.flags.flow_seen || !!s.flags.broke;
  }
  function fixLabel(s, d, fx) {
    var kind = fx[0], id = fx[1];
    if (kind === 'job') return E.JOB[id].name + 'の人手 ＋1';
    if (kind === 'bld') { var b = E.BLD[id]; return b.name + '　' + costText(s, E.cost(s, b), true); }
    if (kind === 'upg') { var u = E.UPG[id]; return u.name + '　' + costText(s, u.cost, true); }
    if (kind === 'tech') { var t2 = E.TECH[id]; return '研究：' + t2.name; }
    if (kind === 'act') return E.actLabel(s, id);
    if (kind === 'off') return '止める：' + E.BLD[id].name + '（' + s.bld[id].on + '）';
    return id;
  }
  function fixReady(s, d, fx) {
    var kind = fx[0], id = fx[1];
    if (kind === 'job') return s.pop > 0;
    if (kind === 'bld') return !E.whyNot(s, E.BLD[id]);
    if (kind === 'upg') return E.canPay(s, E.UPG[id].cost);
    if (kind === 'tech') return E.canPay(s, E.TECH[id].cost);
    if (kind === 'act') { var a = E.actions[id]; return !a.ok || a.ok(s); }
    if (kind === 'off') return s.bld[id].on > 0;
    return false;
  }
  function renderFlow(s, d) {
    var box = $('flowbar');
    if (!flowVisible(s)) { if (box.innerHTML) box.innerHTML = ''; lastSig.flow = null; return; }
    var showStages = s.era <= 4;
    var g = showStages ? E.diagnose(s, d) : { stages: [], main: null };
    if (!g) return;
    /* 詰まりの決定（給料未払いは即時、それ以外は2.5秒続いたら） */
    var now = Date.now(), cand;
    if (s.flags.broke) cand = brokeMain(s, d);
    else if (g.main) cand = { stage: g.main.stage, title: g.main.title, detail: g.main.detail, fixes: g.main.fixKey ? E.fixesFor(s, d, g.main.fixKey) : [] };
    else cand = { stage: 'ok', title: '', detail: '', fixes: [] };
    var ck = cand.stage + '|' + cand.title;
    if (!flowCur || cand.stage === 'broke' || flowCur.stage === 'broke' && !s.flags.broke) { flowCur = cand; flowPend = null; }
    else if (flowCur.stage + '|' + flowCur.title === ck) { flowCur = cand; flowPend = null; }
    else if (flowPend !== ck) { flowPend = ck; flowPendAt = now; }
    else if (now - flowPendAt > 2500) { flowCur = cand; flowPend = null; }
    var M = flowCur;
    var sig = g.stages.map(function (x) { return x.id; }).join(',') + '|' + M.stage + '|' + M.title + '|' + M.fixes.map(function (x) { return x.join(':'); }).join(',');
    if (sig !== lastSig.flow) {
      lastSig.flow = sig; box.innerHTML = ''; refs.flow = {};
      var row = el('div', { class: 'stages' });
      g.stages.forEach(function (st, i) {
        if (i) row.appendChild(el('span', { class: 'arrow', text: '→' }));
        var v = el('span', { class: 'v' });
        var chip = el('span', { class: 'stage' + (st.id === M.stage ? ' bad' : ''), 'data-tip': 'flow:' + st.id }, [el('b', { text: st.name }), v]);
        row.appendChild(chip); refs.flow[st.id] = v;
      });
      box.appendChild(row);
      var nm = { in: '仕入れ', make: 'つくる', fill: '詰める', sell: '売る', broke: '', ok: '' }[M.stage];
      var adv = el('div', { class: 'advice' + (M.stage === 'ok' ? ' ok' : '') + (M.stage === 'broke' ? ' broke' : '') });
      adv.appendChild(el('span', { class: 'ttl', text: M.stage === 'ok' ? '流れは順調' : (nm ? '詰まり：' + nm + '　' : '') + M.title }));
      refs.flow.detail = el('span', { class: 'det' }); adv.appendChild(refs.flow.detail);
      box.appendChild(adv);
      var fx = el('div', { class: 'fixes' }, [el('span', { class: 'dim', text: '手当て：' })]);
      refs.flow.fix = [];
      M.fixes.forEach(function (x) {
        var b = el('button', { class: 'mini fix', 'data-a': 'fix', 'data-id': x[0] + ':' + x[1], 'data-tip': x[0] === 'off' ? 'bld:' + x[1] : x[0] + ':' + x[1] });
        fx.appendChild(b); refs.flow.fix.push([b, x]);
      });
      if (!M.fixes.length) fx.appendChild(el('span', { class: 'dim', text: M.stage === 'ok' ? '—' : '今は見つからない（技術や改善を進めると見つかるかも）' }));
      box.appendChild(fx);
    }
    g.stages.forEach(function (st) {
      var parts = st.v.filter(function (x) { return x[1] > 1e-6 || st.v.length === 1; }).map(function (x) {
        var u = x[2] || '', r = fr(x[1]).replace('+', '') || '0';
        if (u && r !== '0') r = r.replace('/', u + '/');
        return (x[0] ? x[0] + ' ' : '') + r;
      });
      setText(refs.flow[st.id], parts.join('・') || '—');
    });
    if (refs.flow.detail) setText(refs.flow.detail, M.stage === 'ok' ? '詰まっている所はない。どこかを広げれば、全体が伸びる。' : M.detail);
    (refs.flow.fix || []).forEach(function (p) { setText(p[0], fixLabel(s, d, p[1])); p[0].classList.toggle('na', !fixReady(s, d, p[1])); });
  }
  function doFix(s, key) {
    var i = key.indexOf(':'), kind = key.slice(0, i), id = key.slice(i + 1);
    if (kind === 'job') { if (!E.moveJob(s, id)) goto('staff', 'job:' + id); return; }
    if (kind === 'bld') { if (!E.build(s, id)) goto('site', 'bld:' + id); return; }
    if (kind === 'upg') { if (!E.buyUpg(s, id)) goto('upg', 'upg:' + id); return; }
    if (kind === 'tech') { if (!E.research(s, id)) goto('tech', 'tech:' + id); return; }
    if (kind === 'act') E.doAction(s, id);
    if (kind === 'off') E.setOn(s, id, -1);
  }
  var pendingHL = null;
  function goto(tb, hl) {
    if (tb) { tab = tb; try { localStorage.setItem('taiki-minigame-tab', tab); } catch (e) { /* 無視 */ } lastSig.panel = null; }
    pendingHL = hl || null;
  }
  function flashPending() {
    if (!pendingHL) return;
    var t2 = document.querySelector('[data-hl="' + pendingHL + '"]');
    pendingHL = null;
    if (!t2) return;
    try { t2.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { t2.scrollIntoView(); }
    t2.classList.remove('flash'); void t2.offsetWidth; t2.classList.add('flash');
  }

  /* ============ タブ ============ */
  function tabsVisible(s) {
    var t = [];
    if (s.era < 1) return t;
    /* タブは多くても6つまで */
    t.push(['site', '現場']);
    t.push(['staff', '人手']);
    if (Object.keys(s.upg).length || D.upgrades.some(function (u) { return E.upgShown(s, u); })) t.push(['upg', '改善']);
    if (s.flags.research_known) t.push(['tech', '技術']);
    if (s.flags.cans_known || s.techs.bookkeeping) t.push(['market', '取引']);
    if (s.flags.hook) t.push(['stats', '記録']);
    return t;
  }
  function renderTabs(s) {
    var t = tabsVisible(s);
    var ids = t.map(function (x) { return x[0]; });
    if (ids.length && ids.indexOf(tab) < 0) tab = 'site';
    var sig = ids.join(',') + '|' + tab;
    if (sig === lastSig.tabs) return;
    lastSig.tabs = sig;
    var box = $('tabs'); box.innerHTML = '';
    t.forEach(function (x) {
      var isNew = !seenTabs[x[0]] && s.flags['tabseen_' + x[0]] !== true;
      var b = el('button', { 'data-a': 'tab', 'data-id': x[0], class: (x[0] === tab ? 'on' : '') + (isNew && x[0] !== tab ? ' new fade' : ''), text: x[1] });
      box.appendChild(b);
    });
    s.flags['tabseen_' + tab] = true; seenTabs[tab] = true;
  }

  function renderPanel(s, d, force) {
    var box = $('panel');
    if (s.era < 1) { if (box.innerHTML) box.innerHTML = ''; lastSig.panel = null; return; }
    var fn = PANELS[tab] || PANELS.site;
    fn(s, d, box, force);
  }

  /* ============ 共通部品 ============ */
  function costText(s, c, plain) {
    var parts = [];
    for (var k in c) {
      var nm = k === 'money' ? '円' : E.resName(s, k);
      var lack = (s.res[k] || 0) < c[k];
      var t = k === 'money' ? f(c[k]) + '円' : nm + ' ' + f(c[k]);
      parts.push(plain ? t : '<span class="' + (lack ? 'lack' : '') + '">' + t + '</span>');
    }
    return parts.join('　');
  }
  function timeTo(s, d, c) {
    var worst = 0;
    for (var k in c) {
      var need = c[k] - (s.res[k] || 0);
      if (need <= 0) continue;
      var r = RT(d)[k] || 0;
      if (!(r > 0)) return Infinity;
      if (d.cap[k] !== Infinity && d.cap[k] < c[k]) return -1;
      worst = Math.max(worst, need / r);
    }
    return worst;
  }
  function setText(e, t) { if (e && e.textContent !== t) e.textContent = t; }
  function setHTML(e, h) { if (e && e.innerHTML !== h) e.innerHTML = h; }

  /* 鍵つきの再描画：構成(sig)が変わったときだけ作り直し、それ以外は値だけ更新 */
  function keyed(box, sig, build, update, force, key) {
    key = key || 'panel';
    if (sig !== lastSig[key] || force === 'rebuild') {
      lastSig[key] = sig; box.innerHTML = ''; refs[key] = {};
      build(refs[key]);
    }
    update(refs[key]);
  }

  /* ============ 各タブ ============ */
  var PANELS = {};

  PANELS.site = function (s, d, box) {
    var groups = {}, order = [];
    D.buildings.forEach(function (b) {
      if (!E.bldShown(s, b)) return;
      if (b.stages && s.bld[b.id].n >= b.stages) return;
      if (b.max && s.bld[b.id].n >= b.max && !(b.proc && b.proc.toggle)) { (groups['済'] = groups['済'] || []).push(b); return; }
      if (!groups[b.group]) { groups[b.group] = []; order.push(b.group); }
      groups[b.group].push(b);
    });
    /* 先の名前は一つだけ、うっすら */
    var teaser = '';
    if (s.flags.hook && s.era < 3) {
      var names = {}; D.buildings.forEach(function (b) { if (E.bldShown(s, b)) names[b.name] = 1; });
      D.teasers.forEach(function (n) { if (!teaser && !names[n]) teaser = n; });
    }
    var sig = 'site|' + order.map(function (g) { return g + ':' + groups[g].map(function (b) { return b.id; }).join(','); }).join('|') + '|' + teaser + '|' + (groups['済'] || []).length;
    keyed(box, sig, function (R) {
      order.forEach(function (g) {
        var gbox = el('div', { class: 'group' }, [el('h3', { text: g })]);
        groups[g].forEach(function (b) {
          var btn = el('button', { class: 'btn', 'data-a': 'build', 'data-id': b.id, 'data-tip': 'bld:' + b.id });
          var nm = el('span'), cs = el('small', { class: 'cost' });
          btn.appendChild(nm); btn.appendChild(cs);
          var st = el('div', { class: 'st' }), ds = el('div', { text: b.desc });
          var ctl = el('div', { class: 'ctl' });
          var info = el('div', { class: 'info' }, [st, ds]);
          var lineBox = null;
          if (b.id === 'line') { lineBox = el('div', { class: 'linebox' }); info.appendChild(lineBox); }
          if (b.proc && b.proc.toggle) {
            ctl.appendChild(el('button', { class: 'mini', 'data-a': 'on', 'data-id': b.id, 'data-v': -1, text: '−', title: '1つ止める' }));
            ctl.appendChild(el('button', { class: 'mini', 'data-a': 'on', 'data-id': b.id, 'data-v': 1, text: '＋', title: '1つ動かす' }));
          }
          if (!b.stages) ctl.appendChild(el('button', { class: 'mini', 'data-a': 'sell', 'data-id': b.id, title: '解体', text: '×' }));
          var isNew = !s.bld[b.id].n;
          gbox.appendChild(el('div', { class: 'row fade' + (isNew ? ' isnew' : ''), 'data-hl': 'bld:' + b.id }, [btn, info, ctl]));
          R[b.id] = { btn: btn, nm: nm, cs: cs, st: st, ctl: ctl, line: lineBox };
        });
        box.appendChild(gbox);
      });
      if ((groups['済'] || []).length) {
        var done = el('div', { class: 'group' }, [el('h3', { text: '据え付け済みの機器' })]);
        done.appendChild(el('div', { class: 'dim', style: 'font-size:12px', text: groups['済'].map(function (b) { return b.name; }).join('、') }));
        box.appendChild(done);
      }
      if (teaser) box.appendChild(el('div', { class: 'group' }, [el('span', { class: 'teaser fade', text: teaser })]));
    }, function (R) {
      order.forEach(function (g) {
        groups[g].forEach(function (b) {
          var r = R[b.id]; if (!r) return;
          var o = s.bld[b.id], c = E.cost(s, b);
          r.ctl.style.visibility = o.n ? '' : 'hidden';
          setText(r.nm, b.name + (b.stages ? '（' + o.n + '/' + b.stages + '）' : o.n ? '（' + o.n + '）' : ''));
          setHTML(r.cs, costText(s, c) + ((b.space || 0) > 0 ? '　<span class="' + (d.used + b.space > d.land ? 'lack' : '') + '">敷地 ' + b.space + '</span>' : ''));
          var why = '';
          if ((b.space || 0) > 0 && d.used + b.space > d.land) why = '敷地が足りない';
          else if (b.buildCond && !E.cond(s, b.buildCond)) why = '条件：循環率' + Math.round((b.buildCond.circ || 0) * 100) + '%以上';
          else if (!E.canPay(s, c)) { var tt = timeTo(s, d, c); why = tt === -1 ? '置き場が足りない' : tt === Infinity ? '' : 'あと ' + U.fmtTime(tt); }
          r.btn.classList.toggle('na', !!why || !E.canPay(s, c));
          var st = [];
          if (b.proc && b.proc.toggle && o.n) st.push('稼働 ' + o.on + '/' + o.n);
          var pinfo = procOf(d, 'bld.' + b.id);
          if (pinfo && o.n && pinfo.reason) st.push('<span class="bad">' + pinfo.reason + '</span>');
          if (o.n && d.vehStat && d.vehStat[b.id]) { var vs = d.vehStat[b.id]; st.push('走っている ' + vs.manned + '/' + vs.n + (vs.why ? '　<span class="bad">' + vs.why + '</span>' : '')); }
          if (o.n && b.id === 'fork' && d.forkStat) st.push('動いている ' + d.forkStat.manned + '/' + o.n + (d.forkStat.manned < o.n && !d.m['auto.fork'] ? '　<span class="bad">資格を持つ荷役の人手が足りない</span>' : ''));
          if (o.n && b.id === 'filler') st.push('動いている ' + (d.fillersManned || 0) + '/' + o.n + ((d.fillersManned || 0) < o.n ? '　<span class="bad">充填の人手が足りない</span>' : ''));
          if (o.n && b.id === 'line') st.push('動いている ' + (d.linesManned || 0) + '/' + o.n + ((d.linesManned || 0) < o.n ? '　<span class="bad">充填の人手が足りない（1本2人）</span>' : ''));
          if (o.n && b.id === 'crane' && !(s.lic.crane > 0) && !d.m['auto.fork']) st.push('<span class="bad">玉掛け・クレーンの資格者がいない</span>');
          if (why && why.indexOf('あと') === 0) st.push(why);
          else if (why) st.push('<span class="warn">' + why + '</span>');
          setHTML(r.st, st.join('　'));
          if (r.line) setHTML(r.line, o.n ? lineHTML(s, d) : '');
        });
      });
    });
  };
  function procOf(d, key) { var p = null; (d.procs || []).forEach(function (q) { if (q.key === key) p = q; }); return p; }
  /* 小分けラインの工程（一番遅い工程がラインの速さ） */
  function lineHTML(s, d) {
    var lc = d.lineInfo || E.lineCap(s, d.m);
    var h = '1本の速さ ' + f(lc.rate) + '缶/秒（一番遅い工程で決まる）' + (Math.round(d.m['line.weigh'] || 0) < 1 ? '　<span class="warn">重量検査が抜き取り：ときどきクレーム</span>' : '') + '<br>';
    h += lc.det.map(function (x) { return '<span class="' + (x.id === lc.worst ? 'bad' : 'dim') + '">' + x.name + '（' + x.label + '）' + f(x.rate) + '</span>'; }).join(' → ');
    return h;
  }

  PANELS.staff = function (s, d, box) {
    var jobs = D.jobs.filter(function (j) { return E.jobVisible(s, j); });
    var lics = D.licenses.filter(function (l) { return E.cond(s, l.unlock); });
    var sig = 'staff|' + jobs.map(function (j) { return j.id; }).join(',') + '|' + lics.map(function (l) { return l.id; }).join(',');
    keyed(box, sig, function (R) {
      R.head = el('p', { class: 'note' });
      box.appendChild(R.head);
      var g = el('div', { class: 'group' }, [el('h3', { text: '配属' })]);
      jobs.forEach(function (j) {
        var cnt = el('span', { class: 'num' }), st = el('div', { class: 'st' });
        var ctl = el('div', { class: 'ctl' }, [
          el('button', { class: 'mini', 'data-a': 'job', 'data-id': j.id, 'data-v': -1000000, text: '0' }),
          el('button', { class: 'mini', 'data-a': 'job', 'data-id': j.id, 'data-v': -5, text: '−5' }),
          el('button', { class: 'mini', 'data-a': 'job', 'data-id': j.id, 'data-v': -1, text: '−' }),
          el('button', { class: 'mini', 'data-a': 'job', 'data-id': j.id, 'data-v': 1, text: '＋' }),
          el('button', { class: 'mini', 'data-a': 'job', 'data-id': j.id, 'data-v': 5, text: '＋5' }),
          el('button', { class: 'mini', 'data-a': 'job', 'data-id': j.id, 'data-v': 1000000, text: '全員' })
        ]);
        var label = s.era <= 1 && j.id !== 'research' ? j.name : j.name;
        var nameBox = el('div', { class: 'btn', style: 'min-width:150px;cursor:default', 'data-tip': 'job:' + j.id }, [el('span', { text: label + '　' }), cnt]);
        g.appendChild(el('div', { class: 'row fade', 'data-hl': 'job:' + j.id }, [nameBox, el('div', { class: 'info' }, [st, el('div', { text: j.desc })]), ctl]));
        R[j.id] = { cnt: cnt, st: st };
      });
      box.appendChild(g);
      if (lics.length) {
        var lg = el('div', { class: 'group' }, [el('h3', { text: '資格・講習' })]);
        lics.forEach(function (l) {
          var b = el('button', { class: 'btn', 'data-a': 'train', 'data-id': l.id });
          var nm = el('span'), cs = el('small', { class: 'cost' });
          b.appendChild(nm); b.appendChild(cs);
          var st = el('div', { class: 'st' });
          lg.appendChild(el('div', { class: 'row fade' }, [b, el('div', { class: 'info' }, [st, el('div', { text: l.desc + '（講習 ' + U.fmtTime(l.time) + '、手すきの人が1人行く）' })])]));
          R['l_' + l.id] = { b: b, nm: nm, cs: cs, st: st };
        });
        box.appendChild(lg);
      }
    }, function (R) {
      setHTML(R.head, '人手 ' + s.pop + '人　手すき ' + E.idle(s) + '人' + (s.training.length ? '　講習中 ' + s.training.length + '人' : '') + (s.flags.broke ? '　<span class="bad">給料が払えず、みんなの手が半分に鈍っている</span>' : ''));
      jobs.forEach(function (j) {
        var r = R[j.id]; setText(r.cnt, s.jobs[j.id] + '人');
        var info = '';
        if (j.slotsFrom) info = '釜の空き ' + Math.max(0, (d.slots[j.slotsFrom] || 0)) + '人ぶん';
        if (j.id === 'fill') info = '充填 ' + fr(d.fillCap || 0).replace('+', '') + '缶';
        if (j.id === 'deliver' && d.zi) info = '缶 ' + fr(d.zi.canRate * (d.glob || 1)).replace('+', '') + '・届く範囲：' + D.zones[d.zi.canZone].name + (d.zi.bulkZone >= 0 ? '　ローリー ' + fr(d.zi.bulkRate * (d.glob || 1)).replace('+', '') + 'kg' : '');
        if (j.id === 'check') info = '検査 ' + fr(d.checkCap || 0).replace('+', '') + 'kg';
        if (j.id === 'handle') info = '荷役 ' + f(d.handDem) + ' / ' + f(d.handSup);
        if (j.id === 'sales') info = '受託の枠 ' + (d.contractSlots || 0) + '件';
        setText(r.st, info);
      });
      lics.forEach(function (l) {
        var r = R['l_' + l.id];
        var tr = s.training.filter(function (t) { return t.lic === l.id; });
        setText(r.nm, l.name + '（' + s.lic[l.id] + '人）');
        setHTML(r.cs, costText(s, l.cost));
        r.b.classList.toggle('na', !E.canPay(s, l.cost) || E.idle(s) < 1);
        setText(r.st, tr.length ? '講習中：' + tr.map(function (t) { return 'あと' + U.fmtTime(t.remain); }).join('、') : (E.idle(s) < 1 ? '手すきの人がいない' : ''));
      });
    });
  };

  PANELS.tech = function (s, d, box) {
    var avail = D.techs.filter(function (t) { return E.techShown(s, t); });
    var done = D.techs.filter(function (t) { return s.techs[t.id]; });
    var sig = 'tech|' + avail.map(function (t) { return t.id; }).join(',') + '|' + done.length;
    keyed(box, sig, function (R) {
      var g = el('div', { class: 'group' }, [el('h3', { text: '研究できること' })]);
      if (!avail.length) g.appendChild(el('p', { class: 'note', text: '今は思いつくことがない。' }));
      avail.forEach(function (t) {
        var b = el('button', { class: 'btn', 'data-a': 'tech', 'data-id': t.id, 'data-tip': 'tech:' + t.id });
        var cs = el('small', { class: 'cost' });
        b.appendChild(el('span', { text: t.name })); b.appendChild(cs);
        var st = el('div', { class: 'st' });
        g.appendChild(el('div', { class: 'row fade', 'data-hl': 'tech:' + t.id }, [b, el('div', { class: 'info' }, [st, el('div', { text: t.desc })])]));
        R[t.id] = { b: b, cs: cs, st: st, t: t };
      });
      box.appendChild(g);
      if (done.length) box.appendChild(el('div', { class: 'group' }, [el('h3', { text: '身につけたこと' }), el('div', { class: 'dim', style: 'font-size:12px', text: done.map(function (t) { return t.name; }).join('、') })]));
    }, function (R) {
      avail.forEach(function (t) {
        var r = R[t.id]; if (!r) return;
        setHTML(r.cs, costText(s, t.cost));
        var ok = E.canPay(s, t.cost);
        r.b.classList.toggle('na', !ok);
        var tt = ok ? 0 : timeTo(s, d, t.cost);
        setText(r.st, ok ? '' : tt === -1 ? '技術をためておける量が足りない（机・研究小屋を増やす）' : tt === Infinity ? '' : 'あと ' + U.fmtTime(tt));
      });
    });
  };

  PANELS.upg = function (s, d, box) {
    var avail = D.upgrades.filter(function (u) { return E.upgShown(s, u); });
    var done = D.upgrades.filter(function (u) { return s.upg[u.id]; });
    var sig = 'upg|' + avail.map(function (u) { return u.id; }).join(',') + '|' + done.length;
    keyed(box, sig, function (R) {
      var g = el('div', { class: 'group' }, [el('h3', { text: '改善できること' })]);
      if (!avail.length) g.appendChild(el('p', { class: 'note', text: '今は思いつくことがない。' }));
      avail.forEach(function (u) {
        var b = el('button', { class: 'btn', 'data-a': 'upg', 'data-id': u.id, 'data-tip': 'upg:' + u.id });
        var cs = el('small', { class: 'cost' });
        b.appendChild(el('span', { text: u.name })); b.appendChild(cs);
        var st = el('div', { class: 'st' });
        g.appendChild(el('div', { class: 'row fade', 'data-hl': 'upg:' + u.id }, [b, el('div', { class: 'info' }, [st, el('div', { text: u.desc })])]));
        R[u.id] = { b: b, cs: cs, st: st };
      });
      box.appendChild(g);
      if (done.length) box.appendChild(el('div', { class: 'group' }, [el('h3', { text: '済んだ改善' }), el('div', { class: 'dim', style: 'font-size:12px', text: done.map(function (u) { return u.name; }).join('、') })]));
    }, function (R) {
      avail.forEach(function (u) {
        var r = R[u.id]; if (!r) return;
        setHTML(r.cs, costText(s, u.cost));
        var ok = E.canPay(s, u.cost); r.b.classList.toggle('na', !ok);
        var tt = ok ? 0 : timeTo(s, d, u.cost);
        setText(r.st, ok || tt === Infinity || tt === -1 ? '' : 'あと ' + U.fmtTime(tt));
      });
    });
  };

  /* 取引タブ：販売・受託・帳簿を縦に並べる */
  PANELS.market = function (s, d, box) {
    var hasOem = !!s.techs.oem, hasFin = !!s.techs.bookkeeping, hasSales = !!s.flags.cans_known;
    keyed(box, 'mk|' + hasSales + hasOem + hasFin, function (R) {
      ['p_sales', 'p_oem', 'p_fin'].forEach(function (k) { lastSig[k] = null; });
      if (hasSales) { box.appendChild(el('h3', { class: 'sect', text: '販売' })); R.sales = el('div'); box.appendChild(R.sales); }
      if (hasOem) { box.appendChild(el('h3', { class: 'sect', text: '受託' })); R.oem = el('div'); box.appendChild(R.oem); }
      if (hasFin) { box.appendChild(el('h3', { class: 'sect', text: '帳簿' })); R.fin = el('div'); box.appendChild(R.fin); }
    }, function (R) {
      if (R.sales) PANELS.sales(s, d, R.sales);
      if (R.oem) PANELS.oem(s, d, R.oem);
      if (R.fin) PANELS.fin(s, d, R.fin);
    });
  };
  PANELS.sales = function (s, d, box) {
    var sales = (d.sales || []).filter(function (x) {
      var src = x.p.kind === 'can' ? x.p.liquid : x.p.src;
      return s.flags['r_' + src] && (x.p.kind !== 'bulk' || x.zone >= 0);
    });
    var sig = 'market|' + sales.map(function (x) { return x.p.id; }).join(',');
    keyed(box, sig, function (R) {
      R.zone = el('p', { class: 'note' });
      box.appendChild(R.zone);
      var tb = el('table', { class: 't' });
      tb.appendChild(el('tr', {}, [el('th', { text: '製品' }), el('th', { text: '在庫' }), el('th', { text: '注文' }), el('th', { text: '出荷' }), el('th', { text: '単価' })]));
      sales.forEach(function (x) {
        var c = [el('td', { text: x.p.name }), el('td', { class: 'num' }), el('td', { class: 'num' }), el('td', { class: 'num' }), el('td', { class: 'num' })];
        tb.appendChild(el('tr', {}, c));
        R[x.p.id] = c;
      });
      box.appendChild(tb);
      box.appendChild(el('p', { class: 'note', style: 'margin-top:10px', text: '缶の製品は「配達」の人手と車で、ローリーの製品はタンクローリーで運ぶ。届く範囲が広いほど注文が増え、単価も少し上がる。季節によって注文は変わる（夏は水処理、冬は尿素水）。' }));
    }, function (R) {
      var zi = d.zi || { canZone: 0, bulkZone: -1, canRate: 0, bulkRate: 0 };
      setText(R.zone, '缶の届く範囲：' + D.zones[zi.canZone].name + '（' + fr(zi.canRate * (d.glob || 1)).replace('+', '') + '缶）' +
        (zi.bulkZone >= 0 ? '　ローリー：' + D.zones[zi.bulkZone].name + '（' + fr(zi.bulkRate * (d.glob || 1)).replace('+', '') + 'kg）' : '') +
        (zi.missing && zi.missing.length ? '　ローリーに足りない設備：' + zi.missing.map(function (id) { return E.BLD[id].name; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join('、') : '') +
        '　信用 ' + f(s.res.credit));
      sales.forEach(function (x) {
        var c = R[x.p.id]; if (!c) return;
        var stock = x.p.kind === 'can' ? s.res[x.p.id] : s.res[x.p.src];
        var u = x.p.kind === 'can' ? (x.p.container === 'bib' ? '箱' : '缶') : 'kg';
        setText(c[1], f(stock) + u);
        setText(c[2], fr(x.dem).replace('+', ''));
        setText(c[3], fr(x.rate).replace('+', ''));
        setText(c[4], f(x.price) + '円/' + u.replace('kg', 'kg'));
      });
    }, null, 'p_sales');
  };

  PANELS.fin = function (s, d, box) {
    var sig = 'fin|' + s.fin.hist.length + '|' + (s.fin.hist[0] ? s.fin.hist[0].total.inc : 0);
    keyed(box, sig, function (R) {
      box.appendChild(el('p', { class: 'note', text: '月ごとの損益（ゲーム内の1か月 ≒ 約7分）。' }));
      R.cur = el('div'); box.appendChild(R.cur);
      if (s.fin.hist.length) {
        var tb = el('table', { class: 't' });
        tb.appendChild(el('tr', {}, [el('th', { text: '月' }), el('th', { text: '収入' }), el('th', { text: '支出' }), el('th', { text: '損益' })]));
        s.fin.hist.forEach(function (h, i) {
          var p = h.total.inc - h.total.exp;
          tb.appendChild(el('tr', {}, [el('td', { text: i === 0 ? '先月' : i + 1 + 'か月前' }), el('td', { text: f(h.total.inc) }), el('td', { text: f(h.total.exp) }), el('td', { class: p >= 0 ? 'good' : 'bad', text: (p >= 0 ? '+' : '') + f(p) })]));
        });
        box.appendChild(el('h3', { class: 'dim', style: 'font-size:12px;font-weight:normal;margin-top:16px', text: 'これまで' }));
        box.appendChild(tb);
        var last = s.fin.hist[0], tb2 = el('table', { class: 't' }), k;
        tb2.appendChild(el('tr', {}, [el('th', { text: '先月の内訳' }), el('th', { text: '' })]));
        for (k in last.inc) tb2.appendChild(el('tr', {}, [el('td', { text: '収入：' + k }), el('td', { class: 'good', text: '+' + f(last.inc[k]) })]));
        for (k in last.exp) tb2.appendChild(el('tr', {}, [el('td', { text: '支出：' + k }), el('td', { class: 'bad', text: '-' + f(last.exp[k]) })]));
        box.appendChild(el('div', { style: 'margin-top:14px' }, [tb2]));
      }
      if (s.era >= 4) {
        R.circ = el('div', { style: 'margin-top:16px' }); box.appendChild(R.circ);
      }
    }, function (R) {
      var inc = 0, exp = 0, k;
      for (k in s.fin.cur.inc) inc += s.fin.cur.inc[k];
      for (k in s.fin.cur.exp) exp += s.fin.cur.exp[k];
      setHTML(R.cur, '今月（' + Math.round(s.fin.monthT / D.consts.monthSec * 100) + '%経過）　収入 ' + f(inc) + '　支出 ' + f(exp) + '　<span class="' + (inc - exp >= 0 ? 'good' : 'bad') + '">' + (inc - exp >= 0 ? '+' : '') + f(inc - exp) + '</span>');
      if (R.circ) {
        var h = '<b style="font-weight:normal">循環率 ' + Math.round(d.circ * 100) + '%</b>（高いほど、すべての生産と単価が上がる）<br>';
        D.circ.forEach(function (c) { var v = Math.min(1, (d.circParts[c.id] || 0) / c.need); h += '<span class="' + (v >= 1 ? 'good' : 'dim') + '">' + c.name + ' ' + Math.round(v * 100) + '%</span>　'; });
        setHTML(R.circ, h);
      }
    }, null, 'p_fin');
  };

  PANELS.oem = function (s, d, box) {
    var K = s.contracts, steps = D.contracts.steps;
    var sig = 'oem|' + K.offers.map(function (o) { return o.id; }).join(',') + '|' + K.active.map(function (c) { return c.id + ':' + c.step; }).join(',');
    keyed(box, sig, function (R) {
      box.appendChild(el('p', { class: 'note', text: '他社の「困った」を引き受ける。営業1人で1件ずつ進み、製品化すると毎秒の収入になる（原料などを少し使う）。' }));
      R.head = el('p'); box.appendChild(R.head);
      var g = el('div', { class: 'group' }, [el('h3', { text: '引き合い' })]);
      if (!K.offers.length) g.appendChild(el('p', { class: 'note', text: '今は引き合いがない。' }));
      K.offers.forEach(function (o) {
        var t = E.tplById(o.tpl);
        g.appendChild(el('div', { class: 'card fade' }, [el('div', { text: t.name }), el('small', { class: 'dim', text: '見込み：' + f(t.income * o.scale) + '円/秒' }), el('div', { style: 'margin-top:6px' }, [
          el('button', { class: 'mini', 'data-a': 'accept', 'data-id': o.id, text: '引き受ける' }), el('button', { class: 'mini', 'data-a': 'decline', 'data-id': o.id, text: '断る' })])]));
      });
      box.appendChild(g);
      var g2 = el('div', { class: 'group' }, [el('h3', { text: '進行中・継続中' })]);
      K.active.forEach(function (c) {
        var t = E.tplById(c.tpl), stp = el('div', { class: 'steps' });
        steps.forEach(function (x, i) { stp.appendChild(el('span', { class: i < c.step ? 'done' : i === c.step ? 'cur' : '', title: x.name })); });
        var st = el('small', { class: 'dim' });
        g2.appendChild(el('div', { class: 'card' }, [el('div', { text: t.name }), stp, st]));
        R['c' + c.id] = { st: st, c: c };
      });
      box.appendChild(g2);
    }, function (R) {
      setText(R.head, '営業 ' + (s.jobs.sales || 0) + '人　製品化 ' + K.done + '件');
      K.active.forEach(function (c) {
        var r = R['c' + c.id]; if (!r) return;
        var t = E.tplById(c.tpl);
        if (c.step >= steps.length) setText(r.st, '継続受託中：' + f(t.income * c.scale * (d.glob || 1) * (c.eff === undefined ? 1 : c.eff)) + '円/秒' + (c.eff < 0.99 ? '（原料不足）' : ''));
        else setText(r.st, steps[c.step].name + '　' + Math.floor(c.prog / steps[c.step].sec * 100) + '%' + (c.waiting ? '　' + c.waiting : ''));
      });
    }, null, 'p_oem');
  };

  PANELS.stats = function (s, d, box) {
    var sig = 'stats|' + Math.floor(s.t / 5);
    keyed(box, sig, function () {
      var st = s.stats, rows = [];
      rows.push(['遊び始めてから', U.fmtTime((Date.now() - s.started) / 1000)]);
      rows.push(['ゲームの中の時間', U.fmtTime(s.t)]);
      rows.push(['留守中に進んだ時間', U.fmtTime(st.offline)]);
      rows.push(['稼いだお金', f(st.earned) + '円']);
      rows.push(['売った缶', f(st.cansSold) + '缶']);
      rows.push(['洗った缶', f(st.washed) + '缶']);
      rows.push(['逃がした水素', f(st.h2) + 'kg']);
      rows.push(['手を動かした回数', f(st.clicks) + '回']);
      var tb = el('table', { class: 't' });
      rows.forEach(function (r) { tb.appendChild(el('tr', {}, [el('td', { text: r[0] }), el('td', { text: r[1] })])); });
      box.appendChild(tb);
      var pr = el('table', { class: 't', style: 'margin-top:14px' });
      pr.appendChild(el('tr', {}, [el('th', { text: 'これまでにつくったもの' }), el('th', { text: '' })]));
      Object.keys(st.produced).forEach(function (k) { if (E.RES[k] && k !== 'money' && st.produced[k] > 0) pr.appendChild(el('tr', {}, [el('td', { text: E.resName(s, k) }), el('td', { text: f(st.produced[k]) + ' ' + E.RES[k].unit })])); });
      box.appendChild(pr);
    }, function () {});
  };

  /* ============ カーソルを合わせたときの説明 ============ */
  var tipKey = null, tipX = 0, tipY = 0;
  function initTip() {
    document.addEventListener('mouseover', function (e) {
      var t2 = e.target.closest ? e.target.closest('[data-tip]') : null;
      if (!t2) { hideTip(); return; }
      tipKey = t2.getAttribute('data-tip'); updateTip(); placeTip();
    });
    document.addEventListener('mousemove', function (e) { tipX = e.clientX; tipY = e.clientY; if (tipKey) placeTip(); });
    document.addEventListener('mouseleave', hideTip);
    /* スマホ：長押しで説明、どこかを触ると閉じる */
    document.addEventListener('contextmenu', function (e) {
      var t2 = e.target.closest ? e.target.closest('[data-tip]') : null; if (!t2) return;
      e.preventDefault(); tipX = e.clientX; tipY = e.clientY; tipKey = t2.getAttribute('data-tip'); updateTip(); placeTip();
    });
    document.addEventListener('touchstart', function (e) { if (tipKey && !(e.target.closest && e.target.closest('#tip'))) hideTip(); }, { passive: true });
  }
  function hideTip() { if (!tipKey) return; tipKey = null; $('tip').classList.add('hidden'); }
  function placeTip() {
    var b = $('tip'); if (b.classList.contains('hidden')) return;
    var w = b.offsetWidth, h = b.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    var x = tipX + 16, y = tipY + 16;
    if (x + w > vw - 8) x = Math.max(8, tipX - w - 12);
    if (y + h > vh - 8) y = Math.max(8, tipY - h - 12);
    b.style.left = x + 'px'; b.style.top = y + 'px';
  }
  function updateTip() {
    if (!tipKey) return;
    var s = S(), d = s._d || E.derive(s), h = '';
    try { h = tipHTML(s, d, tipKey); } catch (e) { h = ''; }
    var b = $('tip');
    if (!h) { b.classList.add('hidden'); return; }
    setHTML(b, h); b.classList.remove('hidden');
  }
  function line(a, b2, cls) { return '<div class="tl"><span>' + a + '</span><span class="' + (cls || '') + '">' + b2 + '</span></div>'; }
  function rateS(r, unit) { var x = fr(r) || '0'; return unit ? x.replace('/', unit + '/') : x; }
  function ledger(s, d, k, unit) {
    var L = (d.ledS || d.led || {})[k], ins = [], outs = [], n, h = '';
    if (L) for (n in L) { if (L[n] > 1e-9) ins.push([n, L[n]]); else if (L[n] < -1e-9) outs.push([n, L[n]]); }
    ins.sort(function (a, b) { return b[1] - a[1]; }); outs.sort(function (a, b) { return a[1] - b[1]; });
    if (ins.length) h += '<div class="th">増える</div>' + ins.slice(0, 5).map(function (x) { return line(x[0], rateS(x[1], unit), 'good'); }).join('');
    if (outs.length) h += '<div class="th">減る</div>' + outs.slice(0, 5).map(function (x) { return line(x[0], rateS(x[1], unit), 'bad'); }).join('');
    return h;
  }
  function stalledBy(d, k, wt) {
    var n = []; (d.procs || []).forEach(function (p) { if (p.wk === k && p.wt === wt && p.want > 0) n.push(p.name); });
    return n;
  }
  function eff(s, d) { return (s.flags.broke ? 0.5 : 1); }

  function tipHTML(s, d, key) {
    var i = key.indexOf(':'), kind = key.slice(0, i), id = key.slice(i + 1), h = '', C = D.consts;
    if (kind === 'res') {
      var R = E.RES[id], v = s.res[id], cap = d.cap[id], net = RT(d)[id] || 0;
      var unit = R.unit === '円' ? '円' : R.unit === '個' || R.unit === '缶' || R.unit === '箱' ? '' : R.unit;
      h += '<div class="tt">' + E.resName(s, id) + '</div>';
      if (id === 'money') {
        h += line('いま', f(v) + '円', v < 0 ? 'bad' : '');
        h += line('毎秒', rateS(net, '円'), net < 0 ? 'bad' : 'good');
        h += ledger(s, d, id, '円');
        if (v < 0) h += '<div class="tw bad">掛けで仕入れ中。給料が払えないので、みんなの手が半分に鈍っている。</div>';
        else if (s.flags.broke) h += '<div class="tw bad">給料が払えていない。手が半分に鈍っている。</div>';
        return h;
      }
      h += line('いま', f(v) + (cap !== Infinity && cap !== undefined ? ' / ' + f(cap) : '') + (R.unit ? ' ' + R.unit : ''));
      if (Math.abs(net) > 1e-9) h += line('毎秒', rateS(net, unit), net < 0 ? 'bad' : 'good');
      if (cap !== Infinity && v >= cap * 0.995) {
        var bl = stalledBy(d, id, 'full');
        h += '<div class="tw warn">置き場がいっぱい。' + (bl.length ? '止まっている：' + bl.slice(0, 3).join('、') : 'これ以上は増えない') + '</div>';
      } else if (net > 1e-9 && cap !== Infinity) h += '<div class="tw">あと ' + U.fmtTime((cap - v) / net) + ' で満杯</div>';
      else if (net < -1e-9 && v > 0) h += '<div class="tw ' + (v / -net < 60 ? 'bad' : '') + '">あと ' + U.fmtTime(v / -net) + ' で空になる</div>';
      var st = stalledBy(d, id, 'in');
      if (st.length) h += '<div class="tw bad">足りない → 待っている：' + st.slice(0, 3).join('、') + '</div>';
      h += ledger(s, d, id, unit);
      return h;
    }
    if (kind === 'x') {
      if (id === 'pop') {
        h += '<div class="tt">人手</div>' + line('人数', s.pop + ' / ' + d.popCap + '人') + line('手すき', E.idle(s) + '人');
        if (s.flags.broke) h += '<div class="tw bad">給料が払えず、手が半分に鈍っている。新しい人も来ない。</div>';
        else if (s.pop >= d.popCap) h += '<div class="tw warn">住む場所がいっぱい。寮などを建てると、また人が来る。</div>';
        else if (d.arrivalLeft !== undefined && s.flags.hired) h += '<div class="tw">次の人が来るまで あと ' + U.fmtTime(Math.max(0, d.arrivalLeft)) + '</div>';
        h += line('給料', rateS(-(d.salary || 0), '円'), 'bad');
        return h;
      }
      if (id === 'power') return '<div class="tt">電力</div>' + line('使う / 使える', f(d.powerDem) + ' / ' + f(d.powerSup)) + '<div class="tw">' + (d.powerEff < 1 ? '<span class="bad">足りない。電気を使う設備がすべて ' + Math.round(d.powerEff * 100) + '% の速さに落ちている。</span>' : 'まだ余裕がある（あと ' + f(d.powerSup - d.powerDem) + '）。') + '</div>';
      if (id === 'handling') return '<div class="tt">荷役</div>' + line('要る / 動かせる', f(d.handDem) + ' / ' + f(d.handSup)) + '<div class="tw">' + (d.handEff < 1 ? '<span class="bad">足りない。出荷と荷を使う設備が ' + Math.round(d.handEff * 100) + '% に落ちている。荷役の人手・フォークリフトを。</span>' : '荷を動かす力には余裕がある。') + '</div>';
      if (id === 'vent') return '<div class="tt">換気</div><div class="tw">' + (d.ventEff < 1 ? '<span class="bad">酸の霧がこもり、溶かす作業が ' + Math.round(d.ventEff * 100) + '% に落ちている。換気扇・スクラバーを。</span>' : '風は通っている。') + '</div>';
      if (id === 'land') return '<div class="tt">敷地</div>' + line('使っている / 広さ', f(d.used) + ' / ' + f(d.land)) + '<div class="tw">' + (d.used >= d.land * 0.95 ? '<span class="warn">ほとんど空きがない。隣の空き地を。</span>' : 'あと ' + f(d.land - d.used) + ' 空いている。') + '</div>';
      if (id === 'creditline') return '<div class="tt">掛けの枠</div>' + line('枠', f(d.creditLimit) + '円') + (s.res.money < 0 ? line('使っている', f(-s.res.money) + '円', 'bad') : '') + '<div class="tw">お金が足りなくても、この枠の中なら仕入れ（お金を使う設備）が続く。ただし<b>お金がマイナスの間は給料が払えず、みんなの手が半分に鈍る</b>。枠は信用と稼ぎで広がる。</div>';
      if (id === 'circ') return '<div class="tt">循環率</div><div class="tw">捨てていたものを回収するほど上がる。高いほど、すべての生産と単価が上がる。</div>';
      return '';
    }
    if (kind === 'act') {
      var a = E.actions[id], hm = a.heat && s.era >= 1 ? E.heatMul(s, a.heat) : 1, e1 = s.era >= 1;
      h += '<div class="tt">' + E.actLabel(s, id) + '</div>';
      var desc = {
        grope: '暗がりを手で探る。',
        pick: e1 ? '鉄くずを1つ拾う。押すたびに回収を手伝い、しばらく回収（とスクラップの買い付け）が速くなる。' : '鉄くずを1つ拾う。',
        sink: e1 ? '鉄くず1つと塩酸2kgを、その場で溶かす（緑の液3kg）。押すたびに溶解を手伝い、しばらく溶解・反応槽が速くなる。' : '鉄くず1つと酸2kgを壺に沈める。3秒で緑の液が3kgできる。',
        give: e1 ? '店先の客に売る。押すたびに呼び込みになり、しばらく客の足と配達が速くなる。' : '戸口の客に緑の液を渡す（1kg ' + C.walkinPrice + '円）。',
        buyacid: '塩酸' + C.acidBuy.kg + 'kgを' + C.acidBuy.cost + '円で買う。お金が足りなくても、掛けの枠の中なら買える。',
        hire: '人を1人呼ぶ。鉄くずを集めてくれる。',
        setkama: '釜を据える。',
        buycans: '空きポリ缶を' + C.canBuy.n + '個、' + C.canBuy.cost + '円で買う。'
      }[id] || '';
      h += '<div class="tw">' + desc + '</div>';
      if (a.heat && e1) h += line('いまの手伝い', '×' + hm.toFixed(2), hm > 1.02 ? 'good' : 'dim') + '<div class="tw dim">速く押すほど上がる（最大 ×2）。手を止めると数秒で戻る。</div>';
      if (id === 'pick' && s.res.scrap >= d.cap.scrap) h += '<div class="tw warn">鉄くず置き場がいっぱい（手伝いは効く）。</div>';
      if (id === 'sink' && e1 && !(s.res.scrap >= 1 && s.res.hcl >= 2)) h += '<div class="tw warn">鉄くずか塩酸が足りないので、その場では溶かせない（手伝いは効く）。</div>';
      if (id === 'give' && e1) h += line('待っている客', f(s.walkin) + 'kgぶん');
      return h;
    }
    if (kind === 'bld') {
      var b = E.BLD[id], o = s.bld[id], c = E.cost(s, b);
      h += '<div class="tt">' + b.name + (o.n ? '（' + o.n + '）' : '') + '</div><div class="tw">' + b.desc + '</div>';
      h += bldDetail(s, d, b);
      var why = E.whyNot(s, b);
      if (why && why !== 'お金・資材が足りない') h += '<div class="tw warn">' + why + '</div>';
      else if (why) { var tt = timeTo(s, d, c); h += '<div class="tw">' + (tt === -1 ? '置き場が足りない（この値段はためられない）' : tt === Infinity ? 'このままでは貯まらない' : 'あと ' + U.fmtTime(tt) + ' で買える') + '</div>'; }
      var pi = procOf(d, 'bld.' + id);
      if (pi && o.n && pi.reason) h += '<div class="tw bad">いま：' + pi.reason + '</div>';
      return h;
    }
    if (kind === 'job') {
      var j = E.JOB[id], n = s.jobs[id] || 0;
      h += '<div class="tt">' + j.name + '（' + n + '人）</div><div class="tw">' + j.desc + '</div>';
      var per = mulOf(d, 'job.' + id) * (d.m['job.all'] ? 1 + d.m['job.all'] : 1) * eff(s, d) * (d.glob || 1);
      if (j.out && !j.special) {
        var ps = [], k;
        for (k in j.out) ps.push(E.resName(s, k) + ' ' + rateS(j.out[k] * per));
        var pin = []; for (k in j.in) pin.push(E.resName(s, k) + ' ' + rateS(j.in[k] * per));
        h += line('1人で', (pin.length ? pin.join('・') + ' → ' : '') + ps.join('・'));
      }
      if (id === 'fill') h += line('1人で', rateS(j.rate * per) + '缶（手で詰める）');
      if (id === 'deliver') h += line('歩いて1人で', rateS(j.rate * mulOf(d, 'walk') * mulOf(d, 'job.deliver')) + '缶') + '<div class="tw dim">車があれば、運転手として先に車へ乗る。</div>';
      if (id === 'check') h += line('1人で', rateS(0.6 * per) + 'kg');
      if (id === 'handle') h += line('1人で', '荷役 ' + f(j.rate * per));
      if (j.slotsFrom) h += line('置ける人数', (d.slots[j.slotsFrom] || 0) + '人（釜1つに2人）', n > (d.slots[j.slotsFrom] || 0) ? 'bad' : '');
      var pj = procOf(d, 'job.' + id);
      if (pj && pj.reason && n) h += '<div class="tw bad">いま：' + pj.reason + '</div>';
      if (s.flags.broke) h += '<div class="tw bad">給料が払えず、手が半分に鈍っている。</div>';
      return h;
    }
    if (kind === 'tech' || kind === 'upg') {
      var x = kind === 'tech' ? E.TECH[id] : E.UPG[id];
      h += '<div class="tt">' + x.name + '</div><div class="tw">' + x.desc + '</div>';
      if (!E.canPay(s, x.cost)) { var t3 = timeTo(s, d, x.cost); h += '<div class="tw">' + (t3 === -1 ? 'ためておける量が足りない' : t3 === Infinity ? 'このままでは貯まらない' : 'あと ' + U.fmtTime(t3) + ' で手が届く') + '</div>'; }
      return h;
    }
    if (kind === 'flow') {
      var nm = { in: '仕入れ', make: 'つくる', fill: '詰める', sell: '売る' }[id];
      h += '<div class="tt">' + nm + '</div>';
      if (id === 'in') {
        h += '<div class="tw dim">原料を集めて、置き場にためる。</div>';
        ['scrap', 'hcl', 'urea'].forEach(function (k) { if (s.flags['r_' + k]) h += line(E.resName(s, k), f(s.res[k]) + ' / ' + f(d.cap[k]) + '　' + (fr(RT(d)[k] || 0) || '±0'), s.res[k] >= d.cap[k] * 0.9 ? 'warn' : s.res[k] < d.cap[k] * 0.05 ? 'bad' : ''); });
      } else if (id === 'make') {
        h += '<div class="tw dim">原料を溶かし、液にする。</div>';
        (d.procs || []).forEach(function (p) { if (E.procStage(p.key) === 'make' && (p.want > 0 || p.reason)) h += line(p.name, Math.round(p.want > 0 ? p.rate / p.want * 100 : 0) + '%' + (p.reason ? '　' + p.reason : ''), p.reason ? 'bad' : ''); });
      } else if (id === 'fill') {
        h += '<div class="tw dim">液を缶に詰める。</div>' + line('詰めている', rateS(d.filledS || 0, '缶') + '（詰められる ' + rateS(d.fillCap || 0, '缶') + '）') + line('空きポリ缶', f(s.res.can) + ' / ' + f(d.cap.can), s.res.can < 1 ? 'bad' : '');
      } else if (id === 'sell') {
        h += '<div class="tw dim">注文に応じて出荷する。左から：出荷 / 注文</div>';
        if (d.walkinInc) h += line('店先の客', rateS(d.walkinInc, '円'));
        (d.sales || []).forEach(function (x) { if (s.flags['r_' + x.stock] && x.dem > 0 && (x.p.kind !== 'bulk' || x.zone >= 0)) h += line(x.p.name, (fr(x.rate) || '0').replace('+', '') + ' / ' + (fr(x.dem) || '0').replace('+', ''), x.rate < x.dem * 0.9 ? 'warn' : ''); });
      }
      return h;
    }
    return '';
  }
  function mulOf(d, k) { return 1 + ((d.m && d.m[k]) || 0); }
  /* 設備の中身：何を入れて何が出るか、何が増えるか */
  function bldDetail(s, d, b) {
    var h = '', p = b.proc, e = b.effects || {}, k, parts;
    var mm = mulOf(d, 'bld.' + b.id) * (d.glob || 1), om = mulOf(d, 'bld.' + b.id + '.out');
    if (p && p.out && (Object.keys(p.out).length || (p.in && Object.keys(p.in).length))) {
      var ins = [], outs = [];
      for (k in (p.in || {})) ins.push((k === 'money' ? 'お金 ' + rateS(p.in[k] * mm, '円') : E.resName(s, k) + ' ' + rateS(p.in[k] * mm)).replace('+', ''));
      for (k in p.out) outs.push((k === 'money' ? 'お金 ' + rateS(p.out[k] * mm * om, '円') : E.resName(s, k) + ' ' + rateS(p.out[k] * mm * om)).replace('+', ''));
      h += line('1つで', (ins.length ? ins.join('・') : '') + ' → ' + (outs.length ? outs.join('・') : '（処理する）'));
    }
    var need = [];
    if (p && p.power) need.push('電力 ' + p.power);
    if (p && p.operator) need.push('運転の人手 1人');
    if (p && p.handling) need.push('荷役 ' + p.handling);
    if (p && p.needs) need.push(E.BLD[p.needs].name);
    if (e.needs) need.push(E.BLD[e.needs].name);
    if (b.space) need.push('敷地 ' + b.space);
    if (need.length) h += line('要るもの', need.join('・'));
    parts = [];
    if (e.cap) { var cs = []; for (k in e.cap) if (E.RES[k] && (s.flags['r_' + k] || k === 'research')) cs.push(E.resName(s, k) + ' +' + f(e.cap[k])); if (cs.length) parts.push('置ける量：' + cs.slice(0, 4).join('、') + (cs.length > 4 ? ' ほか' : '')); }
    if (e.popCap) parts.push('住める人 +' + e.popCap);
    if (e.land) parts.push('敷地 +' + e.land);
    if (e.power) parts.push('電力 +' + f(e.power));
    if (e.slots) parts.push('溶解の人手を ' + e.slots.dissolve + '人まで置ける');
    if (e.transport) parts.push('運ぶ：' + f(e.transport.rate) + (e.transport.kind === 'bulk' ? 'kg' : '缶') + '/秒・' + D.zones[e.transport.zone].name + 'まで' + (e.transport.license ? '（' + E.LIC[e.transport.license].name + '）' : ''));
    if (e.vent) parts.push('換気 +' + e.vent);
    if (e.checkCap) parts.push('検査 +' + e.checkCap + 'kg/秒');
    if (e.quality) parts.push('品質 +' + Math.round(e.quality * 100) + '%');
    if (e.forklift) parts.push('荷役 +' + e.forklift + '（1台）');
    if (e.crane) parts.push('荷役 +' + e.crane);
    if (e.autohandle) parts.push('荷役 +' + e.autohandle);
    if (e.filler) parts.push('充填 +' + e.filler + '缶/秒');
    if (e.gmul) parts.push('すべての生産 ×' + e.gmul);
    if (e.bigpack) parts.push('注文 +25%');
    if (e.hclRecover) parts.push('排気の酸を回収');
    if (parts.length) h += line('効き目', parts.join('<br>'));
    return h;
  }

  /* ============ 設定 ============ */
  function openModal(html, onMount) {
    var m = $('modal'), b = $('modalbox');
    b.innerHTML = html; m.classList.remove('hidden');
    if (onMount) onMount(b);
  }
  function closeModal() { $('modal').classList.add('hidden'); }

  function openSettings() {
    var s = S();
    openModal('<h2>設定</h2>' +
      '<div class="sect"><label><input type="checkbox" id="o_expo" ' + (s.settings.expo ? 'checked' : '') + '> 大きな数を指数で表示（1.2e45）</label>' +
      '<label><input type="checkbox" id="o_anim" ' + (s.settings.anim ? 'checked' : '') + '> 表示のふわっとした動き</label>' +
      '<label><input type="checkbox" id="o_gag" ' + (s.settings.gag !== false ? 'checked' : '') + '> タイトルの小ネタ</label></div>' +
      '<div class="sect"><b style="font-weight:normal">セーブの書き出し（別のPC・ブラウザへ引っ越すとき）</b><textarea id="o_exp" readonly></textarea>' +
      '<button class="mini" id="o_copy">コピー</button></div>' +
      '<div class="sect"><b style="font-weight:normal">セーブの読み込み</b><textarea id="o_imp" placeholder="ここに書き出した文字を貼り付け"></textarea><button class="mini" id="o_load">読み込む</button></div>' +
      '<div class="sect"><button class="mini" id="o_wipe">最初からやり直す</button>　<button class="mini" id="o_dev">開発者モード</button></div>' +
      '<div class="sect" style="text-align:right"><button class="btn" data-a="close">閉じる</button></div>',
    function (b) {
      b.querySelector('#o_exp').value = E.exportText(s);
      b.querySelector('#o_expo').onchange = function (e) { s.settings.expo = e.target.checked; lastSig = {}; };
      b.querySelector('#o_anim').onchange = function (e) { s.settings.anim = e.target.checked; };
      b.querySelector('#o_gag').onchange = function (e) { s.settings.gag = e.target.checked; };
      b.querySelector('#o_copy').onclick = function () { var t = b.querySelector('#o_exp'); t.select(); try { document.execCommand('copy'); } catch (e) { /* 無視 */ } };
      b.querySelector('#o_load').onclick = function () {
        try { var ns = E.importText(b.querySelector('#o_imp').value); TM.state = ns; E.save(ns); lastSig = {}; closeModal(); alert('読み込みました。'); }
        catch (e) { alert('読み込めませんでした。文字が欠けていないか確かめてください。'); }
      };
      b.querySelector('#o_wipe').onclick = function () {
        if (!confirm('セーブを消して最初からやり直しますか？')) return;
        if (!confirm('本当に消しますか？（元に戻せません）')) return;
        E.wipe(); TM.state = E.newState(); lastSig = {}; closeModal();
      };
      b.querySelector('#o_dev').onclick = function () { if (TM.Dev) TM.Dev.ask(); };
    });
  }

  function resetSig() { lastSig = {}; }

  return { init: init, render: render, openModal: openModal, closeModal: closeModal, resetSig: resetSig, f: f };
})();
