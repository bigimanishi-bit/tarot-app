# download_rws.py
# Wikimedia Commons (Special:FilePath) からRWS画像を落として public/cards/rws/*.jpg に保存
# - 404でも止まらない（最後に失敗一覧）
# - 既に存在するファイルはスキップ

import os
import re
import time
import urllib.request
import urllib.parse
from urllib.error import HTTPError, URLError

OUT_DIR = os.path.join("public", "cards", "rws")
os.makedirs(OUT_DIR, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) tarot-app-rws-downloader"
}

def out_path(filename: str) -> str:
    return os.path.join(OUT_DIR, filename)

def commons_file_url(filename: str) -> str:
    # スペースなどをURLエンコード（大アルカナで必須）
    return "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(filename)

# download_rws.py
# Wikimedia Commons (Special:FilePath) からRWS画像を落として public/cards/rws/*.jpg に保存
# - 404でも止まらない（最後に失敗一覧）
# - 既に存在するファイルはスキップ
# ✅ 重要：スペース入りファイル名はURLエンコード必須

import os
import time
import urllib.request
import urllib.parse
from urllib.error import HTTPError, URLError

OUT_DIR = os.path.join("public", "cards", "rws")
os.makedirs(OUT_DIR, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) tarot-app-rws-downloader"
}

def out_path(filename: str) -> str:
    return os.path.join(OUT_DIR, filename)

def commons_file_url(filename: str) -> str:
    # ✅ スペース等をURLエンコード
    return "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(filename)

def fetch(url: str, dst_path: str, tries: int = 3) -> bool:
    # 既にあるならスキップ
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

# ---- mapping ----

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
    # ✅ Pentacles は Commons 側が Pents01.jpg 系
    ("Pents", [
        "ace-of-pentacles","two-of-pentacles","three-of-pentacles","four-of-pentacles","five-of-pentacles","six-of-pentacles","seven-of-pentacles",
        "eight-of-pentacles","nine-of-pentacles","ten-of-pentacles","page-of-pentacles","knight-of-pentacles","queen-of-pentacles","king-of-pentacles"
    ]),
]

# Major Arcana（スペース入り、quote必須）
MAJORS = [
    ("RWS Tarot 00 Fool.jpg", "the-fool.jpg"),
    ("RWS Tarot 01 Magician.jpg", "the-magician.jpg"),
    ("RWS Tarot 02 High Priestess.jpg", "the-high-priestess.jpg"),
    ("RWS Tarot 03 Empress.jpg", "the-empress.jpg"),
    ("RWS Tarot 04 Emperor.jpg", "the-emperor.jpg"),
    ("RWS Tarot 05 Hierophant.jpg", "the-hierophant.jpg"),
    ("RWS Tarot 06 Lovers.jpg", "the-lovers.jpg"),
    ("RWS Tarot 07 Chariot.jpg", "the-chariot.jpg"),
    ("RWS Tarot 08 Strength.jpg", "strength.jpg"),
    ("RWS Tarot 09 Hermit.jpg", "the-hermit.jpg"),
    ("RWS Tarot 10 Wheel of Fortune.jpg", "wheel-of-fortune.jpg"),
    ("RWS Tarot 11 Justice.jpg", "justice.jpg"),
    ("RWS Tarot 12 Hanged Man.jpg", "the-hanged-man.jpg"),
    ("RWS Tarot 13 Death.jpg", "death.jpg"),
    ("RWS Tarot 14 Temperance.jpg", "temperance.jpg"),
    ("RWS Tarot 15 Devil.jpg", "the-devil.jpg"),
    ("RWS Tarot 16 Tower.jpg", "the-tower.jpg"),
    ("RWS Tarot 17 Star.jpg", "the-star.jpg"),
    ("RWS Tarot 18 Moon.jpg", "the-moon.jpg"),
    ("RWS Tarot 19 Sun.jpg", "the-sun.jpg"),
    ("RWS Tarot 20 Judgement.jpg", "judgement.jpg"),
    ("RWS Tarot 21 World.jpg", "the-world.jpg"),
]

def main():
    failed = []

    # 1) Minor Arcana
    for suit, slugs in SUITS:
        for idx, slug in enumerate(slugs, start=1):
            dst = out_path(f"{slug}.jpg")

            # ✅ Nine of Wands は別名のことがあるので候補を固定で用意
            if suit == "Wands" and idx == 9:
                candidates = [
                    "Wands09.jpg",
                    "WANDS09.jpg",
                    "WANDS09-1.jpg",
                    "Tarot Nine of Wands.jpg",
                    "RWS1909 - Wands 09.jpeg",
                ]
                try:
                    used = fetch_any(candidates, dst)
                    print(f"DL: Wands09 (special:{used}) -> {dst}")
                except Exception as e:
                    print(f"NG: Wands09 -> {dst} ({e})")
                    failed.append(("Wands09", dst, str(e)))
                continue

            src = f"{suit}{idx:02d}.jpg"  # Cups01.jpg, Wands09.jpg, Swords01.jpg, Pents01.jpg ...
            try:
                used = fetch_any([src, src.upper(), src.lower()], dst)
                print(f"DL: {src} ({used}) -> {dst}")
            except Exception as e:
                print(f"NG: {src} -> {dst} ({e})")
                failed.append((src, dst, str(e)))

    # 2) Major Arcana（✅ 余計な候補は作らない：a.jpg とか絶対足さない）
    for src, outname in MAJORS:
        dst = out_path(outname)
        try:
            used = fetch_any([src], dst)
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