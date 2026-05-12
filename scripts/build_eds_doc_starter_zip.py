#!/usr/bin/env python3
"""
Build web/profile-viewer/assets/eds-doc-starter.zip for document-based EDS.

Creates minimal OOXML .docx stubs (index, nav, footer) plus README.md.
Not Adobe templates — authors should replace content using Experience League /
aem.live document-authoring guidance.
"""
from __future__ import annotations

import io
import sys
import textwrap
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_ZIP = ROOT / "web/profile-viewer/assets/eds-doc-starter.zip"

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>
"""

PACKAGE_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
"""

DOC_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
"""

STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr/></w:rPrDefault></w:docDefaults>
</w:styles>
"""


def _xml_escape(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def minimal_docx(body: str) -> bytes:
    doc_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t xml:space="preserve">{_xml_escape(body)}</w:t></w:r></w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>
"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", PACKAGE_RELS)
        z.writestr("word/_rels/document.xml.rels", DOC_RELS)
        z.writestr("word/styles.xml", STYLES)
        z.writestr("word/document.xml", doc_xml)
    return buf.getvalue()


README = textwrap.dedent(
    """\
    # EDS document starter (lab stub pack)

    These files are **minimal placeholders** from the AEP Orchestration Lab so you can
    copy something into SharePoint or Google Drive quickly. They are **not** official
    Adobe templates and do not include block markup — replace body copy and structure
    using Adobe’s document-based Edge Delivery guidance.

    ## Official Adobe references (source of truth)

    - Experience League — *Set up a content repository for Edge Delivery Services* (SharePoint / Google Drive tabs, index · nav · footer patterns):  
      https://experienceleague.adobe.com/en/docs/experience-manager-learn/sites/edge-delivery-services/developing/content-repository
    - *Where to author your site* (content source options):  
      https://www.aem.live/docs/authoring-guide

    ## Suggested filenames in your folder

    - `index.docx` — home page role
    - `nav.docx` — shared navigation
    - `footer.docx` — shared footer

    After uploading, use **Sidekick** to Preview and Publish per Adobe docs.

    ## License

    Stub documents and this README are provided by the lab under the same terms as the
    parent repository (MIT). Replace with your own or Adobe-guided content for production.
    """
)


def main() -> int:
    OUT_ZIP.parent.mkdir(parents=True, exist_ok=True)
    stubs = {
        "index.docx": (
            "STUB — home (index). Replace with real content and blocks per Adobe "
            "document-authoring guides (Experience League / aem.live)."
        ),
        "nav.docx": (
            "STUB — nav. Replace with navigation structure per your boilerplate and Adobe docs."
        ),
        "footer.docx": (
            "STUB — footer. Replace with footer content per your boilerplate and Adobe docs."
        ),
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as outer:
        outer.writestr("README.md", README)
        for name, text in stubs.items():
            outer.writestr(name, minimal_docx(text))
    OUT_ZIP.write_bytes(buf.getvalue())
    print(f"Wrote {OUT_ZIP.relative_to(ROOT)} ({OUT_ZIP.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
