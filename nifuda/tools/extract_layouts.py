"""伝発名人のリポジトリ書き出し(repositorydata.xml)から帳票レイアウトを抜き出す。

使い方: python extract_layouts.py repositorydata.xml > ../帳票レイアウト.md
座標・サイズの単位はすべて 0.01mm（伝発名人の内部単位）。
"""
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict

# 新システムで使う予定の帳票（帳票コード: 用途）
TARGETS = {
    "4000001": "荷札（送状シール）",
    "4000003": "送り状 博運社",
    "4000008": "送り状 九州西濃運輸",
    "4000011": "送り状 JPロジスティクス（旧TOLL）",
    "4000005": "送り状 壱岐海運",
    "4000004": "送り状 野母商船",
    "3000011": "荷札（過水送状シール）",
    "3000007": "送り状 博運社（過水）",
    "3000012": "送り状 九州西濃運輸（過水）",
    "3000014": "送り状 JPロジスティクス（過水）",
}
SYS_OF = {"3": "出荷伝票", "4": "送り状"}


def rows(root, tag):
    for e in root.findall(tag):
        yield {x.tag: (x.text or "") for x in e}


def main(path):
    root = ET.parse(path).getroot()
    items = {(r["SysNo"], r["ItemNo"]): r["ItemName"] for r in rows(root, "emi_ItemInfo")}
    fmt = {r["FormatCD"]: r for r in rows(root, "emi_FormatInfo")}
    field = {(r["FormatCD"], r["FieldID"]): r for r in rows(root, "emi_FormatFieldInfo")}
    edit = {(r["FormatCD"], r["FieldID"]): r for r in rows(root, "emi_FormatStringEditInfo")}
    mapping = defaultdict(dict)
    for r in rows(root, "emi_FormatItemMapping"):
        # 同じ帳票が出荷伝票・送り状の両システムに紐付く場合がある。フィールドIDで重複排除
        mapping[r["FormatCD"]].setdefault(r["FieldID"], r)

    print("# 帳票レイアウト（伝発名人 設定より自動抽出）\n")
    print("単位: 0.01mm。X/Y は用紙左上からの位置。文字数は全角換算の最大桁。\n")
    for cd, label in TARGETS.items():
        f = fmt.get(cd)
        if not f:
            continue
        print(f"## {cd} {f['FormatName']}（{label}）\n")
        print(f"- 用紙: 幅 {f['PaperWidth']} × 高さ {f['PaperHeight']}"
              f"（{int(f['PaperWidth'])/100:g}mm × {int(f['PaperHeight'])/100:g}mm）")
        print(f"- 明細行数: {f['MeisaiCount']} / 既定フォント: {f['FontName']} {f['FontSize']}\n")
        print("| No | 項目 | X | Y | 幅 | 高さ | 明細繰返 | 文字数 | 書式 | 文字サイズ | 文字間隔 |")
        print("|---|---|---|---|---|---|---|---|---|---|---|")
        for fid, m in sorted(mapping[cd].items(), key=lambda kv: int(kv[0])):
            fl = field.get((cd, fid), {})
            ed = edit.get((cd, fid), {})
            name = items.get((m["SysNo"], m["ItemNo"]), m["FixedData"] or m["ItemNo"])
            print(f"| {fid} | {name} | {fl.get('StartPosX','')} | {fl.get('StartPosY','')} "
                  f"| {fl.get('AreaWidth','')} | {fl.get('AreaHeight','')} | {fl.get('RepeatNo','')} "
                  f"| {ed.get('LenUpper','')} | {ed.get('FormatString','')} "
                  f"| {ed.get('FontSize','') or '既定'} | {ed.get('StringPitch','') or '-'} |")
        print()


if __name__ == "__main__":
    main(sys.argv[1])
