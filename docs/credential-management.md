# Credential Management — CloudBridge

> This document explains how credentials are structured, stored, and
> loaded across all three cloud providers and all supported auth strategies.
> Read this before touching any credential-related code or configuration.

---

## Why .env Alone Is Not Enough

Most tutorials say "put secrets in .env." That works for a database
password. It does not work for multi-cloud credentials because:

- `.env` files are flat text — no encryption, no rotation, no audit trail
- Cloud credentials have types — IAM roles are not key=value pairs
- GCP service account keys are JSON files — cannot fit in `.env` cleanly
- Short-lived tokens (STS, OAuth2) expire and need rotation logic
- Production systems need encrypted secret stores, not plaintext files

---

## The 3-Layer Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 3 — Production                                        │
│  HashiCorp Vault / AWS Secrets Manager / Azure Key Vault     │
│  Encrypted at rest · Auto-rotated · Audited · Zero-touch     │
│  Used in: staging, production                                │
├──────────────────────────────────────────────────────────────┤
│  Layer 2 — Local Key Files                                   │
│  secrets/ folder (gitignored entirely)                       │
│  GCP service account JSON · Azure certs (.pem)               │
│  Used in: local development only                             │
├──────────────────────────────────────────────────────────────┤
│  Layer 1 — Environment Variables                             │
│  .env file (gitignored) · .env.example (committed)           │
│  AWS access keys · Azure account name · config values        │
│  Used in: local development only                             │
└──────────────────────────────────────────────────────────────┘
```

**Hard rule:** Layers 1 and 2 are local development only.
Production and staging use Layer 3 exclusively.
No plaintext credentials ever exist on a server.

---

## Layer 1 — Environment Variables (.env)

### What Goes Here

Simple string values that fit in key=value format:

```bash
# Auth
JWT_SECRET=64-character-random-hex-string
API_KEY=your-api-key

# AWS (if using access key auth in local dev)
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# Azure (if using connection string in local dev)
AZURE_STORAGE_ACCOUNT_NAME=yourstorageaccount
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;...

# GCP
GCP_PROJECT_ID=your-project-id
GCP_KEY_FILE=./secrets/gcp-service-account.json
```

### What Does NOT Go Here

- JSON content (GCP service account key) — use secrets/ folder
- Certificate content — use secrets/ folder
- Private key content — use secrets/ folder
- Production credentials of any kind

### Setup

```bash
# Copy the template
cp .env.example .env

# Generate a secure JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Paste the output into .env as JWT_SECRET
```

### How It Is Loaded

`config.ts` uses `dotenv` to load `.env` at startup, then immediately
validates every value with Zod. If anything is missing or malformed,
the process exits with a clear error message before handling any request.

```typescript
// Happens at process start — never at request time
const config = loadConfig(); // exits immediately if invalid
```

---

## Layer 2 — Local Key Files (secrets/)

### What Goes Here

Credential files that cannot be represented as a single string:

```
secrets/
├── gcp-service-account.json       ← gitignored
└── azure-sp-cert.pem              ← gitignored (if using cert auth)
```

### GCP Service Account JSON

This is the most common file in this folder.
Structure (never commit a real version):

```json
{
  "type": "service_account",
  "project_id": "your-project",
  "private_key_id": "key-id",
  "private_key": "-----BEGIN RSA PRIVATE KEY-----\n...",
  "client_email": "cloudbridge@your-project.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}
```

How to get it:

```bash
# 1. GCP Console → IAM & Admin → Service Accounts
# 2. Create: cloudbridge-dev@YOUR_PROJECT.iam.gserviceaccount.com
# 3. Grant role: Storage Object Admin (on dev bucket only)
# 4. Keys → Add Key → JSON → Download
# 5. Move to secrets folder:
mv ~/Downloads/your-project-*.json ./secrets/gcp-service-account.json
```

### Azure Service Principal Certificate

Only needed if using `sp-certificate` auth strategy.
Not required if using `service-principal` with client secret.

```bash
# Generate a self-signed cert for local dev
openssl req -x509 -newkey rsa:4096 \
  -keyout ./secrets/azure-sp-key.pem \
  -out ./secrets/azure-sp-cert.pem \
  -days 365 -nodes \
  -subj "/CN=cloudbridge-dev"

# Upload azure-sp-cert.pem to Azure Portal:
# App Registrations → Your App → Certificates & secrets → Upload
```

### Safety Net

The `.gitignore` covers the entire secrets/ folder:

```
secrets/
```

Individual patterns exist as a second line of defense in case a
credential file is accidentally created outside the secrets/ folder:

```
*service-account*.json
*sa-key*.json
*.pem
*.key
```

---

## Layer 3 — Production Secret Store

### In Production — No Files, No .env

Production deployments use cloud-native identity.
No credential files. No environment variable secrets.

| Deployment     | Auth method               | How it works                               |
| -------------- | ------------------------- | ------------------------------------------ |
| AWS EC2 / ECS  | IAM Role on instance/task | SDK reads instance metadata automatically  |
| AWS Lambda     | Execution role            | SDK reads Lambda environment automatically |
| Azure VM / AKS | Managed Identity          | SDK reads Azure IMDS automatically         |
| GCP GCE / GKE  | Workload Identity         | SDK reads metadata server automatically    |

For secrets that cannot use cloud-native identity (JWT signing key,
API keys, third-party credentials), use a dedicated secret store:

### HashiCorp Vault

```typescript
// vault.ts — fetch at startup, never store in process env
import Vault from "node-vault";

const vault = Vault({
  apiVersion: "v1",
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN, // short-lived, injected by K8s
});

export async function fetchSecrets() {
  const result = await vault.read("secret/cloudbridge/production");
  return result.data; // { jwtSecret, apiKey, ... }
}
```

### AWS Secrets Manager

```typescript
// secrets-manager.ts
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({ region: "ap-south-1" });

export async function fetchSecrets() {
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: "cloudbridge/production" }),
  );
  return JSON.parse(response.SecretString!);
}
```

---

## Credential Rotation

### Short-lived Tokens (STS, OAuth2)

AWS STS tokens and Azure/GCP OAuth2 tokens expire.
The credential resolver in `src/auth/credential-resolver.ts` handles
rotation automatically:

```
Token lifecycle:

