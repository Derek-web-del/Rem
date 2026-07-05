"""Capture PDF screenshots for D. Appendices checklist evidence."""
import json
import os
import fitz

PDF = r"c:\Users\User\Downloads\LenLearn_ Capstone Project (1).pdf"
OUT_DIR = r"c:\xampp\htdocs\LenLearn\docs\thesis\checklist-evidence\appendices"
ZOOM = 2.0

PAGE_MAP = {
    "appendices_section": 217,
    "appendix_a_communication_letter": 218,
    "appendix_b_interview": 220,
    "appendix_b_interview_transcript": 221,
    "appendix_c_panel_comments": 223,
    "appendix_d_signed_frs": 226,
    "appendix_e_expert_validation": 249,
    "appendix_f_questionnaire": 256,
    "appendix_g_security_testing_eval": 262,
    "appendix_h_security_test_case": 267,
    "appendix_i_ethics_clearance": 273,
    "appendix_j_video_review_form": 274,
    "appendix_cv": 280,
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
            "file": f"checklist-evidence/appendices/{filename}",
        }
        print(f"{key}: fitz p.{page} (printed p.{manifest[key]['printed_page']})")

    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    doc.close()
    print(f"Wrote {len(manifest)} images to {OUT_DIR}")


if __name__ == "__main__":
    main()
