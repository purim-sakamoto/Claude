// node safety_shield/build.js <出力先.html> [--fragment]
// CSS/JSをすべて埋め込んだ1ファイル版を作る。--fragment は <html>/<head>/<body> を付けない(埋め込み用)
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const out = process.argv[2] || path.join(dir, 'safety_shield.html');
const fragment = process.argv.includes('--fragment');
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${fs.readFileSync(path.join(dir, 'style.css'), 'utf8')}</style>`);
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, f) => `<script>\n${fs.readFileSync(path.join(dir, f), 'utf8')}</script>`);
if (fragment) {
  html = html.replace(/<!doctype html>\s*<html[^>]*>\s*<head>\s*/i, '')
    .replace(/<meta charset="utf-8">\s*<meta name="viewport"[^>]*>\s*/, '')
    .replace(/<\/head>\s*<body>\s*/, '')
    .replace(/<\/body>\s*<\/html>\s*$/, '');
}
fs.writeFileSync(out, html);
console.log('wrote', out, (html.length / 1024).toFixed(1) + 'KB');
