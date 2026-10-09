/* SAFETY SHIELD - 画面・入力・描画 */
(function () {
  const SS = window.SS;
  const TS = 22; // 1マスのピクセル
  const canvas = document.getElementById('map');
  const ctx = canvas.getContext('2d');
  const panel = document.getElementById('panel');
  const hint = document.getElementById('boardHint');
  const topStatus = document.getElementById('topStatus');
  const hud = document.getElementById('hud');
  const hudTime = document.getElementById('hudTime');
  const hudAlarm = document.getElementById('hudAlarm');
  const hudScore = document.getElementById('hudScore');

  const C = {
    ink: '#0b1622', floor: '#11253a', grid: 'rgba(120,170,210,0.07)', wall: '#5d7d9c', wallTop: '#88a8c6',
    shelf: '#2c4a66', machine: '#3b4f62', safety: '#ffcc1a', cross: '#2fbf71', danger: '#ff5a4e',
    enemy: '#ff8a3d', fg: '#dce8f2', muted: '#8ba3b8',
  };
  const TEAM_COLOR = Object.fromEntries(SS.TEAM_DEFS.map(t => [t.id, t.color]));
  const GO_LABEL = { A: '合図A', B: '合図B', C: '合図C' };

  // ---------- 保存(失敗しても遊べる) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ss_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ss_' + k, JSON.stringify(v)); } catch (e) { /* 保存不可 */ } },
  };

  const game = {
    screen: 'select', stageIdx: 0, st: null, plan: null, sim: null,
    tab: 'route', team: 'red', selWp: -1, speed: 1, paused: false, seed: 1, acc: 0, last: 0,
    progress: store.get('progress', {}),
  };

  // ---------- 既定プラン ----------
  const defaultPlan = def => SS.defaultPlan(def);

  function loadPlan(def) {
    const saved = store.get('plan2_' + def.id, null);
    if (saved && saved.teams && saved.teams.length === 3) return saved;
    return defaultPlan(def);
  }
  function savePlan() { store.set('plan2_' + game.st.def.id, game.plan); }

  function unlocked(i) {
    if (i === 0) return true;
    const prev = SS.STAGES[i - 1];
    const r = game.progress[prev.id];
    return !!r && r !== 'D';
  }

  // ---------- 画面切り替え ----------
  function openSelect() {
    game.screen = 'select';
    game.sim = null;
    hud.hidden = true;
    loadStage(game.stageIdx);
    renderPanel();
  }
  function loadStage(i) {
    game.stageIdx = i;
    game.st = SS.parseStage(SS.STAGES[i]);
    game.plan = loadPlan(game.st.def);
    game.selWp = -1;
  }
  function openPlan() {
    game.screen = 'plan';
    game.sim = null;
    hud.hidden = true;
    const t = game.plan.teams.find(t => t.members.length) || game.plan.teams[0];
    game.team = t.id;
    game.selWp = t.wps.length - 1;
    renderPanel();
    tutEvent('plan');
  }
  function startRun(seed) {
    savePlan();
    game.seed = seed != null ? seed : (Math.floor(Math.random() * 90000) + 10000);
    const plan = JSON.parse(JSON.stringify(game.plan));
    plan.teams = plan.teams.filter(t => t.members.length);
    game.sim = SS.createSim(game.st, plan, game.seed);
    game.screen = 'run';
    game.paused = false;
    game.acc = 0;
    game.speed = game.tut.on ? 1 : game.speed;
    hud.hidden = false;
    if (game.tut.on && TUT[game.tut.i] && TUT[game.tut.i].wait === 'run') { game.tut.i++; game.paused = true; }
    renderPanel();
  }
  function finishRun() {
    game.screen = 'result';
    const r = game.sim.result;
    const id = game.st.def.id;
    const order = { S: 4, A: 3, B: 2, D: 1 };
    const prev = game.progress[id];
    if (!prev || order[r.rank] > order[prev]) {
      game.progress[id] = r.rank;
      store.set('progress', game.progress);
    }
    renderPanel();
  }

  // ---------- パネル描画 ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style') el.setAttribute('style', v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }

  function renderPanel() {
    const keepScroll = panel.querySelector('.wps') ? panel.querySelector('.wps').scrollTop : 0;
    panel.replaceChildren();
    const def = game.st.def;
    topStatus.textContent = game.screen === 'select' ? 'ミッション選択' : `${def.sub}「${def.name}」`;
    if (game.screen === 'select') panel.append(...selectView());
    else if (game.screen === 'plan') panel.append(...planView());
    else if (game.screen === 'run') panel.append(...runView());
    else if (game.screen === 'result') panel.append(...resultView());
    const card = coachCard();
    if (card) panel.prepend(card);
    const w = panel.querySelector('.wps');
    if (w) w.scrollTop = keepScroll;
    updateHint();
    applyHighlight();
  }

  function updateHint() {
    if (game.screen === 'plan') {
      const t = curTeam();
      hint.textContent = t.members.length
        ? `${teamName(t.id)}の経路を編集中: 床をクリックで地点を追加(選択中の地点の後ろに入る)。地点をクリックで選択。`
        : `${teamName(t.id)}には隊員がいません。「編成」タブで配属してください。`;
    } else if (game.screen === 'select') {
      hint.textContent = '作戦図は事前情報です。工場員の初期位置・見張り範囲・巡回ルートと、把握済みの不安全箇所(?)が表示されています。隠れた不安全箇所もあります。';
    } else if (game.screen === 'run') {
      hint.textContent = '実行中は指示を変えられません。一時停止と倍速だけが使えます。';
    } else hint.textContent = '';
  }

  function objectiveList(objs) {
    return h('ul', { class: 'objs' }, objs.map(o => h('li', { class: o.done ? 'done' : o.fail ? 'fail' : '' },
      h('span', { class: 'mk' }, o.done ? '■' : o.fail ? '×' : '□'), h('span', null, o.text), h('span', { class: 'pg' }, o.prog || ''))));
  }
  function staticObjectives(def) {
    const st = game.st;
    return def.objectives.map(o => {
      if (o.type === 'recordCount') return { text: `不安全箇所を${o.n}件以上記録(全${st.hazards.length}件)` };
      if (o.type === 'record') return { text: '必須: ' + o.ids.map(id => st.hazards.find(x => x.id === id).name).join('/') };
      if (o.type === 'neutralize') { const e = st.enemies.find(x => x.id === o.id); return { text: `必須: ${e.name || SS.ENEMY_TYPES[e.type].name}に改善を約束させる` }; }
      return { text: '' };
    });
  }

  function selectView() {
    const def = game.st.def;
    const list = h('div', { class: 'stages' }, SS.STAGES.map((s, i) => {
      const r = game.progress[s.id];
      const ok = unlocked(i);
      return h('button', {
        class: 'stage' + (i === game.stageIdx ? ' sel' : ''), disabled: !ok,
        onclick: () => { loadStage(i); renderPanel(); },
      }, h('span', { class: 'no' }, s.sub), h('span', null, h('span', { class: 'nm' }, s.name), h('br'),
        h('span', { class: 'small muted' }, ok ? (s.dark ? '暗所 / ' : '') + `制限${Math.floor(s.limit / 60)}分${s.limit % 60 ? (s.limit % 60) + '秒' : ''}` : '前の面をクリアで解放')),
      h('span', { class: 'rank ' + (r || '') }, r || '-'));
    }));
    return [
      h('div', null, h('div', { class: 'eyebrow' }, 'MISSION SELECT'), h('h2', null, '今月の安全パトロール')),
      h('p', { class: 'small muted' }, '作戦を立てたら、あとは見守るだけ。パトロール員8名を最大3チームに分け、見つかる前に現場の不安全を記録し、気づかれたら指摘で制圧する。'),
      list,
      h('div', null, h('h3', null, `${def.sub}「${def.name}」ブリーフィング`), h('p', null, def.brief)),
      h('div', null, h('h3', null, '目標'), objectiveList(staticObjectives(def))),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: startTutorial }, 'チュートリアル'), h('span', { class: 'grow' }), h('button', { class: 'btn primary', 'data-tut': 'toPlan', onclick: openPlan }, '作戦立案へ')),
    ];
  }

  // ----- 作戦立案 -----
  function curTeam() { return game.plan.teams.find(t => t.id === game.team); }
  function teamName(id) { return SS.TEAM_DEFS.find(t => t.id === id).name; }
  function memberTeam(mid) { const t = game.plan.teams.find(t => t.members.includes(mid)); return t ? t.id : null; }
  function kitOf(mid) { return game.plan.kits[mid] || SS.MEMBERS.find(m => m.id === mid).kit; }

  function planIssues() {
    const out = [];
    const active = game.plan.teams.filter(t => t.members.length);
    if (!active.length) out.push('隊員が誰も配属されていません');
    for (const t of active) {
      const legs = SS.planPaths(game.st, t, game.plan.kits);
      legs.forEach((l, i) => { if (!l) out.push(`${teamName(t.id)}: 地点${i + 1}へ行けません(施錠扉には合鍵が必要)`); });
      for (const kind of ['light', 'camera']) {
        const need = t.wps.filter(w => w.action === kind).length;
        const have = t.members.filter(id => kitOf(id) === kind).length * SS.KITS[kind].uses;
        if (need > have) out.push(`${teamName(t.id)}: ${SS.KITS[kind].name}が足りません(必要${need}・携行${have})`);
      }
      const codes = new Set(t.wps.map(w => w.go).filter(Boolean));
      for (const c of codes) {
        if (!active.some(o => o !== t && o.wps.some(w => w.go === c))) out.push(`${teamName(t.id)}: ${GO_LABEL[c]}で待つのは自チームだけです(すぐ動き出します)`);
      }
    }
    return out;
  }

  function planView() {
    const def = game.st.def;
    const head = [
      h('div', null, h('div', { class: 'eyebrow' }, `${def.sub} PLANNING`), h('h2', null, def.name)),
      h('div', null, h('h3', null, '目標'), objectiveList(staticObjectives(def)), h('p', { class: 'small muted', style: 'margin-top:6px' }, def.tip)),
      h('div', { class: 'tabs', role: 'tablist' },
        h('button', { class: 'tab' + (game.tab === 'route' ? ' on' : ''), role: 'tab', onclick: () => { game.tab = 'route'; renderPanel(); } }, '経路'),
        h('button', { class: 'tab' + (game.tab === 'squad' ? ' on' : ''), role: 'tab', onclick: () => { game.tab = 'squad'; renderPanel(); } }, '編成')),
    ];
    const body = game.tab === 'squad' ? squadEditor() : routeEditor();
    const issues = planIssues();
    const canRun = game.plan.teams.some(t => t.members.length) && !issues.some(s => s.includes('行けません') || s.includes('誰も'));
    const foot = [
      issues.length ? h('div', null, issues.map(s => h('div', { class: 'warn' }, s))) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: openSelect }, '面選択'),
        h('button', { class: 'btn', onclick: () => { game.plan = defaultPlan(def); game.selWp = -1; savePlan(); renderPanel(); } }, 'プラン初期化'),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn primary big', 'data-tut': 'run', disabled: !canRun, onclick: () => startRun() }, '作戦実行 ▶')),
    ];
    return [...head, ...body, ...foot];
  }

  function squadEditor() {
    const counts = Object.fromEntries(game.plan.teams.map(t => [t.id, t.members.length]));
    const setTeam = (mid, tid) => {
      for (const t of game.plan.teams) t.members = t.members.filter(x => x !== mid);
      if (tid) {
        const t = game.plan.teams.find(t => t.id === tid);
        // 隊列は名簿順(先頭がリーダー)
        t.members.push(mid);
        t.members.sort((a, b) => SS.MEMBERS.findIndex(m => m.id === a) - SS.MEMBERS.findIndex(m => m.id === b));
      }
      savePlan(); renderPanel();
    };
    const statLabels = [['obs', '観察'], ['press', '指摘'], ['stealth', '隠密'], ['hp', '元気'], ['cha', '人望']];
    const roster = h('div', { class: 'roster' }, SS.MEMBERS.map(m => {
      const cur = memberTeam(m.id);
      return h('div', { class: 'mem' },
        h('div', null, h('div', { class: 'nm' }, m.name), h('div', { class: 'cls' }, `${m.dept} / ${m.cls}`)),
        h('div', { class: 'chips', role: 'group', 'aria-label': `${m.name}の配属` },
          h('button', { class: 'chip' + (!cur ? ' on' : ''), style: !cur ? 'background:#8ba3b8' : '', title: '待機', onclick: () => setTeam(m.id, null) }, '―'),
          SS.TEAM_DEFS.map(t => h('button', {
            class: 'chip' + (cur === t.id ? ' on' : ''), title: t.name,
            style: `border-color:${t.color};${cur === t.id ? `background:${t.color}` : `color:${t.color}`}`,
            disabled: cur !== t.id && counts[t.id] >= 4,
            onclick: () => setTeam(m.id, t.id),
          }, t.name[0]))),
        h('div', { class: 'stats' }, statLabels.map(([k, l]) => h('div', { class: 'stat' }, `${l} ${m[k]}`, h('div', { class: 'bar' }, h('i', { style: `width:${Math.min(100, m[k] / 1.15)}%` }))))),
        h('div', { class: 'skill' }, m.skillText),
        h('div', { class: 'mem-bottom' }, h('label', { class: 'small muted', for: 'kit_' + m.id }, '携行品'),
          h('select', {
            id: 'kit_' + m.id,
            onchange: e => { game.plan.kits[m.id] = e.target.value; savePlan(); renderPanel(); },
          }, Object.entries(SS.KITS).map(([k, v]) => h('option', { value: k, selected: kitOf(m.id) === k }, `${v.name}${v.uses < 50 ? '×' + v.uses : ''}`))),
          h('span', { class: 'small muted' }, SS.KITS[kitOf(m.id)].text)));
    }));
    return [h('p', { class: 'small muted' }, '各チーム最大4名。名簿の上にいる隊員がリーダー(先頭)になります。'), roster];
  }

  function routeEditor() {
    const st = game.st;
    const team = curTeam();
    const teamsBar = h('div', { class: 'teams' }, SS.TEAM_DEFS.map(td => {
      const t = game.plan.teams.find(x => x.id === td.id);
      return h('button', {
        class: 'teambtn' + (game.team === td.id ? ' on' : ''), style: `border-color:${td.color}`,
        onclick: () => { game.team = td.id; game.selWp = t.wps.length - 1; renderPanel(); },
      }, h('span', { class: 'tn', style: `color:${td.color}` }, td.name),
      h('span', { class: 'tc' }, t.members.length ? `${t.members.length}名・地点${t.wps.length}` : '未編成'));
    }));
    if (!team.members.length) {
      return [teamsBar, h('p', { class: 'muted' }, 'このチームには隊員がいません。'), h('button', { class: 'btn', onclick: () => { game.tab = 'squad'; renderPanel(); } }, '編成タブへ')];
    }
    const names = team.members.map(id => SS.MEMBERS.find(m => m.id === id).name.split(' ')[0]).join('・');
    const legs = SS.planPaths(st, team, game.plan.kits);
    const opt = (obj, labels, cur, inherit) => [inherit ? h('option', { value: '', selected: !cur }, '前と同じ') : null,
      ...Object.entries(labels).map(([k, v]) => h('option', { value: k, selected: cur === k }, v))];

    const settings = h('div', { style: 'display:grid;gap:6px' },
      h('div', { class: 'small muted' }, `隊列: ${names}(先頭がリーダー)${SS.teamCanUnlock(team.members, game.plan.kits) ? ' / 合鍵あり' : ''}`),
      h('div', { class: 'field' }, h('label', { for: 'entrySel' }, '進入口'),
        h('select', { id: 'entrySel', onchange: e => { team.entry = +e.target.value; savePlan(); renderPanel(); } },
          st.entries.map((en, i) => h('option', { value: i, selected: team.entry === i }, en.name)))),
      h('div', { class: 'field' }, h('label', { for: 'spdSel' }, '歩き方'),
        h('select', { id: 'spdSel', onchange: e => { team.speed = e.target.value; savePlan(); renderPanel(); } }, opt(null, SS.SPEED_LABEL, team.speed))),
      h('div', { class: 'field' }, h('label', { for: 'roeSel' }, '指摘の仕方'),
        h('select', { id: 'roeSel', onchange: e => { team.roe = e.target.value; savePlan(); renderPanel(); } }, opt(null, SS.ROE_LABEL, team.roe))),
      h('div', { class: 'small muted' }, `${SS.ROE_LABEL[team.roe]}: ${SS.ROE_TEXT[team.roe]}`));

    const wpList = h('ol', { class: 'wps' }, team.wps.map((w, i) => {
      const sel = i === game.selWp;
      const sum = [w.speed ? SS.SPEED_LABEL[w.speed] : null, w.roe ? SS.ROE_LABEL[w.roe] : null,
        w.go ? `${GO_LABEL[w.go]}待機` : null, w.action ? (w.action === 'light' ? 'ライト' : '撮影') : null].filter(Boolean).join(' / ') || '設定なし';
      const set = (k, v) => { w[k] = v; savePlan(); renderPanel(); };
      return h('li', { class: 'wp' + (sel ? ' sel' : ''), onclick: e => { if (e.target.closest('select,button')) return; game.selWp = i; renderPanel(); } },
        h('div', { class: 'head' },
          h('span', { class: 'num', style: `color:${TEAM_COLOR[team.id]}` }, String(i + 1)),
          h('span', { class: 'sum' }, sum),
          h('button', { class: 'x', title: 'この地点を削除', 'aria-label': `地点${i + 1}を削除`, onclick: () => { team.wps.splice(i, 1); game.selWp = Math.min(game.selWp, team.wps.length - 1); savePlan(); renderPanel(); } }, '✕')),
        legs[i] ? null : h('div', { class: 'bad' }, 'ここへ行く経路がありません'),
        sel ? h('div', { class: 'edit' },
          h('label', null, 'ここからの歩き方', h('select', { onchange: e => set('speed', e.target.value) }, opt(null, SS.SPEED_LABEL, w.speed, true))),
          h('label', null, 'ここからの指摘の仕方', h('select', { onchange: e => set('roe', e.target.value) }, opt(null, SS.ROE_LABEL, w.roe, true))),
          h('label', null, '着いたら待つ', h('select', { onchange: e => set('go', e.target.value) },
            h('option', { value: '', selected: !w.go }, 'しない'), ...Object.entries(GO_LABEL).map(([k, v]) => h('option', { value: k, selected: w.go === k }, `${v}まで待つ`)))),
          h('label', null, '出発するときに', h('select', { onchange: e => set('action', e.target.value) },
            h('option', { value: '', selected: !w.action }, 'なし'),
            h('option', { value: 'light', selected: w.action === 'light' }, '安全ライトを投げ込む'),
            h('option', { value: 'camera', selected: w.action === 'camera' }, 'デジカメで一括撮影')))) : null);
    }));

    return [
      teamsBar, settings,
      h('div', { class: 'wplist-area' }, h('div', { class: 'row' }, h('h3', { class: 'grow', style: 'margin:0' }, '経路の地点'),
          h('button', { class: 'btn small', disabled: !team.wps.length, onclick: () => undoWp(null) }, '1つ戻す'),
          h('button', { class: 'btn small', disabled: !team.wps.length, onclick: () => { team.wps = []; game.selWp = -1; savePlan(); renderPanel(); } }, '全部消す')),
        team.wps.length ? wpList : h('p', { class: 'small muted' }, '地点なし: このチームは最初からおまかせで巡回します。地図の床を左クリックすると地点を置けます。'),
        h('p', { class: 'small muted', style: 'margin-top:6px' }, '最後の地点に着いたら、残りはおまかせで巡回します。地点をクリックすると細かい指示を設定できます。合図: 同じ合図を待つ全チームが揃うと、一斉に動き出します。')),
    ];
  }

  // ----- 実行中 -----
  function runView() {
    const S = game.sim;
    const speedBtns = h('div', { class: 'row speed' },
      h('button', { class: 'btn' + (game.paused ? ' on' : ''), onclick: () => { game.paused = !game.paused; renderPanel(); } }, game.paused ? '再開' : '一時停止'),
      [1, 2, 4].map(s => h('button', { class: 'btn' + (game.speed === s ? ' on' : ''), onclick: () => { game.speed = s; renderPanel(); } }, `${s}x`)),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => { game.sim = null; openPlan(); } }, '中断'));
    return [
      h('div', null, h('div', { class: 'eyebrow' }, 'AUTO RUN'), h('h2', null, game.st.def.name), h('div', { class: 'small muted' }, `シード ${game.seed}`)),
      speedBtns,
      h('div', null, h('h3', null, '目標'), h('div', { id: 'liveObjs' })),
      h('div', null, h('h3', null, 'チーム'), h('div', { class: 'squad', id: 'liveSquad' })),
      h('div', null, h('h3', null, '無線ログ'), h('ul', { class: 'log', id: 'liveLog' })),
    ];
  }
  let lastLogLen = -1;
  function updateRunPanel() {
    const S = game.sim;
    const o = document.getElementById('liveObjs');
    if (!o) return;
    o.replaceChildren(objectiveList(S.objectives()));
    const sq = document.getElementById('liveSquad');
    sq.replaceChildren(...S.teams.map(t => h('div', null,
      h('div', { class: 't', style: `color:${t.color}` }, `${t.name} `, h('span', { class: 'small muted' }, teamStateText(t))),
      h('div', { class: 'ms' }, t.members.map(m => h('div', { class: 'hp' + (m.out ? ' out' : '') },
        h('span', null, `${m.name}${m.uses > 0 && m.kitId !== 'key' ? ` (${SS.KITS[m.kitId].name}${m.uses})` : ''}`),
        h('div', { class: 'bar' }, h('i', { style: `width:${(m.hp / m.hpMax) * 100}%;background:${m.hp / m.hpMax < 0.35 ? C.danger : C.cross}` }))))))));
    if (S.log.length !== lastLogLen) {
      lastLogLen = S.log.length;
      const lg = document.getElementById('liveLog');
      lg.replaceChildren(...S.log.slice(-60).reverse().map(l => h('li', { class: l.kind }, h('span', { class: 'tm' }, fmtTime(l.t)), h('span', null, l.text))));
    }
  }
  function teamStateText(t) {
    if (!t.members.some(m => !m.out)) return '全員離脱';
    if (t.engaged) return '交戦中';
    if (t.state === 'hold') return `${GO_LABEL[t.holdCode]}待機`;
    if (t.state === 'unlock') return '解錠中';
    if (t.state === 'done') return '完了・待機';
    if (t.state === 'watch') return '記録中';
    if (t.auto) return `おまかせ巡回中(${SS.ROE_LABEL[game.sim.curRoe(t)]})`;
    return `地点${Math.min(t.wi + 1, t.wps.length)}へ移動(${SS.SPEED_LABEL[game.sim.curSpeed(t)]}・${SS.ROE_LABEL[game.sim.curRoe(t)]})`;
  }
  function fmtTime(t) { const s = Math.floor(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  // ----- 結果 -----
  function resultView() {
    const S = game.sim, r = S.result, def = game.st.def;
    const next = SS.STAGES[game.stageIdx + 1];
    const comment = r.success
      ? (r.rank === 'S' ? '完璧なパトロール。現場は素の状態のまま全件記録され、誰にも気づかれなかった。' :
        r.alarm ? '任務は達成。ただし途中で通報が回り、片付けられた箇所もあった。' : '任務達成。見落としを減らせばさらに上を狙える。')
      : `任務失敗: ${r.reason}。リプレイで「どこで見つかったか」を確かめてプランを直そう。`;
    return [
      h('div', { class: 'result' },
        h('div', { class: 'eyebrow' }, 'DEBRIEFING'),
        h('div', { class: 'big' }, h('span', { class: 'rank ' + r.rank }, r.rank),
          h('div', null, h('h2', null, r.success ? '任務達成' : '任務失敗'), h('div', { class: 'small muted' }, `${r.reason} / ${fmtTime(r.t)} / シード ${S.seed}`)))),
      h('p', null, comment),
      h('div', { class: 'result' }, h('table', null,
        h('tr', null, h('td', null, '記録した不安全箇所'), h('td', null, `${r.recorded} / ${r.total}`)),
        h('tr', null, h('td', null, '指摘・制圧などの得点'), h('td', null, r.base)),
        h('tr', null, h('td', null, '残り時間ボーナス'), h('td', null, r.timeBonus)),
        h('tr', null, h('td', null, '離脱者ペナルティ'), h('td', null, -r.outPenalty)),
        h('tr', null, h('td', null, h('b', null, '合計')), h('td', null, h('b', null, r.final))))),
      h('div', null, h('h3', null, '指摘票'), h('ul', { class: 'hzlist' }, S.hazards.map(z => h('li', { class: z.status },
        `${z.status === 'done' ? '■' : z.status === 'lost' ? '×' : '□'} [${z.sev}] ${z.name}` + (z.status === 'done' ? ` (${z.by} +${z.pts})` : z.status === 'lost' ? ' 片付けられた' : ' 見落とし'))))),
      h('div', null, h('h3', null, '目標'), objectiveList(S.objectives())),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: openPlan }, 'プランを直して再挑戦'),
        h('button', { class: 'btn', onclick: () => startRun(S.seed) }, '同じシードで再生'),
        r.success && next ? h('button', { class: 'btn', onclick: () => { loadStage(game.stageIdx + 1); openSelect(); } }, `次の面「${next.name}」へ`) : null,
        h('button', { class: 'btn', onclick: openSelect }, '面選択')),
      h('p', { class: 'small muted' }, 'ランク: S=全件記録・通報なし・離脱なし / A=8割以上記録・離脱1名以下 / B=任務達成'),
    ];
  }


  // ---------- チュートリアル ----------
  const LEGEND_HTML = `<ul class="legend-list">
    <li><span class="lg hz">▲</span>不安全箇所(記録すると緑の✓)。「?」付きは事前情報</li>
    <li><span class="lg en">●</span>工場員。うすい扇形が見張り範囲、点線が巡回ルート</li>
    <li><span class="lg ent">■</span>進入口(番号つき)</li>
    <li><span class="lg wall">■</span>壁・棚(通れない、見通せない)</li>
    <li><span class="lg lock">▦</span>施錠扉(合鍵を持つチームだけ通れる)</li>
  </ul>`;
  const TUT = [
    { screen: 'select', title: 'ようこそ、委員長', body: 'あなたはタイキ薬品工業の安全衛生委員長です。8人のパトロール員に作戦を描いて「作戦実行」を押せば、あとは自動で進みます。<br>現場の<b>不安全箇所を記録する</b>のが仕事です。工場員に見つかると片付けられてしまうので、見つかる前に記録しましょう。' },
    { screen: 'select', title: '作戦図の見方', body: '左の図が現場です。' + LEGEND_HTML, hl: '#canvasWrap' },
    { screen: 'select', title: '作戦立案へ', body: '第1面「原料倉庫」が選ばれています。下の<b>「作戦立案へ」</b>を押してください。', hl: '[data-tut=toPlan]', wait: 'plan' },
    { screen: 'plan', title: 'チームは編成ずみ', body: '<b>レッド</b>と<b>グリーン</b>に4人ずつ入っています。このボタンで、どのチームの経路を描くかを切り替えます。今はレッドが選ばれています。', hl: '.teams' },
    { screen: 'plan', title: '左クリックで地点を置く', body: '作戦図の<b>床(紺色のマス)を左クリック</b>すると、レッドの地点が置かれ、進入口から線でつながります。左上の部屋あたりをクリックしてみましょう。', hl: '#canvasWrap', wait: 'addWp' },
    { screen: 'plan', title: 'もう1か所', body: '続けてクリックすると経路が延びます。黄色の▲の近くを通ると記録できます。もう1か所置いてみましょう。', hl: '#canvasWrap', wait: 'addWp' },
    { screen: 'plan', title: '右クリックで取り消し', body: '間違えたら<b>右クリック</b>。地点の上なら、その地点を消します。何もない所なら最後の地点を消します。試しに右クリックしてみましょう。<br><span class="muted">スマホでは「1つ戻す」ボタンを使います。</span>', hl: '#canvasWrap', wait: 'removeWp' },
    { screen: 'plan', title: '残りはおまかせ', body: '地点を使い切ったチームは、残った▲を<b>自動で回ります</b>。地点ゼロでも大丈夫です。迷ったら、そのまま実行してかまいません。グリーンは地点なしのままにしておきましょう。' },
    { screen: 'plan', title: '細かい指示は後でOK', body: '地点をクリックすると、そこからの歩き方や、<b>合図を待つ</b>・<b>安全ライトを投げ込む</b>といった指示を出せます。第3面あたりから役に立ちます。今は気にしなくて大丈夫です。', hl: '.wplist-area' },
    { screen: 'plan', title: '作戦実行', body: '準備ができたら<b>「作戦実行 ▶」</b>を押しましょう。', hl: '[data-tut=run]', wait: 'run' },
    { screen: 'run', title: '見守るだけ(一時停止中)', body: '始まりました。いったん止めて説明します。<br>▲が緑の✓になれば記録成功。工場員の頭上の<b>「?」</b>は怪しんでいる、<b>「!」</b>は気づいた合図です。「!」の周りの<b>赤い輪が一周すると全館に通報</b>され、片付け(証拠隠し)が始まります。輪が回り切る前に指摘で黙らせれば通報されません。', hl: '#canvasWrap' },
    { screen: 'run', title: '早送り', body: '「次へ」で再開します。右の<b>2x / 4x</b>で早送りできます。一時停止はスペースキーでもできます。', hl: '.speed' },
    { screen: 'result', title: '結果', body: 'ランクと指摘票が出ます。通報されずに全部記録すれば<b>S</b>。目標を達成すれば次の面が解放されます。<br>チュートリアルはこれで終わりです。困ったら右上の<b>「遊び方」</b>をどうぞ。', hl: '.result', last: true },
  ];
  const STAGE_INTRO = {
    2: { title: '第2面の新要素: 騒音とフォークリフト', body: '打錠機の騒音で足音が聞こえにくい面です。<b>フォークリフト</b>は点線のルートを速く回り、見つけるとすぐ通報します。必須目標は<b>打錠機のインターロック無効化</b>の記録。おまかせでも十分戦えます。' },
    3: { title: '第3面の新要素: 暗所と安全ライト', body: '夜勤で暗く、お互いの視界が狭い面です。おまかせでもクリアできますが、ランクを上げたいなら<b>安全ライト</b>を試しましょう。<br>地点をクリックして「出発するときに → 安全ライトを投げ込む」を選ぶと、近くの工場員を5秒くらませます。くらんだ相手は静かに指摘できます。' },
    4: { title: '第4面の新要素: 施錠扉と合図', body: '保管庫は<b>施錠扉</b>(黄黒)で閉ざされています。開けるには<b>合鍵</b>が必要です(レッドは石崎、グリーンは三浦が所持)。<br>扉の手前の地点で「着いたら待つ → 合図Aまで待つ」と「安全ライトを投げ込む」を2チームに設定すると、<b>同時に突入</b>できます。扉を開けた瞬間にライトが飛び込みます。' },
    5: { title: '最終面: 製造部長', body: '<b>製造部長</b>は気づいた瞬間に全館へ通報します。部長室は3方向とも施錠扉です。<br>扉の外で合図を待ち、ライトを投げ込んでから突入するのが確実です。報告箱(黄色の箱)の回収も忘れずに。' },
  };
  game.tut = { on: false, i: 0 };
  game.introSeen = store.get('intro', {});

  function startTutorial() {
    game.tut = { on: true, i: 0 };
    loadStage(0);
    game.plan = SS.defaultPlan(game.st.def);
    savePlan();
    openSelect();
  }
  function endTutorial() {
    if (game.tut.on && TUT[game.tut.i] && TUT[game.tut.i].screen === 'run') game.paused = false;
    game.tut.on = false;
    store.set('tutDone', true);
    renderPanel();
  }
  function tutAdvance() {
    const prev = TUT[game.tut.i];
    game.tut.i++;
    const cur = TUT[game.tut.i];
    if (!cur) { endTutorial(); return; }
    if (cur.screen === 'run' && game.screen === 'run') game.paused = true;
    else if (prev && prev.screen === 'run') game.paused = false;
    renderPanel();
  }
  function tutEvent(name) {
    if (!game.tut.on) return;
    const cur = TUT[game.tut.i];
    if (cur && cur.wait === name) tutAdvance();
  }
  function coachCard() {
    if (game.tut.on) {
      const step = TUT[game.tut.i];
      if (!step || step.screen !== game.screen) return null;
      const n = game.tut.i + 1;
      return h('div', { class: 'coach', role: 'status' },
        h('div', { class: 'coach-head' }, h('span', { class: 'eyebrow' }, `チュートリアル ${n}/${TUT.length}`), h('button', { class: 'x', onclick: endTutorial, title: 'チュートリアルをやめる' }, 'やめる')),
        h('h3', { class: 'coach-title' }, step.title),
        h('div', { class: 'coach-body', html: step.body }),
        step.wait
          ? h('div', { class: 'coach-wait' }, '▶ 操作してみてください', h('button', { class: 'x', onclick: tutAdvance }, '飛ばす'))
          : h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: step.last ? endTutorial : tutAdvance }, step.last ? '終わる' : '次へ')));
    }
    const intro = STAGE_INTRO[game.st.def.id];
    if (game.screen === 'plan' && intro && !game.introSeen[game.st.def.id]) {
      return h('div', { class: 'coach' },
        h('h3', { class: 'coach-title' }, intro.title),
        h('div', { class: 'coach-body', html: intro.body }),
        h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: () => { game.introSeen[game.st.def.id] = true; store.set('intro', game.introSeen); renderPanel(); } }, 'わかった')));
    }
    return null;
  }
  function applyHighlight() {
    document.querySelectorAll('.tut-hl').forEach(el => el.classList.remove('tut-hl'));
    if (!game.tut.on) return;
    const step = TUT[game.tut.i];
    if (!step || !step.hl || step.screen !== game.screen) return;
    const el = document.querySelector(step.hl);
    if (el) el.classList.add('tut-hl');
  }

  // ---------- 遊び方 ----------
  const helpEl = document.getElementById('help');
  function openHelp() {
    helpEl.replaceChildren(h('div', { class: 'modal-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': '遊び方' },
      h('div', { class: 'row' }, h('h2', { class: 'grow' }, '遊び方'), h('button', { class: 'btn', onclick: closeHelp }, '閉じる')),
      h('div', { class: 'help-grid' },
        h('section', null, h('h3', null, '基本の流れ'), h('ol', { html: '<li>面を選んで「作戦立案へ」</li><li>作戦図を<b>左クリック</b>で地点を置く/<b>右クリック</b>で取り消す</li><li>「作戦実行 ▶」。あとは見守るだけ(一時停止・早送りのみ)</li><li>結果を見て、プランを直して再挑戦</li>' })),
        h('section', null, h('h3', null, '作戦図の見方'), h('div', { html: LEGEND_HTML })),
        h('section', null, h('h3', null, 'おまかせ巡回'), h('p', null, '地点を使い切ったチーム(地点ゼロのチームも)は、残りの不安全箇所や目標を自動で回ります。第1・2面はおまかせだけでもクリアできます。')),
        h('section', null, h('h3', null, '見つかると'), h('p', { html: '工場員の頭上の「?」は怪しんでいる、「!」は気づいた合図。「!」の赤い輪が一周すると<b>全館通報</b>され、近くの不安全箇所が片付けられます。通報前に記録すると<b>得点2倍</b>。' })),
        h('section', null, h('h3', null, '細かい指示(地点をクリック)'), h('ul', { html: '<li><b>歩き方</b>: 忍び足は遅いが見つかりにくい</li><li><b>指摘の仕方</b>: こっそり/慎重(おすすめ)/強気</li><li><b>合図まで待つ</b>: 同じ合図を待つ全チームが揃うと一斉に動く</li><li><b>安全ライト</b>: 近くの工場員を5秒くらませる。くらんだ相手は静かに指摘できる</li><li><b>デジカメ</b>: 見えている不安全箇所をまとめて記録</li>' })),
        h('section', null, h('h3', null, 'ランク'), h('p', null, 'S: 全部記録・通報なし・離脱なし / A: 8割以上記録・離脱1人まで / B: 目標達成 / D: 失敗')),
      ),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { closeHelp(); startTutorial(); } }, 'チュートリアルをもう一度'))));
    helpEl.hidden = false;
  }
  function closeHelp() { helpEl.hidden = true; }
  document.getElementById('helpBtn').addEventListener('click', openHelp);
  helpEl.addEventListener('click', e => { if (e.target === helpEl) closeHelp(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !helpEl.hidden) closeHelp(); });

  // ---------- 入力(作戦図クリック) ----------
  function mapPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width * game.st.w,
      y: (e.clientY - rect.top) / rect.height * game.st.h,
    };
  }
  function planTeamForClick() {
    let team = curTeam();
    if (!team.members.length) {
      team = game.plan.teams.find(t => t.members.length);
      if (!team) { game.tab = 'squad'; renderPanel(); flash('先に「編成」で隊員をチームに入れてください'); return null; }
      game.team = team.id;
    }
    return team;
  }
  canvas.addEventListener('click', e => {
    if (game.screen !== 'plan') return;
    const { x, y } = mapPos(e);
    const team = planTeamForClick();
    if (!team) return;
    // 既存地点のクリックは選択
    const hit = team.wps.findIndex(w => Math.hypot(w.x + 0.5 - x, w.y + 0.5 - y) < 0.7);
    if (hit >= 0) { game.selWp = hit; game.tab = 'route'; renderPanel(); return; }
    const tx = Math.floor(x), ty = Math.floor(y);
    if (SS.tileAt(game.st, game.st.tiles, tx, ty) !== SS.TILE.FLOOR) { flash('そこには置けません。床(紺色のマス)をクリックしてください'); return; }
    const prevPt = team.wps.length ? team.wps[team.wps.length - 1] : game.st.entries[team.entry];
    if (!SS.findPath(game.st, game.st.tiles, prevPt.x, prevPt.y, tx, ty, SS.teamCanUnlock(team.members, game.plan.kits))) {
      flash('前の地点からそこへ行けません(黄黒の施錠扉は、合鍵を持つ隊員がいるチームだけ通れます)');
      return;
    }
    team.wps.push({ x: tx, y: ty, speed: '', roe: '', go: '', action: '' });
    game.selWp = team.wps.length - 1;
    game.tab = 'route';
    savePlan();
    renderPanel();
    tutEvent('addWp');
  });
  function undoWp(atIndex) {
    const team = curTeam();
    if (!team.wps.length) { flash('取り消す地点がありません'); return; }
    const i = atIndex != null ? atIndex : team.wps.length - 1;
    team.wps.splice(i, 1);
    game.selWp = team.wps.length - 1;
    savePlan();
    renderPanel();
    tutEvent('removeWp');
  }
  canvas.addEventListener('contextmenu', e => {
    if (game.screen !== 'plan') return;
    e.preventDefault();
    const team = planTeamForClick();
    if (!team) return;
    const { x, y } = mapPos(e);
    const hit = team.wps.findIndex(w => Math.hypot(w.x + 0.5 - x, w.y + 0.5 - y) < 0.7);
    undoWp(hit >= 0 ? hit : null);
  });
  let flashTimer = null;
  function flash(msg) {
    hint.textContent = msg;
    hint.style.color = C.danger;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { hint.style.color = ''; updateHint(); }, 1800);
  }

  // ---------- 描画 ----------
  function setupCanvas() {
    const st = game.st;
    const w = st.w * TS, hgt = st.h * TS;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== w * dpr) {
      canvas.width = w * dpr; canvas.height = hgt * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.dataset.w = w;
  }

  function drawTiles(tiles) {
    const st = game.st;
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, st.w * TS, st.h * TS);
    for (let y = 0; y < st.h; y++) {
      for (let x = 0; x < st.w; x++) {
        const t = tiles[y * st.w + x];
        const px = x * TS, py = y * TS;
        if (t === SS.TILE.WALL) {
          ctx.fillStyle = C.wall; ctx.fillRect(px, py, TS, TS);
          ctx.fillStyle = C.wallTop; ctx.fillRect(px, py, TS, 3);
        } else {
          ctx.fillStyle = C.floor; ctx.fillRect(px, py, TS, TS);
          ctx.strokeStyle = C.grid; ctx.strokeRect(px + 0.5, py + 0.5, TS - 1, TS - 1);
          if (t === SS.TILE.SHELF) {
            ctx.fillStyle = C.shelf; ctx.fillRect(px + 1, py + 2, TS - 2, TS - 4);
            ctx.strokeStyle = '#4b7192'; ctx.beginPath(); ctx.moveTo(px + 2, py + TS / 2); ctx.lineTo(px + TS - 2, py + TS / 2); ctx.stroke();
          } else if (t === SS.TILE.MACHINE) {
            ctx.fillStyle = C.machine; ctx.fillRect(px + 1, py + 1, TS - 2, TS - 2);
            ctx.strokeStyle = 'rgba(220,232,242,0.18)';
            ctx.beginPath();
            for (let k = -TS; k < TS; k += 6) { ctx.moveTo(px + k, py + TS); ctx.lineTo(px + k + TS, py); }
            ctx.save(); ctx.beginPath(); ctx.rect(px + 1, py + 1, TS - 2, TS - 2); ctx.clip();
            ctx.beginPath(); for (let k = -TS; k < TS; k += 6) { ctx.moveTo(px + k, py + TS); ctx.lineTo(px + k + TS, py); } ctx.stroke();
            ctx.restore();
          } else if (t === SS.TILE.LOCK) {
            ctx.save(); ctx.beginPath(); ctx.rect(px, py, TS, TS); ctx.clip();
            ctx.fillStyle = '#1a1400'; ctx.fillRect(px, py, TS, TS);
            ctx.fillStyle = C.safety;
            for (let k = -TS; k < TS * 2; k += 8) { ctx.beginPath(); ctx.moveTo(px + k, py); ctx.lineTo(px + k + 4, py); ctx.lineTo(px + k + 4 - TS, py + TS); ctx.lineTo(px + k - TS, py + TS); ctx.fill(); }
            ctx.restore();
          }
        }
      }
    }
    // 進入口
    st.entries.forEach((en, i) => {
      ctx.fillStyle = C.cross;
      ctx.fillRect(en.x * TS + 3, en.y * TS + 3, TS - 6, TS - 6);
      ctx.fillStyle = '#062b16';
      ctx.font = `bold 11px ${'sans-serif'}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), en.x * TS + TS / 2, en.y * TS + TS / 2 + 1);
    });
  }

  function drawHazard(z, mode) {
    const cx = (z.x + 0.5) * TS, cy = (z.y + 0.5) * TS;
    const r = TS * 0.42;
    ctx.save();
    if (z.item) {
      ctx.fillStyle = mode === 'done' ? C.cross : mode === 'intel' ? 'rgba(255,204,26,0.35)' : C.safety;
      ctx.fillRect(cx - r * 0.8, cy - r * 0.7, r * 1.6, r * 1.4);
      ctx.fillStyle = '#1a1400'; ctx.fillRect(cx - r * 0.5, cy - r * 0.25, r, r * 0.18);
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r * 0.8); ctx.lineTo(cx - r, cy + r * 0.8); ctx.closePath();
    if (mode === 'intel') { ctx.strokeStyle = 'rgba(255,204,26,0.55)'; ctx.setLineDash([2, 2]); ctx.stroke(); }
    else if (mode === 'done') { ctx.fillStyle = C.cross; ctx.fill(); }
    else if (mode === 'lost') { ctx.fillStyle = '#3a5068'; ctx.fill(); }
    else { ctx.fillStyle = C.safety; ctx.fill(); }
    ctx.setLineDash([]);
    ctx.fillStyle = mode === 'intel' ? 'rgba(255,204,26,0.8)' : '#111';
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(mode === 'done' ? '✓' : mode === 'lost' ? '–' : mode === 'intel' ? '?' : '!', cx, cy + 2);
    ctx.restore();
  }

  function drawPerson(x, y, facing, color, opts) {
    const cx = x * TS, cy = y * TS, r = TS * 0.34;
    ctx.save();
    ctx.globalAlpha = opts.alpha != null ? opts.alpha : 1;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = opts.stroke || 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
    // 向き
    ctx.strokeStyle = '#0b1622'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(facing) * r * 1.15, cy + Math.sin(facing) * r * 1.15); ctx.stroke();
    if (opts.cross) { // 緑十字の腕章
      ctx.fillStyle = '#fff'; ctx.fillRect(cx - 4, cy - 1.2, 8, 2.4); ctx.fillRect(cx - 1.2, cy - 4, 2.4, 8);
      ctx.fillStyle = C.cross; ctx.fillRect(cx - 3, cy - 0.7, 6, 1.4); ctx.fillRect(cx - 0.7, cy - 3, 1.4, 6);
    }
    if (opts.lead) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }

  function enemyShape(e, x, y, alpha) {
    const cx = x * TS, cy = y * TS;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (e.type === 'forklift') {
      ctx.translate(cx, cy); ctx.rotate(e.facing);
      ctx.fillStyle = C.enemy; ctx.fillRect(-TS * 0.42, -TS * 0.3, TS * 0.7, TS * 0.6);
      ctx.fillStyle = '#d9d9d9'; ctx.fillRect(TS * 0.28, -TS * 0.3, TS * 0.22, 3); ctx.fillRect(TS * 0.28, TS * 0.3 - 3, TS * 0.22, 3);
      ctx.restore();
      return;
    }
    ctx.restore();
    const boss = e.type === 'boss';
    drawPerson(x, y, e.facing, boss ? '#ff4fa0' : e.type === 'veteran' ? '#e0703a' : e.type === 'leader' ? '#ffa04a' : e.type === 'rookie' ? '#ffc08a' : C.enemy, { alpha, stroke: boss ? '#fff' : null });
    if (e.type === 'leader' || boss) { // ヘルメットのライン
      ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, TS * 0.2, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.restore();
    }
  }

  // 視界の扇形(壁・棚・施錠扉で遮られる)
  function drawCone(x, y, facing, range, half, color, tiles) {
    tiles = tiles || (game.sim ? game.sim.tiles : game.st.tiles);
    const st = game.st;
    const n = Math.max(8, Math.ceil(half * 18));
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x * TS, y * TS);
    for (let i = 0; i <= n; i++) {
      const a = facing - half + (2 * half * i) / n;
      const dx = Math.cos(a), dy = Math.sin(a);
      let r = 0;
      while (r < range) {
        const nr = Math.min(range, r + 0.2);
        const t = SS.tileAt(st, tiles, Math.floor(x + dx * nr), Math.floor(y + dy * nr));
        if (t === SS.TILE.WALL || t === SS.TILE.SHELF || t === SS.TILE.LOCK) break;
        r = nr;
      }
      ctx.lineTo((x + dx * r) * TS, (y + dy * r) * TS);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawPlanOverlay() {
    const st = game.st;
    // 事前情報: 工場員と把握済みの不安全箇所
    for (const z of st.hazards) if (!z.hidden) drawHazard(z, 'intel');
    const vis = 7 * (st.def.dark ? 0.6 : 1);
    for (const e of st.enemies) {
      if (e.route.length >= 2) {
        // 巡回ルート(目撃情報)
        ctx.save();
        ctx.strokeStyle = 'rgba(255,138,61,0.45)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
        if (!e.routeCells) {
          e.routeCells = [];
          let cur = { x: e.x, y: e.y };
          for (const p of [...e.route, e.route[0]]) {
            e.routeCells.push(...(SS.findPath(st, st.tiles, cur.x, cur.y, p.x, p.y, false) || []));
            cur = p;
          }
        }
        ctx.beginPath();
        e.routeCells.forEach((c, k) => { const px = (c.x + 0.5) * TS, py = (c.y + 0.5) * TS; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
        ctx.stroke(); ctx.restore();
      } else {
        // 持ち場の見張り範囲(首振り込み)
        drawCone(e.x + 0.5, e.y + 0.5, e.facing, vis, 0.5 + (55 * Math.PI) / 180, 'rgba(255,138,61,0.09)', st.tiles);
      }
    }
    for (const e of st.enemies) {
      const fake = { type: e.type, facing: e.facing };
      enemyShape(fake, e.x + 0.5, e.y + 0.5, 0.55);
    }
    // 経路
    const order = [...game.plan.teams].sort((a, b) => (a.id === game.team) - (b.id === game.team));
    for (const team of order) {
      if (!team.members.length) continue;
      const col = TEAM_COLOR[team.id];
      const active = game.screen === 'plan' && team.id === game.team;
      const legs = SS.planPaths(st, team, game.plan.kits);
      ctx.save();
      ctx.globalAlpha = active || game.screen !== 'plan' ? 1 : 0.45;
      ctx.lineWidth = active ? 3 : 2;
      legs.forEach((leg, i) => {
        if (!leg) return;
        const sp = (i === 0 ? team.speed : (team.wps.slice(0, i).reverse().find(w => w.speed) || team).speed);
        ctx.strokeStyle = col;
        ctx.setLineDash(sp === 'sneak' ? [2, 5] : sp === 'run' ? [] : [8, 5]);
        ctx.beginPath();
        leg.forEach((c, k) => { const px = (c.x + 0.5) * TS, py = (c.y + 0.5) * TS; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
        ctx.stroke();
      });
      ctx.setLineDash([]);
      team.wps.forEach((w, i) => {
        const px = (w.x + 0.5) * TS, py = (w.y + 0.5) * TS;
        const sel = active && i === game.selWp;
        ctx.fillStyle = '#0b1622';
        ctx.strokeStyle = col; ctx.lineWidth = sel ? 3 : 2;
        ctx.beginPath(); ctx.arc(px, py, sel ? 9 : 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = col; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), px, py + 1);
        if (!legs[i]) { ctx.strokeStyle = C.danger; ctx.beginPath(); ctx.moveTo(px - 7, py - 7); ctx.lineTo(px + 7, py + 7); ctx.stroke(); }
        let bx = px + 9;
        if (w.go) { badge(bx, py - 12, w.go, C.safety, '#1a1400'); bx += 14; }
        if (w.action) badge(bx, py - 12, w.action === 'light' ? '光' : '撮', '#fff', '#111');
      });
      ctx.restore();
    }
  }
  function badge(x, y, text, bg, fg) {
    ctx.save();
    ctx.fillStyle = bg; ctx.fillRect(x - 6, y - 6, 13, 13);
    ctx.fillStyle = fg; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 0.5, y + 1);
    ctx.restore();
  }

  function drawRun(alpha) {
    const S = game.sim;
    drawTiles(S.tiles);
    const lerp = (a, b) => a + (b - a) * alpha;
    const vis = 7 * (game.st.def.dark ? 0.6 : 1);
    // 敵の視界
    for (const e of S.enemies) {
      if (e.state === 'down' || e.stun > 0) continue;
      const col = e.state === 'alert' ? 'rgba(255,90,78,0.2)' : e.state === 'suspicious' ? 'rgba(255,204,26,0.16)' : 'rgba(255,138,61,0.11)';
      drawCone(lerp(e.px, e.x), lerp(e.py, e.y), e.facing, vis, (55 * Math.PI) / 180, col);
    }
    // 不安全箇所
    for (const z of S.hazards) {
      if (z.status === 'open' && !z.known) continue;
      drawHazard(z, z.status === 'open' ? 'open' : z.status);
      if (z.status === 'open' && (z.prog > 0 || z.conceal > 0)) {
        const cx = (z.x + 0.5) * TS, cy = (z.y + 1) * TS + 2;
        ctx.fillStyle = '#000'; ctx.fillRect(cx - 10, cy, 20, 4);
        if (z.prog > 0) { ctx.fillStyle = C.cross; ctx.fillRect(cx - 10, cy, 20 * Math.min(1, z.prog), 2); }
        if (z.conceal > 0) { ctx.fillStyle = C.danger; ctx.fillRect(cx - 10, cy + 2, 20 * Math.min(1, z.conceal), 2); }
      }
    }
    // 経路(薄く)
    ctx.save(); ctx.globalAlpha = 0.35; drawPlanPaths(S); ctx.restore();
    // 敵
    for (const e of S.enemies) {
      const x = lerp(e.px, e.x), y = lerp(e.py, e.y);
      enemyShape(e, x, y, e.state === 'down' ? 0.35 : 1);
      const cx = x * TS, cy = y * TS;
      if (e.state === 'down') {
        ctx.fillStyle = C.cross; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('改', cx, cy + 4);
        continue;
      }
      if (e.stun > 0) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        for (let k = 0; k < 3; k++) { const a = S.t * 4 + k * 2.1; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 9, cy - 10 + Math.sin(a) * 3, 1.8, 0, 7); ctx.stroke(); }
      } else if (e.state === 'alert') {
        markText(cx, cy - 14, '!', C.danger);
        if (e.radio !== null && !S.alarm) {
          const f = e.ty.alarmT ? 1 - e.radio / (e.ty.alarmT * (game.st.def.radio || 1)) : 1;
          ctx.strokeStyle = C.danger; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(cx, cy, TS * 0.55, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.stroke();
        }
      } else if (e.state === 'suspicious' || e.meter > 0.05) {
        markText(cx, cy - 14, '?', C.safety);
        ctx.fillStyle = '#000'; ctx.fillRect(cx - 9, cy - 24, 18, 3);
        ctx.fillStyle = C.safety; ctx.fillRect(cx - 9, cy - 24, 18 * e.meter, 3);
      }
      if (e.ty.boss || e.state === 'alert') {
        const hpF = Math.max(0, e.resolve / e.ty.resolve);
        if (hpF < 1) { ctx.fillStyle = '#000'; ctx.fillRect(cx - 10, cy + 10, 20, 3); ctx.fillStyle = C.enemy; ctx.fillRect(cx - 10, cy + 10, 20 * hpF, 3); }
      }
    }
    // 隊員
    for (const m of S.members) {
      const x = lerp(m.px, m.x), y = lerp(m.py, m.y);
      if (m.out) { drawPerson(x, y, m.facing, '#3a5068', { alpha: 0.6 }); continue; }
      drawCone(x, y, m.facing, 5 * (game.st.def.dark ? 0.6 : 1), Math.PI / 3, hexA(m.team.color, 0.07));
    }
    for (const m of S.members) {
      if (m.out) continue;
      const x = lerp(m.px, m.x), y = lerp(m.py, m.y);
      drawPerson(x, y, m.facing, m.team.color, { cross: true, lead: m === m.team.members.find(o => !o.out) });
      if (m.hp < m.hpMax) {
        const cx = x * TS, cy = y * TS;
        ctx.fillStyle = '#000'; ctx.fillRect(cx - 9, cy + 10, 18, 3);
        ctx.fillStyle = m.hp / m.hpMax < 0.35 ? C.danger : C.cross; ctx.fillRect(cx - 9, cy + 10, 18 * m.hp / m.hpMax, 3);
      }
    }
    // 演出
    for (const f of S.fx) {
      const age = (S.t - f.t0) / f.dur;
      if (f.type === 'shot') {
        ctx.save();
        ctx.globalAlpha = 1 - age;
        ctx.strokeStyle = f.kind === 'press' ? C.safety : f.kind === 'excuse' ? '#c7a6ff' : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = f.kind === 'press' ? 2.5 : 1.5;
        ctx.setLineDash(f.kind === 'excuse' ? [3, 3] : []);
        ctx.beginPath(); ctx.moveTo(f.x1 * TS, f.y1 * TS); ctx.lineTo(f.x2 * TS, f.y2 * TS); ctx.stroke();
        ctx.restore();
      } else if (f.type === 'flash') {
        ctx.save();
        ctx.globalAlpha = 0.6 * (1 - age);
        ctx.fillStyle = f.kind === 'light' ? '#fffbe0' : '#e0f4ff';
        ctx.beginPath(); ctx.arc(f.x * TS, f.y * TS, f.r * TS, 0, 7); ctx.fill();
        ctx.restore();
      }
    }
    for (const f of S.fx) if (f.type === 'bubble') drawBubble(f, (S.t - f.t0) / f.dur);
    // 暗所の帳
    if (game.st.def.dark) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,6,14,0.35)';
      ctx.fillRect(0, 0, game.st.w * TS, game.st.h * TS);
      ctx.restore();
    }
  }
  function drawPlanPaths(S) {
    for (const t of S.teams) {
      if (!t.path || t.state === 'done') continue;
      ctx.strokeStyle = t.color; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.beginPath();
      t.path.slice(Math.max(0, t.pi - 1)).forEach((c, k) => { k ? ctx.lineTo(c.x * TS, c.y * TS) : ctx.moveTo(c.x * TS, c.y * TS); });
      ctx.stroke(); ctx.setLineDash([]);
    }
  }
  function markText(x, y, t, col) {
    ctx.save(); ctx.font = `bold 15px ${'sans-serif'}`; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(t, x, y); ctx.fillStyle = col; ctx.fillText(t, x, y); ctx.restore();
  }
  function drawBubble(f, age) {
    const cx = f.x * TS, cy = f.y * TS - age * 10;
    ctx.save();
    ctx.globalAlpha = age < 0.75 ? 1 : (1 - age) * 4;
    ctx.font = '12px "BIZ UDPGothic", sans-serif';
    const w = ctx.measureText(f.text).width + 10;
    const W = game.st.w * TS;
    const x0 = Math.max(2, Math.min(W - w - 2, cx - w / 2));
    const bg = { team: '#f4f7fa', enemy: '#ffe3cc', alarm: C.danger, down: C.cross, record: C.safety, out: '#8ba3b8', crit: C.safety }[f.kind] || '#fff';
    ctx.fillStyle = bg;
    ctx.fillRect(x0, cy - 22, w, 17);
    ctx.fillStyle = f.kind === 'alarm' ? '#fff' : '#111';
    ctx.textBaseline = 'middle';
    ctx.fillText(f.text, x0 + 5, cy - 13);
    ctx.restore();
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---------- メインループ ----------
  let lastPanel = 0;
  function frame(now) {
    const dtReal = Math.min(0.1, (now - (game.last || now)) / 1000);
    game.last = now;
    setupCanvas();
    if (game.screen === 'run' && game.sim) {
      const S = game.sim;
      if (!game.paused) {
        game.acc += dtReal * game.speed;
        while (game.acc >= SS.DT && !S.over) { S.step(); game.acc -= SS.DT; }
      }
      drawRun(S.over ? 1 : Math.min(1, game.acc / SS.DT));
      hudTime.textContent = `${fmtTime(S.t)} / ${fmtTime(game.st.def.limit)}`;
      hudAlarm.hidden = !S.alarm;
      hudScore.textContent = `得点 ${S.score}`;
      if (now - lastPanel > 250) { updateRunPanel(); lastPanel = now; }
      if (S.over) { updateRunPanel(); setTimeout(() => { if (game.sim === S && game.screen === 'ending') finishRun(); }, 900); game.screen = 'ending'; }
    } else if (game.screen === 'ending' || game.screen === 'result') {
      drawRun(1);
    } else {
      drawTiles(game.st.tiles);
      drawPlanOverlay();
    }
    requestAnimationFrame(frame);
  }

  document.addEventListener('keydown', e => {
    if (game.screen !== 'run') return;
    if (e.target.closest && e.target.closest('select,input')) return;
    if (e.code === 'Space') { e.preventDefault(); game.paused = !game.paused; renderPanel(); }
  });

  // 最後に解放された面から始める
  let start = 0;
  for (let i = 0; i < SS.STAGES.length; i++) if (unlocked(i)) start = i;
  loadStage(start);
  if (!store.get('tutDone', false) && start === 0) game.tut = { on: true, i: 0 };
  openSelect();
  requestAnimationFrame(frame);
})();
