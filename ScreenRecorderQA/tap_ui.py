import re
import sys
import xml.etree.ElementTree as ET

if len(sys.argv) < 4:
    raise SystemExit("usage: tap_ui.py <xml> <regex> <app_package>")

xml_path, pattern, app = sys.argv[1:4]
rx = re.compile(pattern, re.I)
root = ET.parse(xml_path).getroot()
candidates = []

for node in root.iter("node"):
    text = (node.attrib.get("text", "") + " " + node.attrib.get("content-desc", "")).strip()
    pkg = node.attrib.get("package", "")
    rid = node.attrib.get("resource-id", "")
    if not (rx.search(text) or rx.search(rid)):
        continue
    m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
    if not m:
        continue
    x1, y1, x2, y2 = map(int, m.groups())
    score = 0 if pkg != app else 10
    if rid.endswith("button1") or "start_now" in rid.lower():
        score -= 5
    candidates.append((score, (x1+x2)//2, (y1+y2)//2, text, pkg, rid))

if not candidates:
    raise SystemExit(4)

candidates.sort()
_, x, y, *_ = candidates[0]
print(x, y)
