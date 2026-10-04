/* 汎用関数。全ファイル共通の名前空間 TM を用意する（file:// で動かすため ES Modules は使わない） */
var TM = window.TM = window.TM || {};

TM.util = (function () {
  var UNITS = [
    [1e68, '無量大数'], [1e64, '不可思議'], [1e60, '那由他'], [1e56, '阿僧祇'], [1e52, '恒河沙'],
    [1e48, '極'], [1e44, '載'], [1e40, '正'], [1e36, '澗'], [1e32, '溝'], [1e28, '穣'],
    [1e24, '𥝱'], [1e20, '垓'], [1e16, '京'], [1e12, '兆'], [1e8, '億'], [1e4, '万']
  ];

  function trim(x, digits) {
    var s = x.toFixed(digits);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  /* 大きな数の書き方。'eng'：指数（工学表記。12.3e9 のように指数を3の倍数にそろえる）、'jp'：万・億・兆… */
  var mode = { v: 'eng' };
  function setMode(m) { mode.v = m === 'jp' ? 'jp' : 'eng'; }
  function eng(n, fixed) {
    var e = Math.floor(Math.log10(n) / 3) * 3, m = n / Math.pow(10, e);
    var dg = m >= 100 ? 0 : m >= 10 ? 1 : 2, t = m.toFixed(dg);
    if (+t >= 1000) { e += 3; m = n / Math.pow(10, e); t = m.toFixed(2); }
    if (!fixed && t.indexOf('.') >= 0) t = t.replace(/0+$/, '').replace(/\.$/, '');
    return t + 'e' + e;
  }
  function big(n, fixed) {
    if (mode.v === 'eng') return eng(n, fixed);
    for (var i = 0; i < UNITS.length; i++) {
      if (n >= UNITS[i][0]) {
        var v = n / UNITS[i][0];
        return fixed ? v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2) + UNITS[i][1] : (v >= 1000 ? trim(v, 0) : v >= 100 ? trim(v, 1) : trim(v, 2)) + UNITS[i][1];
      }
    }
    return n.toExponential(2);
  }

  /* 数値を整形する（1万未満はそのまま、それより大きい数は big() の書き方） */
  function fmt(n) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    if (!isFinite(n)) return '∞';
    var neg = n < 0; if (neg) n = -n;
    var out = n < 1e4 ? (n >= 100 ? trim(Math.floor(n), 0) : n >= 10 ? trim(n, 1) : trim(n, 2)) : big(n, false);
    return (neg ? '-' : '') + out;
  }

  /* 桁の決まった数（0.10 / 1.20 / 12.0 / 120）。末尾の0を落とさないので、値が揺れても幅が変わらない */
  function fmtFixed(n) {
    if (!isFinite(n)) return '∞';
    var neg = n < 0; if (neg) n = -n;
    var out;
    if (n < 10) out = n.toFixed(2);
    else if (n < 100) out = n.toFixed(1);
    else if (n < 1e4) out = String(Math.round(n));
    else out = big(n, true);
    return (neg ? '-' : '') + out;
  }

  /* 毎秒の値。小さい値は分あたりで見せる。key を渡すと、/秒 と /分 の切り替えに幅を持たせる（行ったり来たりしない） */
  var rateUnit = {};
  function fmtRate(r, expo, key) {
    if (Math.abs(r) < 1e-9) return '';
    var sign = r > 0 ? '+' : '', a = Math.abs(r), perMin;
    if (key) {
      var prev = rateUnit[key];
      perMin = prev === 'm' ? a < 0.15 : prev === 's' ? a < 0.07 : a < 0.1;
      rateUnit[key] = perMin ? 'm' : 's';
    } else perMin = a < 0.1;
    if (perMin) return sign + fmtFixed(r * 60, expo) + '/分';
    return sign + fmtFixed(r, expo) + '/秒';
  }

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) return '—';
    sec = Math.ceil(sec);
    if (sec < 60) return sec + '秒';
    if (sec < 3600) return Math.floor(sec / 60) + '分' + (sec % 60 ? (sec % 60) + '秒' : '');
    if (sec < 86400) return Math.floor(sec / 3600) + '時間' + Math.floor((sec % 3600) / 60) + '分';
    return Math.floor(sec / 86400) + '日' + Math.floor((sec % 86400) / 3600) + '時間';
  }

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    if (children) for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (c === null || c === undefined) continue;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  }

  /* 決定的な乱数（シミュレータで再現性を持たせる） */
  function rng(state) {
    state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
    return state.seed / 4294967296;
  }

  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

  return { setMode: setMode, fmt: fmt, fmtFixed: fmtFixed, fmtRate: fmtRate, fmtTime: fmtTime, clamp: clamp, el: el, rng: rng, deepCopy: deepCopy };
})();
