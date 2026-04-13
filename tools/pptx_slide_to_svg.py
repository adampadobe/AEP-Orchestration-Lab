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


def parse_scheme_color(scheme_el: ET.Element) -> Optional[str]:
    """Map a:schemeClr @val to an approximate sRGB hex (theme not loaded)."""
    v = scheme_el.get("val", "")
    # Light backgrounds / text on dark
    if v in ("lt1", "bg1", "lt2", "bg2"):
        return "#FFFFFF"
    if v in ("dk1", "tx1"):
        return "#1A1A1A"
    if v in ("dk2", "tx2"):
        return "#2C2C2C"
    if v.startswith("accent"):
        return "#1A1A1A"
    return "#2C2C2C"


def parse_rpr_color(rpr: ET.Element) -> Optional[str]:
    if rpr is None:
        return None
    solid = rpr.find("a:solidFill", NS)
    if solid is None:
        return None
    srgb = solid.find("a:srgbClr", NS)
    if srgb is not None and "val" in srgb.attrib:
        return "#" + srgb.attrib["val"]
    sch = solid.find("a:schemeClr", NS)
    if sch is not None:
        return parse_scheme_color(sch)
    return None


def sz_hundredths_pt_to_emu(sz: str) -> float:
    """OOXML sz is in 1/100 pt."""
    return float(sz) / 100.0 * EMU_PER_PT


def extract_text_meta(sp_el: ET.Element) -> dict:
    """
    Walk p:txBody in document order: paragraphs, br, runs.
    Returns text (newlines preserved), optional fill, font size in EMU, bodyPr vert.
    """
    tx = sp_el.find("p:txBody", NS) or sp_el.find(q("p", "txBody"))
    if tx is None:
        return {
            "text": "",
            "fill": None,
            "font_size_emu": None,
            "vert": "horz",
            "l_ins": 91440,
            "t_ins": 91440,
        }

    body = tx.find("a:bodyPr", NS)
    vert = "horz"
    l_ins = t_ins = 91440
    if body is not None:
        vert = body.get("vert", "horz") or "horz"
        l_ins = int(float(body.get("lIns", "91440")))
        t_ins = int(float(body.get("tIns", "91440")))

    paras: List[str] = []
    first_fill: Optional[str] = None
    first_sz_emu: Optional[float] = None

    for p in tx.findall("a:p", NS):
        line_chunks: List[str] = []
        for child in list(p):
            ctag = local(child.tag)
            if ctag == "r":
                rpr = child.find("a:rPr", NS)
                if rpr is not None:
                    if first_sz_emu is None and rpr.get("sz"):
                        first_sz_emu = sz_hundredths_pt_to_emu(rpr.get("sz", "1100"))
                    if first_fill is None:
                        fc = parse_rpr_color(rpr)
                        if fc:
                            first_fill = fc
                for t in child.iter():
                    if local(t.tag) == "t":
                        if t.text:
                            line_chunks.append(t.text)
                        if t.tail:
                            line_chunks.append(t.tail)
            elif ctag == "br":
                line_chunks.append("\n")
        paras.append("".join(line_chunks))
        epr = p.find("a:endParaRPr", NS)
        if epr is not None:
            if first_sz_emu is None and epr.get("sz"):
                first_sz_emu = sz_hundredths_pt_to_emu(epr.get("sz", "1100"))
            if first_fill is None:
                fc = parse_rpr_color(epr)
                if fc:
                    first_fill = fc

    text = "\n".join(paras).strip()
    return {
        "text": text,
        "fill": first_fill,
        "font_size_emu": first_sz_emu,
        "vert": vert,
        "l_ins": l_ins,
        "t_ins": t_ins,
    }


def extract_text(sp_el: ET.Element) -> str:
    return extract_text_meta(sp_el)["text"]


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


