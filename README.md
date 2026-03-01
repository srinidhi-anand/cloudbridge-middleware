<div align="center">

<img src="https://raw.githubusercontent.com/YOUR_USERNAME/cloudbridge-middleware/main/docs/assets/banner.png" alt="CloudBridge Banner" width="100%"/>

# ☁ CloudBridge Middleware

### One API. Three Clouds. Zero Vendor Lock-in.

**Unified storage middleware for AWS S3 · Azure Blob · GCP Cloud Storage**  
Built with Node.js · Fastify · TypeScript · Apache 2.0

---

[![npm version](https://img.shields.io/npm/v/cloudbridge-middleware?color=00FFB2&style=flat-square)](https://www.npmjs.com/package/cloudbridge-middleware)
[![Build Status](https://img.shields.io/github/actions/workflow/status/YOUR_USERNAME/cloudbridge-middleware/ci.yml?style=flat-square&color=00FFB2)](https://github.com/YOUR_USERNAME/cloudbridge-middleware/actions)
[![Coverage](https://img.shields.io/codecov/c/github/YOUR_USERNAME/cloudbridge-middleware?style=flat-square&color=00FFB2)](https://codecov.io/gh/YOUR_USERNAME/cloudbridge-middleware)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen?style=flat-square)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](./CONTRIBUTING.md)
[![Research](https://img.shields.io/badge/research-open--questions-purple?style=flat-square)](./RESEARCH.md)

---

[**Quick Start**](#-quick-start) · [**Architecture**](#-architecture) · [**Auth Methods**](#-authentication) · [**Benchmarks**](#-benchmarks) · [**Research**](#-research--academic) · [**Contributing**](#-contributing) · [**Roadmap**](#-roadmap)

</div>

---

## 🎯 The Problem

Every team building multi-cloud ends up writing this:

```typescript
// ❌ Without CloudBridge — three integrations, three auth flows, three error formats

// AWS
const s3 = new S3Client({ region: "ap-south-1", credentials });
await s3.send(new PutObjectCommand({ Bucket, Key, Body }));

// Azure
const blob = new BlobServiceClient(connectionString);
await blob
  .getContainerClient(container)
  .getBlockBlobClient(key)
  .upload(body, contentLength);

// GCP
const storage = new Storage({ keyFilename: "./sa.json" });
await storage.bucket(bucket).file(key).save(body);
```

```typescript
// ✅ With CloudBridge — one interface, pluggable auth, unified errors

import { CloudBridge } from "cloudbridge-middleware";

const bridge = new CloudBridge(config);

await bridge.putObject("aws", { bucket, key, body });
await bridge.putObject("azure", { bucket, key, body });
await bridge.putObject("gcp", { bucket, key, body });
```

---

## ✨ Features

| Feature             | Description                                                    |
| ------------------- | -------------------------------------------------------------- |
| 🔐 **Multi-Auth**   | IAM, Managed Identity, Service Account, JWT, API Key, mTLS     |
| ☁ **Three Clouds**  | AWS S3 · Azure Blob Storage · GCP Cloud Storage                |
| 🌊 **Stream-first** | Files pipe directly — never buffered in memory                 |
| 🛡️ **Zero-trust**   | RBAC, audit logs, credential rotation, rate limiting           |
| 📊 **Observable**   | OpenTelemetry traces, Pino structured logs, Prometheus metrics |
| 🔄 **Resilient**    | Circuit breaker, exponential backoff, retry budgets            |
| 📦 **Typed**        | Full TypeScript with strict mode — no any                      |
| 🧪 **Tested**       | >80% coverage, mock adapters, fault injection tests            |

---

## ⚡ Quick Start

### Install

```bash
npm install cloudbridge-middleware
```

### Configure

```typescript
// cloudbridge.config.ts
import { CloudBridgeConfig } from "cloudbridge-middleware";

const config: CloudBridgeConfig = {
  providers: {
    aws: {
      auth: {
        type: "iam-role", // or 'access-key', 'assume-role', 'oidc'
        roleArn: process.env.AWS_ROLE_ARN,
      },
      region: "ap-south-1",
    },
    azure: {
      auth: {
        type: "managed-identity", // or 'service-principal', 'azure-ad'
      },
      accountName: process.env.AZURE_STORAGE_ACCOUNT,
    },
    gcp: {
      auth: {
        type: "service-account", // or 'workload-identity', 'adc'
        keyFile: process.env.GCP_KEY_FILE,
      },
      projectId: process.env.GCP_PROJECT_ID,
    },
  },
};
```

### Use

```typescript
import { CloudBridge } from "cloudbridge-middleware";
import { config } from "./cloudbridge.config";

const bridge = new CloudBridge(config);

// Upload
const result = await bridge.putObject("aws", {
  bucket: "my-bucket",
  key: "uploads/photo.jpg",
  body: readableStream,
  contentType: "image/jpeg",
});
// → { etag: 'abc123', provider: 'aws', key: 'uploads/photo.jpg' }

// Download
const stream = await bridge.getObject("gcp", { bucket, key });

// List
const objects = await bridge.listObjects("azure", {
  bucket,
  prefix: "uploads/",
});

// Delete
await bridge.deleteObject("aws", { bucket, key });

// Presigned URL (all providers)
const url = await bridge.presignedUrl("aws", { bucket, key, expiresIn: 3600 });
```

### As a REST API (Fastify server)

```bash
# Start the middleware server
npx cloudbridge-server --config ./cloudbridge.config.ts --port 3000

# Upload via HTTP
curl -X PUT http://localhost:3000/objects/aws/my-bucket/photo.jpg \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: image/jpeg" \
  --data-binary @photo.jpg

# Response
# { "etag": "abc123", "provider": "aws", "bucket": "my-bucket", "key": "photo.jpg" }
```

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Client Request                       │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                    Auth Gateway                          │
│  JWT · API Key · IAM · Managed Identity · Service Acct  │
│  Credential resolver · Token rotation · Vault sync      │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                   Unified REST API                       │
│     Fastify v4 · Zod validation · OpenAPI 3.1 docs      │
│     Rate limiting · RBAC middleware · Audit logging      │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                    Core Engine                           │
│   Provider router · StorageObject model normalizer      │
│   Stream pipeline · Circuit breaker · Error normalizer  │
└────────┬──────────────────┬──────────────────┬──────────┘
         │                  │                  │
┌────────▼───────┐ ┌────────▼───────┐ ┌────────▼───────┐
│   AWS Adapter  │ │  Azure Adapter │ │   GCP Adapter  │
│  @aws-sdk v3   │ │ @azure/storage │ │ @google-cloud  │
│   S3 · STS     │ │  Blob · AAD    │ │  Storage · IAM │
└────────┬───────┘ └────────┬───────┘ └────────┬───────┘
         │                  │                  │
┌────────▼───────┐ ┌────────▼───────┐ ┌────────▼───────┐
│   Amazon S3    │ │  Azure Blob    │ │  GCP Cloud     │
│                │ │   Storage      │ │   Storage      │
└────────────────┘ └────────────────┘ └────────────────┘
```

### Request Flow

```
Client → [Auth] → [Validate] → [Route] → [Adapter] → [Cloud] → [Normalize] → Client
           ↑                                               ↓
      Credential                                    Error mapping
       Resolver                                    Unified model
```

### Project Structure

```
src/
├── adapters/
│   ├── aws-s3.adapter.ts          # AWS S3 — @aws-sdk/client-s3 v3
│   ├── azure-blob.adapter.ts      # Azure Blob — @azure/storage-blob v12
│   ├── gcs.adapter.ts             # GCS — @google-cloud/storage v7
│   └── adapter.interface.ts       # IStorageAdapter contract
├── auth/
│   ├── strategies/
│   │   ├── aws-iam.strategy.ts
│   │   ├── azure-ad.strategy.ts
│   │   ├── gcp-sa.strategy.ts
│   │   └── jwt.strategy.ts
│   └── credential-resolver.ts     # Multi-provider credential logic
├── routes/
│   ├── buckets.route.ts
│   └── objects.route.ts
├── middleware/
│   ├── authenticate.ts
│   ├── authorize.ts               # RBAC
│   ├── rate-limit.ts              # Redis-backed per-tenant
│   └── audit-log.ts              # Structured event logging
├── models/
│   └── storage-object.model.ts    # Unified response type
└── server.ts
```

---

## 🔐 Authentication

CloudBridge supports every major authentication method across all three providers. All strategies are pluggable and can be configured per-tenant.

### AWS

| Method                    | Config Key            | Use Case              |
| ------------------------- | --------------------- | --------------------- |
| IAM Role (EC2/ECS/Lambda) | `type: 'iam-role'`    | Deployed on AWS infra |
| AssumeRole + STS          | `type: 'assume-role'` | Cross-account access  |
| Access Key + Secret       | `type: 'access-key'`  | Local dev / CI        |
| Web Identity (OIDC)       | `type: 'oidc'`        | GitHub Actions, K8s   |

### Azure

| Method                     | Config Key                  | Use Case                |
| -------------------------- | --------------------------- | ----------------------- |
| Managed Identity           | `type: 'managed-identity'`  | Deployed on Azure infra |
| Service Principal + Secret | `type: 'service-principal'` | Applications            |
| Service Principal + Cert   | `type: 'sp-certificate'`    | High-security apps      |
| Azure AD OAuth2            | `type: 'azure-ad'`          | User-delegated access   |

### GCP

| Method              | Config Key                  | Use Case              |
| ------------------- | --------------------------- | --------------------- |
| Service Account Key | `type: 'service-account'`   | Applications          |
| Workload Identity   | `type: 'workload-identity'` | GKE pods              |
| Application Default | `type: 'adc'`               | Local dev             |
| OAuth2 User         | `type: 'oauth2'`            | User-delegated access |

### Generic (all providers)

| Method     | Header                          | Use Case            |
| ---------- | ------------------------------- | ------------------- |
| JWT Bearer | `Authorization: Bearer <token>` | API clients         |
| API Key    | `X-API-Key: <key>`              | Server-to-server    |
| mTLS       | Client certificate              | Zero-trust networks |

### Security Hardening

- **Vault Integration** — HashiCorp Vault or AWS Secrets Manager. Zero plaintext credentials in environment variables or code
- **Token Rotation** — STS tokens auto-refreshed every 15 min. OAuth2 tokens refreshed before expiry without dropping in-flight requests
- **Audit Trail** — Every auth attempt logged: provider, method, tenant, IP, timestamp, result
- **Least Privilege** — Read-only tokens for GET operations, write-scoped tokens for PUT/DELETE

---

## 📊 Benchmarks

> Results measured on: AWS t3.medium · 500 concurrent connections · 1MB objects · ap-south-1

| Operation | Provider   | p50 | p95 | p99 | Throughput |
| --------- | ---------- | --- | --- | --- | ---------- |
| putObject | AWS S3     | —   | —   | —   | —          |
| putObject | Azure Blob | —   | —   | —   | —          |
| putObject | GCS        | —   | —   | —   | —          |
| getObject | AWS S3     | —   | —   | —   | —          |
| getObject | Azure Blob | —   | —   | —   | —          |
| getObject | GCS        | —   | —   | —   | —          |

> 🚧 Benchmark results coming at v1.0 (April 1, 2026). [Follow along →](./docs/devlog.md)

### Abstraction Overhead

One of the core research questions this project investigates:

> _What is the measurable latency cost of a unified abstraction layer compared to direct SDK calls?_

Preliminary hypothesis: overhead will be under 5ms p99. Results will be published at v1.0.

---

## 🔬 Research & Academic

This project is also an active research artifact investigating distributed systems questions in multi-cloud storage.

### Open Research Questions

1. **Consistency anomalies** — What consistency guarantees can a middleware layer provide when writing to providers with different consistency models (S3 eventual vs GCS strong)?

2. **Abstraction overhead** — What is the measurable performance cost of provider normalization at scale? Is it worth it?

3. **Credential rotation under load** — How do short-lived token expiry windows affect p99 latency distribution during high-concurrency uploads?

4. **Failure propagation** — How do partial failures (one provider down mid-multipart) propagate through the abstraction layer?

See [RESEARCH.md](./RESEARCH.md) for full open questions, related work, and how to collaborate.

### Related Work

- [Libcloud](https://libcloud.apache.org/) — Apache multi-cloud library (Python)
- [Rclone](https://rclone.org/) — CLI tool for cloud storage sync
- [Pulumi](https://www.pulumi.com/) — Infrastructure as code, multi-cloud

### Academic Collaboration

Actively seeking pre-PhD collaboration with researchers in:

- Distributed systems
- Cloud storage and consistency
- Systems performance measurement

**Interested?** Open an issue tagged `[research]` or email [srinidhianand4@email.com](mailto:srinidhianand4@email.com)

---

## 🛠 Tech Stack

| Layer         | Choice                | Why                                                |
| ------------- | --------------------- | -------------------------------------------------- |
| Runtime       | Node.js 24 LTS        | Non-blocking I/O ideal for stream proxying         |
| Framework     | Fastify v4            | 2× faster than Express, schema validation built-in |
| Language      | TypeScript 5 strict   | Contract enforcement across all adapters           |
| Auth          | Passport.js + custom  | Pluggable strategy pattern                         |
| Secret Store  | HashiCorp Vault       | Dynamic credentials, auto-rotation                 |
| Validation    | Zod + JSON Schema     | Runtime + compile-time safety                      |
| Testing       | Vitest + Supertest    | Fast, ESM-native, mock adapters                    |
| Observability | OpenTelemetry + Pino  | Traces, metrics, structured logs                   |
| Container     | Docker + Kubernetes   | Helm chart with HPA, pod identity                  |
| CI/CD         | GitHub Actions        | Lint → test → build → publish                      |
| API Docs      | Swagger / OpenAPI 3.1 | Auto-generated from Fastify schemas                |

---

## 📅 Roadmap

### v0.1 — Foundation _(Week 1)_

- [x] Repo structure and TypeScript setup
- [ ] Credential resolver (all 3 providers + JWT + API Key)
- [ ] StorageObject unified model
- [ ] IStorageAdapter interface contract

### v0.2 — Core Adapters _(Week 2)_

- [ ] AWS S3 adapter (upload, download, delete, list, presigned)
- [ ] Azure Blob adapter (same ops + SAS tokens)
- [ ] GCS adapter (same ops + signed URLs)
- [ ] Stream pipeline (no memory buffering)

### v0.3 — Security _(Week 3)_

- [ ] RBAC middleware
- [ ] Rate limiting (Redis-backed, per-tenant)
- [ ] Audit logging
- [ ] Credential rotation during in-flight uploads

### v1.0 — Production Ready _(Week 4 · April 1, 2026)_

- [ ] OpenTelemetry integration
- [ ] Kubernetes Helm chart
- [ ] Benchmark results published
- [ ] npm publish
- [ ] OpenAPI docs

### v1.x — Future

- [ ] Fourth provider: Cloudflare R2
- [ ] Multi-provider write (write to all three simultaneously)
- [ ] Consistency research hooks
- [ ] Web dashboard (built with the architecture visualization)

---

## 🤝 Contributing

Contributions are welcome from both **industry engineers** and **academic researchers**.

### For Engineers

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/cloudbridge-middleware
cd cloudbridge-middleware

# Install dependencies
npm install

# Run tests
npm test

# Run with mock providers (no real cloud accounts needed)
npm run dev:mock
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for:

- Code style guide
- How to add a new cloud provider
- How to add a new auth strategy
- PR review process

### For Researchers

See [RESEARCH.md](./RESEARCH.md) for:

- Open research questions
- How to reproduce benchmarks
- How to propose a research collaboration
- Citation format

### Good First Issues

Issues tagged [`good-first-issue`](https://github.com/YOUR_USERNAME/cloudbridge-middleware/issues?q=label%3Agood-first-issue) are scoped for new contributors.

---

## 📖 Documentation

| Document                                   | Description                                  |
| ------------------------------------------ | -------------------------------------------- |
| [DESIGN.md](./DESIGN.md)                   | Architecture decisions and hard problems     |
| [RESEARCH.md](./RESEARCH.md)               | Open research questions and academic context |
| [CONTRIBUTING.md](./CONTRIBUTING.md)       | How to contribute                            |
| [docs/devlog.md](./docs/devlog.md)         | Public build log — updated daily             |
| [docs/benchmarks.md](./docs/benchmarks.md) | Methodology and raw results                  |
| [API Reference](./docs/api.md)             | Full REST API documentation                  |

---

## 📜 License

Licensed under the [Apache License 2.0](./LICENSE).

You are free to use, modify, and distribute this software — including in commercial products — with attribution. Patent protection is included.

```
Copyright 2026 CloudBridge Contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
```

---

## 🙏 Acknowledgements

Built with inspiration from:

- [Apache Libcloud](https://libcloud.apache.org/) — the original multi-cloud abstraction
- [Rclone](https://rclone.org/) — showed that cloud storage unification is genuinely useful
- Research from USENIX ATC, ACM SoCC on distributed storage systems

---

<div align="center">

**Built in public · Day by day · Starting March 2, 2026**

[Follow the build log →](./docs/devlog.md) · [Star on GitHub ⭐](https://github.com/YOUR_USERNAME/cloudbridge-middleware)

</div>
