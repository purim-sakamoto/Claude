/* 戦争の画面（時代9〜10）。作戦図をキャンバスに描く。
   時代9：太陽系の前線図（補給の船団が流れていく）。時代10：星図（艦隊が航路を動き、交戦が光る）。 */
var TM = window.TM = window.TM || {};

TM.WarUI = (function () {
  var E = TM.Engine, U = TM.util, el = U.el;
  var sel = null, frac = 1, cv = null, raf = 0, hover = null;
  var C = { bg: '#0a0f0c', grid: 'rgba(120,170,120,0.08)', grid2: 'rgba(120,170,120,0.16)', us: '#7fc7ff', enemy: '#ff6a55', free: '#8c8c7a', text: '#cfe3c8', dim: '#6f8a72', amber: '#ffb347', good: '#8fe08a' };

  function S() { return TM.state; }
  function f(n) { return U.fmt(n, S().settings.expo); }

  /* ---------------- 画面 ---------------- */
  function panel(s, d, box, H) {
    var W = TM.DATA.war, w = TM.War.ensure(s);
    var mode = s.era >= 10 ? 'map' : 'front';
    H.keyed(box, 'war|' + mode, function (R) {
      box.appendChild(el('h3', { class: 'sect wartitle', text: mode === 'front' ? '作戦図：前線と補給' : '作戦図：星図' }));
      cv = el('canvas', { class: 'warmap', width: 900, height: 420 });
      box.appendChild(cv);
      cv.addEventListener('click', onCanvasClick);
      cv.addEventListener('mousemove', function (e) { hover = pick(e); });
      cv.addEventListener('mouseleave', function () { hover = null; });
      R.info = el('div', { class: 'warinfo' }); box.appendChild(R.info);
      if (mode === 'front') {
        var tb = el('table', { class: 't wart' });
        tb.appendChild(el('tr', {}, ['前線', '押し返し', '補給', '推進剤', '冷却材', '装甲材', '浄水剤', '重点'].map(function (h) { return el('th', { text: h }); })));
        R.rows = {};
        W.fronts.forEach(function (fr) {
          var cells = []; for (var i = 0; i < 6; i++) cells.push(el('td'));
          var pr = el('td');
          [1, 2, 3].forEach(function (v) { pr.appendChild(el('button', { class: 'mini', 'data-a': 'wprio', 'data-id': fr.id, 'data-v': v, text: ['', '並', '重', '最重'][v] })); });
          tb.appendChild(el('tr', {}, [el('td', { text: fr.name })].concat(cells).concat([pr])));
          R.rows[fr.id] = { cells: cells, pr: pr };
        });
        box.appendChild(tb);
        box.appendChild(el('p', { class: 'note', text: '船団に積める量（輸送船団）と、宇宙港で積み込める量（ターミナル）の小さいほうが、1秒に前線へ送れる量。重点を上げた前線に多く配る。補給が7割を下回ると押し込まれる。押し返すほど、前線は多くの物資を欲しがる。' }));
      } else {
        var bar = el('div', { class: 'warbar' });
        bar.appendChild(el('span', { class: 'dim', text: '送る艦：' }));
        [[1, '全部'], [0.5, '半分'], [0.25, '4分の1']].forEach(function (x) { bar.appendChild(el('button', { class: 'mini wfrac', 'data-a': 'wfrac', 'data-v': x[0], text: x[1] })); });
        bar.appendChild(el('span', { class: 'dim', style: 'margin-left:10px', text: '味方の星系を押して選び、となりの星系を押すと艦隊が向かう。' }));
        box.appendChild(bar);
        var ships = el('div', { class: 'group' }, [el('h3', { text: '造船（宇宙ドック）' })]);
        R.ships = {};
        W.ships.forEach(function (sh) {
          var b = el('button', { class: 'btn', 'data-a': 'wship', 'data-id': sh.id });
          var nm = el('span', { text: sh.name + '（強さ ' + sh.str + '）' }), cs = el('small', { class: 'cost' });
          b.appendChild(nm); b.appendChild(cs);
          ships.appendChild(el('div', { class: 'row' }, [b, el('div', { class: 'info', text: '造るのに ' + U.fmtTime(sh.sec) + '（ドック1つで1隻ずつ）' })]));
          R.ships[sh.id] = { b: b, cs: cs };
        });
        var ab = el('div', { class: 'warbar' }, [el('span', { class: 'dim', text: '空いたドックで造り続ける：' })]);
        [['', '止める']].concat(W.ships.map(function (sh) { return [sh.id, sh.name]; })).forEach(function (x) { ab.appendChild(el('button', { class: 'mini wauto', 'data-a': 'wauto', 'data-id': x[0], text: x[1] })); });
        ships.appendChild(ab);
        R.queue = el('div', { class: 'note' }); ships.appendChild(R.queue);
        box.appendChild(ships);
      }
      R.log = el('div', { class: 'warlog' }); box.appendChild(R.log);
      startLoop();
    }, function (R) {
      if (mode === 'front') {
        var depot = Math.min(0.5, 0.1 * E.sumEffect(s, 'wbuf'));
        H.setHTML(R.info, '1秒に送れる量 <b>' + f(w.cap || 0) + ' t</b>（船団 ' + f(w.lift || 0) + ' t・積み込み ' + f(w.load || 0) + ' t）' + (depot ? '　前線補給基地 +' + Math.round(depot * 100) + '%' : '') + (w.fall ? '　<span class="bad">押し込まれた前線がある：工場の生産 −20%</span>' : ''));
        W.fronts.forEach(function (fr) {
          var st = w.fronts[fr.id], r = R.rows[fr.id], nd = TM.War.frontNeed(s, fr, st);
          H.setText(r.cells[0], st.won ? '押し返した' : Math.floor(st.pos) + '%');
          r.cells[0].className = st.won ? 'good' : st.pos < 10 ? 'bad' : '';
          H.setText(r.cells[1], st.won ? '—' : Math.round(st.r * 100) + '%');
          r.cells[1].className = st.won ? '' : st.r < W.frontHold ? 'bad' : st.r >= 1 ? 'good' : 'warn';
          TM.War.RES4.forEach(function (k, i) { H.setText(r.cells[2 + i], st.won ? '—' : f(nd[k]) + '/秒'); });
          [].forEach.call(r.pr.children, function (b, i) { b.classList.toggle('on', st.prio === i + 1); b.disabled = st.won; });
        });
      } else {
        var sup = TM.War.supplied(s), own = 0, tot = TM.War.totalStr(s);
        for (var k in w.sys) if (w.sys[k].owner === 'us') own++;
        H.setHTML(R.info, '艦隊の強さ 合計 <b>' + f(tot) + '</b>（強さの倍率 ×' + (w.fm || 1).toFixed(2) + (w.upkeepMul < 0.95 ? '　<span class="bad">補給が足りない（推進剤・冷却材）</span>' : '') + '）　取った星系 ' + own + '/' + TM.DATA.war.systems.length +
          '　敵の次の反撃まで ' + U.fmtTime(Math.max(0, w.raidT)) + (sel ? '　選んでいる星系：<b>' + TM.War.sysDef(sel).name + '</b>（' + f(w.sys[sel].str) + '）' : ''));
        [].forEach.call(document.querySelectorAll('.wfrac'), function (b) { b.classList.toggle('on', +b.getAttribute('data-v') === frac); });
        W.ships.forEach(function (sh) { var r = R.ships[sh.id]; H.setHTML(r.cs, H.costText(s, sh.cost)); r.b.classList.toggle('na', !TM.War.canBuild(s, sh.id)); });
        [].forEach.call(document.querySelectorAll('.wauto'), function (b) { b.classList.toggle('on', (b.getAttribute('data-id') || null) === (w.auto || null)); });
        var docks = E.sumEffect(s, 'dock');
        H.setHTML(R.queue, 'ドック ' + docks + '　造船中 ' + w.queue.length + '隻' + (w.queue.length ? '：' + w.queue.slice(0, 8).map(function (q, i) { var sh = TM.War.shipDef(q.type); return sh.name + (i < docks ? '（' + Math.round(100 - q.left / sh.sec * 100) + '%）' : '（待ち）'); }).join('、') : '') + '　これまでに造った艦 ' + (w.built || 0) + '隻');
        void sup;
      }
      H.setHTML(R.log, w.log.slice(0, 8).map(function (x) { return '<div class="' + x.cls + '"><span class="dim">' + stamp(s, x.t) + '</span>　' + x.text + '</div>'; }).join(''));
    });
  }
  function stamp(s, t) {
    var dt = Math.max(0, s.t - t);
    return dt < 60 ? 'いま' : U.fmtTime(dt) + '前';
  }

  /* ---------------- 操作 ---------------- */
  TM.UIActions = TM.UIActions || {};
  TM.UIActions.wprio = function (t, id, v) { TM.War.setPrio(S(), id, v); };
  TM.UIActions.wship = function (t, id) { TM.War.buildShip(S(), id); };
  TM.UIActions.wauto = function (t, id) { TM.War.setAuto(S(), id); };
  TM.UIActions.wfrac = function (t, id, v) { frac = v || 1; };

  function toXY(x, y) { return [30 + x / 100 * (cv.width - 60), 20 + y / 100 * (cv.height - 40)]; }
  function pick(e) {
    if (!cv || S().era < 10) return null;
    var r = cv.getBoundingClientRect(), mx = (e.clientX - r.left) * cv.width / r.width, my = (e.clientY - r.top) * cv.height / r.height;
    var best = null, bd = 22 * 22;
    TM.DATA.war.systems.forEach(function (x) { var p = toXY(x.x, x.y), dd = (p[0] - mx) * (p[0] - mx) + (p[1] - my) * (p[1] - my); if (dd < bd) { bd = dd; best = x.id; } });
    return best;
  }
  function onCanvasClick(e) {
    var s = S(), id = pick(e); if (!id) { sel = null; return; }
    var w = s.war;
    if (sel && sel !== id && TM.War.adj()[sel].indexOf(id) >= 0) {
      if (TM.War.send(s, sel, id, frac)) { if (w.sys[sel].str < 0.5) sel = null; }
      return;
    }
    sel = w.sys[id].owner === 'us' ? id : null;
  }

  /* ---------------- 描画 ---------------- */
  function startLoop() {
    if (raf) return;
    var tick = function () {
      raf = 0;
      if (!cv || !document.body.contains(cv)) { cv = null; return; }
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  function grid(g) {
    g.fillStyle = C.bg; g.fillRect(0, 0, cv.width, cv.height);
    for (var x = 0; x < cv.width; x += 30) { g.strokeStyle = x % 150 === 0 ? C.grid2 : C.grid; g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, cv.height); g.stroke(); }
    for (var y = 0; y < cv.height; y += 30) { g.strokeStyle = y % 150 === 0 ? C.grid2 : C.grid; g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(cv.width, y + 0.5); g.stroke(); }
    g.font = '10px monospace'; g.fillStyle = C.dim;
    for (var i = 0; i * 150 < cv.width; i++) g.fillText(String.fromCharCode(65 + i), i * 150 + 4, 12);
    for (var j = 1; j * 150 < cv.height; j++) g.fillText(String(j), 4, j * 150 - 4);
  }
  function draw() {
    var s = S(), g = cv.getContext('2d'), now = performance.now() / 1000;
    grid(g);
    if (s.era >= 10) drawMap(s, g, now); else drawFronts(s, g, now);
    /* 走査線と時刻 */
    var sy = (now * 60) % cv.height;
    g.fillStyle = 'rgba(140,255,140,0.04)'; g.fillRect(0, sy, cv.width, 3);
    g.fillStyle = C.dim; g.font = '10px monospace';
    g.fillText('T+' + Math.floor(s.t - ((s.war && s.war.started) || 0)) + 's  ' + (s.era >= 10 ? 'STRATEGIC MAP' : 'LOGISTICS / FRONT'), cv.width - 230, cv.height - 8);
  }

  /* 時代9：太陽を中心に、外側に4つの前線。補給の船団が地球から流れていく */
  function drawFronts(s, g, now) {
    var W = TM.DATA.war, w = s.war, cx = cv.width * 0.42, cy = cv.height / 2, R0 = Math.min(cx, cy) - 30;
    g.fillStyle = C.amber; g.beginPath(); g.arc(cx, cy, 7, 0, Math.PI * 2); g.fill();
    [0.18, 0.28, 0.45, 0.62, 0.78, 0.92].forEach(function (r) { g.strokeStyle = 'rgba(160,200,160,0.12)'; g.beginPath(); g.arc(cx, cy, R0 * r, 0, Math.PI * 2); g.stroke(); });
    var ea = now * 0.05, ex = cx + Math.cos(ea) * R0 * 0.28, ey = cy + Math.sin(ea) * R0 * 0.28;
    g.fillStyle = C.us; g.beginPath(); g.arc(ex, ey, 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = C.text; g.font = '11px monospace'; g.fillText('EARTH', ex + 6, ey - 6);
    var lift = w.cap || 0, tot = 0; W.fronts.forEach(function (fr) { if (!w.fronts[fr.id].won) tot += w.fronts[fr.id].prio; });
    W.fronts.forEach(function (fr, i) {
      var st = w.fronts[fr.id], a = fr.ang * Math.PI / 180;
      var rLine = R0 * (0.62 + 0.36 * st.pos / 100);
      /* 前線（弧） */
      g.lineWidth = 3; g.strokeStyle = st.won ? C.good : st.r < W.frontHold ? C.enemy : C.us;
      g.beginPath(); g.arc(cx, cy, rLine, a - 0.33, a + 0.33); g.stroke();
      /* 敵の圧力（外側の赤い三角） */
      if (!st.won) {
        for (var k = -2; k <= 2; k++) {
          var aa = a + k * 0.13, rr = rLine + 14 + Math.sin(now * 2 + k + i) * 3;
          var px = cx + Math.cos(aa) * rr, py = cy + Math.sin(aa) * rr;
          g.fillStyle = C.enemy; g.beginPath(); g.moveTo(px + Math.cos(aa + Math.PI) * 6, py + Math.sin(aa + Math.PI) * 6);
          g.lineTo(px + Math.cos(aa + 2.2) * 5, py + Math.sin(aa + 2.2) * 5); g.lineTo(px + Math.cos(aa - 2.2) * 5, py + Math.sin(aa - 2.2) * 5); g.fill();
        }
        /* 押し合いの火花 */
        if (Math.random() < 0.5) { var fa = a + (Math.random() - 0.5) * 0.6, fx = cx + Math.cos(fa) * rLine, fy = cy + Math.sin(fa) * rLine; g.fillStyle = C.amber; g.fillRect(fx - 1, fy - 1, 2 + Math.random() * 2, 2 + Math.random() * 2); }
      }
      g.lineWidth = 1;
      /* 船団：地球から前線へ */
      var share = st.won || !tot ? 0 : st.prio / tot, nShips = Math.min(14, Math.ceil(share * Math.log(1 + lift) * 2));
      var tx = cx + Math.cos(a) * (rLine - 6), ty = cy + Math.sin(a) * (rLine - 6);
      for (var j = 0; j < nShips; j++) {
        var p = ((now * 0.12 + j / nShips + i * 0.13) % 1);
        var qx = ex + (tx - ex) * p, qy = ey + (ty - ey) * p;
        g.fillStyle = C.amber; g.fillRect(qx - 1.5, qy - 1.5, 3, 3);
      }
      g.strokeStyle = 'rgba(255,179,71,0.18)'; g.setLineDash([3, 5]); g.beginPath(); g.moveTo(ex, ey); g.lineTo(tx, ty); g.stroke(); g.setLineDash([]);
      /* ラベル */
      var lx = cx + Math.cos(a) * (R0 * 1.0 + 6), ly = cy + Math.sin(a) * (R0 * 1.0 + 6);
      g.fillStyle = C.text; g.font = '12px sans-serif';
      var txt = fr.name + '  ' + (st.won ? '押し返した' : Math.floor(st.pos) + '%  補給' + Math.round(st.r * 100) + '%');
      g.fillText(txt, Math.max(4, Math.min(cv.width - 200, lx - 40)), Math.max(14, Math.min(cv.height - 6, ly)));
    });
  }

  /* 時代10：星図 */
  function drawMap(s, g, now) {
    var W = TM.DATA.war, w = s.war, A = TM.War.adj();
    var col = function (o) { return o === 'us' ? C.us : o === 'enemy' ? C.enemy : C.free; };
    /* 勢力の色を薄く塗る */
    W.systems.forEach(function (x) {
      var p = toXY(x.x, x.y), o = w.sys[x.id].owner; if (o === 'free') return;
      var gr = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], 90);
      gr.addColorStop(0, o === 'us' ? 'rgba(127,199,255,0.16)' : 'rgba(255,106,85,0.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(p[0] - 90, p[1] - 90, 180, 180);
    });
    /* 航路 */
    W.lanes.forEach(function (l) {
      var a = toXY(W.systems.filter(function (x) { return x.id === l[0]; })[0].x, W.systems.filter(function (x) { return x.id === l[0]; })[0].y);
      var b = toXY(TM.War.sysDef(l[1]).x, TM.War.sysDef(l[1]).y);
      var hl = sel && ((l[0] === sel) || (l[1] === sel));
      g.strokeStyle = hl ? 'rgba(255,179,71,0.7)' : 'rgba(160,200,160,0.25)'; g.lineWidth = hl ? 1.5 : 1;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    });
    g.lineWidth = 1;
    /* 移動中の艦隊 */
    w.moves.forEach(function (mv) {
      var a = TM.War.sysDef(mv.from), b = TM.War.sysDef(mv.to), pa = toXY(a.x, a.y), pb = toXY(b.x, b.y), p = Math.min(1, mv.t / mv.dur);
      var x = pa[0] + (pb[0] - pa[0]) * p, y = pa[1] + (pb[1] - pa[1]) * p;
      var c = mv.side === 'us' ? C.us : C.enemy;
      g.strokeStyle = c; g.setLineDash([2, 4]); g.beginPath(); g.moveTo(pa[0], pa[1]); g.lineTo(x, y); g.stroke(); g.setLineDash([]);
      /* 矢印 */
      var ang = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]);
      g.fillStyle = c; g.beginPath(); g.moveTo(x + Math.cos(ang) * 9, y + Math.sin(ang) * 9); g.lineTo(x + Math.cos(ang + 2.5) * 7, y + Math.sin(ang + 2.5) * 7); g.lineTo(x + Math.cos(ang - 2.5) * 7, y + Math.sin(ang - 2.5) * 7); g.fill();
      unit(g, x + 10, y - 18, c, mv.str);
    });
    /* 星系 */
    W.systems.forEach(function (x) {
      var X = w.sys[x.id], p = toXY(x.x, x.y), c = col(X.owner);
      if (sel === x.id) { g.strokeStyle = C.amber; g.lineWidth = 2; g.beginPath(); g.arc(p[0], p[1], 14 + Math.sin(now * 5) * 2, 0, Math.PI * 2); g.stroke(); g.lineWidth = 1; }
      if (sel && A[sel].indexOf(x.id) >= 0 && X.owner !== 'us') { g.strokeStyle = 'rgba(255,179,71,0.5)'; g.setLineDash([2, 3]); g.beginPath(); g.arc(p[0], p[1], 16, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
      if (hover === x.id) { g.strokeStyle = C.text; g.beginPath(); g.arc(p[0], p[1], 12, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = c; g.beginPath();
      if (x.capital) { for (var k = 0; k < 10; k++) { var rr = k % 2 ? 4 : 10, aa = -Math.PI / 2 + k * Math.PI / 5; g.lineTo(p[0] + Math.cos(aa) * rr, p[1] + Math.sin(aa) * rr); } }
      else g.arc(p[0], p[1], x.home ? 9 : 6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = C.text; g.font = '11px sans-serif'; g.fillText(x.name, p[0] + 10, p[1] + 16);
      if (X.owner === 'enemy') { g.fillStyle = C.enemy; g.font = '10px monospace'; g.fillText('DEF ' + f(X.def), p[0] + 10, p[1] + 28); }
      if (X.owner === 'us' && X.str >= 0.5) unit(g, p[0] - 30, p[1] - 26, C.us, X.str);
      /* 交戦 */
      if (X.battle) {
        var B = X.battle;
        for (var j = 0; j < 6; j++) {
          var a1 = Math.random() * Math.PI * 2, r1 = 6 + Math.random() * 18;
          g.strokeStyle = Math.random() < 0.5 ? C.amber : (B.side === 'us' ? C.us : C.enemy);
          g.beginPath(); g.moveTo(p[0] + Math.cos(a1) * r1, p[1] + Math.sin(a1) * r1); g.lineTo(p[0] + Math.cos(a1 + 0.4) * (r1 + 10), p[1] + Math.sin(a1 + 0.4) * (r1 + 10)); g.stroke();
        }
        g.strokeStyle = C.amber; g.globalAlpha = 0.5 + 0.5 * Math.sin(now * 10); g.beginPath(); g.arc(p[0], p[1], 20, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
        g.fillStyle = C.amber; g.font = 'bold 11px monospace';
        g.fillText('交戦  ' + (B.side === 'us' ? '攻' : '守') + ' ' + f(B.att) + ' / ' + f(B.side === 'us' ? X.def : X.str + X.def), p[0] - 40, p[1] - 30);
      }
    });
  }
  /* 部隊の記号（四角に×）と強さ */
  function unit(g, x, y, c, str) {
    g.strokeStyle = c; g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x, y, 22, 14); g.strokeRect(x + 0.5, y + 0.5, 22, 14);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 22, y + 14); g.moveTo(x + 22, y); g.lineTo(x, y + 14); g.stroke();
    g.fillStyle = c; g.font = '10px monospace'; g.fillText(f(str), x + 25, y + 11);
  }

  return { panel: panel };
})();
