"""Capture PDF page screenshots for Chapter 4 B.1 checklist evidence."""
import json
import os
import fitz

PDF = r"c:\Users\User\Downloads\LenLearn_ Capstone Project (1).pdf"
OUT_DIR = r"c:\xampp\htdocs\LenLearn\docs\thesis\checklist-evidence\ch4"
ZOOM = 2.0

# Explicit page map (1-based) from LenLearn Capstone Project PDF manuscript.
PAGE_MAP = {
    "system_implementation_overview": 150,
    "implemented_web_modules_summary": 151,
    "security_components_implementation": 152,
    "security_components_supportability": 166,
    "security_components_stride_summary": 177,
    "results_system_quality_evaluation": 153,
    "functional_suitability_results": 154,
    "performance_efficiency_results": 163,
    "reliability_results": 160,
    "usability_results": 157,
    "security_results": 166,
    "security_testing_vulnerability": 177,
    "security_testing_vulnerability_cont": 178,
    "spoofing_results": 181,
    "tampering_results": 183,
    "repudiation_results": 185,
    "information_disclosure_results": 187,
    "denial_of_service_results": 189,
    "elevation_of_privilege_results": 191,
    "discussion_of_findings": 193,
    "interpretation_of_results": 195,
    "implication_of_findings": 197,
}


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
        manifest[key] = {"page": page, "file": f"checklist-evidence/ch4/{filename}"}
        print(f"{key}: page {page} -> {filename}")

    manifest_path = os.path.join(OUT_DIR, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"Wrote {len(manifest)} images to {OUT_DIR}")
    doc.close()


if __name__ == "__main__":
    main()
