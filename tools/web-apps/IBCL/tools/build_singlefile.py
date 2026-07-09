#!/usr/bin/env python3
"""
Build a single-file IBCL release from the modular development files.
Run from the project root:

    python tools/build_singlefile.py

Output:
    dist/IBCL_v2_singlefile.html
"""
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
OUT = ROOT / "dist" / "IBCL_v2_singlefile.html"

soup = BeautifulSoup(INDEX.read_text(encoding="utf-8"), "html.parser")

for link in list(soup.find_all("link", rel="stylesheet")):
    href = link.get("href", "")
    if href.startswith("css/"):
        style = soup.new_tag("style")
        style.string = (ROOT / href).read_text(encoding="utf-8")
        link.replace_with(style)

for script in list(soup.find_all("script")):
    src = script.get("src")
    if src and src.startswith("js/"):
        inline = soup.new_tag("script")
        inline.string = (ROOT / src).read_text(encoding="utf-8")
        script.replace_with(inline)

OUT.parent.mkdir(exist_ok=True)
OUT.write_text(str(soup), encoding="utf-8")
print(f"Built {OUT}")
