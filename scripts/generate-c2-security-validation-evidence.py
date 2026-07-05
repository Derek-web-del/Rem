"""Generate security validation checklist evidence cards (sections 1–3)."""
import json
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(r"c:\xampp\htdocs\LenLearn\docs\thesis\checklist-evidence\c2")
OUT.mkdir(parents=True, exist_ok=True)
W, H = 880, 420


def font(sz, bold=False):
    try:
        return ImageFont.truetype("arialbd.ttf" if bold else "arial.ttf", sz)
    except OSError:
        return ImageFont.load_default()


def card(name, title, lines):
    img = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 46], fill=(245, 248, 252))
    d.rectangle([0, 0, W, H], outline=(170, 170, 170), width=2)
    d.text((12, 10), title, fill=(25, 55, 100), font=font(15, True))
    y = 56
    for line in lines:
        ff = font(10) if line.startswith("#") else font(11)
        col = (90, 90, 90) if line.startswith("#") else (20, 20, 20)
        for p in textwrap.wrap(line, 96) or [""]:
            d.text((12, y), p, fill=col, font=ff)
            y += 16
            if y > H - 14:
                break
    p = OUT / name
    img.save(p)
    return f"checklist-evidence/c2/{name}"


cards = {
    "s1_password_auth.png": card("s1_password_auth.png", "§1 Password Hashing & Authentication", [
        "bcrypt cost 12 — server/password.js",
        "Better Auth httpOnly session cookies (not URL tokens)",
        "Generic login errors — App.jsx formatAuthError / ST-01",
        "Idle logout 30 min — useIdleSession (all portal layouts)",
        "Session logout PASS — Session_Logout_Evidence.txt",
        "# ON FILE: code + automated tests",
        "# YOU CAPTURE: login error UI, pgAdmin hash, logout 401",
    ]),
    "s2_input_validation.png": card("s2_input_validation.png", "§2 Input Validation & Error Handling", [
        "Client: upload limits, form validate(), STRONG_PASSWORD_REGEX",
        "Server: sanitizeInput.js, multer fileFilter, parameterized SQL",
        "Output: sanitizeHtml.js before dangerouslySetInnerHTML",
        "Production errors: sendSafeServerError — generic message only",
        "Server logs: console.error('[DB ERROR]', context, err)",
        "# YOU CAPTURE: invalid upload rejected, 500 generic JSON",
    ]),
    "s3_api_session.png": card("s3_api_session.png", "§3 API Protection & Session Management", [
        "Auth required: API_Auth_Required_Evidence.txt — 401 PASS",
        "RBAC: requireAdminRole / requireStudentSession + ET-01/02",
        "Minimal JWT payload — auth.js definePayload (id, email, role)",
        "Rate limits: sign-in 10/15min, API tiered — server/index.js",
        "Session in cookie only — credentials:include, no ?session= URL",
        "# YOU CAPTURE: 401/403 API response, Network tab cookies only",
    ]),
}

with open(OUT / "manifest.json", "w") as f:
    json.dump({k.replace(".png", ""): {"file": v} for k, v in cards.items()}, f, indent=2)
print(f"Wrote {len(cards)} cards")
