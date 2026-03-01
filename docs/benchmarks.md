# CloudBridge — Benchmark Documentation

> Methodology is written before any results — the test design is not shaped
> by what the numbers turn out to be. This is basic research integrity.
>
> Scripts are added to benchmarks/scenarios/ once adapters are built in Week 3.
> Results tables are filled in as each scenario is run.
>
> **Reproducibility:** Anyone with free-tier cloud accounts should be able
> to run these benchmarks and get comparable results following this document.

---

## The Central Research Question

CloudBridge sits in the hot path of every storage operation.
Every upload, download, and list call passes through it.

> _What is the measurable overhead of a unified abstraction layer
> compared to direct cloud SDK invocation — and is that overhead
> acceptable for production use?_

If overhead is negligible (< 5ms p99) — abstraction is essentially free.
If overhead is significant (> 20ms p99) — users face a real tradeoff.

Either result is a valid and publishable finding.

---

## Benchmark Environment

### Development Machine

| Component | Specification                                |
| --------- | -------------------------------------------- |
| OS        | Windows 11 (primary development environment) |
| Node.js   | 24.x LTS                                     |
| npm       | 11.x (ships with Node.js 24)                 |
| Shell     | PowerShell 7+                                |

> Node.js 24 entered LTS in October 2025 and is supported until April 2028.
> It ships with npm 11 which includes ~65% faster dependency resolution
> than npm 10 and improved security scanning.
> All benchmark scripts in this project are written to run on Windows.

### Benchmark Server (Where Tests Run)

Benchmarks are run from a cloud server, not the local development machine.
Local machine network conditions would make results unreproducible.

| Component     | Specification                     |
| ------------- | --------------------------------- |
| Instance type | AWS t3.medium (2 vCPU, 4GB RAM)   |
| OS            | Ubuntu 22.04 LTS                  |
| Node.js       | 24.x LTS                          |
| Network       | AWS VPC, same region as S3 bucket |

> Rationale for t3.medium: representative of a typical application server.
> Not tuned for maximum throughput — tuned for realistic conditions.

### Cloud Regions

| Provider          | Region              | Rationale                                     |
| ----------------- | ------------------- | --------------------------------------------- |
| AWS S3            | ap-south-1 (Mumbai) | Closest to Chennai with free tier eligibility |
| Azure Blob        | southeastasia       | Closest free tier region                      |
| GCP Cloud Storage | asia-south1         | Closest to Chennai                            |

> All three in the same geographic zone to make provider comparisons fair.
> Cross-region tests would inflate numbers and make comparisons misleading.

### Software Versions

| Software              | Version  |
| --------------------- | -------- |
| Node.js               | 24.x LTS |
| npm                   | 11.x     |
| Fastify               | 4.x      |
| @aws-sdk/client-s3    | 3.x      |
| @azure/storage-blob   | 12.x     |
| @google-cloud/storage | 7.x      |
| k6                    | 0.49.x   |
| TypeScript            | 5.x      |

> Exact versions are pinned in package-lock.json.
> Each result row records the git commit hash it was measured on.
> Use `npm ci` (not `npm install`) to reproduce the exact dependency tree.

---

## Why Node.js 24 Matters for This Project

Node.js 24 comes with npm 11, which includes several improvements and new features — enhanced performance, improved security, and better compatibility with modern JavaScript packages.

Three specific Node.js 24 features directly affect CloudBridge:

**1. Improved AsyncLocalStorage**
AsyncLocalStorage now uses AsyncContextFrame by default, which provides a more efficient implementation of asynchronous context tracking.
CloudBridge uses AsyncLocalStorage to propagate request context (tenant ID,
auth strategy, provider) through the async call chain without passing it
explicitly. This improvement directly reduces overhead in the Core Engine.

**2. Explicit resource management (`using` keyword)**
Node.js 24 supports the `using` statement for automatic resource cleanup.
Useful for ensuring credential clients and stream handles are released
correctly after each request — reduces risk of resource leaks under load.

**3. Undici 7 HTTP client**
Node.js 24 updates Undici to the latest major version (7.X) which includes better performance and support for some additional HTTP features.
Undici is used internally by Node.js fetch. Relevant for any health check
or internal HTTP calls the middleware makes.

---

## Load Test Tool — k6

