"""Capture PDF page screenshots for D.1 General Objective Compliance checklist evidence."""
import json
import os

import fitz

PDF_CANDIDATES = [
    r"c:\Users\User\Downloads\LenLearn_ Capstone Project (1).pdf",
    r"c:\Users\User\Downloads\LenLearn_ Capstone Project.pdf",
]
OUT_DIR = r"c:\xampp\htdocs\LenLearn\docs\thesis\checklist-evidence\d1"
ZOOM = 2.0

# fitz page numbers for LenLearn_ Capstone Project.pdf (218 pp, Jun 2026 export).
# Re-map if using the longer (1).pdf revision — search manuscript for Sec. 1.3 / Appendix D.
PAGE_MAP = {
    "title_page": 1,
    "general_objective_ch1": 25,
    "scope_limitations_ch1": 27,
    "signed_frs_appendix_d": 201,
}


def resolve_pdf():
    for path in PDF_CANDIDATES:
        if os.path.isfile(path):
            return path
    raise FileNotFoundError("LenLearn capstone PDF not found in Downloads")


def printed_page(doc, page_num):
    text = doc[page_num - 1].get_text()
    foot = [line.strip() for line in text.split("\n") if line.strip().isdigit() and len(line.strip()) <= 3]
    return foot[-1] if foot else "?"


def render_page(doc, page_num, out_path):
    page = doc[page_num - 1]
    mat = fitz.Matrix(ZOOM, ZOOM)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    pix.save(out_path)


def main():
    pdf = resolve_pdf()
    os.makedirs(OUT_DIR, exist_ok=True)
    doc = fitz.open(pdf)

    manifest = {"pdf_source": pdf}
    for key, page in PAGE_MAP.items():
        if page > doc.page_count:
            print(f"SKIP {key}: page {page} exceeds doc length {doc.page_count}")
            continue
        filename = f"{key}.png"
        out_path = os.path.join(OUT_DIR, filename)
        render_page(doc, page, out_path)
        manifest[key] = {
            "fitz_page": page,
            "printed_page": printed_page(doc, page),
            "file": f"checklist-evidence/d1/{filename}",
        }
        print(f"{key}: fitz p.{page} (printed p.{manifest[key]['printed_page']})")

    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)

    doc.close()
    print(f"Wrote {len(PAGE_MAP)} images to {OUT_DIR}")


if __name__ == "__main__":
    main()
