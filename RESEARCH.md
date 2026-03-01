# CloudBridge — Research Document

> This file is for academic readers, potential PhD collaborators,  
> and researchers interested in multi-cloud storage systems.

---

## Overview

CloudBridge is both an **engineering artifact** and a **research platform**.  
The system is designed to be instrumented, measured, and studied — not just used.

This document outlines the open research questions this project addresses,  
the empirical methodology, and how to get involved as a collaborator.

---

## Research Questions

### RQ1 — Abstraction Overhead

> _What is the measurable latency and throughput cost of a unified abstraction  
> layer compared to direct SDK invocation, at varying concurrency levels?_

**Hypothesis:** Overhead will be under 5ms p99 at 500 concurrent connections  
for 1MB objects, making abstraction cost negligible in practice.

**Method:** k6 load tests, direct SDK baseline vs. CloudBridge, measured at  
p50/p95/p99 across 10,000 operations per provider.

**Status:** Planned — Week 3

---

### RQ2 — Credential Rotation Under Load

> _How do short-lived token expiry windows (15-min STS tokens, 1-hour OAuth2)  
> affect p99 latency distribution during sustained high-concurrency uploads?_

**Hypothesis:** Naive rotation causes p99 spikes. Proactive refresh with  
overlap window eliminates spikes at the cost of marginal token waste.

**Method:** Synthetic load with token expiry injected at intervals.  
Measure p99 latency before/after rotation events.

**Status:** Planned — Week 3–4

---

### RQ3 — Error Propagation Patterns

> _What are the failure propagation characteristics when one provider  
> fails mid-operation in a multi-provider write scenario?_

**Hypothesis:** Without explicit saga patterns, partial writes create  
inconsistent state that is difficult to detect and recover from.

**Method:** Fault injection (chaos testing) with one provider returning  
errors at specific operation stages.

**Status:** Planned — v1.x

---

### RQ4 — Consistency Model Exposure

> _What consistency guarantees can a middleware layer expose when  
> underlying providers offer different models (S3 eventual consistency  
> on list operations vs. GCS strong consistency)?_

**Hypothesis:** A middleware layer can surface provider consistency  
differences explicitly, allowing callers to make informed tradeoffs,  
rather than hiding them behind a false unified guarantee.

**Method:** Formal analysis + empirical measurement of list-after-write  
anomalies across providers.

**Status:** Open question — seeking collaborator

---

## Methodology

### Benchmark Environment

- Cloud: AWS ap-south-1 · Azure Southeast Asia · GCP asia-south1
- Instance: t3.medium equivalent (2 vCPU, 4GB RAM)
- Load generator: k6 v0.49
- Object sizes tested: 10KB · 100KB · 1MB · 10MB · 100MB
- Concurrency levels: 10 · 50 · 100 · 250 · 500

### Reproducibility

All benchmark scripts are in `./benchmarks/`.  
Results are deterministic given the same cloud region and instance type.  
Raw data will be published in `./docs/benchmarks.md`.

### Statistical Reporting

- All latency numbers reported as p50/p95/p99
- Minimum 1,000 samples per data point
- Confidence intervals reported where relevant

---

## Related Work

| Work                                   | Relevance                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| Apache Libcloud (Python)               | Original multi-cloud abstraction — different language, different design goals |
| Rclone                                 | CLI-focused, not embeddable middleware                                        |
| Alluxio                                | Data orchestration layer — heavier, JVM-based                                 |
| OpenStack Swift                        | Single-cloud abstraction, not multi-cloud                                     |
| USENIX ATC '23 papers on cloud storage | Benchmark methodology reference                                               |
| ACM SoCC proceedings                   | Distributed storage consistency models                                        |

---

## Target Venues

### Workshop Papers (near-term, 2–4 pages)

- IEEE CLOUD Workshop Track
- ACM India Student Research Competition
- National Conference on Cloud Computing (India)

### Conference Papers (medium-term, 10–12 pages)

- USENIX ATC — Systems measurement focus
- ACM SoCC — Cloud computing focus
- IEEE ICDCS — Distributed systems focus

---

## How to Collaborate

### Option 1 — Research Issue

Open a GitHub issue tagged `[research]` describing:

- Which research question interests you
- Your background / institution
- What you'd like to contribute (measurement, analysis, writing)

### Option 2 — Direct Email

Email: [srinidhianand4@email.com](mailto:srinidhianand4@email.com)  
Subject: `[CloudBridge Research] — <your topic>`

Include:

- Your institution and research group
- The specific question from this document (or a new one)
- What collaboration looks like from your side

### Option 3 — Fork and Study

Fork the repo, run the benchmarks, publish your own findings.  
We ask only that you cite this project if you use the codebase.

---

## Citation

If you use CloudBridge in academic work, please cite:

```bibtex
@software{cloudbridge2026,
  author    = {Srinidhi A},
  title     = {CloudBridge: Unified Storage Middleware for AWS S3,
               Azure Blob, and GCP Cloud Storage},
  year      = {2026},
  url       = {https://github.com/YOUR_USERNAME/cloudbridge-middleware},
  license   = {Apache-2.0}
}
```

---

## Author

**Srinidhi A**  
Chennai, India

_Building toward pre-PhD collaboration in distributed systems  
and cloud storage — open to research discussions with faculty  
at IISc, IIT, and Anna University._
