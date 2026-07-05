"""Capture PDF page screenshots for C.5 Data Privacy Clause and Compliance checklist."""
import json
import os

import fitz

PDF_CANDIDATES = [
    r"c:\Users\User\Downloads\LenLearn_ Capstone Project (1).pdf",
    r"c:\Users\User\Downloads\LenLearn_ Capstone Project.pdf",
]
OUT_DIR = r"c:\xampp\htdocs\LenLearn\docs\thesis\checklist-evidence\c5"
ZOOM = 2.0

PAGE_MAP = {
    "frs_table1_terms_policy": 57,
    "frs_table2_terms_policy": 60,
    "frs_table3_terms_policy": 62,
    "sec14_scope_data_protection": 27,
    "sec18_privacy_definitions": 34,
    "table11_security_feasibility": 77,
    "ch6_ra10173_retention": 185,
    "appendix_h_it03_sensitive_fields": 210,
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
            "file": f"checklist-evidence/c5/{filename}",
        }
        print(f"{key}: fitz p.{page} (printed p.{manifest[key]['printed_page']})")

    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)

    doc.close()
    print(f"Wrote {len(manifest) - 1} images to {OUT_DIR}")


if __name__ == "__main__":
    main()
