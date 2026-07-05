"""Capture PDF screenshots for C. Bibliography checklist evidence."""
import json
import os
import re
import fitz

PDF = r"c:\Users\User\Downloads\LenLearn_ Capstone Project (1).pdf"
OUT_DIR = r"c:\xampp\htdocs\LenLearn\docs\thesis\checklist-evidence\bib"
ZOOM = 2.0

PAGE_MAP = {
    "bibliography_opening": 208,
    "bibliography_after_ch6": 207,
    "bibliography_list_mid": 211,
    "bibliography_apa_format": 208,
    "bibliography_sources_credible": 212,
    "intext_citation_ch1": 51,
    "intext_citation_ch4": 150,
}


def printed_page(doc, page_num):
    text = doc[page_num - 1].get_text()
    foot = [l.strip() for l in text.split("\n") if l.strip().isdigit() and len(l.strip()) <= 3]
    return foot[-1] if foot else "?"


def render_page(doc, page_num, out_path):
    page = doc[page_num - 1]
    mat = fitz.Matrix(ZOOM, ZOOM)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    pix.save(out_path)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    doc = fitz.open(PDF)

    manifest = {}
    for key, page in PAGE_MAP.items():
        filename = f"{key}.png"
        out_path = os.path.join(OUT_DIR, filename)
        render_page(doc, page, out_path)
        manifest[key] = {
            "fitz_page": page,
            "printed_page": printed_page(doc, page),
            "file": f"checklist-evidence/bib/{filename}",
        }
        print(f"{key}: fitz p.{page} (printed p.{manifest[key]['printed_page']})")

    # Count bibliography entries
    bib_text = ""
    for i in range(207, doc.page_count):
        bib_text += doc[i].get_text()
    entries = len(re.findall(r"●", bib_text))
    years = sorted(set(re.findall(r"\((\d{4})\)", bib_text)))
    manifest["_meta"] = {
        "entry_count": entries,
        "year_range": f"{years[0]}–{years[-1]}" if years else "?",
        "bib_pages": "196–204",
    }

    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    doc.close()
    print(f"Entries: {entries}, years: {years}")


if __name__ == "__main__":
    main()
