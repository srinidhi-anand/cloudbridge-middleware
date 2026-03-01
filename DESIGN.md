# CloudBridge — Design Document

**Author:** Srinidhi A\
**Started:** March 2, 2026\
**Status:** Active Development\
**Version:** 0.1

---

## Problem Statement

Every team building multi-cloud storage ends up maintaining three separate
integrations — each with different authentication flows, different error
formats, different upload patterns, and different stream handling behaviors.

There is no production-ready, open-source Node.js middleware that unifies
AWS S3, Azure Blob Storage, and GCP Cloud Storage under a single
authenticated REST API, with pluggable auth strategies, stream-first I/O,
and full observability.

This project builds that layer.

---

## What This Is Not

- Not a storage service itself — it proxies to existing cloud storage
- Not a data migration or sync tool
- Not a multi-cloud replication system (v1 writes to one provider per request)
- Not a replacement for Terraform or Pulumi — purely runtime middleware

---

## Core Design Principles

### 1. Stream-first, never buffer

Files pipe directly from the incoming request to the cloud SDK upload stream.
No file ever fully resides in process memory.
Consequence: memory usage stays flat regardless of file size.

### 2. Auth is pluggable, not hardcoded

Every supported auth strategy — IAM role, Managed Identity, Service Account,
JWT, API Key — is a separate strategy class implementing one interface.
Adding a new strategy requires touching exactly one file.

### 3. Providers are interchangeable at the interface boundary

All three adapters implement the same `IStorageAdapter` interface.
The Core Engine never knows which provider it's talking to.
Adding a fourth provider (Cloudflare R2, MinIO) requires touching exactly one file.

### 4. Errors are normalized, never leaked

Cloud provider errors are caught at the adapter boundary and mapped to a
unified `StorageError` type before propagating up.
Callers never receive raw AWS, Azure, or GCP error objects.

### 5. Every operation is observable

Every request generates a structured log event and an OpenTelemetry span.
Every auth attempt generates an audit event.
No silent failures.

---

## The Three Hardest Problems

These are the problems this project must solve that have no obvious answer
at the start. They are documented here to be honest about complexity,
not to signal difficulty.

---

### Hard Problem 1 — Credential Rotation During In-Flight Uploads

**The situation:**
AWS STS tokens have a configurable TTL of 15 minutes to 12 hours.
Azure AD tokens expire in 1 hour.
GCP OAuth2 access tokens expire in 1 hour.

A multipart upload of a large file can take 10–30 minutes.
A token that is valid when the upload starts may expire before it completes.

**Why this is hard:**
Naive rotation — detect expiry, refresh, retry — breaks the stream.
Retry means restarting the entire upload from byte 0.
For a 5GB file, that's unacceptable.

**The approach will be:**
Proactive refresh: refresh the token when it reaches 80% of its TTL,
not when it expires. The new token is ready before the old one dies.
For multipart uploads specifically: use the token that was valid at
upload initiation for the entire upload session, and refresh in the
background for the next request.

**Open Question is:**
Whether AWS S3 multipart upload sessions honor the token that created
the session, or whether each part upload re-evaluates the token.
This needs to be tested empirically — result will be documented.

---

### Hard Problem 2 — Stream Backpressure Across Three SDKs

**The situation:**
Node.js streams, AWS SDK v3 streams, Azure Blob streams, and GCP storage
streams all implement backpressure differently.

- AWS SDK v3 uses async iterables and `Readable.from()`
- Azure Blob SDK accepts `ReadableStream`, `Buffer`, or `Blob`
- GCP Storage SDK uses Node.js `Writable` streams via `.save()` or `.createWriteStream()`

A client uploading at 100MB/s to a cloud provider that can only absorb
50MB/s will cause memory to grow unboundedly if backpressure is not
propagated correctly back to the client.

**The approach will be:**
Each adapter implements a `createUploadStream()` method that returns a
Node.js `Writable`. Fastify pipes the request body into this writable.
Node.js backpressure propagates automatically through the pipe chain.
I will verify with memory profiling under load (heap snapshots at 100, 500, 1000 concurrent uploads).

**Open Question is:**
Whether GCP's `createWriteStream()` correctly signals backpressure
under high concurrency. Empirical test planned in Week 2.

---

### Hard Problem 3 — Error Normalization Without Losing Context

**The situation:**
The same logical error — "object not found" — looks completely different
across providers:

```
AWS:   { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } }
Azure: { code: 'BlobNotFound', statusCode: 404, details: {...} }
GCP:   { code: 404, errors: [{ domain: 'global', reason: 'notFound' }] }
```

Callers should receive a consistent `StorageError` regardless of provider.
But throwing away the original error loses debuggability.

**The approach will be:**
Unified `StorageError` carries: `code` (our enum), `provider`, `operation`,
`httpStatus`, and `originalError` (the raw provider error, preserved for
logging but never sent to the client).

