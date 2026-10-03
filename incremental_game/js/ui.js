/* 画面の描画。状態(TM.state)を読み、操作はエンジンの関数を呼ぶ */
var TM = window.TM = window.TM || {};

TM.UI = (function () {
  var E = TM.Engine, U = TM.util, D, el = U.el;
  var tab = 'site', lastSig = {}, refs = {}, seenTabs = {};
  var $ = function (id) { return document.getElementById(id); };

  function S() { return TM.state; }
  function f(n) { return U.fmt(n, S().settings.expo); }
  function fr(r) { return U.fmtRate(r, S().settings.expo); }

  function init() {
    D = TM.DATA;
    /* クリックはまとめて受ける（描き直しでボタンが入れ替わっても取りこぼさない） */
    document.body.addEventListener('click', onClick);
    $('gear').addEventListener('click', openSettings);
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
    renderTabs(s);
    renderPanel(s, d, force);
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
    var year = Math.floor(s.t / (C.seasonSec * 4)) + 1, season = D.seasons[Math.floor(s.t / C.seasonSec) % 4];
    setHTML($('cal'), s.era >= 1 ? year + '年目　' + season : '');
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
        var row = el('div', { class: 'res fade' }, [nm, v, r]);
        refs.res[id] = { row: row, nm: nm, v: v, r: r };
        box.appendChild(row);
      });
      if (extra.length) box.appendChild(el('div', { class: 'resgroup', text: '状況' }));
      extra.forEach(function (id) {
        var nm = el('span', { class: 'nm' }), v = el('span', { class: 'v' }), r = el('span', { class: 'r' });
        var row = el('div', { class: 'res fade' }, [nm, v, r]);
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
      var rate = d.rate ? d.rate[id] || 0 : 0;
      setText(x.r, fr(rate));
      x.row.classList.toggle('full', cap !== Infinity && cap > 0 && s.res[id] >= cap * 0.999);
      x.row.classList.toggle('neg', rate < -1e-9);
      if (id === 'money') x.v.classList.toggle('bad', s.res.money < 0);
    });
    extra.forEach(function (id) {
      var x = refs.res['x_' + id];
      if (id === 'pop') { setText(x.nm, '人手'); setText(x.v, s.pop + ' / ' + d.popCap + '人'); setText(x.r, E.idle(s) > 0 ? '手すき ' + E.idle(s) + '人' : ''); }
      if (id === 'land') { setText(x.nm, '敷地'); setText(x.v, f(d.used) + ' / ' + f(d.land)); x.row.classList.toggle('full', d.used >= d.land * 0.95); setText(x.r, ''); }
      if (id === 'power') { setText(x.nm, '電力'); setText(x.v, f(d.powerDem) + ' / ' + f(d.powerSup)); x.row.classList.toggle('full', d.powerEff < 1); setText(x.r, d.powerEff < 1 ? '足りない（' + Math.round(d.powerEff * 100) + '%）' : ''); }
      if (id === 'handling') { setText(x.nm, '荷役'); setText(x.v, f(d.handDem) + ' / ' + f(d.handSup)); x.row.classList.toggle('full', d.handEff < 1); setText(x.r, d.handEff < 1 ? '足りない（' + Math.round(d.handEff * 100) + '%）' : ''); }
      if (id === 'vent') { setText(x.nm, '換気'); setText(x.v, Math.round((d.ventEff || 1) * 100) + '%'); x.row.classList.toggle('full', d.ventEff < 1); setText(x.r, ''); }
      if (id === 'circ') { setText(x.nm, '循環率'); setText(x.v, Math.round(d.circ * 100) + '%'); setText(x.r, ''); }
      if (id === 'creditline') { setText(x.nm, '掛けの枠'); setText(x.v, f(d.creditLimit) + '円'); setText(x.r, s.res.money < 0 ? '掛けで仕入れ中' : ''); }
    });
  }

  /* ============ 手作業のボタン ============ */
  var ACTION_ORDER = ['grope', 'pick', 'sink', 'give', 'buyacid', 'hire', 'setkama', 'buycans'];
  function renderActions(s) {
    var vis = ACTION_ORDER.filter(function (id) { var a = E.actions[id]; return !a.vis || a.vis(s); });
    if (s.era >= 2) vis = vis.filter(function (id) { return id === 'buycans' ? false : id !== 'give'; });
    if (s.era >= 3) vis = [];
    if (s.era >= 1 && tab !== 'site') vis = [];
    var box = $('actions'), sig = vis.join(',');
    if (sig !== lastSig.act) {
      lastSig.act = sig; box.innerHTML = ''; refs.act = {};
      vis.forEach(function (id) {
        var b = el('button', { class: 'btn fade', 'data-a': 'act', 'data-id': id });
        var lab = el('span'), sm = el('small'), pr = el('span', { class: 'prog' });
        b.appendChild(lab); b.appendChild(sm); b.appendChild(pr);
        refs.act[id] = { b: b, lab: lab, sm: sm, pr: pr };
        box.appendChild(b);
      });
    }
    vis.forEach(function (id) {
      var a = E.actions[id], r = refs.act[id];
      var label = id === 'grope' ? '手探りする' : typeof a.label === 'function' ? a.label(s) : a.label;
      setText(r.lab, label);
      var c = a.cost ? a.cost(s) : null;
      setText(r.sm, c ? costText(s, c, true) : '');
      r.b.classList.toggle('na', !!(a.ok && !a.ok(s)));
      var p = id === 'sink' && s.manual.dissolve > 0 ? (1 - s.manual.dissolve / D.consts.manualDissolveSec) * 100 : 0;
      r.pr.style.width = p + '%';
    });
  }

  /* ============ タブ ============ */
  function tabsVisible(s) {
    var t = [];
    if (s.era < 1) return t;
    t.push(['site', '現場']);
    t.push(['staff', '人手']);
    if (s.flags.research_known) t.push(['tech', '技術']);
    t.push(['upg', '改善']);
    if (s.flags.cans_known) t.push(['market', '取引']);
    if (s.flags.hook) t.push(['flow', '工程図']);
    if (s.bld.line && s.bld.line.n > 0) t.push(['line', 'ライン']);
    if (s.techs.bookkeeping) t.push(['fin', '経営']);
    if (s.techs.oem) t.push(['oem', '受託']);
    t.push(['stats', '記録']);
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
      var r = d.rate ? d.rate[k] : 0;
      if (!(r > 0)) return Infinity;
      if (d.cap[k] !== Infinity && d.cap[k] < c[k]) return -1;
      worst = Math.max(worst, need / r);
    }
    return worst;
  }
  function setText(e, t) { if (e && e.textContent !== t) e.textContent = t; }
  function setHTML(e, h) { if (e && e.innerHTML !== h) e.innerHTML = h; }

  /* 鍵つきの再描画：構成(sig)が変わったときだけ作り直し、それ以外は値だけ更新 */
  function keyed(box, sig, build, update, force) {
    if (sig !== lastSig.panel || force === 'rebuild') {
      lastSig.panel = sig; box.innerHTML = ''; refs.panel = {};
      build(refs.panel);
    }
    update(refs.panel);
  }

  /* ============ 各タブ ============ */
  var PANELS = {};

  PANELS.site = function (s, d, box) {
    var groups = {}, order = [];
    D.buildings.forEach(function (b) {
      if (!E.bldVisible(s, b)) return;
      if (b.stages && s.bld[b.id].n >= b.stages) return;
      if (b.max && s.bld[b.id].n >= b.max && !(b.proc && b.proc.toggle)) { (groups['済'] = groups['済'] || []).push(b); return; }
      if (!groups[b.group]) { groups[b.group] = []; order.push(b.group); }
      groups[b.group].push(b);
    });
    var teasers = [];
    if (s.flags.hook && s.era < 3) {
      var names = {}; D.buildings.forEach(function (b) { if (E.bldVisible(s, b)) names[b.name] = 1; });
      teasers = D.teasers.filter(function (n) { return !names[n] && !D.buildings.some(function (b) { return b.name === n && E.bldVisible(s, b); }); });
    }
    var sig = 'site|' + order.map(function (g) { return g + ':' + groups[g].map(function (b) { return b.id; }).join(','); }).join('|') + '|' + teasers.join(',') + '|' + (groups['済'] || []).length;
    keyed(box, sig, function (R) {
      order.forEach(function (g) {
        var gbox = el('div', { class: 'group' }, [el('h3', { text: g })]);
        groups[g].forEach(function (b) {
          var btn = el('button', { class: 'btn', 'data-a': 'build', 'data-id': b.id });
          var nm = el('span'), cs = el('small', { class: 'cost' });
          btn.appendChild(nm); btn.appendChild(cs);
          var st = el('div', { class: 'st' }), ds = el('div', { text: b.desc });
          var ctl = el('div', { class: 'ctl' });
          var info = el('div', { class: 'info' }, [st, ds]);
          if (b.proc && b.proc.toggle) {
            ctl.appendChild(el('button', { class: 'mini', 'data-a': 'on', 'data-id': b.id, 'data-v': -1, text: '−' }));
            ctl.appendChild(el('button', { class: 'mini', 'data-a': 'on', 'data-id': b.id, 'data-v': 1, text: '＋' }));
          }
          if (!b.stages) ctl.appendChild(el('button', { class: 'mini', 'data-a': 'sell', 'data-id': b.id, title: '解体', text: '×' }));
          gbox.appendChild(el('div', { class: 'row fade' }, [btn, info, ctl]));
          R[b.id] = { btn: btn, nm: nm, cs: cs, st: st, ctl: ctl };
        });
        box.appendChild(gbox);
      });
      if ((groups['済'] || []).length) {
        var done = el('div', { class: 'group' }, [el('h3', { text: '据え付け済みの機器' })]);
        done.appendChild(el('div', { class: 'dim', style: 'font-size:12px', text: groups['済'].map(function (b) { return b.name; }).join('、') }));
        box.appendChild(done);
      }
      if (teasers.length) {
        var tg = el('div', { class: 'group' }, [el('h3', { text: '……' })]);
        teasers.forEach(function (n) { tg.appendChild(el('span', { class: 'teaser fade', text: n })); });
        box.appendChild(tg);
      }
    }, function (R) {
      order.forEach(function (g) {
        groups[g].forEach(function (b) {
          var r = R[b.id]; if (!r) return;
          var o = s.bld[b.id], c = E.cost(s, b);
          setText(r.nm, b.name + (b.stages ? '（' + o.n + '/' + b.stages + '）' : o.n ? '（' + o.n + '）' : ''));
          setHTML(r.cs, costText(s, c) + ((b.space || 0) > 0 ? '　<span class="' + (d.used + b.space > d.land ? 'lack' : '') + '">敷地 ' + b.space + '</span>' : ''));
          var why = '';
          if ((b.space || 0) > 0 && d.used + b.space > d.land) why = '敷地が足りない';
          else if (b.buildCond && !E.cond(s, b.buildCond)) why = '条件：循環率' + Math.round((b.buildCond.circ || 0) * 100) + '%以上';
          else if (!E.canPay(s, c)) { var tt = timeTo(s, d, c); why = tt === -1 ? '置き場が足りない' : tt === Infinity ? '' : 'あと ' + U.fmtTime(tt); }
          r.btn.classList.toggle('na', !!why || !E.canPay(s, c));
          r.btn.title = why;
          var st = [];
          if (b.proc && b.proc.toggle && o.n) st.push('稼働 ' + o.on + '/' + o.n);
          var pinfo = null; (d.procs || []).forEach(function (p) { if (p.key === 'bld.' + b.id) pinfo = p; });
          if (pinfo && o.n && pinfo.reason) st.push('<span class="bad">' + pinfo.reason + '</span>');
          if (o.n && d.vehStat && d.vehStat[b.id]) { var vs = d.vehStat[b.id]; st.push('走っている ' + vs.manned + '/' + vs.n + (vs.why ? '　<span class="bad">' + vs.why + '</span>' : '')); }
          if (o.n && b.id === 'fork' && d.forkStat) st.push('動いている ' + d.forkStat.manned + '/' + o.n + (d.forkStat.manned < o.n && !d.m['auto.fork'] ? '　<span class="bad">資格を持つ荷役の人手が足りない</span>' : ''));
          if (o.n && b.id === 'filler') st.push('動いている ' + (d.fillersManned || 0) + '/' + o.n + ((d.fillersManned || 0) < o.n ? '　<span class="bad">充填の人手が足りない</span>' : ''));
          if (o.n && b.id === 'line') st.push('動いている ' + (d.linesManned || 0) + '/' + o.n + ((d.linesManned || 0) < o.n ? '　<span class="bad">充填の人手が足りない（1本2人）</span>' : ''));
          if (o.n && b.id === 'crane' && !(s.lic.crane > 0) && !d.m['auto.fork']) st.push('<span class="bad">玉掛け・クレーンの資格者がいない</span>');
          if (why && why.indexOf('あと') === 0) st.push(why);
          else if (why) st.push('<span class="warn">' + why + '</span>');
          setHTML(r.st, st.join('　'));
        });
      });
    });
  };

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
        var nameBox = el('div', { class: 'btn', style: 'min-width:150px;cursor:default' }, [el('span', { text: label + '　' }), cnt]);
        g.appendChild(el('div', { class: 'row fade' }, [nameBox, el('div', { class: 'info' }, [st, el('div', { text: j.desc })]), ctl]));
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
      setText(R.head, '人手 ' + s.pop + '人　手すき ' + E.idle(s) + '人' + (s.training.length ? '　講習中 ' + s.training.length + '人' : '') + (s.flags.broke ? '　（給料が払えず、みんなの手が鈍っている）' : ''));
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
    var avail = D.techs.filter(function (t) { return E.techAvailable(s, t); });
    var done = D.techs.filter(function (t) { return s.techs[t.id]; });
    var future = D.techs.filter(function (t) { return !s.techs[t.id] && !E.techAvailable(s, t); });
    var showFar = s.flags.hook;
    var sig = 'tech|' + avail.map(function (t) { return t.id; }).join(',') + '|' + done.length + '|' + future.length;
    keyed(box, sig, function (R) {
      var g = el('div', { class: 'group' }, [el('h3', { text: '研究できること' })]);
      if (!avail.length) g.appendChild(el('p', { class: 'note', text: '今は思いつくことがない。' }));
      avail.forEach(function (t) {
        var b = el('button', { class: 'btn', 'data-a': 'tech', 'data-id': t.id });
        var cs = el('small', { class: 'cost' });
        b.appendChild(el('span', { text: t.name })); b.appendChild(cs);
        var st = el('div', { class: 'st' });
        g.appendChild(el('div', { class: 'row fade' }, [b, el('div', { class: 'info' }, [st, el('div', { text: t.desc })])]));
        R[t.id] = { b: b, cs: cs, st: st, t: t };
      });
      box.appendChild(g);
      if (showFar && future.length) {
        var fg = el('div', { class: 'group' }, [el('h3', { text: 'まだ遠いこと' })]);
        var shown = future.slice(0, 6).map(function (t) { return t.name; });
        D.teaserTechs.forEach(function (n) { if (shown.indexOf(n) < 0 && !done.some(function (t) { return t.name === n; }) && !avail.some(function (t) { return t.name === n; })) shown.push(n); });
        shown.forEach(function (n) { fg.appendChild(el('span', { class: 'teaser', text: n })); });
        box.appendChild(fg);
      }
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
    var avail = D.upgrades.filter(function (u) { return E.upgVisible(s, u); });
    var done = D.upgrades.filter(function (u) { return s.upg[u.id]; });
    var sig = 'upg|' + avail.map(function (u) { return u.id; }).join(',') + '|' + done.length;
    keyed(box, sig, function (R) {
      var g = el('div', { class: 'group' }, [el('h3', { text: '改善できること' })]);
      if (!avail.length) g.appendChild(el('p', { class: 'note', text: '今は思いつくことがない。' }));
      avail.forEach(function (u) {
        var b = el('button', { class: 'btn', 'data-a': 'upg', 'data-id': u.id });
        var cs = el('small', { class: 'cost' });
        b.appendChild(el('span', { text: u.name })); b.appendChild(cs);
        var st = el('div', { class: 'st' });
        g.appendChild(el('div', { class: 'row fade' }, [b, el('div', { class: 'info' }, [st, el('div', { text: u.desc })])]));
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

  PANELS.market = function (s, d, box) {
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
    });
  };

  PANELS.flow = function (s, d, box) {
    var procs = (d.procs || []).filter(function (p) { return p.want > 0 || p.reason; });
    var sig = 'flow|' + procs.map(function (p) { return p.key; }).join(',');
    keyed(box, sig, function (R) {
      box.appendChild(el('p', { class: 'note', text: '工程ごとの流れ。赤は止まっている理由。棒は動いている割合。' }));
      var head = el('div', { class: 'flow' }); R.head = head; box.appendChild(head);
      procs.forEach(function (p) {
        var io = el('span', { class: 'io' }), why = el('span', { class: 'why' }), bar = el('div', { class: 'bar' }), bi = el('i');
        bar.appendChild(bi);
        box.appendChild(el('div', { class: 'flow fade' }, [el('b', { text: p.name + '　' }), io, '　', why, bar]));
        R[p.key] = { io: io, why: why, bar: bar, bi: bi };
      });
    }, function (R) {
      setText(R.head, '電力 ' + f(d.powerDem) + '/' + f(d.powerSup) + '　荷役 ' + f(d.handDem) + '/' + f(d.handSup) + '　検査 ' + f(d.checkUsed || 0) + '/' + f(d.checkCap || 0) + 'kg/秒　充填 ' + f(d.filled || 0) + '/' + f(d.fillCap || 0) + '缶/秒' + (d.fumes ? '　換気 ' + Math.round(d.ventEff * 100) + '%' : ''));
      procs.forEach(function (p) {
        var r = R[p.key]; if (!r) return;
        var cur = null; (d.procs || []).forEach(function (q) { if (q.key === p.key) cur = q; });
        if (!cur) return;
        var ins = [], outs = [], k;
        for (k in cur.inp) if (cur.inp[k]) ins.push(E.resName(s, k) + ' ' + f(cur.inp[k] * cur.rate));
        for (k in cur.out) if (cur.out[k]) outs.push(E.resName(s, k) + ' ' + f(cur.out[k] * cur.rate));
        setText(r.io, (ins.length ? ins.join('＋') : '—') + ' → ' + (outs.length ? outs.join('＋') : '（処理）') + ' /秒');
        setText(r.why, cur.reason || '');
        var eff = cur.want > 0 ? cur.rate / cur.want : 0;
        r.bi.style.width = Math.round(Math.min(1, eff) * 100) + '%';
        r.bar.classList.toggle('red', !!cur.reason);
      });
    });
  };

  PANELS.line = function (s, d, box) {
    var sig = 'line|' + s.bld.line.n;
    keyed(box, sig, function (R) {
      box.appendChild(el('p', { class: 'note', text: '小分けラインは、缶供給 → 充填 → キャップ締め → ラベル → 重量検査 → パレット積み の直列。一番遅い工程がラインの速さになる。改善タブで工程を機械にできる。' }));
      R.info = el('p', {}); box.appendChild(R.info);
      D.lineModules.forEach(function (m) {
        var nm = el('div'), bar = el('div', { class: 'bar' }), bi = el('i'); bar.appendChild(bi);
        box.appendChild(el('div', { class: 'flow' }, [nm, bar]));
        R[m.id] = { nm: nm, bar: bar, bi: bi };
      });
    }, function (R) {
      var lc = d.lineInfo || E.lineCap(s, d.m);
      var mx = 0; lc.det.forEach(function (x) { mx = Math.max(mx, x.rate); });
      setText(R.info, 'ライン ' + s.bld.line.n + '本（動いている ' + (d.linesManned || 0) + '本）　1本の速さ ' + f(lc.rate) + '缶/秒' + (Math.round(d.m['line.weigh'] || 0) < 1 ? '　※重量検査が抜き取りなので、ときどき内容量不足のクレームが来る' : ''));
      lc.det.forEach(function (x) {
        var r = R[x.id];
        setText(r.nm, x.name + '：' + x.label + '　' + f(x.rate) + '缶/秒' + (x.id === lc.worst ? '　← 一番遅い' : ''));
        r.bi.style.width = Math.round(x.rate / mx * 100) + '%';
        r.bar.classList.toggle('red', x.id === lc.worst);
      });
    });
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
    });
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
    });
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
