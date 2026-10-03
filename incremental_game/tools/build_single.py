"""index.html と css/js をまとめて、1つのHTMLファイル（dist/taiki_minigame.html）にする。

使い方:  python tools/build_single.py
（ゲームを遊ぶだけなら不要。dist/ にできあがったものが入っている）
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "dist" / "taiki_minigame.html"


def main():
    html = (ROOT / "index.html").read_text(encoding="utf-8")

    def css(m):
        text = (ROOT / m.group(1)).read_text(encoding="utf-8")
        return "<style>\n" + text + "\n</style>"

    def js(m):
        text = (ROOT / m.group(1)).read_text(encoding="utf-8")
        # </script> が文字列に含まれていても壊れないように
        text = text.replace("</script", "<\\/script")
        return "<script>\n" + text + "\n</script>"

    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css, html)
    html = re.sub(r'<script src="([^"]+)"></script>', js, html)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print("wrote", OUT, f"{OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
