# CloudBridge — Development Log

> A daily journal of decisions, discoveries, dead ends, and course corrections.
> Written for three audiences: future contributors, academic collaborators,
> and my future self trying to remember why I made a particular decision.
>
> Format: what I did, what I found out, what I decided and why,
> what I don't know yet, and what tomorrow looks like.

---

## Day 1 — March 2, 2026

**Focus:** Foundation — repo, credentials, architecture thinking
**Hours:** ~3

---

### What I Did Today

Set up the full project foundation before writing a single line of
implementation code. This was intentional — I've learned from past
projects that starting to code before the structure is clear leads to
expensive refactors later.

Created the repo structure, wrote the DESIGN.md, README, RESEARCH.md,
CONTRIBUTING.md, credential management system, and the config loader.
No adapter code, no routes, no server yet.

---

### The Decision That Took the Longest

Writing the DESIGN.md problem statement took three full rewrites.

First attempt was too technical — jumped straight into adapter patterns
without explaining why the problem matters. A faculty member reading it
would not immediately understand the research angle.

Second attempt overcorrected — too abstract, read like a product pitch.

Third attempt landed on the side-by-side code comparison: three messy
SDK integrations vs. one clean CloudBridge call. That contrast made the
problem immediately obvious to both engineers and researchers without
requiring any background context.

Lesson: lead with the problem in code, not in prose.

---

### Credential System — Why Three Layers

Spent time thinking through credential management before touching any
cloud SDK. Most tutorials treat this as an afterthought. For a project
that handles credentials from three different cloud providers with five
or six authentication strategies each, it cannot be an afterthought.

Settled on three layers:

**Layer 1 — .env file**
Simple key=value pairs. AWS access keys, JWT secret, Azure account name.
Gitignored. Committed as .env.example with placeholder values.

**Layer 2 — secrets/ files**
Credential files that cannot be key=value pairs. GCP service account
JSON, Azure certificates. Gitignored entirely except for README.md
which explains how to populate each file.

**Layer 3 — config.ts loader**
A Zod schema that validates everything at startup. Uses discriminated
unions to model each auth strategy — so if you set AWS_ROLE_ARN, the
loader knows you want AssumeRole, not Access Key. If you set
AWS_ACCESS_KEY_ID, it knows you want static credentials.

The key insight: the loader auto-detects which auth strategy to use
from which environment variables are present. You don't configure
the strategy name — you just set the credentials and the loader figures
out which strategy applies. This mirrors how real cloud SDKs work
(AWS provider chain, GCP ADC) and reduces configuration surface area.

One thing I don't know yet: whether Zod discriminated unions will
cleanly handle the case where a user sets _both_ AWS_ROLE_ARN and
AWS_ACCESS_KEY_ID by mistake. Need to add explicit precedence
documentation — AssumeRole wins over Access Key if both are set.
Added to OQ-4 backlog.

---

### The "We" Problem

Caught myself writing "we will take this approach" and "what we will
not do" throughout DESIGN.md. This is a solo project. "We" is
intellectually dishonest here — it hedges ownership of decisions that
are entirely mine.

Rewrote all instances. "We will" became either "The approach:" (for
architectural facts) or "I will" (for planned actions). Passive
declarative voice works better for design decisions anyway — it makes
the decision feel considered rather than tentative.

---

### Apache 2.0 vs MIT — Why It Matters

Chose Apache 2.0 over MIT after thinking through the use case.
MIT is silent on patents. Apache 2.0 includes an explicit patent grant.

For infrastructure middleware that companies might embed in commercial
products — which is exactly what CloudBridge is — the patent grant
reduces adoption friction. A legal team at a company evaluating
CloudBridge for their platform will have an easier conversation with
Apache 2.0 than MIT.

For academic use, Apache 2.0 is well-understood and recognized by IISc,
IIT, and most research institutions as a research-friendly license.

---

### What Surprised Me Today

Writing the "What This Project Will Not Do in v1" section of DESIGN.md
was harder than expected — not because the constraints were unclear,
but because articulating them precisely forces you to commit.

"No multi-provider writes" sounds simple. But it immediately raises
the question: what if someone wants to write to S3 and GCS simultaneously
for redundancy? That's a legitimate use case. Saying no to it in v1
means accepting that some users will have that unmet need.

That's fine — scope discipline is the point. But writing it down makes
it real in a way that thinking it does not.

---

### Free Tier Cloud Accounts

Created accounts for all three providers:

- **AWS:** Free tier account created. IAM user with S3-scoped policy.
  Access key saved to secrets. Will switch to AssumeRole once I have
  a test EC2 instance.

- **Azure:** Free account created. Storage account provisioned in
  Southeast Asia region (closest to Chennai with free tier eligibility).
  Connection string saved to secrets for now — will migrate to
  Service Principal in Day 2.

- **GCP:** Free project created. Service account created with
  Storage Object Admin role scoped to a single test bucket.
  JSON key downloaded and saved to secrets/gcp-service-account.json.

One observation: GCP's free tier onboarding is the most friction-heavy
of the three. Creating a service account, assigning a role, and
downloading a key involves five separate UI steps across three different
console sections. AWS IAM is significantly more streamlined for
programmatic access setup.

This friction difference is worth noting — it may affect how I write
the setup documentation for contributors who need to run integration
tests locally.

---

### Research Angle — First Clear Signal

While writing OQ-3 (consistency contract exposure), I realized this is
the most academically interesting question in the project — and it's
not one I've seen directly addressed in existing multi-cloud middleware
work.

S3 offers strong consistency for object reads and writes but historically
had eventual consistency for list operations (this changed in 2020 but
the documentation still causes confusion). GCS offers strong consistency
for all operations. Azure Blob offers strong consistency.

A middleware that exposes a unified "putObject then listObjects" flow
silently inherits whatever consistency model the underlying provider
uses. A caller who tests on GCS (strong) and deploys to S3 may see
surprising behavior.

The interesting research question: can a middleware layer expose
consistency guarantees explicitly — per provider, per operation —
without breaking the unified abstraction? Or does unification
necessarily require hiding consistency differences?

This feels like a 4-page workshop paper. Adding to RESEARCH.md tomorrow.

---

### What I Don't Know Yet

- Whether Zod discriminated unions handle ambiguous env var combinations
  cleanly — need to test edge cases in config.ts
- Whether GCP createWriteStream() correctly propagates backpressure
  under high concurrency — empirical test planned Week 2
- Whether the devlog format I'm using here is the right level of detail
  — will evaluate after a week of entries

---

### Day 2

Two files. Nothing else.

**src/adapters/adapter.interface.ts**
The `IStorageAdapter` interface — the contract every adapter must fulfill.
This is the most important design decision in the entire project.
Getting this wrong means all three adapters are wrong.

Key decisions to make tomorrow:

- Should `putObject` accept a Node.js Readable, a Buffer, or both?
- Should `listObjects` return an array or an async generator?
  (Generator is more memory-efficient for large buckets but more
  complex to consume)
- Should presigned URL generation be on the adapter or a separate
  interface? (Leaning toward separate — not all use cases need it)

**src/models/storage-object.model.ts**
The `StorageObject` unified model — what every adapter returns.
Must capture everything useful from all three providers without
becoming a lowest-common-denominator type that loses important metadata.

Expected time: 3–4 hours.
Expected difficulty: the interface decisions, not the TypeScript.

---

_Day 1 complete. Repo is public. Foundation is solid._
_The hardest part of today was not the setup — it was writing clearly._