def default_text_font_emu(w: float, h: float, text: str) -> float:
    """When OOXML has no sz, scale from box (EMU)."""
    lines = max(1, text.count("\n") + 1)
    per_line = h / (lines + 0.5)
    by_w = w / max(len(text.replace("\n", "")) * 0.55, 4.0)
    fs = min(per_line * 0.85, by_w * 1.1, h * 0.22)
    return max(24000.0, min(fs, 320000.0))


def text_fill_fallback(shape_fill: Optional[str]) -> str:
    """Dark text on light fills, light text on dark fills."""
    if not shape_fill or shape_fill.lower() in ("none", "#ffffff", "#fff"):
        return "#1a1d21"
    hx = shape_fill.lstrip("#")
    if len(hx) != 6:
        return "#1a1d21"
    try:
        r, g, b = int(hx[0:2], 16), int(hx[2:4], 16), int(hx[4:6], 16)
    except ValueError:
        return "#1a1d21"
    lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
    return "#f5f5f5" if lum < 0.42 else "#1a1d21"


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
        meta = extract_text_meta(node)
        emit_rect(sx, sy, sw, sh, fill, prst, meta)
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

    def emit_rect(
        x: float,
        y: float,
        w: float,
        h: float,
        fill: Optional[str],
        prst: Optional[str],
        meta: dict,
    ) -> None:
        if w < 1 and h < 1:
            return
        text = meta.get("text", "")
        rects.append(
            {
                "x": x,
                "y": y,
                "w": w,
                "h": h,
                "fill": fill,
                "prst": prst,
                "text": text,
                "text_fill": meta.get("fill"),
                "font_size_emu": meta.get("font_size_emu"),
                "vert": meta.get("vert", "horz"),
                "l_ins": meta.get("l_ins", 91440),
                "t_ins": meta.get("t_ins", 91440),
            }
        )

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
    out.append(
        '  <g id="labels" font-family="system-ui,Segoe UI,Arial,sans-serif">'
    )
    for r in rects:
        raw = (r.get("text") or "").strip()
        if not raw:
            continue
        x, y, w, h = r["x"], r["y"], r["w"], r["h"]
        if w < 2500 or h < 2000:
            continue
        if r.get("font_size_emu") is not None:
            fs = float(r["font_size_emu"])
        else:
            fs = default_text_font_emu(w, h, raw)
        fs = max(22000.0, min(fs, min(w, h) * 0.48))
        tfill = r.get("text_fill") or text_fill_fallback(r.get("fill"))
        vert = r.get("vert") or "horz"
        l_ins = float(r.get("l_ins", 91440))
        t_ins = float(r.get("t_ins", 91440))
        lines = raw.split("\n")
        cx = x + w / 2.0
        cy = y + h / 2.0

        if vert in ("vert", "vert270", "eaVert", "mongolianVert", "wordArtVert"):
            # One dominant use: vertical caption along a narrow box (e.g. "Pipeline")
            line0 = lines[0][:500]
            out.append(
                f'    <text transform="rotate(-90 {cx:.2f} {cy:.2f})" font-size="{fs:.0f}" '
                f'fill="{html.escape(tfill)}" text-anchor="middle" dominant-baseline="middle" '
                f'x="{cx:.2f}" y="{cy:.2f}">{html.escape(line0)}</text>'
            )
            continue

        lh = fs * 1.18
        y0 = y + t_ins + fs
        parts: List[str] = []
        for i, line in enumerate(lines[:30]):
            frag = line[:800]
            if i == 0:
                parts.append(
                    f'<tspan x="{x + l_ins:.2f}" y="{y0:.2f}">{html.escape(frag)}</tspan>'
                )
            else:
                parts.append(
                    f'<tspan x="{x + l_ins:.2f}" dy="{lh:.2f}">{html.escape(frag)}</tspan>'
                )
        out.append(
            f'    <text font-size="{fs:.0f}" fill="{html.escape(tfill)}">{"".join(parts)}</text>'
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
