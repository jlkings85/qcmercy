# ClinicalQC — Mercy EMS

The complete standalone application is in **[`ClinicalQC/`](./ClinicalQC/)**, with its original folder structure preserved. Use that directory as the Cloudflare build root. Earlier flattened uploads at the repository root are retained for reference and are not the deployment source.

## Deployment status

- Repository: `jlkings85/qcmercy`, production branch `main`.
- Target hostname: `https://qc.mercyems.net`.
- Historical production data migration: **pending**. Do not open staff access or switch the production hostname until the complete database has been migrated and verified.
- The recovered configuration contains a placeholder D1 database ID. Provision a separate `clinicalqc` database and set its ID in `ClinicalQC/wrangler.jsonc` before deployment. Do not use the ClinicalShifts database.

## Cloudflare Workers build settings

| Setting | Value |
| --- | --- |
| Repository | `jlkings85/qcmercy` |
| Branch | `main` |
| Root directory | `ClinicalQC` |
| Worker name | `clinicalqc` |
| Node version | `24` |
| Package manager | `pnpm@11.25.0` |
| Build command | `pnpm install --frozen-lockfile` |
| Deploy command | `pnpm run deploy` |

The deploy command checks types, runs authentication and migration fixture tests, builds the Worker, applies schema migrations, and deploys. It does **not** import historical business data.

See **[the complete setup, runtime settings, login, and migration instructions](./ClinicalQC/README.md)**. In those original instructions, “repository root” refers to the application directory, `ClinicalQC/`, in this repository layout.

Keep runtime secrets, production database exports, and staff invitation codes out of this repository. Staff login is invitation-gated email/password authentication, separate from ClinicalShifts accounts.
