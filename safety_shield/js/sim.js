/* SAFETY SHIELD - シミュレーション本体(描画から独立・決定論的) */
(function (root) {
  const SS = root.SS || (root.SS = {});

  const T_FLOOR = 0, T_WALL = 1, T_SHELF = 2, T_MACHINE = 3, T_LOCK = 4;
  SS.TILE = { FLOOR: T_FLOOR, WALL: T_WALL, SHELF: T_SHELF, MACHINE: T_MACHINE, LOCK: T_LOCK };
  const DT = 0.1;
  SS.DT = DT;

  const SPEED = { sneak: 1.2, walk: 2.2, run: 3.6 };
  const MOVE_NOISE = { sneak: 0.6, walk: 2.0, run: 4.5 };
  const MOVE_VIS = { sneak: 0.55, walk: 1.0, run: 1.6, still: 0.35, hold: 0.15 };
  SS.SPEED_LABEL = { sneak: '忍び足', walk: '通常', run: '小走り' };
  SS.ROE_LABEL = { recon: 'こっそり', infil: '慎重', assault: '強気' };
  SS.ROE_TEXT = {
    recon: '自分からは指摘しない。目が合ったら応戦するが、立ち止まらずに進む',
    infil: '気づかれた相手と、すぐそばの相手にだけ静かに指摘する(おすすめ)',
    assault: '見つけた相手に大声で指摘する。強いが周りにも聞こえる',
  };
  SS.TEAM_DEFS = [
    { id: 'red', name: 'レッド', color: '#ff5a4e' },
    { id: 'green', name: 'グリーン', color: '#3fd17a' },
    { id: 'gold', name: 'ゴールド', color: '#ffc531' },
  ];

  // ---------- 乱数 ----------
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  SS.rng = rng;

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  function angDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }
  function turnToward(cur, target, maxStep) {
    const d = angDiff(cur, target);
    if (Math.abs(d) <= maxStep) return target;
    return cur + Math.sign(d) * maxStep;
  }

  // ---------- ステージ解析 ----------
  SS.parseStage = function (def) {
    const h = def.map.length, w = def.map[0].length;
    const tiles = new Uint8Array(w * h);
    const hazards = [], points = {}, digits = {}, entries = [];
    for (let y = 0; y < h; y++) {
      const row = def.map[y];
      if (row.length !== w) throw new Error(`stage ${def.id} row ${y} length ${row.length} != ${w}`);
      for (let x = 0; x < w; x++) {
        const c = row[x];
        let t = T_FLOOR;
        if (c === '#') t = T_WALL;
        else if (c === '=') t = T_SHELF;
        else if (c === '+') t = T_MACHINE;
        else if (c === 'L') t = T_LOCK;
        else if (c === 'S') entries.push({ x, y, name: def.entries[entries.length] || `進入口${entries.length + 1}` });
        else if (c >= 'a' && c <= 'z') {
          const hd = def.hazards[c];
          if (!hd) throw new Error(`stage ${def.id}: hazard ${c} undefined`);
          hazards.push(Object.assign({ id: c, x, y }, hd));
        } else if (c >= '0' && c <= '9') digits[c] = { x, y };
        else if (c >= 'A' && c <= 'Z') points[c] = { x, y };
        tiles[y * w + x] = t;
      }
    }
    const enemies = [];
    for (const key of Object.keys(def.enemies)) {
      const ed = def.enemies[key];
      const pos = digits[key] || (ed.at && points[ed.at]);
      if (!pos) throw new Error(`stage ${def.id}: enemy ${key} has no position`);
      const route = (ed.route || '').split('').filter(Boolean).map(ch => {
        if (!points[ch]) throw new Error(`stage ${def.id}: point ${ch} missing`);
        return points[ch];
      });
      enemies.push({ id: key, type: ed.type, x: pos.x, y: pos.y, facing: (ed.facing || 0) * Math.PI / 180, route, name: ed.name });
    }
    return { def, w, h, tiles, hazards, enemies, entries, points };
  };

  function tileAt(st, tiles, x, y) {
    if (x < 0 || y < 0 || x >= st.w || y >= st.h) return T_WALL;
    return tiles[y * st.w + x];
  }
  SS.tileAt = tileAt;

  function passable(t, canUnlock) {
    return t === T_FLOOR || (t === T_LOCK && canUnlock);
  }
  function blocksSight(t) {
    return t === T_WALL || t === T_SHELF || t === T_LOCK;
  }

  // 視線判定(タイル座標の連続値)
  function los(st, tiles, ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay);
    const n = Math.ceil(d / 0.25);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = Math.floor(ax + (bx - ax) * t), y = Math.floor(ay + (by - ay) * t);
      if (blocksSight(tileAt(st, tiles, x, y))) return false;
    }
    return true;
  }
  SS.los = los;

  // ---------- 経路探索(8方向・角抜け不可のA*) ----------
  SS.findPath = function (st, tiles, sx, sy, gx, gy, canUnlock) {
    if (!passable(tileAt(st, tiles, gx, gy), canUnlock)) return null;
    if (sx === gx && sy === gy) return [{ x: sx, y: sy }];
    const W = st.w, N = st.w * st.h;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = [];
    const push = (i, f) => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    const hfn = (x, y) => {
      const dx = Math.abs(x - gx), dy = Math.abs(y - gy);
      return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy);
    };
    const s = sy * W + sx;
    g[s] = 0;
    push(s, hfn(sx, sy));
    const goal = gy * W + gx;
    while (heap.length) {
      const [, i] = pop();
      if (closed[i]) continue;
      closed[i] = 1;
      if (i === goal) break;
      const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (!passable(tileAt(st, tiles, nx, ny), canUnlock)) continue;
          if (dx && dy && (!passable(tileAt(st, tiles, x + dx, y), false) || !passable(tileAt(st, tiles, x, y + dy), false))) continue;
          const j = ny * W + nx;
          if (closed[j]) continue;
          const ng = g[i] + (dx && dy ? 1.4142 : 1);
          if (ng < g[j]) {
            g[j] = ng;
            came[j] = i;
            push(j, ng + hfn(nx, ny));
          }
        }
      }
    }
    if (came[goal] < 0) return null;
    const out = [];
    for (let i = goal; i !== s; i = came[i]) out.push({ x: i % W, y: (i / W) | 0 });
    out.push({ x: sx, y: sy });
    return out.reverse();
  };

  // チームが合鍵を持っているか
  SS.teamCanUnlock = function (memberIds, kits) {
    return memberIds.some(id => (kits[id] || SS.MEMBERS.find(m => m.id === id).kit) === 'key');
  };

  // プランの各区間の経路を計算(UIのプレビューにも使う)
  SS.planPaths = function (st, team, kits) {
    const canUnlock = SS.teamCanUnlock(team.members, kits);
    const e = st.entries[team.entry] || st.entries[0];
    let cur = { x: e.x, y: e.y };
    const legs = [];
    for (const wp of team.wps) {
      const p = SS.findPath(st, st.tiles, cur.x, cur.y, wp.x, wp.y, canUnlock);
      legs.push(p);
      if (p) cur = { x: wp.x, y: wp.y };
    }
    return legs;
  };

  // 既定プラン: 2チーム編成・地点なし(=全員おまかせ巡回)
  SS.defaultPlan = function (def) {
    const n = def.entries.length;
    return {
      kits: { miura: 'key', yanami: 'light' },
      teams: [
        { id: 'red', members: ['onizuka', 'ishizaki', 'hanashiro', 'sorachi'], entry: 0, speed: 'walk', roe: 'infil', wps: [] },
        { id: 'green', members: ['kageyama', 'takahashi', 'yanami', 'miura'], entry: n - 1, speed: 'walk', roe: 'infil', wps: [] },
        { id: 'gold', members: [], entry: 0, speed: 'walk', roe: 'infil', wps: [] },
      ],
    };
  };

  // ---------- シミュレーション ----------
  SS.createSim = function (st, plan, seed) {
    const R = rng(seed);
    const tiles = new Uint8Array(st.tiles);
    const def = st.def;
    const visMul = def.dark ? 0.6 : 1;
    const S = {
      t: 0, seed, tiles, st, alarm: false, alarmT: null, over: false, result: null,
      log: [], fx: [], members: [], teams: [], enemies: [], hazards: [], score: 0, outs: 0,
      stats: { presses: 0, hits: 0, takedowns: 0, excuses: 0 },
    };

    const say = (text, kind) => S.log.push({ t: S.t, text, kind: kind || 'info' });
    const bubble = (x, y, text, kind) => {
      // 同じ人の吹き出しは最新だけ残す
      S.fx = S.fx.filter(f => f.type !== 'bubble' || Math.hypot(f.x - x, f.y - y) > 0.9);
      S.fx.push({ type: 'bubble', x, y, text, kind, t0: S.t, dur: 1.8 });
    };
    const pick = arr => arr[Math.floor(R() * arr.length)];

    // 不安全箇所
    for (const h of st.hazards) {
      S.hazards.push(Object.assign({}, h, { prog: 0, conceal: 0, status: 'open', known: !h.hidden, by: null, concealer: null }));
    }

    // 敵
    for (const e of st.enemies) {
      const ty = SS.ENEMY_TYPES[e.type];
      S.enemies.push({
        id: e.id, type: e.type, ty, name: e.name || ty.name,
        x: e.x + 0.5, y: e.y + 0.5, px: e.x + 0.5, py: e.y + 0.5,
        facing: e.facing, baseFacing: e.facing,
        route: e.route.map(p => ({ x: p.x + 0.5, y: p.y + 0.5 })), ri: 0, pause: 0,
        path: null, pi: 0,
        state: 'calm', meter: 0, aware: null, lastKnown: null, investigate: null, lookT: 0,
        radio: null, react: 0, cd: 0, stun: 0, resolve: ty.resolve, task: null, phase: R() * 6,
      });
    }

    // 隊員とチーム
    const kits = plan.kits || {};
    for (const td of SS.TEAM_DEFS) {
      const tp = plan.teams.find(t => t.id === td.id);
      if (!tp || !tp.members.length) continue;
      const entry = st.entries[tp.entry] || st.entries[0];
      const team = {
        id: td.id, name: td.name, color: td.color,
        wps: tp.wps.map(w => Object.assign({}, w)),
        speed: tp.speed || 'walk', roe: tp.roe || 'infil',
        wi: 0, path: null, pi: 0, state: 'move', holdCode: null, unlockT: 0, fuse: null,
        trail: [{ x: entry.x + 0.5, y: entry.y + 0.5 }], members: [], engaged: false,
        canUnlock: SS.teamCanUnlock(tp.members, kits), doneAt: null, reachedLast: false,
      };
      tp.members.forEach((mid, k) => {
        const md = SS.MEMBERS.find(m => m.id === mid);
        const kit = kits[mid] || md.kit;
        const m = Object.assign({}, md, {
          team, k, x: entry.x + 0.5, y: entry.y + 0.5, px: entry.x + 0.5, py: entry.y + 0.5,
          facing: 0, hpMax: md.hp, hp: md.hp, out: false, cd: 0.3 + R() * 0.5, target: null,
          kitId: kit, uses: SS.KITS[kit].uses, moving: 'still',
        });
        team.members.push(m);
        S.members.push(m);
      });
      S.teams.push(team);
    }
    if (!S.teams.length) throw new Error('チームがありません');
    S.teams.forEach(t => startLeg(t));

    function startLeg(team) {
      if (team.wi >= team.wps.length) {
        // 地点を使い切ったら、残りはおまかせ巡回
        if (!team.auto) {
          team.auto = true;
          if (team.wps.length) say(`${team.name}、計画完了。ここからおまかせ巡回`, 'team');
        }
        autoNext(team);
        return;
      }
      const lead = leader(team) || team.trail[team.trail.length - 1];
      const wp = team.wps[team.wi];
      const p = SS.findPath(st, tiles, Math.floor(lead.x), Math.floor(lead.y), wp.x, wp.y, team.canUnlock);
      if (!p) {
        say(`${team.name}: 地点${team.wi + 1}への経路なし。次の地点へ`, 'warn');
        team.wi++;
        startLeg(team);
        return;
      }
      team.path = p.map(c => ({ x: c.x + 0.5, y: c.y + 0.5 }));
      team.pi = 1;
      team.state = 'move';
    }

    // ---------- おまかせ巡回 ----------
    // リーダー位置からの移動コスト(ダイクストラ)
    function costMap(team, from) {
      const N = st.w * st.h, W = st.w;
      const d = new Float32Array(N).fill(Infinity);
      const s0 = Math.floor(from.y) * W + Math.floor(from.x);
      d[s0] = 0;
      const q = [s0];
      while (q.length) {
        // 小さな盤面なので単純な選択で十分
        let bi = 0;
        for (let i = 1; i < q.length; i++) if (d[q[i]] < d[q[bi]]) bi = i;
        const i = q[bi];
        q[bi] = q[q.length - 1]; q.pop();
        const x = i % W, y = (i / W) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (!passable(tileAt(st, tiles, nx, ny), team.canUnlock)) continue;
          if (dx && dy && (!passable(tileAt(st, tiles, x + dx, y), false) || !passable(tileAt(st, tiles, x, y + dy), false))) continue;
          const j = ny * W + nx, nd = d[i] + (dx && dy ? 1.4142 : 1);
          if (nd < d[j]) { if (d[j] === Infinity) q.push(j); d[j] = nd; }
        }
      }
      return d;
    }

    function autoCandidates() {
      const out = [];
      for (const h of S.hazards) if (h.status === 'open') out.push({ kind: 'hazard', ref: h, x: h.x, y: h.y });
      for (const o of def.objectives) {
        if (o.type !== 'neutralize') continue;
        const e = S.enemies.find(x => x.id === o.id);
        if (e && e.state !== 'down') out.push({ kind: 'enemy', ref: e, x: Math.floor(e.x), y: Math.floor(e.y) });
      }
      return out;
    }

    function autoNext(team) {
      const lead = leader(team);
      team.path = null;
      team.autoTarget = null;
      if (!lead) { team.state = 'dead'; return; }
      const claimed = new Set(S.teams.filter(t => t !== team && t.autoTarget && teamAlive(t)).map(t => t.autoTarget.ref));
      const cands = autoCandidates().filter(c => !(team.skip && team.skip.has(c.ref)));
      if (!cands.length) { team.state = 'done'; return; }
      const d = costMap(team, lead);
      let best = null, bestCost = Infinity;
      for (const c of cands) {
        // 見通せる距離まで近づけばよい(設備の中の箇所にも対応)
        const reach = c.kind !== 'hazard' || c.ref.item ? 0 : c.ref.hidden && !c.ref.known ? 1 : 2;
        for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
          const x = c.x + dx, y = c.y + dy;
          if (!passable(tileAt(st, tiles, x, y), team.canUnlock)) continue;
          const cost = d[y * st.w + x];
          if (cost === Infinity) continue;
          if ((dx || dy) && !los(st, tiles, x + 0.5, y + 0.5, c.x + 0.5, c.y + 0.5)) continue;
          // 他チームが向かっている先は後回し
          const total = cost + (claimed.has(c.ref) ? 40 : 0);
          if (total < bestCost) { bestCost = total; best = { c, x, y }; }
        }
      }
      if (!best) { team.state = 'done'; return; }
      const p = SS.findPath(st, tiles, Math.floor(lead.x), Math.floor(lead.y), best.x, best.y, team.canUnlock);
      if (!p) { (team.skip || (team.skip = new Set())).add(best.c.ref); autoNext(team); return; }
      team.autoTarget = best.c;
      team.autoT = 0;
      team.path = p.map(c => ({ x: c.x + 0.5, y: c.y + 0.5 }));
      team.pi = 1;
      team.state = 'move';
    }

    function autoResolved(t) {
      if (!t) return true;
      if (t.kind === 'hazard') return t.ref.status !== 'open';
      return t.ref.state === 'down';
    }

    function leader(team) {
      return team.members.find(m => !m.out);
    }
    function teamAlive(team) {
      return team.members.some(m => !m.out);
    }
    function curSpeed(team) {
      if (team.wi === 0) return team.speed;
      return team.wps[team.wi - 1].speed || team.speed;
    }
    function curRoe(team) {
      if (team.wi === 0) return team.roe;
      return team.wps[team.wi - 1].roe || team.roe;
    }
    S.curRoe = curRoe;
    S.curSpeed = curSpeed;

    // ---------- 音 ----------
    function noise(x, y, r, src) {
      if (r <= 0.05) return;
      for (const e of S.enemies) {
        if (e.state === 'down' || e.stun > 0) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        const eff = los(st, tiles, e.x, e.y, x, y) ? r : r * 0.55;
        if (d > eff) continue;
        if (e.state === 'calm' || e.state === 'suspicious') {
          if (r >= 5 && d <= eff * 0.75) {
            becomeAlert(e, null, { x, y });
          } else if (e.state === 'calm') {
            e.state = 'suspicious';
            e.investigate = { x, y };
            e.path = null;
            e.lookT = 0;
            if (src !== 'quiet') bubble(e.x, e.y - 0.6, '…?', 'enemy');
          } else {
            e.investigate = { x, y };
            e.path = null;
          }
        } else if (e.state === 'alert' && !e.aware) {
          e.lastKnown = { x, y };
        }
      }
    }

    // 無線通報までの猶予(部長は即時、ほかは最低2秒)
    function radioTime(e) {
      return e.ty.boss ? 0 : Math.max(2, e.ty.alarmT * (def.radio || 1));
    }
    S.radioTime = radioTime;

    function becomeAlert(e, member, pos) {
      const was = e.state;
      e.state = 'alert';
      if (member) {
        e.aware = member;
        e.lastKnown = { x: member.x, y: member.y };
      } else if (pos) {
        e.lastKnown = pos;
      }
      if (was !== 'alert') {
        e.react = e.ty.react;
        e.path = null;
        e.task = null;
        if (!S.alarm && e.radio === null) {
          e.radio = radioTime(e);
          bubble(e.x, e.y - 0.6, e.ty.boss ? '一旦止めて片付けろ!' : pick(SS.LINES.spot), 'alarm');
          say(`${e.name}がパトロールに気づいた${e.ty.boss ? '' : '(無線で通報中…)'}`, 'warn');
        }
      }
    }

    function raiseAlarm(by) {
      if (S.alarm) return;
      S.alarm = true;
      S.alarmT = S.t;
      say(`『${by.ty.boss ? '一旦止めて片付けろ!' : 'パトロール来たぞ!'}』全館に通報が回った。現場が片付けを始める`, 'alarm');
      for (const e of S.enemies) {
        if (e.state === 'down') continue;
        if (e.state !== 'alert') {
          e.state = 'alert';
          e.aware = null;
          e.react = e.ty.react;
          e.path = null;
        }
        e.radio = null;
      }
    }

    // ---------- 視認 ----------
    function memberSees(m, x, y, range) {
      const d = Math.hypot(x - m.x, y - m.y);
      if (d > range) return false;
      if (d > 1.3 && Math.abs(angDiff(m.facing, Math.atan2(y - m.y, x - m.x))) > Math.PI / 3) return false;
      return los(st, tiles, m.x, m.y, x, y);
    }
    function enemySees(e, m, range) {
      const d = dist(e, m);
      if (d > range) return false;
      if (d > 1.2 && Math.abs(angDiff(e.facing, angTo(e, m))) > (55 * Math.PI) / 180) return false;
      return los(st, tiles, e.x, e.y, m.x, m.y);
    }

    // ---------- 移動補助 ----------
    function stepAlong(obj, path, holder, idxKey, speed) {
      let left = speed * DT;
      while (left > 0 && holder[idxKey] < path.length) {
        const tgt = path[holder[idxKey]];
        const dx = tgt.x - obj.x, dy = tgt.y - obj.y;
        const d = Math.hypot(dx, dy);
        if (d < 1e-6) { holder[idxKey]++; continue; }
        obj.facing = turnToward(obj.facing, Math.atan2(dy, dx), 0.6);
        if (d <= left) {
          obj.x = tgt.x; obj.y = tgt.y; left -= d; holder[idxKey]++;
        } else {
          obj.x += (dx / d) * left; obj.y += (dy / d) * left; left = 0;
        }
      }
      return holder[idxKey] >= path.length;
    }

    function enemyGo(e, x, y, speed) {
      if (!e.path || !e.goal || e.goal.x !== Math.floor(x) || e.goal.y !== Math.floor(y)) {
        const p = SS.findPath(st, tiles, Math.floor(e.x), Math.floor(e.y), Math.floor(x), Math.floor(y), false);
        e.goal = { x: Math.floor(x), y: Math.floor(y) };
        if (!p) { e.path = null; return true; }
        e.path = p.map(c => ({ x: c.x + 0.5, y: c.y + 0.5 }));
        e.pi = 1;
      }
      return stepAlong(e, e.path, e, 'pi', speed);
    }

    // ---------- 1ティック ----------
    S.step = function () {
      if (S.over) return;
      for (const m of S.members) { m.px = m.x; m.py = m.y; }
      for (const e of S.enemies) { e.px = e.x; e.py = e.y; }
      S.t = Math.round((S.t + DT) * 10) / 10;

      updateGoCodes();
      for (const team of S.teams) updateTeam(team);
      for (const e of S.enemies) updateEnemy(e);
      perception();
      combat();
      recordHazards();
      S.fx = S.fx.filter(f => S.t - f.t0 < f.dur);
      checkEnd();
    };

    function updateGoCodes() {
      for (const code of ['A', 'B', 'C']) {
        const involved = S.teams.filter(t => teamAlive(t) && t.wps.some((w, i) => w.go === code && (i >= t.wi || (t.state === 'hold' && t.holdCode === code && i === t.wi - 1))));
        if (!involved.length) continue;
        const holding = involved.filter(t => t.state === 'hold' && t.holdCode === code);
        if (holding.length === involved.length) {
          const label = { A: '合図A', B: '合図B', C: '合図C' }[code];
          say(`${label}!${holding.map(t => t.name).join('・')}前進`, 'go');
          for (const t of holding) {
            t.holdCode = null;
            afterArrive(t, true);
          }
        }
      }
    }

    function afterArrive(team, released) {
      const wp = team.wps[team.wi - 1];
      if (!released && wp.go) {
        team.state = 'hold';
        team.holdCode = wp.go;
        say(`${team.name}、地点${team.wi}で合図${wp.go}を待つ`, 'team');
        return;
      }
      team.pendingLight = false;
      if (wp.action === 'light') {
        // 次の地点が扉の向こうなら、扉が開いた瞬間に投げ込む
        const nxt = team.wps[team.wi];
        const lead = leader(team);
        if (nxt && lead && !los(st, tiles, lead.x, lead.y, nxt.x + 0.5, nxt.y + 0.5)) team.pendingLight = true;
        else useKit(team, 'light');
      } else if (wp.action === 'camera') useKit(team, 'camera');
      startLeg(team);
    }

    function useKit(team, kind) {
      const user = team.members.find(m => !m.out && m.kitId === kind && m.uses > 0);
      const lead = leader(team);
      if (!user || !lead) {
        say(`${team.name}: ${SS.KITS[kind].name}がありません`, 'warn');
        return;
      }
      user.uses--;
      if (kind === 'light') {
        // 投げ込み先: 見えている一番近い工場員 → 次の地点 → 正面
        const nxt = team.wps[team.wi];
        let tx, ty, bd = 7.5;
        for (const e of S.enemies) {
          if (e.state === 'down') continue;
          const d = Math.hypot(e.x - lead.x, e.y - lead.y);
          if (d < bd && los(st, tiles, lead.x, lead.y, e.x, e.y)) { bd = d; tx = e.x; ty = e.y; }
        }
        if (tx === undefined && nxt && Math.hypot(nxt.x + 0.5 - lead.x, nxt.y + 0.5 - lead.y) <= 7 && los(st, tiles, lead.x, lead.y, nxt.x + 0.5, nxt.y + 0.5)) {
          tx = nxt.x + 0.5; ty = nxt.y + 0.5;
        } else if (tx === undefined) {
          tx = lead.x + Math.cos(lead.facing) * 3; ty = lead.y + Math.sin(lead.facing) * 3;
        }
        team.fuse = { t: 0.6, x: tx, y: ty };
        bubble(user.x, user.y - 0.6, 'ライト、入れます!', 'team');
        say(`${user.name}が安全ライトを投げ込んだ`, 'team');
      } else {
        let n = 0;
        for (const h of S.hazards) {
          if (h.status !== 'open') continue;
          const hx = h.x + 0.5, hy = h.y + 0.5;
          if (Math.hypot(hx - user.x, hy - user.y) <= 5 && los(st, tiles, user.x, user.y, hx, hy)) {
            completeHazard(h, user, true);
            n++;
          }
        }
        S.fx.push({ type: 'flash', x: user.x, y: user.y, r: 5, t0: S.t, dur: 0.4, kind: 'camera' });
        noise(user.x, user.y, 2, 'quiet');
        say(`${user.name}がデジカメで撮影(${n}件記録)`, 'team');
      }
    }

    function updateTeam(team) {
      const lead = leader(team);
      if (!lead) { team.state = 'dead'; return; }

      // ライトの起爆
      if (team.fuse) {
        team.fuse.t -= DT;
        if (team.fuse.t <= 0) {
          const { x, y } = team.fuse;
          team.fuse = null;
          let n = 0;
          for (const e of S.enemies) {
            if (e.state === 'down') continue;
            if (Math.hypot(e.x - x, e.y - y) <= 3.2 && los(st, tiles, x, y, e.x, e.y)) {
              e.stun = 5; n++;
              if (e.radio !== null) e.radio = null;
            }
          }
          S.fx.push({ type: 'flash', x, y, r: 3.2, t0: S.t, dur: 0.6, kind: 'light' });
          noise(x, y, 4);
          if (n) say(`安全ライト命中: ${n}人がまぶしさで動けない`, 'good');
        }
      }

      // 元気回復(花城)
      if (!team.engaged && team.members.some(m => !m.out && m.skill === 'medic')) {
        for (const m of team.members) if (!m.out) m.hp = Math.min(m.hpMax, m.hp + 0.8 * DT);
      }

      if (team.pendingLight) {
        const nxt = team.wps[team.wi];
        if (!nxt) team.pendingLight = false;
        else if (Math.hypot(nxt.x + 0.5 - lead.x, nxt.y + 0.5 - lead.y) <= 7 && los(st, tiles, lead.x, lead.y, nxt.x + 0.5, nxt.y + 0.5)) {
          team.pendingLight = false;
          useKit(team, 'light');
        }
      }

      const roe = curRoe(team);
      let moving = false;
      if (team.engaged && roe !== 'recon') {
        // 交戦中は停止
      } else if (team.state === 'move' && team.path) {
        // 施錠扉の手前で解錠
        const nxt = team.path[team.pi];
        if (nxt && tileAt(st, tiles, Math.floor(nxt.x), Math.floor(nxt.y)) === T_LOCK && Math.hypot(nxt.x - lead.x, nxt.y - lead.y) < 1.6) {
          team.state = 'unlock';
          const fast = team.members.some(m => !m.out && m.skill === 'breach');
          team.unlockT = fast ? 1 : 3;
          team.door = { x: Math.floor(nxt.x), y: Math.floor(nxt.y) };
          say(`${team.name}、施錠扉を解錠中`, 'team');
        } else {
          const sp = curSpeed(team);
          const shadow = team.members.some(m => !m.out && m.skill === 'shadow');
          const v = sp === 'sneak' && shadow ? 2.0 : SPEED[sp];
          const arrived = stepAlong(lead, team.path, team, 'pi', v);
          moving = true;
          if (team.auto) {
            team.autoT += DT;
            const tgt = team.autoTarget;
            if (autoResolved(tgt)) autoNext(team);
            else if (arrived) { team.state = 'watch'; team.watchT = 0; }
            else if (team.autoT > 40) { (team.skip || (team.skip = new Set())).add(tgt.ref); autoNext(team); }
          } else if (arrived) {
            team.wi++;
            afterArrive(team, false);
          }
        }
      } else if (team.state === 'watch') {
        // おまかせ: 目標を見つめて記録が終わるのを待つ
        const tgt = team.autoTarget;
        team.watchT += DT;
        if (tgt) lead.facing = turnToward(lead.facing, Math.atan2(tgt.y + 0.5 - lead.y, tgt.x + 0.5 - lead.x), 0.5);
        if (autoResolved(tgt)) autoNext(team);
        else if (team.watchT > 8) { (team.skip || (team.skip = new Set())).add(tgt.ref); autoNext(team); }
      } else if (team.state === 'unlock') {
        team.unlockT -= DT;
        if (team.unlockT <= 0) {
          tiles[team.door.y * st.w + team.door.x] = T_FLOOR;
          noise(team.door.x + 0.5, team.door.y + 0.5, 3);
          say(`${team.name}、解錠完了`, 'team');
          team.state = 'move';
        }
      }

      // 隊列(リーダーの軌跡を追う)
      const last = team.trail[team.trail.length - 1];
      if (Math.hypot(lead.x - last.x, lead.y - last.y) > 0.15) {
        team.trail.push({ x: lead.x, y: lead.y });
        if (team.trail.length > 80) team.trail.shift();
      }
      const alive = team.members.filter(m => !m.out);
      const sp = moving ? curSpeed(team) : team.state === 'hold' ? 'hold' : 'still';
      alive.forEach((m, k) => {
        m.moving = sp;
        if (k === 0) return;
        const want = 0.85 * k;
        let acc = Math.hypot(lead.x - team.trail[team.trail.length - 1].x, lead.y - team.trail[team.trail.length - 1].y);
        let pos = team.trail[0];
        for (let i = team.trail.length - 1; i > 0; i--) {
          const a = team.trail[i], b = team.trail[i - 1];
          const seg = Math.hypot(a.x - b.x, a.y - b.y);
          if (acc + seg >= want) {
            const f = (want - acc) / seg;
            pos = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
            break;
          }
          acc += seg;
        }
        const dx = pos.x - m.x, dy = pos.y - m.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.02) {
          const step = Math.min(d, 4.5 * DT);
          m.x += (dx / d) * step; m.y += (dy / d) * step;
          if (d > 0.1 && !m.target) m.facing = turnToward(m.facing, Math.atan2(dy, dx), 0.5);
        }
      });
      // 停止中は扇状に警戒
      if (!moving) {
        alive.forEach((m, k) => {
          if (m.target) return;
          const fan = [0, 0.9, -0.9, Math.PI][k] || 0;
          m.facing = turnToward(m.facing, lead.facing + fan, 0.25);
        });
      }
      if (moving) {
        const r = MOVE_NOISE[sp];
        for (const m of alive) noise(m.x, m.y, r * (1.3 - m.stealth / 100) * def.noise, 'quiet');
      }

      if (team.state === 'done' && !team.engaged && team.doneAt === null) team.doneAt = S.t;
      if (team.state !== 'done') team.doneAt = null;
    }

    function updateEnemy(e) {
      if (e.state === 'down') return;
      if (e.stun > 0) { e.stun = Math.max(0, e.stun - DT); return; }
      const ty = e.ty;

      if (e.radio !== null && !S.alarm) {
        e.radio -= DT;
        if (e.radio <= 0) { e.radio = null; raiseAlarm(e); }
      }

      if (e.state === 'calm') {
        e.meter = Math.max(0, e.meter - 0.3 * DT);
        if (e.route.length >= 2) {
          if (e.pause > 0) { e.pause -= DT; return; }
          const tgt = e.route[e.ri];
          if (enemyGo(e, tgt.x, tgt.y, ty.speed * 0.8)) {
            e.ri = (e.ri + 1) % e.route.length;
            e.path = null;
            e.pause = e.type === 'forklift' ? 0.5 : 1.5;
          }
        } else if (e.route.length === 1 && dist(e, e.route[0]) > 0.3) {
          enemyGo(e, e.route[0].x, e.route[0].y, ty.speed * 0.8);
        } else {
          // 持ち場でゆっくり首を振る
          e.facing = e.baseFacing + Math.sin(S.t * 0.35 + e.phase) * 0.5;
        }
      } else if (e.state === 'suspicious') {
        if (e.investigate) {
          if (enemyGo(e, e.investigate.x, e.investigate.y, ty.speed * 0.7) || !e.path) {
            e.investigate = null;
            e.lookT = 4;
            e.path = null;
          }
        } else {
          e.lookT -= DT;
          e.facing += 1.2 * DT;
          if (e.lookT <= 0) {
            e.state = 'calm';
            e.meter = 0;
            e.path = null;
            e.pause = 0;
            if (!e.route.length) e.route = [{ x: e.x, y: e.y }];
          }
        }
      } else if (e.state === 'alert') {
        if (e.react > 0) e.react -= DT;
        const seen = e.seeing;
        if (seen) {
          e.facing = turnToward(e.facing, angTo(e, seen), 0.6);
          e.lastKnown = { x: seen.x, y: seen.y };
          e.path = null;
          if (e.task) releaseTask(e);
          return;
        }
        if (ty.boss || e.type === 'veteran') {
          if (e.lastKnown) e.facing = turnToward(e.facing, angTo(e, e.lastKnown), 0.3);
          return;
        }
        // 通報が回ったら片付けに走る
        if (S.alarm && ty.conceal < 50) {
          if (!e.task) {
            let best = null, bd = 1e9;
            for (const h of S.hazards) {
              if (h.status !== 'open' || h.concealer || h.item) continue;
              const d = Math.hypot(h.x + 0.5 - e.x, h.y + 0.5 - e.y);
              if (d < bd && d < 6.5) { bd = d; best = h; }
            }
            if (best) { e.task = best; best.concealer = e; e.path = null; }
          }
          if (e.task) {
            const h = e.task;
            if (h.status !== 'open') { releaseTask(e); return; }
            if (Math.hypot(h.x + 0.5 - e.x, h.y + 0.5 - e.y) <= 1.1) {
              h.conceal += DT / (ty.conceal * (def.conceal || 1) * (h.mandatory ? 4 : 1));
              e.facing = angTo(e, { x: h.x + 0.5, y: h.y + 0.5 });
              if (h.conceal >= 1) {
                h.status = 'lost';
                h.concealer = null;
                e.task = null;
                bubble(e.x, e.y - 0.6, 'よし、片付いた', 'enemy');
                say(`「${h.name}」が片付けられてしまった`, 'bad');
              }
            } else if (enemyGo(e, h.x + 0.5, h.y + 0.5, ty.speed) && !e.path) {
              releaseTask(e);
            }
            return;
          }
        }
        if (e.lastKnown) {
          if (enemyGo(e, e.lastKnown.x, e.lastKnown.y, ty.speed * 0.9) || !e.path) {
            e.lastKnown = null;
            e.path = null;
          }
        } else {
          e.facing += 0.8 * DT;
        }
      }
    }

    function releaseTask(e) {
      if (e.task) { e.task.concealer = null; e.task = null; }
    }

    function perception() {
      // 敵 → 隊員
      for (const e of S.enemies) {
        e.seeing = null;
        if (e.state === 'down' || e.stun > 0) continue;
        const range = 7 * visMul;
        let best = null, bestGain = 0, bestD = 1e9;
        for (const m of S.members) {
          if (m.out) continue;
          if (!enemySees(e, m, range)) continue;
          const d = dist(e, m);
          if (e.state === 'alert') {
            if (d < bestD) { bestD = d; best = m; }
            continue;
          }
          const gain = 2.0 * (def.detect || 1) * (1.4 - m.stealth / 100) * (1 - (d / range) * 0.6) * MOVE_VIS[m.moving] * (e.state === 'suspicious' ? 1.5 : 1) * (d < 1.5 ? 3 : 1);
          if (gain > bestGain) { bestGain = gain; best = m; }
        }
        if (e.state === 'alert') {
          if (best) {
            e.seeing = best;
            if (!e.aware) { e.aware = best; }
            if (!S.alarm && e.radio === null) e.radio = radioTime(e);
          }
          if (e.ty.boss && best && !S.alarm) raiseAlarm(e);
          continue;
        }
        // 目が合ったら(互いに視界に入ったら)その場で交戦になる
        if (best) {
          const eye = S.members.find(m => !m.out && enemySees(e, m, range) && memberSees(m, e.x, e.y, range));
          if (eye) {
            e.meter = 1;
            becomeAlert(e, eye);
            e.seeing = eye;
            bubble(eye.x, eye.y - 0.6, '目が合った!', 'eye');
            if (e.ty.boss) raiseAlarm(e);
            continue;
          }
        }
        if (best) {
          e.meter = Math.min(1, e.meter + bestGain * DT);
          if (e.meter >= 1) {
            becomeAlert(e, best);
            e.seeing = best;
            if (e.ty.boss) raiseAlarm(e);
          } else if (e.meter >= 0.4) {
            if (e.state === 'calm') bubble(e.x, e.y - 0.6, '…ん?', 'enemy');
            e.state = 'suspicious';
            e.investigate = { x: best.x, y: best.y };
            e.path = null;
            e.facing = turnToward(e.facing, angTo(e, best), 0.4);
          }
        }
      }
    }

    function rangeFactor(d) {
      return d <= 2 ? 1.2 : clamp(1.2 - (d - 2) * 0.15, 0.6, 1.2);
    }

    function combat() {
      for (const team of S.teams) team.engaged = false;
      const range = 7 * visMul;
      // 隊員の指摘
      for (const m of S.members) {
        m.target = null;
        if (m.out) continue;
        const roe = curRoe(m.team);
        let tgt = null, td = 1e9;
        for (const e of S.enemies) {
          if (e.state === 'down') continue;
          const d = dist(m, e);
          if (!memberSees(m, e.x, e.y, range)) continue;
          const aware = e.state === 'alert';
          // こっそり: 自分からは仕掛けないが、気づかれたら応戦する
          const ok = roe === 'recon' ? aware : roe === 'assault' || aware || d <= 2.2;
          if (ok && d < td) { td = d; tgt = e; }
        }
        if (!tgt) continue;
        m.target = tgt;
        m.team.engaged = true;
        m.facing = turnToward(m.facing, angTo(m, tgt), 0.8);
        m.cd -= DT;
        if (m.cd > 0) continue;
        m.cd = 1.1 - m.obs / 400;
        S.stats.presses++;
        const aware = tgt.state === 'alert';
        const stunned = tgt.stun > 0;
        if (stunned && td <= 3) {
          // ライトでくらんだ相手は落ち着いて指摘できる
          const p = clamp(0.75 + (m.press - tgt.ty.deceit) / 200, 0.5, 0.97);
          bubble(m.x, m.y - 0.6, '落ち着いて聞いてください', 'team');
          if (R() < p) neutralize(tgt, m, true);
          continue;
        }
        if (!aware && td <= 2.2 && roe !== 'assault') {
          // 指摘票で静かに制圧
          const p = clamp(0.38 + (m.press - tgt.ty.deceit) / 150 + (stunned ? 0.3 : 0) - (tgt.ty.boss ? 0.3 : 0), 0.15, 0.95);
          bubble(m.x, m.y - 0.6, '少しよろしいですか', 'team');
          if (R() < p) {
            neutralize(tgt, m, true);
          } else {
            becomeAlert(tgt, m);
            noise(m.x, m.y, 1.5, 'quiet');
          }
          continue;
        }
        const rank = tgt.ty.rank && m.skill !== 'chief' ? 0.35 : 0;
        let p = (m.press / 100) * rangeFactor(td) * (stunned ? 1.6 : 1) * (aware ? 1 : 1.4) / (tgt.ty.deceit / 100 + rank) * 0.6;
        p = clamp(p, 0.08, 0.92);
        noise(m.x, m.y, roe === 'assault' ? 6 : 3);
        bubble(m.x, m.y - 0.6, pick(SS.LINES.press), 'team');
        if (R() < p) {
          let dmg = 25 + m.press * 0.45;
          if (m.skill === 'naive' && R() < 0.15) { dmg *= 3; bubble(m.x, m.y - 1.2, '会心の指摘!', 'crit'); }
          tgt.resolve -= dmg;
          S.stats.hits++;
          S.fx.push({ type: 'shot', x1: m.x, y1: m.y, x2: tgt.x, y2: tgt.y, t0: S.t, dur: 0.25, kind: 'press' });
          if (tgt.resolve <= 0) neutralize(tgt, m, false);
          else if (tgt.state !== 'alert') becomeAlert(tgt, m);
        } else {
          S.fx.push({ type: 'shot', x1: m.x, y1: m.y, x2: tgt.x + (R() - 0.5), y2: tgt.y + (R() - 0.5), t0: S.t, dur: 0.25, kind: 'miss' });
          if (tgt.state !== 'alert') becomeAlert(tgt, m);
        }
      }
      // 工場員の誤魔化し
      for (const e of S.enemies) {
        if (e.state !== 'alert' || e.stun > 0 || !e.seeing || e.react > 0) continue;
        const m = e.seeing;
        const d = dist(e, m);
        if (d > 6 * Math.max(visMul, 0.8)) continue;
        m.team.engaged = true;
        e.cd -= DT;
        if (e.cd > 0) continue;
        e.cd = e.ty.cd;
        S.stats.excuses++;
        let p = clamp(0.35 + (e.ty.deceit - m.cha) / 180, 0.12, 0.8) * rangeFactor(d);
        if (e.ty.rank && m.skill === 'chief') p *= 0.5;
        bubble(e.x, e.y - 0.6, pick(e.ty.boss ? SS.LINES.bossExcuse : SS.LINES.excuse), 'enemy');
        if (R() < p) {
          const medic = m.team.members.some(o => !o.out && o.skill === 'medic');
          m.hp -= e.ty.dmg * (medic ? 0.85 : 1);
          S.fx.push({ type: 'shot', x1: e.x, y1: e.y, x2: m.x, y2: m.y, t0: S.t, dur: 0.25, kind: 'excuse' });
          if (m.hp <= 0) {
            m.hp = 0;
            m.out = true;
            S.outs++;
            bubble(m.x, m.y - 0.6, pick(SS.LINES.out), 'out');
            say(`${m.name}、元気切れで離脱`, 'bad');
            if (!teamAlive(m.team)) say(`${m.team.name}チーム、全員離脱`, 'bad');
          }
        }
      }
    }

    function neutralize(e, by, silent) {
      e.state = 'down';
      e.radio = null;
      releaseTask(e);
      S.score += e.ty.boss ? 300 : 40;
      S.stats.takedowns++;
      bubble(e.x, e.y - 0.6, pick(SS.LINES.down), 'down');
      say(`${by.name}: ${e.name}が改善を約束${silent ? '(静かに)' : ''}`, 'good');
      if (by.skill === 'talk') {
        let n = 0;
        for (const h of S.hazards) {
          if (h.status === 'open' && !h.known && Math.hypot(h.x - e.x, h.y - e.y) <= 8) { h.known = true; n++; }
        }
        if (n) say(`三浦の聞き取り: 隠れた不安全箇所を${n}件把握`, 'good');
      }
    }

    function completeHazard(h, by, viaCamera) {
      h.status = 'done';
      h.known = true;
      h.by = by.name;
      if (h.concealer) { h.concealer.task = null; h.concealer = null; }
      const pts = SS.SEV_PTS[h.sev] * (S.alarm ? 1 : 2);
      h.pts = pts;
      S.score += pts;
      bubble(h.x + 0.5, h.y - 0.2, h.item ? '回収!' : '記録!', 'record');
      say(`${by.name}: 「${h.name}」を${h.item ? '回収' : '記録'}${viaCamera ? '(撮影)' : ''} +${pts}${S.alarm ? '' : ' 素の状態×2'}`, 'record');
    }

    function recordHazards() {
      const range = 5 * visMul;
      for (const h of S.hazards) {
        if (h.status !== 'open') continue;
        const hx = h.x + 0.5, hy = h.y + 0.5;
        let gain = 0, who = null;
        for (const m of S.members) {
          if (m.out) continue;
          if (h.item) {
            if (Math.hypot(hx - m.x, hy - m.y) <= 1.2) { completeHazard(h, m, false); break; }
            continue;
          }
          if (m.target) continue;
          const special = m.cat && m.cat === h.cat;
          const r = h.hidden && !h.known && !special ? 2 : range;
          if (!memberSees(m, hx, hy, r)) continue;
          const g = (0.4 + m.obs / 100) * (special ? 2 : 1) / { A: 2.5, B: 2, C: 1.5 }[h.sev];
          if (g > gain) { gain = g; who = m; }
          if (!h.known) h.known = true;
        }
        if (h.status !== 'open' || !who) continue;
        h.prog += gain * DT;
        if (h.prog >= 1) completeHazard(h, who, false);
      }
    }

    // ---------- 目標と終了判定 ----------
    S.objectives = function () {
      return def.objectives.map(o => {
        if (o.type === 'recordCount') {
          const n = S.hazards.filter(h => h.status === 'done').length;
          return { text: `不安全箇所を${o.n}件以上記録`, done: n >= o.n, fail: S.hazards.filter(h => h.status !== 'lost').length < o.n, prog: `${n}/${o.n}` };
        }
        if (o.type === 'record') {
          const hs = o.ids.map(id => S.hazards.find(h => h.id === id));
          const done = hs.filter(h => h.status === 'done').length;
          return {
            text: hs.length === 1 ? `必須: ${hs[0].name}` : `必須: ${hs.map(h => h.name).join('/')}`,
            done: done === hs.length, fail: hs.some(h => h.status === 'lost'), prog: `${done}/${hs.length}`,
          };
        }
        if (o.type === 'neutralize') {
          const e = S.enemies.find(x => x.id === o.id);
          return { text: `必須: ${e.name}に改善を約束させる`, done: e.state === 'down', fail: false, prog: e.state === 'down' ? '済' : '未' };
        }
        return { text: '?', done: false, fail: false };
      });
    };

    function checkEnd() {
      const objs = S.objectives();
      const allMembersOut = S.members.every(m => m.out);
      let reason = null;
      if (allMembersOut) reason = '全員が離脱した';
      else if (objs.some(o => o.fail)) reason = '必須の目標が達成不能になった';
      else if (S.t >= def.limit) reason = '時間切れ';
      else {
        const teamsIdle = S.teams.every(t => !teamAlive(t) || (t.doneAt !== null && S.t - t.doneAt >= 3));
        const everythingResolved = S.hazards.every(h => h.status !== 'open') && S.enemies.every(e => e.state === 'down');
        if (teamsIdle) reason = '全チームが計画を完了';
        else if (everythingResolved) reason = '全箇所・全員を制圧';
      }
      if (!reason) return;
      S.over = true;
      const success = !allMembersOut && objs.every(o => o.done);
      const recorded = S.hazards.filter(h => h.status === 'done').length;
      const total = S.hazards.length;
      let timeBonus = 0;
      if (success) timeBonus = Math.round((def.limit - S.t) * 2);
      const outPenalty = S.outs * 150;
      const final = Math.max(0, S.score + timeBonus - outPenalty);
      let rank = 'D';
      if (success) {
        if (recorded === total && S.outs === 0 && !S.alarm) rank = 'S';
        else if (recorded >= total * 0.8 && S.outs <= 1) rank = 'A';
        else rank = 'B';
      }
      S.result = { success, reason, rank, recorded, total, timeBonus, outPenalty, base: S.score, final, alarm: S.alarm, outs: S.outs, t: S.t };
      say(success ? `作戦終了: ${reason}。任務達成 ランク${rank}` : `作戦終了: ${reason}。任務失敗`, success ? 'good' : 'bad');
    }

    say(`作戦開始。シード ${seed}`, 'go');
    return S;
  };

  // 結果まで一気に回す(テスト・検証用)
  SS.runToEnd = function (st, plan, seed) {
    const S = SS.createSim(st, plan, seed);
    let guard = 0;
    while (!S.over && guard++ < 5000) S.step();
    return S;
  };

  if (typeof module !== 'undefined') module.exports = SS;
})(typeof window !== 'undefined' ? window : globalThis);
