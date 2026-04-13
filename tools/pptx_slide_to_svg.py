#!/usr/bin/env python3
"""
Extract vector-ish content from a PPTX slide (Office Open XML) to a standalone SVG.

Maps sp (auto shapes + text), cxnSp (connectors/lines), and grpSp transforms
using a:xfrm off/ext/chOff/chExt. Skips pictures (pic) by default.

Usage:
  python3 tools/pptx_slide_to_svg.py path/to/deck.pptx 1 -o web/profile-viewer/images/aep-architecture-slide1.svg

Slide index is 1-based (first slide = 1).
"""
from __future__ import annotations

import argparse
import html
import sys
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Callable, List, Optional, Tuple

EMU_PER_PT = 12700.0

NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def local(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def q(ns: str, name: str) -> str:
    return f"{{{NS[ns]}}}{name}"


@dataclass
class GroupXfrm:
    off_x: int
    off_y: int
    ext_cx: int
    ext_cy: int
    ch_off_x: int
    ch_off_y: int
    ch_ext_cx: int
    ch_ext_cy: int

    def is_degenerate(self) -> bool:
        return self.ch_ext_cx <= 0 or self.ch_ext_cy <= 0 or self.ext_cx <= 0 or self.ext_cy <= 0


def parse_xfrm(el: ET.Element) -> Optional[Tuple[int, int, int, int]]:
    """Return off_x, off_y, ext_cx, ext_cy or None."""
    sp_pr = None
    if local(el.tag) == "sp":
        sp_pr = el.find("p:spPr", NS) or el.find(q("p", "spPr"))
    elif local(el.tag) == "cxnSp":
        sp_pr = el.find("p:spPr", NS) or el.find(q("p", "spPr"))
    elif local(el.tag) == "pic":
        sp_pr = el.find("p:spPr", NS) or el.find(q("p", "spPr"))
    if sp_pr is None:
        return None
    xfrm = sp_pr.find("a:xfrm", NS) or sp_pr.find(q("a", "xfrm"))
    if xfrm is None:
        return None
    off = xfrm.find("a:off", NS) or xfrm.find(q("a", "off"))
    ext = xfrm.find("a:ext", NS) or xfrm.find(q("a", "ext"))
    if off is None or ext is None:
        return None
    return (
        int(off.get("x", "0")),
        int(off.get("y", "0")),
        int(ext.get("cx", "0")),
        int(ext.get("cy", "0")),
    )


def parse_group_xfrm(grp_el: ET.Element) -> Optional[GroupXfrm]:
    grp_sp_pr = grp_el.find("p:grpSpPr", NS) or grp_el.find(q("p", "grpSpPr"))
    if grp_sp_pr is None:
        return None
    xfrm = grp_sp_pr.find("a:xfrm", NS) or grp_sp_pr.find(q("a", "xfrm"))
    if xfrm is None:
        return None
    off = xfrm.find("a:off", NS) or xfrm.find(q("a", "off"))
    ext = xfrm.find("a:ext", NS) or xfrm.find(q("a", "ext"))
    ch_off = xfrm.find("a:chOff", NS) or xfrm.find(q("a", "chOff"))
    ch_ext = xfrm.find("a:chExt", NS) or xfrm.find(q("a", "chExt"))
    if not all([off, ext, ch_off, ch_ext]):
        return None
    return GroupXfrm(
        int(off.get("x", "0")),
        int(off.get("y", "0")),
        int(ext.get("cx", "0")),
        int(ext.get("cy", "0")),
        int(ch_off.get("x", "0")),
        int(ch_off.get("y", "0")),
        int(ch_ext.get("cx", "0")),
        int(ch_ext.get("cy", "0")),
    )


def map_through_groups(
    ox: int, oy: int, cx: int, cy: int, groups: List[GroupXfrm]
) -> Tuple[float, float, float, float]:
    """Map a rect from inner group space to slide EMU. groups: innermost -> outermost."""
    x, y, w, h = float(ox), float(oy), float(cx), float(cy)
    for g in groups:
        if g.is_degenerate():
            # Skip bad / placeholder group xfrm (common root grpSpPr with zeros)
            continue
        sx = g.ext_cx / g.ch_ext_cx
        sy = g.ext_cy / g.ch_ext_cy
        x = g.off_x + (x - g.ch_off_x) * sx
        y = g.off_y + (y - g.ch_off_y) * sy
        w = w * sx
        h = h * sy
    return x, y, w, h


def solid_fill_color(sp_pr: ET.Element) -> Optional[str]:
    if sp_pr is None:
        return None
    solid = sp_pr.find(".//a:solidFill", NS)
    if solid is None:
        return None
    srgb = solid.find("a:srgbClr", NS)
    if srgb is not None and "val" in srgb.attrib:
        return "#" + srgb.attrib["val"]
    return None


def line_style(sp_pr: ET.Element) -> Tuple[Optional[str], float]:
    """Return stroke color (#RRGGBB or None) and width in EMU."""
    if sp_pr is None:
        return None, 9525.0
    ln = sp_pr.find("a:ln", NS)
    if ln is None:
        return None, 9525.0
    w = float(ln.get("w", "9525"))
    solid = ln.find("a:solidFill/a:srgbClr", NS)
    if solid is not None and "val" in solid.attrib:
        return "#" + solid.attrib["val"], w
    return "#888888", w


def extract_text(sp_el: ET.Element) -> str:
    parts: List[str] = []
    tx = sp_el.find("p:txBody", NS) or sp_el.find(q("p", "txBody"))
    if tx is None:
        return ""
    for t in tx.iter():
        if local(t.tag) == "t" and t.text:
            parts.append(t.text)
        elif local(t.tag) == "t" and not t.text and (t.text is None):
            continue
    return " ".join(parts).strip()


def preset_geom_name(sp_pr: ET.Element) -> Optional[str]:
    if sp_pr is None:
        return None
    pg = sp_pr.find("a:prstGeom", NS)
    if pg is None:
        return None
    return pg.get("prst")


def slide_size_emu(z: zipfile.ZipFile) -> Tuple[int, int]:
    root = ET.fromstring(z.read("ppt/presentation.xml"))
    for el in root.iter():
        if local(el.tag) == "sldSz":
            return int(el.get("cx", "0")), int(el.get("cy", "0"))
    return 12192000, 6858000


def slide_xml_path(slide_1based: int) -> str:
    return f"ppt/slides/slide{slide_1based}.xml"


def cxn_line_points(
    off_x: int, off_y: int, ext_cx: int, ext_cy: int
) -> Tuple[float, float, float, float]:
    """Straight connector: line from (off) to (off+ext). Handles zero width/height."""
    x1, y1 = float(off_x), float(off_y)
    x2, y2 = x1 + float(ext_cx), y1 + float(ext_cy)
    return x1, y1, x2, y2


def walk_sp_tree(
    node: ET.Element,
    groups: List[GroupXfrm],
    emit_rect: Callable[..., None],
    emit_line: Callable[..., None],
    emit_text: Callable[..., None],
    skip_pics: bool,
) -> None:
    tag = local(node.tag)
    if tag == "grpSp":
        gx = parse_group_xfrm(node)
        if gx is not None and not gx.is_degenerate():
            gnext = groups + [gx]
        else:
            gnext = groups
        for ch in list(node):
            if local(ch.tag) in ("nvGrpSpPr", "grpSpPr"):
                continue
            walk_sp_tree(ch, gnext, emit_rect, emit_line, emit_text, skip_pics)
        return

    if tag == "sp":
        xf = parse_xfrm(node)
        if xf is None:
            return
        ox, oy, ecx, ecy = xf
        sx, sy, sw, sh = map_through_groups(ox, oy, ecx, ecy, groups)
        sp_pr = node.find("p:spPr", NS) or node.find(q("p", "spPr"))
        fill = solid_fill_color(sp_pr) if sp_pr is not None else None
        prst = preset_geom_name(sp_pr) if sp_pr is not None else None
        text = extract_text(node)
        emit_rect(sx, sy, sw, sh, fill, prst, text)
        return

    if tag == "cxnSp":
        xf = parse_xfrm(node)
        if xf is None:
            return
        ox, oy, ecx, ecy = xf
        x1, y1, x2, y2 = cxn_line_points(ox, oy, ecx, ecy)
        sx1, sy1, _, _ = map_through_groups(int(x1), int(y1), 0, 0, groups)
        sx2, sy2, _, _ = map_through_groups(int(x2), int(y2), 0, 0, groups)
        sp_pr = node.find("p:spPr", NS) or node.find(q("p", "spPr"))
        stroke, sw_emu = line_style(sp_pr) if sp_pr is not None else (None, 9525.0)
        emit_line(sx1, sy1, sx2, sy2, stroke, max(3175.0, sw_emu))
        return

    if tag == "pic" and not skip_pics:
        # Placeholder: could resolve r:embed to image — skipped by default
        return


def pptx_slide_to_svg(zpath: str, slide_1based: int, skip_pics: bool = True) -> str:
    with zipfile.ZipFile(zpath, "r") as z:
        sw, sh = slide_size_emu(z)
        xml = z.read(slide_xml_path(slide_1based))
    root = ET.fromstring(xml)
    c_sld = root.find("p:cSld", NS) or root.find(q("p", "cSld"))
    if c_sld is None:
        raise SystemExit("Invalid slide: no cSld")
    sp_tree = c_sld.find("p:spTree", NS) or c_sld.find(q("p", "spTree"))
    if sp_tree is None:
        raise SystemExit("Invalid slide: no spTree")

    rects: List[dict] = []
    lines: List[dict] = []
    labels: List[dict] = []

    def emit_rect(
        x: float,
        y: float,
        w: float,
        h: float,
        fill: Optional[str],
        prst: Optional[str],
        text: str,
    ) -> None:
        if w < 1 and h < 1:
            return
        rects.append(
            {"x": x, "y": y, "w": w, "h": h, "fill": fill, "prst": prst, "text": text}
        )
        if text and w > 20000 and h > 8000:
            labels.append({"x": x, "y": y, "w": w, "h": h, "text": text})

    def emit_line(
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        stroke: Optional[str],
        sw_emu: float,
    ) -> None:
        lines.append(
            {
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "stroke": stroke or "#999999",
                "sw": max(3175.0, sw_emu),
            }
        )

    def emit_text_stub(*_a, **_k):
        pass

    # Root group on slide often has dummy xfrm; children use slide coords inside nested groups.
    for ch in list(sp_tree):
        lt = local(ch.tag)
        if lt in ("nvGrpSpPr", "grpSpPr"):
            continue
        walk_sp_tree(ch, [], emit_rect, emit_line, emit_text_stub, skip_pics)

    # Build SVG
    out: List[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {sw} {sh}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">',
        f'  <rect x="0" y="0" width="{sw}" height="{sh}" fill="#ffffff"/>',
        '  <g id="connectors">',
    ]
    for ln in lines:
        out.append(
            f'    <line x1="{ln["x1"]:.2f}" y1="{ln["y1"]:.2f}" x2="{ln["x2"]:.2f}" y2="{ln["y2"]:.2f}" '
            f'stroke="{html.escape(ln["stroke"])}" stroke-width="{ln["sw"]:.0f}" fill="none" stroke-linecap="round"/>'
        )
    out.append("  </g>")
    out.append('  <g id="boxes">')
    for r in rects:
        fill = r["fill"]
        if not fill:
            fill = "none"
        stroke = "#cccccc"
        if fill == "none":
            stroke = "#bbbbbb"
        out.append(
            f'    <rect x="{r["x"]:.2f}" y="{r["y"]:.2f}" width="{r["w"]:.2f}" height="{r["h"]:.2f}" '
            f'fill="{html.escape(fill)}" stroke="{stroke}" stroke-width="9525" opacity="0.95"/>'
        )
    out.append("  </g>")
    out.append('  <g id="labels" font-family="system-ui,Segoe UI,Arial,sans-serif" fill="#111111">')
    for lb in labels:
        tx = html.escape(lb["text"][:200])
        # crude font size from box height
        fs = max(80000, min(lb["h"] / 4.5, 220000))
        out.append(
            f'    <text x="{lb["x"] + lb["w"] * 0.05:.2f}" y="{lb["y"] + fs * 1.2:.2f}" font-size="{fs:.0f}">{tx}</text>'
        )
    out.append("  </g>")
    out.append("</svg>")
    return "\n".join(out) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser(description="Convert PPTX slide shapes to SVG")
    ap.add_argument("pptx", help="Path to .pptx file")
    ap.add_argument("slide", type=int, help="Slide number (1-based)")
    ap.add_argument("-o", "--output", help="Write SVG to this path (default: stdout)")
    args = ap.parse_args()
    svg = pptx_slide_to_svg(args.pptx, args.slide)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(svg)
        print(f"Wrote {args.output}", file=sys.stderr)
    else:
        sys.stdout.write(svg)


if __name__ == "__main__":
    main()