**Open Question is:**
The full surface area of provider-specific error codes.
An error map will be built as it is encountered during integration testing.
The map will be a documented artifact of the project.

---

## Architecture Decisions

### Why Fastify over Express

Fastify's JSON schema validation is built into the route definition,
not bolted on as middleware. This means request validation, OpenAPI
generation, and TypeScript types all derive from one source of truth.
Express requires separate libraries for each of these.
Performance: Fastify benchmarks at ~2× Express throughput for JSON APIs.

### Why Node.js over Go or Rust

This middleware is I/O-bound, not CPU-bound. It proxies streams — it
does not transform or compute on them. Node.js's non-blocking I/O model
is well-suited to this workload. Go or Rust would offer no meaningful
advantage here and would significantly increase development time.

### Why TypeScript strict mode

All three cloud adapters must implement the same interface.
Without strict mode, the compiler will not catch a missing method or
incorrect return type until runtime. With strict mode, the interface
contract is enforced at compile time.

### Why Apache 2.0 over MIT

Apache 2.0 includes explicit patent grants. For infrastructure middleware
that may be adopted by companies, the patent grant reduces legal friction.
MIT is equally permissive but silent on patents.

---

## Success Criteria

These are measurable. Each one has a number, a method to measure it,
and a clear pass/fail line.

---

### SC-1 — Functional Completeness

**Criterion:** All five core operations work correctly on all three providers.

| Operation    | AWS S3 | Azure Blob | GCS | Pass condition                             |
| ------------ | ------ | ---------- | --- | ------------------------------------------ |
| putObject    |        |            |     | Returns etag, persists to cloud            |
| getObject    |        |            |     | Returns byte-identical file                |
| deleteObject |        |            |     | Object no longer exists                    |
| listObjects  |        |            |     | Returns all objects with correct metadata  |
| presignedUrl |        |            |     | URL works for 1 hour, rejects after expiry |

**Measurement:** Integration test suite, run against real cloud accounts.
**Target:** 100% pass on all operations, all providers.
**Measured:** Week 2, repeated in Week 4 after security layer added.

---

### SC-2 — Authentication Coverage

**Criterion:** All supported auth strategies successfully authenticate.

| Strategy          | Provider | Pass condition                             |
| ----------------- | -------- | ------------------------------------------ |
| IAM Role          | AWS      | Authenticates from EC2 instance metadata   |
| AssumeRole        | AWS      | Temporary credentials issued and used      |
| Access Key        | AWS      | Static credentials authenticate            |
| Managed Identity  | Azure    | Authenticates from Azure VM                |
| Service Principal | Azure    | Client secret and cert both work           |
| Service Account   | GCP      | JSON key file authenticates                |
| ADC               | GCP      | gcloud local credentials work              |
| JWT Bearer        | All      | Valid token passes, expired token rejected |
| API Key           | All      | Valid key passes, invalid key rejected     |

**Measurement:** Unit tests with mock credential providers + integration
tests with real credentials in CI.
**Target:** 100% pass.

---

### SC-3 — Performance Baseline

**Criterion:** Abstraction overhead is measurable and documented.

| Metric                      | Target                           | Method                        |
| --------------------------- | -------------------------------- | ----------------------------- |
| p99 latency (1MB putObject) | < 80ms overhead vs. direct SDK   | k6 load test, 500 concurrent  |
| Memory under load           | Flat — no growth over 10 minutes | heap snapshot, 500 concurrent |
| Throughput                  | > 500 req/sec (1KB objects)      | k6 constant arrival rate      |

**Measurement:** k6 load tests. Direct SDK baseline first, then through middleware.
Overhead = middleware p99 − direct SDK p99.
**Target:** Overhead < 5ms p99. If it exceeds this, investigate and document why.
**Measured:** Week 3.

---

### SC-4 — Reliability

**Criterion:** System recovers from provider failures without crashing.

| Scenario                            | Expected behavior                                    |
| ----------------------------------- | ---------------------------------------------------- |
| Provider returns 503                | Retry with exponential backoff, max 3 attempts       |
| Provider returns 429 (rate limited) | Backoff, respect Retry-After header                  |
| Token expires mid-request           | Request fails gracefully with `AUTH_EXPIRED` error   |
| Network timeout                     | Request fails with `TIMEOUT` error, no resource leak |

**Measurement:** Fault injection tests using mock adapters that return
controlled errors at specific points.
**Target:** Zero unhandled promise rejections, zero memory leaks in fault scenarios.

---

### SC-5 — Observability

**Criterion:** Every operation produces structured, queryable telemetry.

| Signal      | Requirement                                                    |
| ----------- | -------------------------------------------------------------- |
| Log event   | Every request: provider, operation, duration, status, tenant   |
| Audit event | Every auth: strategy, provider, tenant, IP, result             |
| Trace span  | Every request has a span with correct parent-child structure   |
| Error event | Every error includes: code, provider, operation, originalError |