├── 0%    Token issued
├── 80%   Proactive refresh triggered (background, non-blocking)
├── 100%  Token expires — new token already ready

Result: token never expires while a request is in flight
```

The 80% threshold provides a 20% overlap window:

- 15-minute STS token → refresh at minute 12
- 1-hour OAuth2 token → refresh at minute 48

### Static Credentials (Access Keys, Service Account JSON)

These do not auto-expire but require manual rotation:

| Credential type          | Recommended rotation          |
| ------------------------ | ----------------------------- |
| AWS Access Keys          | Every 90 days                 |
| GCP Service Account Keys | Every 90 days                 |
| Azure Client Secrets     | Every 180 days (prefer cert)  |
| JWT signing secret       | Every 180 days                |
| API Keys                 | Every 90 days or on suspicion |

---

## Security Rules

Apply to all contributors, all environments, no exceptions:

1. **Never log credential values** — log field names in errors, never values
2. **Never commit anything from secrets/** — gitignore covers it, but verify manually before every push
3. **Never put JSON content in .env** — use secrets/ folder
4. **Separate credentials per environment** — dev, staging, and prod each get their own service account, IAM user, or service principal
5. **Scope tightly** — dev credentials access only dev buckets, never production resources
6. **Rotate on suspicion** — if a credential may be compromised, rotate immediately without waiting for the scheduled cycle
7. **Audit quarterly** — review IAM policies every three months to remove permissions that are no longer needed

---

## Checking Your Setup

Run this before starting development to verify all credentials are in place:

```bash
npm run check:credentials
```

Runs `src/config.ts` in validation-only mode. Checks that:

- All required env vars are present and correctly typed
- All referenced key files exist at the specified paths
- All cloud provider clients can be initialized

Does not make any real API calls to cloud providers.

Output on success:

```
✅ Configuration loaded successfully
   Providers enabled: AWS, Azure, GCP
   Auth strategies: iam-role, managed-identity, service-account
```

Output on failure:

```
❌ Configuration error:
   providers.gcp.auth.keyFile: File not found: ./secrets/gcp-service-account.json
   → Follow secrets/README.md to create this file
```

---

## Where Each File Lives

```
cloudbridge-middleware/
├── .env.example          ← committed — shows what is needed, no real values
├── .env                  ← gitignored — your real local values
└── secrets/
    └── *.json / *.pem    ← gitignored — real credential files
```

---

## Change Log

| Date       | Change                                          |
| ---------- | ----------------------------------------------- |
| 2026-03-02 | Document created — 3-layer architecture defined |
