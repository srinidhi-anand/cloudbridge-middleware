# Contributing to CloudBridge

Thank you for your interest in contributing. CloudBridge welcomes contributions  
from **industry engineers**, **students**, and **academic researchers** alike.

---

## Ways to Contribute

- 🐛 **Bug reports** — found something broken? Open an issue
- ✨ **Feature requests** — have an idea? Start a discussion
- 🔧 **Code** — fix a bug, add a provider, improve performance
- 📖 **Docs** — improve README, add examples, fix typos
- 🔬 **Research** — run benchmarks, propose research questions
- 🌍 **New provider** — add Cloudflare R2, MinIO, Backblaze B2

---

## Getting Started

```bash
# 1. Fork the repo on GitHub, then:
git clone https://github.com/YOUR_USERNAME/cloudbridge-middleware
cd cloudbridge-middleware

# 2. Install dependencies
npm install

# 3. Run tests (no cloud accounts needed — uses mocks)
npm test

# 4. Start dev server with mock providers
npm run dev:mock

# 5. Create your branch
git checkout -b feature/your-feature-name
```

---

## Code Standards

- **TypeScript strict mode** — no `any`, no implicit returns
- **Tests required** — new features need unit tests, new adapters need integration tests
- **Conventional commits** — `feat:`, `fix:`, `docs:`, `test:`, `chore:`
- **No console.log** — use the Pino logger

---

## Adding a New Cloud Provider

1. Create `src/adapters/your-provider.adapter.ts`
2. Implement the `IStorageAdapter` interface fully
3. Add auth strategy in `src/auth/strategies/`
4. Add to the provider factory in `src/adapters/adapter.factory.ts`
5. Add integration tests in `tests/integration/`
6. Update README auth table and benchmark table

---

## Adding a New Auth Strategy

1. Create `src/auth/strategies/your-strategy.ts`
2. Implement the `IAuthStrategy` interface
3. Register in `src/auth/credential-resolver.ts`
4. Add unit tests
5. Document in README auth section

---

## Pull Request Process

1. Open a PR against `main`
2. Fill in the PR template
3. Ensure all tests pass
4. Request review — PRs are reviewed within 48 hours

---

## Research Contributions

See [RESEARCH.md](./RESEARCH.md) for how to contribute to the academic side  
of this project — benchmark methodology, open questions, collaboration.

---

## Code of Conduct

Be kind. Be constructive. Be patient.  
This project follows the [Contributor Covenant](https://www.contributor-covenant.org/).

---

## Questions?

Open a [Discussion](https://github.com/srinidhi-anand/cloudbridge-middleware/discussions)  
or email [srinidhianand4@email.com](mailto:srinidhianand4@email.com).
