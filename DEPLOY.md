# 🚀 CivicMind — Google Cloud Platform Deployment Guide

> Deploy CivicMind to **Google Cloud Run** — fully managed, auto-scaling, free tier eligible.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Google Cloud CLI (`gcloud`) | Latest | [cloud.google.com/sdk](https://cloud.google.com/sdk/docs/install) |
| Docker Desktop | Latest | [docker.com](https://www.docker.com/products/docker-desktop/) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| A GCP Account | — | [console.cloud.google.com](https://console.cloud.google.com) |

---

## Step 1 — Create a GCP Project

```bash
# Login to your Google account
gcloud auth login

# Create a new project (or use an existing one)
gcloud projects create civicmind-app --name="CivicMind"

# Set the project as default
gcloud config set project civicmind-app

# Enable billing (required for Cloud Run)
# → Go to: https://console.cloud.google.com/billing
# → Link a billing account to the project
```

> **Note:** Cloud Run has a generous free tier:
> - 2 million requests/month free
> - 180,000 vCPU-seconds/month free
> - No charge when idle (scales to zero)

---

## Step 2 — Enable Required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  containerregistry.googleapis.com \
  artifactregistry.googleapis.com
```

---

## Step 3 — Configure Your API Keys

Your `.env` file must have all three keys before you deploy:

```bash
# Check your .env is populated
cat .env
```

It should look like this (no placeholder values):

```env
GEMINI_API_KEY=AIzaSy...your_real_key
CIVIC_API_KEY=AIzaSy...your_real_key
CALENDAR_API_KEY=AIzaSy...your_real_key
NODE_ENV=production
PORT=8080
```

> **Where to get keys:**
> | Key | URL |
> |-----|-----|
> | Gemini API | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
> | Civic Info API | [console.cloud.google.com](https://console.cloud.google.com) → APIs → Enable "Google Civic Information API" |
> | Calendar API | [console.cloud.google.com](https://console.cloud.google.com) → APIs → Enable "Google Calendar API" |

---

## Step 4 — Build & Push Docker Image

### Option A: Use Cloud Build (Recommended — no Docker Desktop needed)

```bash
# Set your project ID
export PROJECT_ID=civicmind-app

# Submit build directly to Google Cloud Build
gcloud builds submit \
  --tag gcr.io/$PROJECT_ID/civicmind \
  .
```

### Option B: Build Locally and Push

```bash
export PROJECT_ID=civicmind-app

# Configure Docker to use Google Container Registry
gcloud auth configure-docker

# Build the image
docker build -t gcr.io/$PROJECT_ID/civicmind .

# Push to Google Container Registry
docker push gcr.io/$PROJECT_ID/civicmind
```

---

## Step 5 — Deploy to Cloud Run

```bash
export PROJECT_ID=civicmind-app

gcloud run deploy civicmind \
  --image gcr.io/$PROJECT_ID/civicmind \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars \
    NODE_ENV=production,\
    GEMINI_API_KEY=$(grep GEMINI_API_KEY .env | cut -d '=' -f2),\
    CIVIC_API_KEY=$(grep CIVIC_API_KEY .env | cut -d '=' -f2),\
    CALENDAR_API_KEY=$(grep CALENDAR_API_KEY .env | cut -d '=' -f2)
```

After deployment completes, you'll see:

```
✓ Deploying...done.
Service [civicmind] revision [civicmind-00001-xxx] has been deployed and is serving 100 percent of traffic.
Service URL: https://civicmind-xxxxxxxx-uc.a.run.app
```

---

## Step 6 — Verify Deployment

```bash
# Get the service URL
SERVICE_URL=$(gcloud run services describe civicmind \
  --region us-central1 \
  --format 'value(status.url)')

echo "App URL: $SERVICE_URL"

# Test the health endpoint
curl "$SERVICE_URL/api/health"
# Expected: {"status":"ok","timestamp":"...","version":"2.0.0"}
```

Open your browser at the Service URL — CivicMind should be live! ✅

---

## Step 7 — (Recommended) Store Secrets in Secret Manager

Instead of passing keys as env vars directly, use Google Secret Manager for production:

```bash
# Create secrets
echo -n "YOUR_GEMINI_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=-
echo -n "YOUR_CIVIC_KEY"  | gcloud secrets create CIVIC_API_KEY  --data-file=-
echo -n "YOUR_CAL_KEY"    | gcloud secrets create CALENDAR_API_KEY --data-file=-

# Grant Cloud Run access to secrets
PROJECT_NUMBER=$(gcloud projects describe civicmind-app --format='value(projectNumber)')

gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding CIVIC_API_KEY \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding CALENDAR_API_KEY \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Re-deploy using secrets (instead of --set-env-vars)
gcloud run deploy civicmind \
  --image gcr.io/$PROJECT_ID/civicmind \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --update-secrets \
    GEMINI_API_KEY=GEMINI_API_KEY:latest,\
    CIVIC_API_KEY=CIVIC_API_KEY:latest,\
    CALENDAR_API_KEY=CALENDAR_API_KEY:latest \
  --set-env-vars NODE_ENV=production
```

---

## Step 8 — Set Up a Custom Domain (Optional)

```bash
# Map your domain (must be verified in Google Search Console first)
gcloud run domain-mappings create \
  --service civicmind \
  --domain civicmind.yourdomain.com \
  --region us-central1
```

Then add the CNAME/A records shown in the output to your DNS provider.

---

## Step 9 — Push Code to GitHub

```bash
cd /Users/surajzaware/Desktop/ElectaGuide

# Stage all new files
git add .

# Commit with a meaningful message
git commit -m "feat: backend proxy, security hardening, 102 tests, accessibility overhaul

- Move all API keys to server-side proxy (no client-side secrets)
- Add helmet, cors, express-rate-limit, morgan, express-validator
- Add server/server.js with routes for Gemini, Civic Info, Calendar APIs
- Add src/utils/guardrails.js, cache.js, accessibility.js
- Add 102 Jest tests (guardrails, API integration, accessibility)
- Add skip-to-content link, aria-live regions, WCAG focus styles
- Add multi-stage Dockerfile with non-root user
- Add .env.example, .eslintrc.json, README.md rewrite"

# Push to GitHub
git push origin main
```

---

## Redeploy After Code Changes

Each time you push changes, run:

```bash
export PROJECT_ID=civicmind-app

# Rebuild and redeploy in one command
gcloud builds submit --tag gcr.io/$PROJECT_ID/civicmind . && \
gcloud run deploy civicmind \
  --image gcr.io/$PROJECT_ID/civicmind \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

---

## Useful Commands

```bash
# View live logs
gcloud run services logs read civicmind --region us-central1 --tail 50

# Stream logs in real time
gcloud beta run services logs tail civicmind --region us-central1

# View service details
gcloud run services describe civicmind --region us-central1

# List all revisions
gcloud run revisions list --service civicmind --region us-central1

# Roll back to previous revision
gcloud run services update-traffic civicmind \
  --to-revisions civicmind-00001-xxx=100 \
  --region us-central1

# Delete the service (stop billing)
gcloud run services delete civicmind --region us-central1
```

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `EADDRINUSE :::8080` (local) | Run `lsof -ti:8080 \| xargs kill -9` then retry |
| `Image not found` | Run the `gcloud builds submit` step again |
| `403 Forbidden` on API calls | Check API keys in Secret Manager or env vars |
| `Container failed to start` | Check `gcloud run services logs read civicmind` |
| `Billing not enabled` | Go to console.cloud.google.com → Billing → Link account |
| App loads but AI doesn't respond | `GEMINI_API_KEY` env var not set on Cloud Run — re-deploy with `--set-env-vars` |

---

## Architecture on GCP

```
User Browser
     │
     ▼
Cloud Run (civicmind service)
  ├── Serves  public/index.html  (static files)
  ├── POST /api/gemini    ──► Google Gemini 2.5 Flash API
  ├── GET  /api/civic/*   ──► Google Civic Information API
  └── POST /api/calendar/* ──► Google Calendar deep-link
```

All API keys live in **Cloud Run environment variables** or **Secret Manager** — never in the browser.
