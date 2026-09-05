# -*- coding: utf-8 -*-
"""Fill zh_CN .ts entries for the quick effect search feature.

Patches <message> blocks whose <location filename> matches the target
source file, so identical source strings in other contexts stay
untouched. Run from repo root: python tools/patch_ts_quickfx.py
"""
import re
import sys

TS = "src/app/translations/friction_zh_CN.ts"

TRANSLATIONS = {
    "../GUI/quickeffectsearchdialog.cpp": {
        "Search Effects (Ctrl+Space)...": "搜索特效…（Ctrl+Space）",
        "General": "常规",
        "Custom": "自定义",
        "Shader": "着色器",
        "Path Effects": "路径特效",
        "Blend Effects": "混合特效",
        "Transform Effects": "变换特效",
    },
    "../GUI/effectactions.cpp": {
        "Quick Search Effects...": "快速搜索特效...",
        "Quick Search Effects (AE: FX Console)": "快速搜索特效（AE：FX 控制台）",
        "General": "常规",
        "Custom": "自定义",
        "Shader": "着色器",
        "Path Effects": "路径特效",
        "Fill Effects": "填充特效",
        "Outline Base Effects": "描边基础特效",
        "Outline Effects": "描边特效",
        "Blend Effects": "混合特效",
        "Transform Effects": "变换特效",
        " (Raster Effect)": "（光栅特效）",
        " (Path Effect)": "（路径特效）",
        " (Fill Effect)": "（填充特效）",
        " (Outline Base Effect)": "（描边基础特效）",
        " (Outline Effect)": "（描边特效）",
        " (Blend Effect)": "（混合特效）",
        " (Transform Effect)": "（变换特效）",
    },
}

def main():
    with open(TS, "r", encoding="utf-8") as f:
        content = f.read()

    patched = 0
    missed = []

    def patch_block(match):
        nonlocal patched
        block = match.group(0)
        loc = re.search(r'<location filename="([^"]+)"', block)
        src = re.search(r"<source>(.*?)</source>", block, re.DOTALL)
        if not loc or not src:
            return block
        table = TRANSLATIONS.get(loc.group(1))
        if not table:
            return block
        key = src.group(1)
        if key not in table:
            return block
        new_tr = "<translation>%s</translation>" % table[key]
        block2, n = re.subn(
            r'<translation(?: type="unfinished")?(?:>.*?</translation>|/>)',
            new_tr, block, count=1, flags=re.DOTALL)
        if n:
            patched += 1
        return block2

    content = re.sub(r"<message>.*?</message>", patch_block,
                     content, flags=re.DOTALL)

    # report any requested keys that were not found in the ts
    with open(TS, "r", encoding="utf-8") as f:
        ts = f.read()
    for fname, table in TRANSLATIONS.items():
        for key in table:
            pat = ('<location filename="%s"' % fname,
                   "<source>%s</source>" % key)
            ok = False
            for m in re.finditer(r"<message>.*?</message>", ts, re.DOTALL):
                if pat[0] in m.group(0) and pat[1] in m.group(0):
                    ok = True
                    break
            if not ok:
                missed.append("%s :: %s" % (fname, key))

    with open(TS, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)

    print("patched:", patched)
    if missed:
        print("NOT FOUND:")
        for m in missed:
            print(" ", m)
        sys.exit(1)

if __name__ == "__main__":
    main()
