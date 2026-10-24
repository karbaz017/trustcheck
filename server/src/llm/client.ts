import { GoogleAuth } from "google-auth-library";

/**
 * Single entry point for Gemini on Vertex AI.
 * Auth uses Application Default Credentials (gcloud ADC, GOOGLE_APPLICATION_CREDENTIALS service account, or the
 * attached service account on Vultr/GCE/Cloud Run), so no API key is ever stored in the app.
 */
let auth: GoogleAuth | null = null;

async function accessToken(): Promise<string> {
  auth ??= new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const token = await auth.getAccessToken();
  if (!token) throw new Error("No Google Cloud credentials found. Run `gcloud auth application-default login` or set GOOGLE_APPLICATION_CREDENTIALS.");
  return token;
}

export function vertexUrl(): string {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const model = process.env.GEMINI_MODEL;
  if (!project || !model) throw new Error("GOOGLE_CLOUD_PROJECT and GEMINI_MODEL must be set");
  const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
}

export async function callModel(body: unknown, timeoutMs: number): Promise<Response> {
  const url = vertexUrl();
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${await accessToken()}` },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify(body),
  });
}
