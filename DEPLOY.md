# Deploying TrustCheck on Google Cloud Run

One container: the Express server serves the API (SSE included) and the built client. On Cloud Run, Vertex AI auth is automatic through the service's identity (ADC), so there is no key file and no `GOOGLE_APPLICATION_CREDENTIALS`.

| Variable | Needed for | Notes |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GEMINI_MODEL` | Gemini on Vertex AI | Required |
| `APP_ORIGIN` | CORS | The Cloud Run URL or your custom domain |
| `DATABASE_URL` | Persistence | Empty = in-memory store (lost on restart or scale-to-zero) |
| `AUTH0_DOMAIN`, `AUTH0_AUDIENCE` | Login (optional) | Plus `VITE_AUTH0_*` build args below |
| `FEATURE_*`, `FINNHUB_API_KEY`, `SEC_USER_AGENT` | Add-ons | See README |

## 1. One-time setup
```bash
export PROJECT_ID=<your-project-id>
export REGION=us-central1
gcloud auth login
gcloud config set project $PROJECT_ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com aiplatform.googleapis.com secretmanager.googleapis.com

# Registry for the image
gcloud artifacts repositories create trustcheck --repository-format=docker --location=$REGION

# Identity the service runs as (needs Vertex AI only)
gcloud iam service-accounts create trustcheck-run
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:trustcheck-run@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

## 2. Build and push the image
Build for amd64 (Cloud Run is x86; this matters on Apple Silicon). `VITE_*` args are baked into the client, so pass them here if you use Auth0.
```bash
gcloud auth configure-docker $REGION-docker.pkg.dev
IMAGE=$REGION-docker.pkg.dev/$PROJECT_ID/trustcheck/app:latest
docker build --platform linux/amd64 -t $IMAGE \
  --build-arg VITE_AUTH0_DOMAIN=... --build-arg VITE_AUTH0_CLIENT_ID=... --build-arg VITE_AUTH0_AUDIENCE=... .
docker push $IMAGE
```

## 3. Deploy
```bash
gcloud run deploy trustcheck \
  --image $IMAGE --region $REGION \
  --service-account trustcheck-run@$PROJECT_ID.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --port 8787 --memory 512Mi --timeout 300 \
  --min-instances 1 --max-instances 3 \
  --set-env-vars GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION,GEMINI_MODEL=gemini-2.5-flash
```
- `--min-instances 1` keeps the in-memory store, the demo cache and the news polling alive. Drop it to 0 to save money if you use a database.
- `--timeout 300` allows long SSE streams.

Open the printed URL, then set the CORS origin and redeploy the config:
```bash
gcloud run services update trustcheck --region $REGION \
  --update-env-vars APP_ORIGIN=https://<service-url>
```
Check: `curl https://<service-url>/api/health`.

## 4. Secrets (API keys)
Keep keys such as `FINNHUB_API_KEY` or `BRAVE_API_KEY` in Secret Manager, not in env vars:
```bash
echo -n "KEY" | gcloud secrets create finnhub-key --data-file=-
gcloud secrets add-iam-policy-binding finnhub-key \
  --member="serviceAccount:trustcheck-run@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
gcloud run services update trustcheck --region $REGION --update-secrets FINNHUB_API_KEY=finnhub-key:latest
```

## 5. Database (optional)
Use Cloud SQL for PostgreSQL, or any external Postgres, and set `DATABASE_URL` (as a secret). For Cloud SQL, add `--add-cloudsql-instances $PROJECT_ID:$REGION:<instance>` and use the socket URL `postgresql://user:pass@/trustcheck?host=/cloudsql/$PROJECT_ID:$REGION:<instance>`. Tables are created on boot.

## 6. Custom domain and Auth0
`gcloud run domain-mappings create --service trustcheck --domain yourdomain.com --region $REGION`, then add the DNS records it prints. Set `APP_ORIGIN` to the domain, and add it to Auth0 Callback, Logout and Web Origins URLs.

## Update
Rebuild and push the image, then `gcloud run deploy trustcheck --image $IMAGE --region $REGION`. Logs: `gcloud run services logs read trustcheck --region $REGION`.
