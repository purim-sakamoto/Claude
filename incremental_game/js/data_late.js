/* ゲームデータ（後半）：時代4の自動化の続きから、電気と計算・空・惑星・外太陽系・戦争・果てまで。
   data.js のあとに読み込み、TM.DATA の配列に足す。
   ph：設備の「場面」。現場タブは場面ごとに分けて見せる（古い場面の設備は別の見出しにまとめる） */
(function () {
  var D = TM.DATA;
  function add(list, items) { items.forEach(function (x) { list.push(x); }); }

  /* ---------------- 場面 ---------------- */
  D.phases = [
    { id: 'ground', name: '地上の工場' },
    { id: 'auto', name: '自動化' },
    { id: 'power', name: '電気と計算' },
    { id: 'sky', name: '空' },
    { id: 'planet', name: '惑星' },
    { id: 'outer', name: '外太陽系' },
    { id: 'war', name: '戦時' },
    { id: 'end', name: '果て' }
  ];
  D.eraNames = ['暗闇', '町工場', '工場', '基地', '自動化', '電気と計算', '空', '惑星', '外太陽系', '兵站', '戦略', '果て'];

  /* ---------------- 資源 ---------------- */
  add(D.resources, [
    { id: 'compute', name: '計算力', unit: 'PF', cap: null, grp: 'calc' },
    { id: 'fuel', name: 'ロケット燃料', unit: 't', cap: 0, grp: 'space' },
    { id: 'orbit', name: '軌道資材', unit: 't', cap: 0, grp: 'space' },
    { id: 'moonfe', name: '月の砂鉄', unit: 't', cap: null, grp: 'space' },
    { id: 'vhcl', name: '金星の塩化水素', unit: 't', cap: null, grp: 'space' },
    { id: 'sfecl3', name: '宇宙製 塩化第二鉄', unit: 't', cap: null, grp: 'space' },
    { id: 'tf_heat', name: '火星：気温', unit: '', cap: null, grp: 'mars' },
    { id: 'tf_air', name: '火星：大気', unit: '', cap: null, grp: 'mars' },
    { id: 'tf_water', name: '火星：水', unit: '', cap: null, grp: 'mars' },
    { id: 'tf_life', name: '火星：緑', unit: '', cap: null, grp: 'mars' },
    { id: 'aster', name: '小惑星の鉄', unit: 't', cap: null, grp: 'outer' },
    { id: 'he3', name: 'ヘリウム3', unit: 't', cap: null, grp: 'outer' },
    { id: 'ice', name: 'エウロパの氷', unit: 't', cap: null, grp: 'outer' },
    { id: 'ch4', name: 'タイタンのメタン', unit: 't', cap: null, grp: 'outer' },
    { id: 'w_fuel', name: '推進剤', unit: 't', cap: null, grp: 'war' },
    { id: 'w_cool', name: '冷却材', unit: 't', cap: null, grp: 'war' },
    { id: 'w_armor', name: '装甲材', unit: 't', cap: null, grp: 'war' },
    { id: 'w_water', name: '浄水剤', unit: 't', cap: null, grp: 'war' },
    { id: 'star', name: '恒星エネルギー', unit: '', cap: null, grp: 'end' },
    { id: 'ism', name: '星間物質', unit: '', cap: null, grp: 'end' },
    { id: 'gfe', name: '星の鉄', unit: '', cap: null, grp: 'end' }
  ]);
  /* 「研究」より前に計算・宇宙…を差し込む */
  var gi = 0; D.resGroups.forEach(function (g, i) { if (g.id === 'lab') gi = i; });
  D.resGroups.splice(gi, 0,
    { id: 'calc', name: '計算' },
    { id: 'space', name: '宇宙' },
    { id: 'mars', name: '火星（テラフォーミング）' },
    { id: 'outer', name: '外太陽系' },
    { id: 'war', name: '軍需（前線へ送る物資）' },
    { id: 'end', name: '星' });

  /* ---------------- 設備 ---------------- */
  add(D.buildings, [
    /* ---- 時代4の続き：自動配送・電化 ---- */
    { id: 'heatpump', ph: 'auto', name: 'ヒートポンプ', group: '電化', desc: '燃やさずに、電気で熱をくみ上げる。ボイラーの代わりになり、燃料代がかからない。', unlock: { tech: 'electrify' },
      cost: { money: 4e7 }, ratio: 1.3, space: 2, effects: { steam: 2 }, proc: { power: 25 } },
    { id: 'evlorry', ph: 'auto', name: '自動運転ローリー', group: '自動配送', desc: '電気で走り、運転手がいらないローリー。充電所が要る。全国・海外の港まで。', unlock: { tech: 'autodrive' },
      cost: { money: 6e7 }, ratio: 1.22, space: 4, effects: { transport: { kind: 'bulk', rate: 220, zone: 5, auto: true, requires: ['charger', 'shiptank'] } }, proc: { power: 6 } },
    { id: 'charger', ph: 'auto', name: '急速充電所', group: '自動配送', desc: '電動の車を充電する。', unlock: { tech: 'autodrive' },
      cost: { money: 2e7 }, ratio: 1.5, space: 2, max: 3, proc: { power: 10 } },
    { id: 'dronehub', ph: 'auto', name: 'ドローン配送拠点', group: '自動配送', desc: '缶や箱を、空から届ける。人はいらない。', unlock: { tech: 'drone' },
      cost: { money: 5e7 }, ratio: 1.25, space: 2, effects: { transport: { rate: 6, zone: 5, auto: true } }, proc: { power: 8 } },
    { id: 'solarfarm', ph: 'auto', name: '太陽光発電所', group: '電化', desc: '遊んでいる土地に、パネルを並べる。', unlock: { tech: 'electrify' },
      cost: { money: 8e7 }, ratio: 1.22, space: 0, effects: { power: 120 } },

    /* ---- 時代5：電気と計算 ---- */
    { id: 'battery', ph: 'power', name: '蓄電池', group: '電気', desc: '昼の電気を夜に回す。使える電気が増える。', unlock: { era: 5 },
      cost: { money: 3e9 }, ratio: 1.3, space: 0, effects: { power: 900 } },
    { id: 'fusion', ph: 'power', name: '核融合炉', group: '電気', desc: '理屈は、まだ誰にも分からない。でも、動く。燃料は海の水から取る重水素。', unlock: { tech: 'fusion' },
      cost: { money: 4e10 }, ratio: 1.32, space: 0, effects: { power: 12000 } },
    { id: 'ctower', ph: 'power', name: '冷却塔', group: '計算', desc: 'データセンターの熱を、水で捨てる。冷却水の藻を薬で抑える（薬代がかかる）。', unlock: { tech: 'datacenter' },
      cost: { money: 2e9 }, ratio: 1.3, space: 0, effects: { cool: 4 }, proc: { in: { money: 3e5 }, out: {}, toggle: true } },
    { id: 'dc', ph: 'power', name: 'データセンター', group: '計算', desc: '電気を計算に変える。冷却塔1基で4棟まで冷やせる。計算力は売れるし、研究にも使える。', unlock: { tech: 'datacenter' },
      cost: { money: 6e9 }, ratio: 1.24, space: 0, proc: { in: {}, out: { compute: 1 }, power: 800, toggle: true, cooled: true } },
    { id: 'ailab', ph: 'power', name: 'AI研究所', group: '計算', desc: '計算力で、研究を回す。', unlock: { tech: 'aiops' },
      cost: { money: 1.5e10 }, ratio: 1.3, space: 0, proc: { in: { compute: 0.6 }, out: { research: 3e6 }, power: 200, toggle: true } },
    { id: 'aiplant', ph: 'power', name: 'AIの工場長', group: '計算', desc: '工場全体の段取りを、計算で組む。すべての生産 +4%（1つごと）。', unlock: { tech: 'aiops' },
      cost: { money: 2e10, compute: 200 }, ratio: 1.4, space: 0, effects: { global: 0.04 }, proc: { in: { compute: 0.3 }, out: {}, power: 100 } },
    { id: 'mega5', ph: 'power', name: '宇宙港', group: '大型', desc: '海の上の発射台と、燃料と、管制の計算機。10段階で完成。', unlock: { tech: 'spaceport' },
      cost: { money: 5e10, compute: 800 }, ratio: 1.45, ratioRes: { compute: 1.35 }, space: 0, stages: 10, onComplete: { era: 6 } },

    /* ---- 時代6：空 ---- */
    { id: 'electrolysis', ph: 'sky', name: '水電解装置', group: '燃料', desc: '純水を電気で分けて、水素をつくる。', unlock: { era: 6 },
      cost: { money: 3e11 }, ratio: 1.25, space: 0, effects: { cap: { h2: 20000 } }, proc: { in: { pw: 40 }, out: { h2: 4 }, power: 3000, toggle: true } },
    { id: 'fuelplant', ph: 'sky', name: '液化水素プラント', group: '燃料', desc: '水素を冷やして液体に。ロケット燃料になる。', unlock: { era: 6 },
      cost: { money: 2e11 }, ratio: 1.25, space: 0, effects: { cap: { fuel: 400 } }, proc: { in: { h2: 4 }, out: { fuel: 1 }, power: 1500, toggle: true } },
    { id: 'launch', ph: 'sky', name: '打ち上げ場', group: '打ち上げ', desc: '燃料を燃やして、資材を軌道へ上げる。', unlock: { era: 6 },
      cost: { money: 6e11 }, ratio: 1.3, space: 0, effects: { cap: { orbit: 400 } }, proc: { in: { fuel: 1, money: 5e7 }, out: { orbit: 0.25 }, toggle: true } },
    { id: 'orbtank', ph: 'sky', name: '軌道上タンク', group: '打ち上げ', desc: '軌道で資材と燃料をためる。', unlock: { bld: { launch: 1 } },
      cost: { money: 4e11, orbit: 20 }, ratio: 1.35, space: 0, effects: { cap: { orbit: 1500, fuel: 600 } } },
    { id: 'sat', ph: 'sky', name: '通信衛星の網', group: '軌道', desc: '地球をくるむ衛星の網。どこでも配車でき、計算をつなぐ。すべての生産 +3%（1つごと）。', unlock: { tech: 'satellite' },
      cost: { money: 3e11, orbit: 30 }, ratio: 1.4, space: 0, effects: { global: 0.03 } },
    { id: 'station', ph: 'sky', name: '軌道ステーション', group: '軌道', desc: '人の住む宇宙の家。飲み水と空気を、地上から上げた薬で整える。宇宙の住人が増える。', unlock: { tech: 'station' },
      cost: { money: 8e11, orbit: 80 }, ratio: 1.4, space: 0, effects: { popCap: 60 }, proc: { in: { orbit: 0.01, money: 1e7 }, out: { money: 6e8 }, toggle: true } },
    { id: 'orbdc', ph: 'sky', name: '軌道データセンター', group: '軌道', desc: '宇宙は冷たい。冷却塔はいらない。電気は太陽から。', unlock: { tech: 'orbdc' },
      cost: { money: 1.5e12, orbit: 60 }, ratio: 1.3, space: 0, proc: { in: { orbit: 0.004 }, out: { compute: 12 }, toggle: true } },
    { id: 'spacelab', ph: 'sky', name: '軌道研究所', group: '軌道', desc: '無重力で、地上ではできない実験を。', unlock: { bld: { station: 1 } },
      cost: { money: 1e12, orbit: 50 }, ratio: 1.32, space: 0, proc: { in: { compute: 1 }, out: { research: 3e7 }, toggle: true } },
    { id: 'mega6', ph: 'sky', name: '軌道エレベーター', group: '大型', desc: '地球と宇宙を一本の綱でつなぐ。打ち上げずに、昇る。10段階。', unlock: { tech: 'elevator' },
      cost: { money: 1.5e12, orbit: 300 }, ratio: 1.45, ratioRes: { orbit: 1.3 }, space: 0, stages: 10, onComplete: { era: 7 } },

    /* ---- 時代7：惑星 ---- */
    { id: 'lift', ph: 'planet', name: 'エレベーターの昇降機', group: '月と金星', desc: '綱を昇って、資材を軌道へ。燃料はいらない。', unlock: { era: 7 },
      cost: { money: 3e13 }, ratio: 1.25, space: 0, effects: { cap: { orbit: 6000 } }, proc: { in: { money: 2e9 }, out: { orbit: 4 }, power: 20000, toggle: true } },
    { id: 'moonplant', ph: 'planet', name: '月面溶解プラント', group: '月と金星', desc: '月の砂には鉄が混じっている。', unlock: { tech: 'moon' },
      cost: { money: 2e13, orbit: 300 }, ratio: 1.28, space: 0, proc: { in: { orbit: 0.05 }, out: { moonfe: 3 }, toggle: true } },
    { id: 'venus', ph: 'planet', name: '金星浮遊プラント', group: '月と金星', desc: '金星の雲は硫酸と塩化水素でできている。浮かんで、集める。', unlock: { tech: 'venus' },
      cost: { money: 3e13, orbit: 400 }, ratio: 1.28, space: 0, proc: { out: { vhcl: 5 }, in: {}, toggle: true } },
    { id: 'orbreactor', ph: 'planet', name: '軌道上反応槽', group: '月と金星', desc: '月の鉄と金星の塩化水素から、宇宙製の塩化第二鉄を。', unlock: { tech: 'venus' },
      cost: { money: 4e13, orbit: 300 }, ratio: 1.28, space: 0, proc: { in: { moonfe: 2, vhcl: 3 }, out: { sfecl3: 4 }, toggle: true } },
    { id: 'colonywater', ph: 'planet', name: '月と火星の街の水道', group: '街', desc: '宇宙の街の水を、宇宙製の第二鉄で澄ませる。', unlock: { tech: 'moon' },
      cost: { money: 3e13, orbit: 200 }, ratio: 1.26, space: 0, proc: { in: { sfecl3: 1 }, out: { money: 2e10 }, toggle: true } },
    { id: 'marsbase', ph: 'planet', name: '火星基地', group: '街', desc: '赤い土の上の、最初の街。住む人が増える。', unlock: { tech: 'mars' },
      cost: { money: 1e14, orbit: 1000 }, ratio: 1.4, space: 0, effects: { popCap: 300 } },
    { id: 'marsplant', ph: 'planet', name: '火星の赤土プラント', group: '火星', desc: '火星の赤は、酸化鉄の赤。塩化水素で溶かせば、そのまま第二鉄液になる。', unlock: { tech: 'mars' },
      cost: { money: 1.2e14, orbit: 600 }, ratio: 1.28, space: 0, proc: { in: { vhcl: 3 }, out: { sfecl3: 8 }, toggle: true } },
    { id: 'mirror', ph: 'planet', name: '軌道ミラー', group: 'テラフォーミング', desc: '太陽の光を集めて、火星を温める。', unlock: { tech: 'terraform' },
      cost: { money: 1e14, orbit: 800 }, ratio: 1.3, space: 0, proc: { in: { orbit: 0.02 }, out: { tf_heat: 0.02 }, toggle: true } },
    { id: 'airfac', ph: 'planet', name: '大気工場', group: 'テラフォーミング', desc: '赤土を塩化水素で溶かすときに、酸素と塩素を回して空へ返す。', unlock: { tech: 'terraform' },
      cost: { money: 1e14, orbit: 800 }, ratio: 1.3, space: 0, proc: { in: { vhcl: 2 }, out: { tf_air: 0.02 }, toggle: true } },
    { id: 'comet', ph: 'planet', name: '彗星の誘導', group: 'テラフォーミング', desc: '氷の彗星の軌道を、少しだけ曲げる。', unlock: { tech: 'terraform' },
      cost: { money: 1e14, orbit: 800 }, ratio: 1.3, space: 0, proc: { in: { fuel: 2 }, out: { tf_water: 0.02 }, toggle: true } },
    { id: 'algae', ph: 'planet', name: '藻の散布', group: 'テラフォーミング', desc: '澄ませた水に藻をまく。凝集剤で濁りを沈めてから。', unlock: { tech: 'terraform' },
      cost: { money: 1e14, orbit: 800 }, ratio: 1.3, space: 0, proc: { in: { sfecl3: 1 }, out: { tf_life: 0.02 }, toggle: true } },
    { id: 'mega7', ph: 'planet', name: 'テラフォーミング', group: '大型', desc: '火星に、空と海と森を。気温・大気・水・緑をためて、10段階で完成。', unlock: { tech: 'terraform' },
      cost: { money: 2e14, tf_heat: 40, tf_air: 40, tf_water: 40, tf_life: 40 }, ratio: 1.4, ratioRes: { tf_heat: 1.3, tf_air: 1.3, tf_water: 1.3, tf_life: 1.3 }, space: 0, stages: 10, onComplete: { era: 8 } },

    /* ---- 時代8：外太陽系 ---- */
    { id: 'asteroid', ph: 'outer', name: '小惑星溶解船', group: '小惑星帯', desc: '鉄とニッケルの塊を、核融合の熱でまるごと溶かす。', unlock: { era: 8 },
      cost: { money: 3e15, orbit: 3000 }, ratio: 1.28, space: 0, proc: { out: { aster: 6 }, power: 3e4, toggle: true } },
    { id: 'asteroidreactor', ph: 'outer', name: '小惑星反応炉', group: '小惑星帯', desc: '小惑星の鉄を、宇宙製の塩化第二鉄に。', unlock: { era: 8 },
      cost: { money: 4e15, orbit: 3000 }, ratio: 1.28, space: 0, proc: { in: { aster: 4, vhcl: 3 }, out: { sfecl3: 16 }, toggle: true } },
    { id: 'jupscoop', ph: 'outer', name: '木星の大気採取船', group: '木星と土星', desc: '木星の雲をすくって、ヘリウム3を集める。', unlock: { tech: 'jupiter' },
      cost: { money: 6e15, orbit: 5000 }, ratio: 1.28, space: 0, proc: { in: { fuel: 1 }, out: { he3: 0.5 }, toggle: true } },
    { id: 'fusion2', ph: 'outer', name: 'ヘリウム3核融合炉', group: '木星と土星', desc: '中性子の出ない火。とても大きな電気。', unlock: { tech: 'jupiter' },
      cost: { money: 8e15 }, ratio: 1.3, space: 0, effects: { power: 4e6 }, proc: { in: { he3: 0.2 }, out: {} } },
    { id: 'europa', ph: 'outer', name: 'エウロパの氷採掘', group: '木星と土星', desc: '氷の月を掘る。溶かせば、純水よりきれいな水。', unlock: { tech: 'europa' },
      cost: { money: 5e15, orbit: 4000 }, ratio: 1.28, space: 0, proc: { in: { fuel: 0.5 }, out: { ice: 10 }, toggle: true } },
    { id: 'titan', ph: 'outer', name: 'タイタンのメタン井', group: '木星と土星', desc: 'メタンの湖から、燃料を汲む。', unlock: { tech: 'titan' },
      cost: { money: 6e15, orbit: 4000 }, ratio: 1.28, space: 0, proc: { out: { ch4: 6 }, in: {}, toggle: true } },
    { id: 'ch4fuel', ph: 'outer', name: 'メタン燃料プラント', group: '木星と土星', desc: 'メタンを冷やして、ロケット燃料に。', unlock: { tech: 'titan' },
      cost: { money: 3e15 }, ratio: 1.26, space: 0, effects: { cap: { fuel: 20000 } }, proc: { in: { ch4: 4 }, out: { fuel: 6 }, toggle: true } },
    { id: 'outercity', ph: 'outer', name: '外惑星の街', group: '街', desc: '木星と土星の月に住む人たちの水を、氷と第二鉄で。', unlock: { tech: 'europa' },
      cost: { money: 1e16, orbit: 5000 }, ratio: 1.26, space: 0, effects: { popCap: 400 }, proc: { in: { ice: 4, sfecl3: 3 }, out: { money: 2e12 }, toggle: true } },
    { id: 'coldc', ph: 'outer', name: '氷の月の計算機', group: '木星と土星', desc: 'マイナス180度。冷やす手間がいらない。', unlock: { tech: 'europa' },
      cost: { money: 8e15, orbit: 4000 }, ratio: 1.3, space: 0, proc: { in: { ice: 2 }, out: { compute: 300 }, power: 2e5, toggle: true } },
    { id: 'kuiper', ph: 'outer', name: '外縁観測所', group: '外縁', desc: '太陽系の外れから、星の向こうを見る。', unlock: { tech: 'kuiper' },
      cost: { money: 2e16, orbit: 8000 }, ratio: 1.35, space: 0, proc: { in: { compute: 20 }, out: { research: 2e10 }, toggle: true } },
    { id: 'mega8', ph: 'outer', name: 'ヘリオポーズ基地', group: '大型', desc: '太陽の風が届く、いちばん外の線。10段階で完成。', unlock: { tech: 'heliopause' },
      cost: { money: 5e16, orbit: 20000 }, ratio: 1.45, ratioRes: { orbit: 1.3 }, space: 0, stages: 10, onComplete: { era: 9 } },

    /* ---- 時代9〜10：戦時 ---- */
    { id: 'wfuel', ph: 'war', name: '推進剤工場', group: '軍需工場', desc: 'ロケット燃料を、艦の推進剤に仕立てる。', unlock: { era: 9 },
      cost: { money: 1e17 }, ratio: 1.25, space: 0, proc: { in: { fuel: 6 }, out: { w_fuel: 3 }, toggle: true } },
    { id: 'wcool', ph: 'war', name: '冷却材工場', group: '軍需工場', desc: '氷を溶かし、純度を上げて、艦の冷却材に。', unlock: { era: 9 },
      cost: { money: 1e17 }, ratio: 1.25, space: 0, proc: { in: { ice: 6 }, out: { w_cool: 3 }, power: 1e5, toggle: true } },
    { id: 'warmor', ph: 'war', name: '装甲材の圧延所', group: '軍需工場', desc: '小惑星の鉄を、装甲の板に。', unlock: { era: 9 },
      cost: { money: 2e17 }, ratio: 1.25, space: 0, proc: { in: { aster: 6 }, out: { w_armor: 3 }, power: 2e5, toggle: true } },
    { id: 'wwater', ph: 'war', name: '浄水剤工場', group: '軍需工場', desc: '前線の水を澄ませるのは、うちの液だ。', unlock: { era: 9 },
      cost: { money: 1e17 }, ratio: 1.25, space: 0, proc: { in: { sfecl3: 6 }, out: { w_water: 3 }, toggle: true } },
    { id: 'wterminal', ph: 'war', name: '宇宙港ターミナル', group: '兵站', desc: '物資を仕分けて、船に積む。積める量が増える。', unlock: { era: 9 },
      cost: { money: 2e17 }, ratio: 1.3, space: 0, effects: { wload: 4 } },
    { id: 'convoy', ph: 'war', name: '輸送船団', group: '兵站', desc: '前線へ物資を運ぶ船団。運べる量が増える。', unlock: { era: 9 },
      cost: { money: 1e17 }, ratio: 1.26, space: 0, effects: { wlift: 3 } },
    { id: 'fdepot', ph: 'war', name: '前線補給基地', group: '兵站', desc: '前線のそばに物資をためておく。補給が途切れても、しばらく持ちこたえる。', unlock: { tech: 'depotwar' },
      cost: { money: 5e17, w_armor: 50 }, ratio: 1.35, space: 0, effects: { wbuf: 1 } },
    { id: 'mega9', ph: 'war', name: '反攻艦隊の造船所', group: '大型', desc: '4つの前線をすべて押し返したら、こちらから打って出る。10段階で完成。', unlock: { tech: 'counter' },
      cost: { money: 2e17, w_armor: 400 }, ratio: 1.3, ratioRes: { w_armor: 1.3 }, space: 0, stages: 10, buildCond: { war: 'fronts' }, onComplete: { era: 10 } },
    { id: 'dock', ph: 'war', name: '宇宙ドック', group: '造船', desc: '艦を造る船台。多いほど、同時にたくさん造れる。', unlock: { era: 10 },
      cost: { money: 3e17, w_armor: 300 }, ratio: 1.5, space: 0, effects: { dock: 1 } },
    { id: 'shipyard2', ph: 'war', name: '自動造船ライン', group: '造船', desc: '艦の部品を、ラインで流して組む。造船が速くなる。', unlock: { tech: 'autoyard' },
      cost: { money: 1e18, w_armor: 1000 }, ratio: 1.4, space: 0, effects: { dockSpeed: 0.5 } },
    { id: 'fleetdepot', ph: 'war', name: '艦隊補給所', group: '造船', desc: '艦に物資を積む。遠くで戦う艦の補給が続く。', unlock: { era: 10 },
      cost: { money: 4e17 }, ratio: 1.35, space: 0, effects: { fsupply: 1 } },

    /* ---- 時代11：果て ---- */
    { id: 'starfurnace', ph: 'end', name: '恒星炉', group: '星', desc: '鉄は、星が最後につくる元素。星の芯を炉にする。', unlock: { era: 11 },
      cost: { money: 2e18 }, ratio: 1.3, space: 0, proc: { out: { star: 10, gfe: 3 }, in: {}, toggle: true } },
    { id: 'ismnet', ph: 'end', name: '星間雲回収網', group: '星', desc: '星間雲には塩化水素も尿素も漂っている。網で集める。', unlock: { tech: 'ism' },
      cost: { money: 5e18, star: 5000 }, ratio: 1.35, space: 0, proc: { in: { star: 1 }, out: { ism: 5 }, toggle: true } },
    { id: 'galwater', ph: 'end', name: '銀河水処理網', group: '星', desc: '銀河じゅうの水を澄ませる。', unlock: { tech: 'galaxy' },
      cost: { money: 1e19, gfe: 2e4, ism: 2e4 }, ratio: 1.3, space: 0, proc: { in: { gfe: 2, ism: 2 }, out: { money: 5e14 }, toggle: true } },
    { id: 'starlorry', ph: 'end', name: '恒星間ローリー', group: '星', desc: '光の速さの手前で、液を運ぶ。すべての生産 +10%（1つごと）。', unlock: { tech: 'galaxy' },
      cost: { money: 2e19, star: 1e5 }, ratio: 1.5, space: 0, effects: { global: 0.1 } },
    { id: 'alien', ph: 'end', name: '異星の商会', group: '星', desc: 'かつての敵。ケイ素の体の取引先。星間物質を高く買ってくれる。', unlock: { tech: 'ism' },
      cost: { money: 8e18, ism: 1e4 }, ratio: 1.3, space: 0, proc: { in: { ism: 3 }, out: { money: 1e15 }, toggle: true } },
    { id: 'starlab', ph: 'end', name: '恒星計算機', group: '星', desc: '星ひとつぶんの計算機。', unlock: { era: 11 },
      cost: { money: 5e18, star: 2000 }, ratio: 1.3, space: 0, proc: { in: { star: 0.5 }, out: { research: 1e15 }, toggle: true } },
    { id: 'final', ph: 'end', name: '始まりの釜', group: '大型', desc: '宇宙そのものを、一つの釜に。10段階。', unlock: { tech: 'origin' },
      cost: { money: 5e18, star: 2e5, ism: 2e5, gfe: 1e5 }, ratio: 1.6, ratioRes: { star: 1.4, ism: 1.4, gfe: 1.4 }, space: 0, stages: 10, onComplete: { ending: true } }
  ]);

  /* ---------------- 技術 ---------------- */
  add(D.techs, [
    /* 時代4の続き */
    { id: 'electrify', name: '電化', desc: '燃やすのをやめて、電気で温め、電気で走る。', cost: { research: 4e6 }, era: 4, req: ['automation'] },
    { id: 'autodrive', name: '自動運転', desc: '運転手のいないローリーとトラック。', cost: { research: 8e6 }, era: 4, req: ['electrify', 'autofork'], effects: [['auto.drive', 1]] },
    { id: 'drone', name: '配送ドローン', desc: '缶は、空を飛んで届く。', cost: { research: 1.2e7 }, era: 4, req: ['autodrive'] },
    /* 時代5：電気と計算 */
    { id: 'fusion', name: '核融合', desc: '「なぜ動くのかは、まだ分からない」。報告書の一行目にそう書いてある。', cost: { research: 3e8 }, era: 5 },
    { id: 'datacenter', name: 'データセンター', desc: '電気を、計算に。', cost: { research: 2e8 }, era: 5 },
    { id: 'aiops', name: 'AI運転', desc: '計算で研究し、計算で工場を回す。', cost: { research: 8e8 }, era: 5, req: ['datacenter'] },
    { id: 'immersion', name: '液浸冷却', desc: '計算機を、冷たい液に沈める。データセンター +50%。', cost: { research: 2e9 }, era: 5, req: ['datacenter'], effects: [['bld.dc', 0.5]] },
    { id: 'spaceport', name: '宇宙港', desc: '電気も、計算も、燃料もそろった。空へ。', cost: { research: 5e9 }, era: 5, req: ['fusion', 'aiops'] },
    /* 時代6：空 */
    { id: 'reusable', name: '再使用ロケット', desc: '降りてきて、また昇る。打ち上げ場 +100%。', cost: { research: 3e10 }, era: 6, effects: [['bld.launch', 1]] },
    { id: 'satellite', name: '衛星', desc: '空の上に、網を張る。', cost: { research: 2e10 }, era: 6 },
    { id: 'station', name: '軌道ステーション', desc: '宇宙に住む。', cost: { research: 6e10 }, era: 6, req: ['satellite'] },
    { id: 'orbdc', name: '宇宙の計算機', desc: '冷却はいらない。電気は太陽から。', cost: { research: 1e11 }, era: 6, req: ['satellite'] },
    { id: 'elevator', name: '軌道エレベーター', desc: '打ち上げずに、昇る。', cost: { research: 4e11 }, era: 6, req: ['reusable', 'station'] },
    /* 時代7：惑星 */
    { id: 'moon', name: '月面冶金', desc: '月の砂には、鉄が混じっている。', cost: { research: 2e12 }, era: 7 },
    { id: 'venus', name: '大気化学', desc: '金星の雲は硫酸と塩化水素でできている。仕入れ先が一つ増えた。', cost: { research: 3e12 }, era: 7, req: ['moon'] },
    { id: 'mars', name: '火星', desc: '赤は、酸化鉄の赤。', cost: { research: 6e12 }, era: 7, req: ['venus'] },
    { id: 'terraform', name: 'テラフォーミング', desc: '星ひとつを、住める星に。', cost: { research: 1.5e13 }, era: 7, req: ['mars'] },
    /* 時代8：外太陽系 */
    { id: 'jupiter', name: 'ヘリウム3', desc: '木星の雲に、未来の燃料が眠っている。', cost: { research: 8e13 }, era: 8 },
    { id: 'europa', name: '氷の月', desc: 'エウロパの氷の下に、海がある。', cost: { research: 1e14 }, era: 8 },
    { id: 'titan', name: 'メタンの湖', desc: 'タイタンには、燃料の湖がある。', cost: { research: 1.2e14 }, era: 8, req: ['europa'] },
    { id: 'kuiper', name: '外縁', desc: '太陽系のいちばん外を、見に行く。', cost: { research: 3e14 }, era: 8, req: ['jupiter', 'titan'] },
    { id: 'heliopause', name: 'ヘリオポーズ', desc: '太陽の風が、星の風とぶつかる場所。', cost: { research: 1e15 }, era: 8, req: ['kuiper'] },
    /* 時代9：兵站 */
    { id: 'depotwar', name: '前線補給', desc: '前線のそばに倉庫を。', cost: { research: 5e15 }, era: 9 },
    { id: 'convoyai', name: '船団の自動編成', desc: '船団の積み合わせを計算で組む。運べる量 +50%。', cost: { research: 1e16 }, era: 9, effects: [['wlift', 0.5]] },
    { id: 'counter', name: '反攻', desc: '守るだけでは、終わらない。', cost: { research: 3e16 }, era: 9, req: ['depotwar'] },
    /* 時代10：戦略 */
    { id: 'autoyard', name: '自動造船', desc: '艦も、ラインで造る。', cost: { research: 1e17 }, era: 10 },
    { id: 'tactics', name: '艦隊戦術', desc: '数より、並べ方。艦隊の強さ +30%。', cost: { research: 2e17 }, era: 10, effects: [['fleet', 0.3]] },
    { id: 'tactics2', name: '電子戦', desc: '相手の目をふさぐ。艦隊の強さ +30%。', cost: { research: 6e17 }, era: 10, req: ['tactics'], effects: [['fleet', 0.3]] },
    /* 時代11：果て */
    { id: 'nucleo', name: '恒星元素合成', desc: '鉄は、星が最後につくるもの。ずっと、星の灰を溶かしていた。', cost: { research: 1e19 }, era: 11 },
    { id: 'ism', name: '星間化学', desc: '星と星のあいだにも、塩化水素と尿素がある。', cost: { research: 5e19 }, era: 11, req: ['nucleo'] },
    { id: 'galaxy', name: '銀河規模の物流', desc: '一番遠い客にも、ローリーは行く。', cost: { research: 3e20 }, era: 11, req: ['ism'] },
    { id: 'entropy', name: 'エントロピー', desc: '星が冷えていく。宇宙が、暗くなっていく。', cost: { research: 2e21 }, era: 11, req: ['galaxy'] },
    { id: 'origin', name: '宇宙反応工学', desc: '宇宙そのものが、巨大な反応槽だった。', cost: { research: 5e21 }, era: 11, req: ['entropy'] }
  ]);

  /* ---------------- 改善 ---------------- */
  add(D.upgrades, [
    { id: 'heatswap', name: 'ボイラーの電化', desc: 'ボイラーをヒートポンプに置き換える。濃縮・尿素溶解 +50%', cost: { money: 3e8 }, unlock: { bld: { heatpump: 2 } }, effects: [['bld.conc', 0.5], ['bld.ureadis', 0.5]] },
    { id: 'routeai', name: '配車の最適化', desc: '空いた荷台をなくす。輸送 +50%', cost: { money: 5e8 }, unlock: { bld: { evlorry: 1 } }, effects: [['transport', 0.5]] },
    { id: 'gpu2', name: '新しい計算チップ', desc: 'データセンター +100%', cost: { money: 1e11 }, unlock: { bld: { dc: 3 } }, effects: [['bld.dc', 1]] },
    { id: 'cloudsales', name: 'クラウドの営業', desc: '計算力の注文 ×2', cost: { money: 6e10 }, unlock: { bld: { dc: 2 } }, effects: [['demand.cloud', 1]] },
    { id: 'gridsc', name: '超伝導の送電網', desc: '使える電気 +50%', cost: { money: 2e11 }, unlock: { bld: { fusion: 1 } }, effects: [['power', 0.5]] },
    { id: 'cryo', name: '断熱タンク', desc: 'ロケット燃料・軌道資材の置き場 ×3', cost: { money: 1e12 }, unlock: { bld: { launch: 1 } }, effects: [['cap.fuel', 2], ['cap.orbit', 2]] },
    { id: 'spacecloud', name: '宇宙のクラウド', desc: '計算力の注文 ×2', cost: { money: 3e12 }, unlock: { bld: { orbdc: 2 } }, effects: [['demand.cloud', 2]] },
    { id: 'zerog', name: '無重力の撹拌', desc: '宇宙の反応 +100%', cost: { money: 2e14 }, unlock: { bld: { orbreactor: 2 } }, effects: [['bld.orbreactor', 1], ['bld.marsplant', 1], ['bld.asteroidreactor', 1]] },
    { id: 'stargrade', name: '宇宙規格', desc: '宇宙の街の水道 +100%', cost: { money: 3e14 }, unlock: { bld: { colonywater: 3 } }, effects: [['bld.colonywater', 1], ['bld.outercity', 1]] },
    { id: 'tfboost', name: '温室ガスの工夫', desc: 'テラフォーミングの設備 +50%', cost: { money: 6e14 }, unlock: { bld: { mirror: 2 } }, effects: [['bld.mirror', 0.5], ['bld.airfac', 0.5], ['bld.comet', 0.5], ['bld.algae', 0.5]] },
    { id: 'he3boost', name: '磁場閉じ込めの改良', desc: 'ヘリウム3核融合炉の電気 ×2', cost: { money: 3e16 }, unlock: { bld: { fusion2: 1 } }, effects: [['power', 1]] },
    { id: 'ftl', name: '外惑星の配車網', desc: '外太陽系の採掘 +100%', cost: { money: 4e16 }, unlock: { bld: { europa: 2 } }, effects: [['bld.europa', 1], ['bld.titan', 1], ['bld.jupscoop', 1], ['bld.asteroid', 1]] },
    { id: 'warfac', name: '24時間の軍需工場', desc: '軍需工場 +100%', cost: { money: 2e18 }, unlock: { bld: { warmor: 2 } }, effects: [['bld.wfuel', 1], ['bld.wcool', 1], ['bld.warmor', 1], ['bld.wwater', 1]] },
    { id: 'dyson', name: '星を包む配管', desc: 'すべての生産 ×2', cost: { money: 1e19, star: 1e5 }, unlock: { bld: { starfurnace: 3 } }, effects: [['global', 1]] },
    { id: 'lightcone', name: '光円錐の配車', desc: 'すべての生産 ×2', cost: { money: 3e19, ism: 1e5 }, unlock: { bld: { starlorry: 1 } }, effects: [['global', 1]] }
  ]);

  /* ---------------- 売り物 ---------------- */
  add(D.products, [
    { id: 'cloud', kind: 'direct', src: 'compute', name: '計算力（クラウド）', price: 3e6, demand: 0.6, creditPer: 0.0002 }
  ]);

  /* ---------------- 時代ごとの数 ---------------- */
  D.eraSalary = [0, 0.3, 2.5, 8, 30, 200, 2000, 2e4, 2e5, 2e6, 2e7, 2e8];
  D.consts.wasteFreeEra = [0.05, 0.05, 1, 4, 10, 20, 40, 80, 160, 320, 640, 1280];
  D.calendar.yearSec = [7400, 7400, 6700, 6000, 2900, 9000, 9000, 6000, 4000, 20000, 20000, 1500];

  /* ---------------- 戦争 ----------------
     前線（時代9）：need は1秒あたりに要る物資。補給が足りると前線が進み、足りないと押し戻される。
     星図（時代10）：x,y は0〜100。owner：us / enemy / free。def：守りの強さ */
  D.war = {
    fronts: [
      { id: 'jup', name: '木星前線', need: { w_fuel: 1.0, w_cool: 0.6, w_armor: 0.8, w_water: 0.4 }, ang: -40 },
      { id: 'sat', name: '土星前線', need: { w_fuel: 0.8, w_cool: 0.8, w_armor: 0.6, w_water: 0.6 }, ang: 30 },
      { id: 'ura', name: '天王星前線', need: { w_fuel: 1.2, w_cool: 0.5, w_armor: 1.0, w_water: 0.5 }, ang: 120 },
      { id: 'nep', name: '海王星前線', need: { w_fuel: 1.0, w_cool: 1.0, w_armor: 1.2, w_water: 0.8 }, ang: 210 }
    ],
    frontSpeed: 0.006, frontHold: 0.7, frontStart: 25, needScale: 8,
    ships: [
      { id: 'frigate', name: '護衛艦', cost: { w_armor: 40, w_fuel: 20, w_cool: 10, compute: 2000 }, str: 1, sec: 600 },
      { id: 'cruiser', name: '巡洋艦', cost: { w_armor: 200, w_fuel: 90, w_cool: 50, compute: 1e4 }, str: 6, sec: 1800 },
      { id: 'battleship', name: '戦艦', cost: { w_armor: 900, w_fuel: 400, w_cool: 250, compute: 5e4 }, str: 30, sec: 5400 }
    ],
    /* 艦1隻の強さ1あたり、1秒に使う物資（補給が切れると強さが半分） */
    upkeep: { w_fuel: 0.002, w_cool: 0.001 },
    systems: [
      { id: 'sol', name: '太陽系', x: 12, y: 55, owner: 'us', home: true },
      { id: 'cen', name: 'ケンタウルス', x: 26, y: 38, owner: 'free', def: 0, reward: 1 },
      { id: 'bar', name: 'バーナード', x: 27, y: 70, owner: 'free', def: 0, reward: 1 },
      { id: 'wol', name: 'ウォルフ', x: 40, y: 22, owner: 'enemy', def: 160, reward: 2 },
      { id: 'las', name: 'ラランド', x: 42, y: 52, owner: 'enemy', def: 240, reward: 2 },
      { id: 'sir', name: 'シリウス', x: 41, y: 82, owner: 'enemy', def: 200, reward: 2 },
      { id: 'eps', name: 'エリダヌス', x: 56, y: 35, owner: 'enemy', def: 560, reward: 3 },
      { id: 'tau', name: 'くじら座タウ', x: 57, y: 68, owner: 'enemy', def: 640, reward: 3 },
      { id: 'pro', name: 'プロキオン', x: 70, y: 18, owner: 'enemy', def: 1200, reward: 4 },
      { id: 'alt', name: 'アルタイル', x: 71, y: 50, owner: 'enemy', def: 1680, reward: 4 },
      { id: 'veg', name: 'ベガ', x: 72, y: 84, owner: 'enemy', def: 1400, reward: 4 },
      { id: 'arc', name: 'アークトゥルス', x: 85, y: 33, owner: 'enemy', def: 3600, reward: 5 },
      { id: 'den', name: 'デネブ', x: 86, y: 70, owner: 'enemy', def: 4000, reward: 5 },
      { id: 'cap', name: '敵の母星', x: 95, y: 51, owner: 'enemy', def: 12000, reward: 10, capital: true }
    ],
    lanes: [['sol', 'cen'], ['sol', 'bar'], ['cen', 'bar'], ['cen', 'wol'], ['cen', 'las'], ['bar', 'las'], ['bar', 'sir'], ['wol', 'eps'], ['las', 'eps'], ['las', 'tau'], ['sir', 'tau'],
      ['wol', 'pro'], ['eps', 'pro'], ['eps', 'alt'], ['tau', 'alt'], ['tau', 'veg'], ['sir', 'veg'], ['pro', 'arc'], ['alt', 'arc'], ['alt', 'den'], ['veg', 'den'], ['arc', 'cap'], ['den', 'cap'], ['alt', 'cap']],
    laneSec: 150,
    /* 敵の守りの回復（1秒あたり、もとの守りに対する割合）と、反撃の間隔(秒)・強さ（もとの守りに対する割合） */
    regen: 0.0004, raidSec: 1800, raidStr: 0.6,
    battleK: 0.004
  };

  /* ---------------- 流れの手当て（後半） ---------------- */
  D.flow.fixes.power.push(['bld', 'battery'], ['upg', 'gridsc'], ['bld', 'fusion2']);
  D.flow.fixes.compute = [['bld', 'dc'], ['bld', 'ctower'], ['upg', 'gpu2'], ['bld', 'orbdc'], ['bld', 'coldc']];
  D.flow.fixes.orbit = [['bld', 'launch'], ['tech', 'reusable'], ['bld', 'fuelplant'], ['bld', 'lift']];
  D.flow.fixes.fuel = [['bld', 'fuelplant'], ['bld', 'electrolysis'], ['bld', 'ch4fuel']];

  /* ---------------- 物語（後半） ---------------- */
  add(D.story, [
    { id: 'warfirst', cond: { bld: { warmor: 1 } }, text: '戦時統制。小惑星の鉄も、氷も、まず軍需工場が取る。在庫が1時間分たまれば、工場は休む。' },
    { id: 'alienism', cond: { bld: { alien: 1 } }, text: '異星の商会は、星間物質をいくらでも買う。釜の分まで売ってしまわないように（設備は止められる）。' },
    { id: 'electric', cond: { tech: 'electrify' }, text: '最後のボイラーの火を落とした。工場が、静かになった。' },
    { id: 'drone', cond: { bld: { dronehub: 1 } }, text: '缶が、空を飛んでいく。昔、台車で押した道の上を。' },
    { id: 'era5', cond: { era: 5 }, text: '捨てるものがなくなった。あとは、電気さえあれば。' },
    { id: 'fusion', cond: { bld: { fusion: 1 } }, text: '核融合炉に火が入った。なぜ動くのか、誰もうまく説明できない。でも、動いている。' },
    { id: 'dc', cond: { bld: { dc: 1 } }, text: '電気が、計算に変わる。冷却塔の水は、自分たちの液で澄ませている。' },
    { id: 'ai', cond: { bld: { aiplant: 1 } }, text: 'AIが段取りを組んだ。最初に出した答えは「釜をもう一つ」だった。' },
    { id: 'era6', cond: { era: 6 }, text: 'あの泡を覚えているか。ぽんと鳴った、あの泡を。いま、それで空へ昇る。' },
    { id: 'station', cond: { bld: { station: 1 } }, text: '軌道ステーションに、最初の住人が来た。飲み水の消毒は、地上と同じ次亜塩素酸ソーダ。' },
    { id: 'era7', cond: { era: 7 }, text: '綱を昇って、月へ、金星へ、火星へ。' },
    { id: 'venus', cond: { bld: { venus: 1 } }, text: '金星の雲は硫酸と塩化水素でできている。仕入れ先が一つ増えた。' },
    { id: 'mars', cond: { bld: { marsplant: 1 } }, text: '火星の赤は、酸化鉄の赤だった。溶かせば、いつもの赤褐色の液になる。' },
    { id: 'era8', cond: { era: 8 }, text: '火星に、雨が降った。' },
    { id: 'europa', cond: { bld: { europa: 1 } }, text: 'エウロパの氷を溶かした。地上のどの水より、澄んでいた。' },
    { id: 'signal', cond: { bld: { kuiper: 1 } }, text: '外縁観測所が、規則正しい信号を拾った。自然には、こんな並び方はしない。' },
    { id: 'era9', cond: { era: 9 }, text: '外から来た。木星の衛星が一つ、連絡を絶った。前線が、四つできた。', cls: 'warn' },
    { id: 'firstwin', cond: { flag: 'front_won' }, text: '前線を一つ押し返した。届けた浄水剤の缶に、兵士がありがとうと書いて返してきた。' },
    { id: 'era10', cond: { era: 10 }, text: '造船所に、最初の艦が浮かんだ。こんどは、こちらから行く。', cls: 'warn' },
    { id: 'captured', cond: { flag: 'sys_captured' }, text: '星系を一つ取った。相手の工場の跡に、見慣れた赤褐色の染みがあった。' },
    { id: 'era11', cond: { era: 11 }, text: '敵の母星の地下に、巨大な釜があった。彼らもまた、鉄を溶かしていた。戦争は終わった。' },
    { id: 'ash', cond: { tech: 'nucleo' }, text: 'ずっと、星の灰を溶かしていた。' },
    { id: 'cold', cond: { tech: 'entropy' }, text: '星が、一つずつ消えていく。最後の灯りのそばで、釜はまだ温かい。' }
  ]);

  /* ---------------- 作業メモ（後半） ---------------- */
  add(D.memos, [
    { text: '自動運転のローリーを走らせる', done: { bld: { evlorry: 1 } } },
    { text: '核融合炉に火を入れる', done: { bld: { fusion: 1 } } },
    { text: '計算力を売る', done: { stat: { cloudSold: 1 } } },
    { text: '宇宙港を完成させる', done: { era: 6 } },
    { text: '軌道ステーションに水を届ける', done: { bld: { station: 1 } } },
    { text: '軌道エレベーターを完成させる', done: { era: 7 } },
    { text: '月で鉄を溶かす', done: { bld: { moonplant: 1 } } },
    { text: '火星の赤土を溶かす', done: { bld: { marsplant: 1 } } },
    { text: '火星のテラフォーミングを完成させる', done: { era: 8 } },
    { text: 'エウロパの氷を掘る', done: { bld: { europa: 1 } } },
    { text: 'ヘリオポーズ基地を完成させる', done: { era: 9 } },
    { text: '前線を一つ押し返す', done: { flag: 'front_won' } },
    { text: '4つの前線をすべて押し返す', done: { flag: 'fronts_all' } },
    { text: '反攻艦隊の造船所を完成させる', done: { era: 10 } },
    { text: '星系を一つ取る', done: { flag: 'sys_captured' } },
    { text: '敵の母星を落とす', done: { era: 11 } },
    { text: '恒星炉に火を入れる', done: { bld: { starfurnace: 1 } } },
    { text: '始まりの釜を完成させる', done: { stat: { ended: 1 } } }
  ]);
})();
