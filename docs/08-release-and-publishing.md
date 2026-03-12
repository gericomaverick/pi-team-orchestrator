# Release And Publishing

This repo now has two release paths:

- local release script for manual publishes
- GitHub Actions release pipeline for normal publishing

## Recommended path

Use GitHub Actions as the primary release path.

Flow:

1. Update `package.json` version.
2. Update `CHANGELOG.md`.
3. Push the release commit to `main`.
4. Push a matching tag like `v0.2.4`.
5. GitHub creates a GitHub Release.
6. The npm publish workflow runs from the tag push and publishes the package.

## Workflows

- `.github/workflows/github-release.yml`
  Creates a GitHub Release when a `v*` tag is pushed.
- `.github/workflows/npm-publish.yml`
  Publishes to npm when a `v*` tag is pushed, when a GitHub Release is published, or on manual dispatch.

The publish workflow supports:
- trusted publishing by default
- `NPM_TOKEN` fallback when the `NPM_TOKEN` GitHub secret is present

## npm package settings

For this repo, the practical setting is:

`Require two-factor authentication or a granular access token with bypass 2fa enabled`

Why:

- trusted publishing from GitHub does not need a token
- local emergency/manual publishes can still work with a bypass-enabled granular token
- GitHub Actions can fall back to `NPM_TOKEN` if trusted publishing is not configured or needs to be bypassed temporarily

Use the stricter setting:

`Require two-factor authentication and disallow tokens`

only if you want to enforce trusted publishing only and never allow token-based fallback.

## Local release script

`release.sh` remains useful for:
- dry-run validation
- manual publish from a workstation
- OTP-based publish when needed

Commands:

```bash
npm run release:dry
npm run release
NPM_OTP=123456 npm run release
```

## Trusted publishing setup

In npm package settings, configure a trusted publisher for this GitHub repo and workflow.

Use:
- repository: `gericomaverick/pi-team-orchestrator`
- workflow: `.github/workflows/npm-publish.yml`

After that, tag pushes should follow the normal GitHub path without any local npm token.
