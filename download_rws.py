# download_rws.py
# Wikimedia Commons (Special:FilePath) からRWS画像を落として public/cards/rws/*.jpg に保存
# - 404でも止まらない（最後に失敗一覧）
# - 既に存在するファイルはスキップ
# 注意：Commonsに存在するファイル名に依存します。足りない場合はFAILED一覧から追加します。

import os
import re
import time
import urllib.request
from urllib.error import HTTPError, URLError

OUT_DIR = os.path.join("public", "cards", "rws")
os.makedirs(OUT_DIR, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) tarot-app-rws-downloader"
}

def slugify(name: str) -> str:
    s = name.lower()
    s = s.replace("’", "").replace("'", "")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"^-+|-+$", "", s)
    return s

def out_path(filename: str) -> str:
    return os.path.join(OUT_DIR, filename)

def commons_file_url(filename: str) -> str:
    # Special:FilePath はリダイレクトして実体ファイルへ飛ぶ
    # 例: https://commons.wikimedia.org/wiki/Special:FilePath/Cups01.jpg
    return "https://commons.wikimedia.org/wiki/Special:FilePath/" + filename

def fetch(url: str, dst_path: str, tries: int = 3) -> bool:
    if os.path.exists(dst_path) and os.path.getsize(dst_path) > 0:
        return True

    last_err = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            os.makedirs(os.path.dirname(dst_path), exist_ok=True)
            with open(dst_path, "wb") as f:
                f.write(data)
            return True
        except (HTTPError, URLError) as e:
            last_err = e
            time.sleep(0.6 + i * 0.6)
        except Exception as e:
            last_err = e
            time.sleep(0.6 + i * 0.6)

    raise last_err

def fetch_any(filenames, dst_path: str) -> str:
    last = None
    for fn in filenames:
        try:
            ok = fetch(commons_file_url(fn), dst_path)
            if ok:
                return fn
        except Exception as e:
            last = e
            continue
    if last:
        raise last
    raise Exception("no candidates")

def candidates_for(src: str):
    # ありがちな揺れを候補にする
    base = src
    cands = {base}

    # 大文字小文字
    cands.add(base.lower())
    cands.add(base.upper())

    # 拡張子
    if base.lower().endswith(".jpg"):
        cands.add(base[:-4] + ".JPG")
        cands.add(base[:-4] + ".jpeg")
        cands.add(base[:-4] + ".png")
        cands.add(base[:-4] + ".PNG")

    # 09 vs 9
    cands.add(re.sub(r"(\D)0([1-9])(\D|$)", r"\1\2\3", base))

    # suit単数形
    cands.add(base.replace("Wands", "Wand"))
    cands.add(base.replace("Cups", "Cup"))
    cands.add(base.replace("Swords", "Sword"))
    cands.add(base.replace("Pentacles", "Pentacle"))

    # 区切り
    cands.add(base.replace("Wands", "Wands_"))
    cands.add(base.replace("Cups", "Cups_"))
    cands.add(base.replace("Swords", "Swords_"))
    cands.add(base.replace("Pentacles", "Pentacles_"))
    cands.add(base.replace("Wands", "Wands-"))
    cands.add(base.replace("Cups", "Cups-"))
    cands.add(base.replace("Swords", "Swords-"))
    cands.add(base.replace("Pentacles", "Pentacles-"))

    # a / -1
    extra = set()
    for v in list(cands):
        if v.lower().endswith(".jpg"):
            extra.add(v[:-4] + "a.jpg")
            extra.add(v[:-4] + "-1.jpg")
            extra.add(v[:-4] + "_1.jpg")
            extra.add(v[:-4] + "01.jpg")
    cands |= extra

    return [c for c in sorted(cands) if c]

# ---- mapping ----
# Majorは Commons 側の命名が揺れやすいので、ここはまずスーツのみ落とす（確実に進める）
SUITS = [
    ("Cups", [
        "ace-of-cups","two-of-cups","three-of-cups","four-of-cups","five-of-cups","six-of-cups","seven-of-cups",
        "eight-of-cups","nine-of-cups","ten-of-cups","page-of-cups","knight-of-cups","queen-of-cups","king-of-cups"
    ]),
    ("Wands", [
        "ace-of-wands","two-of-wands","three-of-wands","four-of-wands","five-of-wands","six-of-wands","seven-of-wands",
        "eight-of-wands","nine-of-wands","ten-of-wands","page-of-wands","knight-of-wands","queen-of-wands","king-of-wands"
    ]),
    ("Swords", [
        "ace-of-swords","two-of-swords","three-of-swords","four-of-swords","five-of-swords","six-of-swords","seven-of-swords",
        "eight-of-swords","nine-of-swords","ten-of-swords","page-of-swords","knight-of-swords","queen-of-swords","king-of-swords"
    ]),
    ("Pentacles", [
        "ace-of-pentacles","two-of-pentacles","three-of-pentacles","four-of-pentacles","five-of-pentacles","six-of-pentacles","seven-of-pentacles",
        "eight-of-pentacles","nine-of-pentacles","ten-of-pentacles","page-of-pentacles","knight-of-pentacles","queen-of-pentacles","king-of-pentacles"
    ]),
]

def main():
    failed = []

    for suit, slugs in SUITS:
        for idx, slug in enumerate(slugs, start=1):
            src = f"{suit}{idx:02d}.jpg"  # Cups01.jpg, Wands09.jpg ...
            dst = out_path(f"{slug}.jpg")
            try:
                used = fetch_any(candidates_for(src), dst)
                print(f"DL: {src} ({used}) -> {dst}")
            except Exception as e:
                print(f"NG: {src} -> {dst} ({e})")
                failed.append((src, dst, str(e)))

    print("\n=== DONE ===")
    if failed:
        print(f"FAILED: {len(failed)}")
        for s, d, e in failed:
            print(f"- {s} => {d}  ({e})")
    else:
        print("ALL OK")

if __name__ == "__main__":
    main()