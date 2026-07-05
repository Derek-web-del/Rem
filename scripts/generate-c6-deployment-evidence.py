"""Generate C.6 Deployment checklist evidence cards (Railway + Cloudflare)."""
import json
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(r"c:\xampp\htdocs\LenLearn")
OUT = ROOT / "docs" / "thesis" / "checklist-evidence" / "c6"
OUT.mkdir(parents=True, exist_ok=True)
W, H = 900, 480


def font(size, bold=False):
    try:
        return ImageFont.truetype("arialbd.ttf" if bold else "arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def card(name, title, lines, status="CONFIGURED"):
    img = Image.new("RGB", (W, H), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, W, 50], fill=(240, 248, 255))
    draw.rectangle([0, 0, W, H], outline=(160, 160, 160), width=2)
    draw.text((14, 12), title, fill=(20, 60, 120), font=font(17, True))
    draw.text((W - 130, 14), status, fill=(0, 110, 50), font=font(14, True))
    y = 62
    for line in lines:
        ff = font(11) if not line.startswith("#") else font(10)
        color = (70, 70, 70) if line.startswith("#") else (15, 15, 15)
        for part in textwrap.wrap(line, width=100 if line.startswith("#") else 88) or [""]:
            draw.text((14, y), part, fill=color, font=ff)
            y += 17
            if y > H - 20:
                break
    path = OUT / name
    img.save(path)
    return f"checklist-evidence/c6/{name}"


cards = {
    "domain_documented.png": card(
        "domain_documented.png",
        "Domain — glendalehs-lms.com",
        [
            "Production domain documented in Ch.4, Ch.6, manifest.json",
            "Host: https://glendalehs-lms.com",
            "Stack: Railway (app + PostgreSQL) + Cloudflare (DNS/WAF/SSL edge)",
            "# ON FILE: manuscript + public/manifest.json",
            "# YOU CAPTURE: Cloudflare DNS dashboard (CNAME → Railway)",
        ],
    ),
    "railway_production.png": card(
        "railway_production.png",
        "Railway Production Config",
        [
            "railway.toml: build npm run build · start npm start",
            "Health: GET /api/health → status ok, database connected",
            "NODE_ENV=production enforced in server/index.js",
            "BETTER_AUTH_SECRET required min 32 chars in production",
            "Volume: /app/public/uploads (optional persistent uploads)",
            "# YOU CAPTURE: Railway dashboard — service + deploy logs",
        ],
    ),
    "cloudflare_security.png": card(
        "cloudflare_security.png",
        "Cloudflare — Domain + Security Edge",
        [
            "DNS: CNAME glendalehs-lms.com → Railway hostname",
            "SSL/TLS: Full (strict) recommended (SETUP.md §13.6)",
            "Edge: rate limiting / WAF (substitute for CAPTCHA per Ch.6)",
            "cf-connecting-ip trusted in Better Auth (server/auth.js)",
            "# YOU CAPTURE: Cloudflare SSL/TLS + DNS screenshots",
        ],
    ),
    "debug_disabled.png": card(
        "debug_disabled.png",
        "Debug Mode Disabled (Production)",
        [
            "/api/debug/infra-user-events registered ONLY when NODE_ENV !== production",
            "AUTH_SMTP_DEV_FALLBACK must NOT be set in production (.env.production.example)",
            "AES_256_SECRET_KEY required in production (aes256.js)",
            "Health JSON exposes environment: production",
            "# YOU CAPTURE: GET /api/health on live domain (redact if needed)",
        ],
    ),
    "env_vars_protected.png": card(
        "env_vars_protected.png",
        "Environment Variables Protected",
        [
            "Secrets in Railway Variables — never committed (.env.production.example only)",
            "DATABASE_URL via ${{Postgres.DATABASE_URL}} reference",
            "BETTER_AUTH_SECRET, AES_256_SECRET_KEY, RESEND/SMTP keys server-side",
            ".gitignore excludes .env · no secrets in Frontend bundle",
            "# YOU CAPTURE: Railway Variables tab (blur secret values)",
        ],
    ),
    "backup_procedure.png": card(
        "backup_procedure.png",
        "Backup & Restore (Admin Module)",
        [
            "FRS: Data Recovery & Backup + Archive Vault modules",
            "Frontend/src/pages/BackupPage.jsx — create, download, restore",
            "Categories: students, faculty, curriculum, audit logs, etc.",
            "Admin password confirmation on restore (verifyAdminPassword)",
            "# YOU CAPTURE: Backup summary + Create Backup Now screenshot",
        ],
    ),
    "production_security.png": card(
        "production_security.png",
        "Security Validated on Production",
        [
            "Evaluation host: glendalehs-lms.com (Railway + Cloudflare)",
            "Ch.4 STRIDE tests + FURPS walkthroughs on deployed instance",
            "Table 74: 18/18 security metrics Passed (controlled eval)",
            "npm run security:evidence — automated local + API probes",
            "# YOU CAPTURE: live sign-in + STRIDE spot-check on production URL",
        ],
    ),
}

manifest = {k.replace(".png", ""): {"file": v} for k, v in cards.items()}
with open(OUT / "manifest.json", "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2)
print(f"Wrote {len(cards)} cards to {OUT}")
