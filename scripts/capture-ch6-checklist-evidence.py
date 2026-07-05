"""Capture PDF page screenshots for Chapter 6 B.4 checklist evidence."""
import json
import os
import fitz

PDF = r"c:\Users\User\Downloads\LenLearn_ Capstone Project (1).pdf"
OUT_DIR = r"c:\xampp\htdocs\LenLearn\docs\thesis\checklist-evidence\ch6"
ZOOM = 2.0

PAGE_MAP = {
    "chapter6_opening": 203,
    "system_enhancements": 203,
    "system_enhancements_cont": 204,
    "security_improvements": 204,
    "security_improvements_cont": 205,
    "future_research": 205,
    "future_research_cont": 206,
    "deployment_advice": 206,
    "deployment_advice_cont": 207,
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
            "file": f"checklist-evidence/ch6/{filename}",
        }
        print(f"{key}: fitz p.{page} (printed p.{manifest[key]['printed_page']})")

    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    doc.close()
    print(f"Wrote {len(manifest)} images to {OUT_DIR}")


if __name__ == "__main__":
    main()
