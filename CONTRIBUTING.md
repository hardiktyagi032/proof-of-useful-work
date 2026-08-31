# Contributing to Proof of Useful Work

## Branch flow

```text
feature branch -> pull request -> integration -> release pull request -> main -> Vercel production
```

1. Create a feature or fix branch from `integration`.
2. Open the pull request against `integration`.
3. The CI workflow must install from the lockfile, pass the simulation tests, and build the production bundle.
4. Merge reviewed work into `integration`. Vercel may create a preview deployment for the branch or pull request.
5. When `integration` is release-ready, open one pull request from `integration` into `main`.
6. Merging that release pull request into `main` triggers the Vercel production deployment through the repository’s Vercel integration.

Pull requests from feature branches directly into `main` intentionally fail the release-policy check.

## Local validation

```bash
npm ci
npm run check
```

The project is currently a research simulator. Do not describe simulated guarantees as deployed cryptographic or consensus guarantees.
