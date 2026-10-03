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

  /* 数値を日本語の命数で整形する。expo=true なら指数表記 */
  function fmt(n, expo) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    if (!isFinite(n)) return '∞';
    var neg = n < 0; if (neg) n = -n;
    var out;
    if (n < 1e4) {
      out = n >= 100 ? trim(Math.floor(n), 0) : n >= 10 ? trim(n, 1) : trim(n, 2);
    } else if (expo) {
      out = n.toExponential(2).replace('e+', 'e');
    } else {
      out = null;
      for (var i = 0; i < UNITS.length; i++) {
        if (n >= UNITS[i][0]) {
          var v = n / UNITS[i][0];
          out = (v >= 1000 ? trim(v, 0) : v >= 100 ? trim(v, 1) : trim(v, 2)) + UNITS[i][1];
          break;
        }
      }
      if (out === null) out = n.toExponential(2);
    }
    return (neg ? '-' : '') + out;
  }

  /* 毎秒の値。小さい値は分あたりで見せる */
  function fmtRate(r, expo) {
    if (Math.abs(r) < 1e-9) return '';
    var sign = r > 0 ? '+' : '';
    if (Math.abs(r) < 0.1) return sign + fmt(r * 60, expo) + '/分';
    return sign + fmt(r, expo) + '/秒';
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

  return { fmt: fmt, fmtRate: fmtRate, fmtTime: fmtTime, clamp: clamp, el: el, rng: rng, deepCopy: deepCopy };
})();