**Measurement:** Manual verification with Pino output and Jaeger trace viewer.
**Target:** No operation completes without producing all four signal types.

---

### SC-6 — Code Quality

**Criterion:** The codebase is maintainable and well-tested.

| Metric                | Target                            |
| --------------------- | --------------------------------- |
| Test coverage         | ≥ 80% lines                       |
| TypeScript errors     | 0 in strict mode                  |
| Linting errors        | 0 (ESLint + Prettier)             |
| Documented interfaces | 100% of public methods have JSDoc |

---

## Open Questions

These are genuine unknown open things yet to find answers for, and
will need to discover empirically or through research. Each one is
framed as a testable hypothesis or a decision point.

---

### OQ-1 — Does S3 re-validate credentials per part in multipart uploads?

**Why it matters:**
If yes, our token rotation strategy must ensure the refreshed token is
available before each part upload, not just at session start.
If no, it can refresh lazily and the current session continues unaffected.

**How to answer it:**
Start a multipart upload with a 15-minute STS token.
Wait 20 minutes before uploading the second part.
Observe whether AWS accepts or rejects the part upload.

**Status:** Unanswered — planned for Week 2.

---

### OQ-2 — What is the actual abstraction overhead at p99?

**Why it matters:**
If overhead is >20ms, the middleware is a meaningful tax on every
storage operation. If it's <5ms, abstraction is essentially free.
This is the core empirical finding of the project.

**Hypothesis:** Overhead will be <5ms p99 at 500 concurrent connections
for 1MB objects. The dominant latency is network round-trip to the cloud,
not the middleware processing.

**How to answer it:**
k6 load test. Direct SDK call vs. identical call through middleware.
Measure at 10, 50, 100, 250, 500 concurrent connections.
Plot overhead vs. concurrency to identify if it scales linearly.

**Status:** Unanswered — planned for Week 3.

---

### OQ-3 — Is it possible to expose a meaningful consistency contract?

**Why it matters:**
S3 offers strong consistency for object reads/writes but eventual
consistency for some list operations. GCS offers strong consistency
for all operations. Azure Blob offers strong consistency.

A unified API that hides these differences may mislead callers into
assuming stronger guarantees than AWS actually provides.

**The options:**
A) Expose the lowest common denominator — eventual consistency everywhere.
Safe but unnecessarily conservative.
B) Expose provider-specific consistency guarantees per request.
Accurate but breaks the unified abstraction.
C) Document the differences prominently and let callers opt into
provider-specific behavior flags.

**Status:** Unanswered — decision needed before v1.0 API is finalized.
This is the most interesting research question in the project.

---

### OQ-4 — How should the unified error taxonomy be structured?

**Why it matters:**
Too few error codes and callers can't distinguish recoverable from
unrecoverable errors. Too many and the error surface becomes unwieldy.

**Draft taxonomy:**

```
NOT_FOUND          — object or bucket does not exist
FORBIDDEN          — credentials valid but insufficient permissions
AUTH_EXPIRED       — token expired mid-operation
AUTH_INVALID       — credentials rejected
QUOTA_EXCEEDED     — provider quota or rate limit hit
PROVIDER_ERROR     — provider returned 5xx
TIMEOUT            — operation exceeded deadline
VALIDATION_ERROR   — request was malformed
CONFLICT           — object already exists (if versioning off)
```

**Open question:** Is `CONFLICT` meaningful across all three providers?
GCS and S3 support conditional writes. Azure Blob has ETag-based
concurrency. Should these map to the same error code?

**Status:** Draft — needs validation during adapter implementation.

---

### OQ-5 — Should presigned URL generation be part of v1?

**Why it matters:**
Presigned URLs are a critical production use case — they let clients
upload directly to cloud storage without going through the middleware,
which eliminates the middleware as a bottleneck for large files.

All three providers support them but with different naming and behavior:

- AWS: presigned URLs via `@aws-sdk/s3-request-presigner`
- Azure: SAS tokens (different concept, same outcome)
- GCP: signed URLs via `file.getSignedUrl()`

**The risk:**
SAS tokens (Azure) are conceptually different from presigned URLs
(AWS/GCP) — they're attached to the storage account, not a specific
object path. Mapping them to a unified interface may hide important
security behavior differences.

**Status:** Leaning toward yes for v1, with prominent documentation
of the Azure behavioral difference.

---

## What this project Will Not Do in v1

Being explicit about scope prevents scope creep.

- No multi-provider writes (write to S3 and GCS simultaneously)
- No cross-provider object sync or replication
- No object transformation (resize, transcode) in the pipeline
- No client-side encryption (server-side encryption only)
- No fourth provider (Cloudflare R2, MinIO) — v1.x
- No UI or dashboard — CLI and REST API only

---

## Change Log

| Date       | Change                   | Author     |
| ---------- | ------------------------ | ---------- |
| 2026-03-02 | Initial document created | Srinidhi A |