All benchmark tests use [k6](https://k6.io) (v0.49+).

### Why k6

- Tests written in JavaScript — readable alongside the Node.js codebase
- Native p50/p95/p99 output — no post-processing required
- Supports constant arrival rate, ramping VUs, and pass/fail thresholds
- Results exportable to JSON for analysis and archiving
- Actively maintained, widely used in both industry and research contexts

---

## Installing k6 on Windows

### Option 1 — winget (Recommended)

Built into Windows 10 (version 1709+) and Windows 11. No admin rights needed.

```powershell
winget install k6
```

Close and reopen PowerShell after install, then verify:

```powershell
k6 version
# Expected: k6 v0.49.0 (go1.21.x, windows/amd64)
```

**If k6 is not recognized after install:**
The PATH update requires a fresh terminal session.
Close PowerShell completely and reopen — do not just open a new tab.

**If you see a script execution policy error:**

```powershell
# Run once in PowerShell as Administrator
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

### Option 2 — Chocolatey

```powershell
# PowerShell as Administrator
choco install k6
k6 version
```

---

### Option 3 — Direct MSI Installer

No package manager required.

1. Go to `https://dl.k6.io/msi/`
2. Download the latest `.msi` file
3. Double-click to install
4. Open a new PowerShell window
5. Run `k6 version` to confirm

---

### Verifying k6 Works

Before running any CloudBridge benchmarks, confirm k6 is working
with a simple smoke test. Save this as `smoke-test.js` anywhere:

```javascript
import http from "k6/http";
export default function () {
  http.get("https://httpbin.org/get");
}
```

```powershell
k6 run smoke-test.js
```

Expected output:

```
          /\      |‾‾| /‾‾/   /‾‾/
     /\  /  \     |  |/  /   /  /
    /  \/    \    |     (   /   ‾‾\
   /          \   |  |\  \ |  (‾)  |
  / __________ \  |__| \__\ \_____/ .io

  scenarios: 1 scenario, 1 max VUs
  ✓ http_req_duration: avg=~200ms
```

If this runs successfully, k6 is ready for Week 3 benchmarks.

---

### Windows-Specific Notes for Running k6

PowerShell uses backtick for line continuation, not backslash like bash.

```powershell
# Correct Windows line continuation:
k6 run benchmarks/scenarios/put-object-1mb.js `
  -e BASE_URL=http://localhost:3000 `
  -e PROVIDER=aws `
  -e JWT_TOKEN=your-test-jwt

# Equivalent bash (for the Ubuntu benchmark server):
k6 run benchmarks/scenarios/put-object-1mb.js \
  -e BASE_URL=http://localhost:3000 \
  -e PROVIDER=aws \
  -e JWT_TOKEN=your-test-jwt
```

Environment variables in PowerShell use `$env:` prefix:

```powershell
# Set before running k6
$env:BASE_URL = "http://localhost:3000"
$env:PROVIDER = "aws"
$env:JWT_TOKEN = "your-test-jwt"

k6 run benchmarks/scenarios/put-object-1mb.js
```

---

### Running Benchmarks (Week 3 — After Adapters Are Built)

> Scripts do not exist yet — they are added in Week 3 once the
> adapter layer is complete. These commands will work at that point.

```powershell
# Single scenario
k6 run benchmarks/scenarios/put-object-1mb.js

# Full suite via npm script
npm run benchmark

# Save raw results for archiving
k6 run benchmarks/scenarios/put-object-1mb.js `
  --out json=benchmarks/results/raw/put-1mb-aws-$(Get-Date -Format yyyyMMdd).json
```

---

## What Is Being Measured

Two call paths for the same operation:

```
Path A — Direct SDK (baseline):
k6 → AWS SDK → S3

Path B — Through CloudBridge:
k6 → Fastify → Auth → Core Engine → AWS Adapter → AWS SDK → S3

Overhead = Path B p99 − Path A p99
```

The overhead represents the cost of:

- HTTP parsing in Fastify
- JWT or API key validation
- Provider routing in the Core Engine
- Request and response normalization
- Error wrapping at the adapter boundary

---

## Test Scenarios

---

### Scenario 1 — putObject Latency

**What it measures:**
End-to-end latency of uploading a single object, from first byte sent
to response received. Tested on all three providers.

**Why this is the primary scenario:**
putObject is the most common write operation and the most sensitive
to middleware overhead. If abstraction cost exists, it shows here first.

**Object sizes:**

| Size   | Rationale                                                 |
| ------ | --------------------------------------------------------- |
| 10 KB  | Thumbnail, config file — overhead proportionally largest  |
| 100 KB | Document, small image — balanced workload                 |
| 1 MB   | Typical web asset — primary benchmark size                |
| 10 MB  | Large document, audio file                                |
| 100 MB | Video segment — network round-trip dominates at this size |

**Concurrency levels:**

| Virtual Users | Rationale                                            |
| ------------- | ---------------------------------------------------- |
| 10            | Light load — baseline behavior                       |
| 50            | Moderate — typical small application                 |
| 100           | Medium load                                          |
| 250           | High load                                            |
| 500           | Stress — where overhead becomes visible if it exists |

**Status:** 🔲 Planned — Week 3

---

### Scenario 2 — getObject Latency

**What it measures:**
End-to-end latency of downloading a single object.
Same object sizes and concurrency levels as Scenario 1.

**Additional metric — Time to First Byte (TTFB):**
Measures when the response stream starts, not when it completes.
Important for streaming use cases where the client processes data
before the full file arrives.

**Status:** 🔲 Planned — Week 3

---

### Scenario 3 — listObjects Latency

**What it measures:**
Latency of listing objects with varying bucket sizes.
Tests whether pagination handling in the Core Engine adds overhead.

**Bucket sizes tested:**

| Objects in bucket | Rationale                          |
| ----------------- | ---------------------------------- |
| 100               | Small bucket                       |
| 1,000             | Medium bucket                      |
| 10,000            | Large bucket — pagination required |

**Status:** 🔲 Planned — Week 3

---

### Scenario 4 — Auth Strategy Overhead

**What it measures:**
The latency cost of each authentication strategy in isolation.
Operation is fixed (putObject, 1MB). Only the auth strategy varies.

**Expected overhead per strategy:**

| Strategy           | Expected overhead | Reason                              |
| ------------------ | ----------------- | ----------------------------------- |
| API Key            | ~0ms              | Single hash comparison in memory    |
| JWT Bearer         | ~1ms              | Token verification, no network call |
| IAM Role (cached)  | ~0ms              | Credentials already in memory       |
| IAM Role (refresh) | ~50–100ms         | STS network call required           |
| AssumeRole         | ~100–200ms        | STS call on every refresh cycle     |
| Service Principal  | ~50–100ms         | Azure AD token refresh call         |

> Token caching should eliminate refresh overhead in steady state.
> This scenario verifies that caching works correctly under load.

**Status:** 🔲 Planned — Week 3

---

### Scenario 5 — Memory Under Sustained Load

**What it measures:**
Node.js heap usage over time under sustained concurrent upload load.
Specifically: does memory stay flat, or does it grow?

**Why this matters:**
If the stream piping architecture is correct, memory stays flat
regardless of how many concurrent uploads are in flight.
If memory grows, there is a buffering bug — files are being held
in memory instead of piped through.

**Pass condition:**
Heap stays within ±10% of its baseline value after warmup.
Any sustained upward trend over 10 minutes is a failure.

**Status:** 🔲 Planned — Week 3

---

### Scenario 6 — Abstraction Overhead (The Core Finding)

**This is the primary research scenario.**

Direct SDK baseline vs. identical call through CloudBridge.
The difference is the pure cost of the abstraction layer.

**Method:**

1. Run Scenario 1 (putObject, 1MB, 500 VUs) calling AWS SDK directly —
   no Fastify, no middleware, no auth. This is the true minimum latency.
2. Run the identical scenario through CloudBridge.
3. Overhead = CloudBridge p99 − Direct SDK p99.

**Expected finding:**
Overhead will be dominated by Fastify HTTP parsing and JWT verification,
not by the adapter abstraction itself.
Hypothesis: < 5ms p99 overhead at 500 concurrent connections.

**Status:** 🔲 Planned — Week 3

---

## Results

> Added as each scenario is run in Week 3.
> Every result row records the git commit hash and run date.
> Raw k6 JSON files are saved in benchmarks/results/raw/ (gitignored — too large).

---

### Scenario 1 — putObject Latency

#### AWS S3

| Object Size | VUs | p50 | p95 | p99 | Throughput | Commit | Date |
| ----------- | --- | --- | --- | --- | ---------- | ------ | ---- |
| 1 MB        | 100 | —   | —   | —   | —          | —      | —    |
| 1 MB        | 500 | —   | —   | —   | —          | —      | —    |
| 10 MB       | 100 | —   | —   | —   | —          | —      | —    |

#### Azure Blob

| Object Size | VUs | p50 | p95 | p99 | Throughput | Commit | Date |
| ----------- | --- | --- | --- | --- | ---------- | ------ | ---- |
| 1 MB        | 100 | —   | —   | —   | —          | —      | —    |
| 1 MB        | 500 | —   | —   | —   | —          | —      | —    |

#### GCP Cloud Storage

| Object Size | VUs | p50 | p95 | p99 | Throughput | Commit | Date |
| ----------- | --- | --- | --- | --- | ---------- | ------ | ---- |
| 1 MB        | 100 | —   | —   | —   | —          | —      | —    |
| 1 MB        | 500 | —   | —   | —   | —          | —      | —    |

---

### Scenario 4 — Auth Strategy Overhead

| Strategy           | Provider | p50 overhead | p99 overhead | Notes | Date |
| ------------------ | -------- | ------------ | ------------ | ----- | ---- |
| API Key            | All      | —            | —            | —     | —    |
| JWT Bearer         | All      | —            | —            | —     | —    |
| IAM Role (cached)  | AWS      | —            | —            | —     | —    |
| IAM Role (refresh) | AWS      | —            | —            | —     | —    |
| Managed Identity   | Azure    | —            | —            | —     | —    |
| Service Account    | GCP      | —            | —            | —     | —    |

---

### Scenario 5 — Memory Under Sustained Load

| Scenario              | Initial heap | At 5 min | At 10 min | Trend | Date |
| --------------------- | ------------ | -------- | --------- | ----- | ---- |
| 500 VU × 10MB uploads | —            | —        | —         | —     | —    |

---

### Scenario 6 — Abstraction Overhead (Core Finding)

| Operation | Size | VUs | Direct SDK p99 | CloudBridge p99 | Overhead | Date |
| --------- | ---- | --- | -------------- | --------------- | -------- | ---- |
| putObject | 1 MB | 500 | —              | —               | —        | —    |
| putObject | 1 MB | 100 | —              | —               | —        | —    |
| getObject | 1 MB | 500 | —              | —               | —        | —    |

---

## How to Reproduce These Results

```powershell
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/cloudbridge-middleware
cd cloudbridge-middleware

# 2. Check out the exact commit from the results table above
git checkout <commit-hash>

# 3. Install exact dependencies — use ci not install
npm ci

# 4. Configure credentials
cp .env.example .env
# Fill in .env — follow docs/credential-management.md

# 5. Verify setup
npm run check:credentials

# 6. Run the full benchmark suite (Week 3 — once scripts exist)
npm run benchmark
```

**Expected variance:** ±10–15% on p99 due to cloud network variability.
If results differ by more than 20%, check: same region, same instance
type, no competing load on the server.

---

## Statistical Notes

- All latency values in milliseconds
- Minimum 1,000 samples per data point
- Warmup period: first 10 seconds excluded from each run
- p50 = median · p95 = 95th percentile · p99 = 99th percentile
- Each scenario run three times — median run reported, all three archived in raw/
- Throughput = successful requests per second

---

## Honest Limitations

**Free tier rate limits:**
Cloud free tier accounts have throughput limits that may cap results
at high concurrency. Numbers at 500 VUs may reflect rate limiting,
not actual latency characteristics of the middleware.

**Single region:**
All tests run in a single cloud region per provider.
Multi-region latency profiles would differ significantly.

**Single instance:**
Benchmarks run on one CloudBridge instance.
Horizontal scaling behavior is not measured.

**Synthetic workload:**
Constant arrival rate with fixed object sizes. Real applications
have mixed read/write ratios, varying sizes, and bursty patterns.

These limitations do not invalidate the findings — they scope them.
Results characterize single-instance, single-region behavior for
representative object sizes under constant load.

---

## Change Log

| Date       | Change                                                 |
| ---------- | ------------------------------------------------------ |
| 2026-03-02 | Document created — methodology written, no results yet |
| —          | Scenarios 1–6 run, results added (Week 3)              |
