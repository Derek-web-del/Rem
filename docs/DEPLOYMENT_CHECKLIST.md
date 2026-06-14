# LenLearn LMS — Deployment Checklist

## WEEK BEFORE DEPLOY

### Code Readiness
- [ ] npm run build passes locally
- [ ] npm run test passes
- [ ] Static SPA serving added to server/index.js
- [ ] railway.toml created
- [ ] Health check endpoint working
- [ ] All migrations 001-038 tested
- [ ] Git commit pushed and clean

### Security Fixes
- [ ] DOMPurify installed and applied to all dangerouslySetInnerHTML
- [ ] sanitizeInput covers all /api routes
- [ ] AUTH_TWO_FACTOR_SKIP_VERIFY_ON_ENABLE=false confirmed
- [ ] Generic error messages for login

## DAY BEFORE DEPLOY

### Railway Setup
- [ ] PostgreSQL service created (empty database)
- [ ] Web service connected to GitHub repo
- [ ] Volume mounted at /app/public/uploads
- [ ] All environment variables set in Railway dashboard

### Secrets Generated (NEW values)
- [ ] BETTER_AUTH_SECRET (openssl rand -base64 32)
- [ ] AES_256_SECRET_KEY (64 hex chars)
- [ ] SEED_ADMIN_PASSWORD (strong unique password)
- [ ] SMTP_PASS (Gmail App Password)

### Database Setup
- [ ] npm run db:migrate (against prod DATABASE_URL)
- [ ] npm run db:seed (creates one admin)
- [ ] npm run ensure:portal-mfa
- [ ] npm run verify:portal-mfa (must exit 0)
- [ ] npm run pii:encrypt
- [ ] npm run smtp:test

## DEPLOY DAY

### DNS and Domain
- [ ] Cloudflare DNS configured
- [ ] CNAME to Railway URL
- [ ] SSL Full (strict) on Cloudflare
- [ ] BETTER_AUTH_URL set to final https:// domain

### Deploy and Verify
- [ ] Railway deploy triggered
- [ ] Build logs show no errors
- [ ] Health check returns 200: GET /api/health
- [ ] Admin login works + OTP email received
- [ ] OTP code verified + dashboard loads
- [ ] Create one test faculty
- [ ] Upload one PDF file
- [ ] PDF loads correctly
- [ ] Admin monitoring logs show login event
- [ ] Change admin password from seed password

## POST DEPLOY
- [ ] Create real faculty accounts
- [ ] Create real student accounts
- [ ] Faculty accept Terms & Conditions
- [ ] Students accept Terms & Conditions
- [ ] Test quiz creation and submission end to end
- [ ] Test originality checker
- [ ] Monitor Railway logs for first 24 hours

## WHAT NOT TO BRING TO PRODUCTION
- ❌ Local .env file
- ❌ node_modules/
- ❌ Local public/uploads/ files
- ❌ BETTER_AUTH_RESET_JWKS=1
- ❌ AUTH_TWO_FACTOR_SKIP_VERIFY_ON_ENABLE=true
- ❌ Default Admin123@ password
- ❌ Demo/test accounts
- ❌ SECURITY_EVIDENCE_* vars
- ❌ Dev database dump
