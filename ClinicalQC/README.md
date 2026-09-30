# ClinicalQC — Mercy EMS

Standalone deployment of the existing ClinicalQC app, prepared for a private GitHub repository, your Cloudflare account, and **https://qc.mercyems.net**. Staff use invitation-gated, verified email/password accounts, matching the ClinicalShifts enrollment approach. Accounts are separate from ClinicalShifts; this is not shared sign-on.

## Current state

Source is prepared and locally validated. It has **not** been pushed to GitHub or deployed to your Cloudflare account. The historical production database has **not** been copied. The existing ChatGPT-hosted ClinicalQC and its data are unchanged.

This package contains application source, dependency lockfile, migrations, tests, and deployment instructions. It contains no production data, passwords, API keys, or staff invitations.

Preserved functionality includes county-specific truck/device choices, strip/control lots and ranges, competency verification, historical import provenance, exceptions and hold review, repeat QC, temperature settings and office records, reports over an inclusive date range, and audit history.

## Deployment sequence

1. Create a **private** GitHub repository named `clinicalqc` in your account. Upload the contents of this directory at the repository root. Include the lockfile and migrations. Do not upload `node_modules`, `dist`, `.dev.vars`, or database exports.
2. In your Cloudflare account, create a **new D1 database named `clinicalqc`**. Replace the placeholder `database_id` in `wrangler.jsonc` with that database's ID. Never use the ClinicalShifts database or Worker.
3. In Workers & Pages, create/connect a Worker named **`clinicalqc`** to that GitHub repository. Use Node **24**, pnpm **11.25.0**, production branch `main`, and the commands below. The root directory is the repository root.
4. Set the Worker runtime variables/secrets below. Configure Resend with a verified sender domain. Do not place any secrets in GitHub source or share them in chat. Cloudflare build environment variables and Worker runtime variables are separate; these values belong to the Worker runtime.
5. Deploy initially on its assigned `workers.dev` address. Set `BETTER_AUTH_URL` to that exact HTTPS address during staging. Import and verify the complete existing business database before owner activation. Do not activate a fresh empty workspace: owner enrollment intentionally requires the existing administrator record.
6. Test owner email verification, sign-in, staff invitation and credential enforcement with designated test accounts. Verify reports, trucks, serial numbers, stored ranges, exceptions, temperatures, audit history, and all table counts against the existing app.
7. Pause submissions on the old app during the final snapshot/cutover. Repeat the complete migration into a clean production destination and verify it before opening staff access. Do not attempt to merge independent writes from two live databases.
8. Once the database and login are ready, set `BETTER_AUTH_URL=https://qc.mercyems.net`. Configure the Worker Custom Domain `qc.mercyems.net` in Cloudflare. Cloudflare manages that Worker's DNS and TLS. If the previously supplied CNAME to `custom-domains.chatgpt.site` was added, replace it as part of this cutover; it belongs to the old ChatGPT-hosted app. Remove the old Sites custom-domain binding after the destination is verified. Do not change unrelated Mercy EMS records.
9. Reissue any staging-origin invitation links, verify a login on the final hostname, and then distribute that hostname to staff. Keep the old Site restricted as a reference until historical-data verification is signed off.

### Cloudflare build configuration

| Setting | Value |
| --- | --- |
| Worker name | `clinicalqc` |
| Root directory | repository root |
| Install command, if configurable | `pnpm install --frozen-lockfile` |
| Build command | `pnpm install --frozen-lockfile` |
| Deploy command | `pnpm run deploy` |
| Node version | `24` |
| Production branch | `main` |

`pnpm run deploy` rejects an unconfigured database, checks TypeScript, runs the authentication and migration tests, builds, applies additive database migrations to `clinicalqc`, and deploys the generated Worker. It never imports historical data automatically. The database migration commands need D1 permission in the Cloudflare build token; use the provider's secure permissions controls.

Official references: [Cloudflare Git builds](https://developers.cloudflare.com/workers/ci-cd/builds/), [build settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [Worker Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), [Better Auth email/password](https://better-auth.com/docs/authentication/email-password).

### Runtime settings

| Name | Purpose |
| --- | --- |
| `BETTER_AUTH_URL` | Exact HTTPS app origin, finally `https://qc.mercyems.net` |
| `BETTER_AUTH_SECRET` | Independent cryptographically random secret of at least 32 characters |
| `QC_OWNER_EMAIL` | `jlkings85@gmail.com`, matching the existing active administrator record |
| `QC_SETUP_TOKEN` | Independent random secret of at least 32 characters, only for initial owner enrollment |
| `RESEND_API_KEY` | API key with email delivery permission for the verified sender |
| `QC_EMAIL_FROM` | Sender accepted by your Resend account, such as `ClinicalQC <qc@your-verified-sender-domain>` |

Generate the two independent secrets locally using a password manager or cryptographic generator; do not reuse ClinicalShifts secrets. Store secret values with Cloudflare's encrypted secret controls. The `.dev.vars.example` file contains names only for local setup.

## First administrator and staff login

After the historical data is verified, the owner opens `/register`, uses the configured owner email and initial setup code, chooses a password of at least 12 characters, and verifies the email. Sign in, then activate access using the same setup code. This links the new login to the existing administrator's operator ID. Remove `QC_SETUP_TOKEN` from the Worker after successful owner activation.

In **Users & credentials**, an administrator chooses **Set up login** next to an active person, then **Create invitation link**. Copy and privately share that link with that specific person. Creating the link sends no message. It expires after seven days and replaces an earlier unused invitation. Imported placeholder identifiers must be updated to a real working email before inviting a person; their operator ID and historical records stay unchanged.

Staff create their account with the invited email, verify the email, sign in, and activate access. The invitation code is kept in that browser tab during registration. If opening verification in another browser or device, paste the code from the invitation link into the activation page. Only the invited, verified email can redeem it. Existing account holders who receive a replacement invitation can sign in and use its code on `/activate`.

Login access and testing competency are separate. Creating a login does not approve testing or extend credential dates. Deactivation immediately blocks business API access even while an authentication session exists. Password reset revokes existing sessions. An activated login email cannot be changed in the ordinary user editor; a deliberate identity migration is required.

## Historical database migration

**A report CSV is insufficient for this cutover.** Obtain a complete, consistent read-only export of the current Site's D1 business database. This source export is still pending. Preserve it privately outside the repository. The migration utility takes a SQLite copy of that full export, and requires all ten business tables:

`operators`, `assets`, `records`, `exceptions`, `actions`, `audit`, `import_batches`, `history_rows`, `temperature_records`, `application_settings`.

A SQL database export can be loaded into a private SQLite file using a trusted SQLite utility. Do not use the local development/test database as the production source. Do not export or import ClinicalShifts authentication tables.

After applying the numbered migrations to the new, empty destination:

```sh
node scripts/migrate-data.mjs prepare migration-private/source.sqlite migration-private/data.sql
pnpm exec wrangler d1 execute clinicalqc --remote --file migration-private/data.sql
```

The utility creates an import SQL file plus a manifest of row counts and full-content hashes. It preserves row order, IDs, original JSON snapshots, truck and meter serial information, ranges, import source rows, temperature references, and the audit trail. Legacy ChatGPT `auth_id` values remain untouched as historical provenance. New verified logins use the separate `qc_login_links` table. No old identity header or email alone grants access.

The import is designed for an empty business database. It refuses to merge or re-import into populated tables. If a provider import fails part-way through, do not rerun it into the partial destination: keep the original export safe, investigate the error, and provision a clean, separate destination. A source row over the safe SQL statement limit is rejected before output and requires a bound-parameter transfer.

Export the newly imported destination to a private SQLite file and verify **before activating accounts or adding records**:

```sh
node scripts/migrate-data.mjs verify migration-private/data.sql.manifest.json migration-private/destination.sqlite
```

All ten tables must match counts, schema columns, original row order, and SHA-256 content. Any mismatch blocks cutover. Keep the source export and migration manifest as the private cutover record. Actual historical migration remains pending; passing fixture tests is not a substitute for this comparison.

## Local development and checks

```sh
pnpm install --frozen-lockfile
pnpm db:local
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

For local login, copy `.dev.vars.example` to ignored `.dev.vars`, supply independent development settings, and use a local fixture database containing an explicitly chosen administrator. No public first-user administrator creation exists. Integration tests run with in-memory fixture data and intercepted email; they do not send mail or access production.

Validated in this preparation: TypeScript, production Worker build, real Better Auth handlers/Drizzle integration, verified email and session behavior, invitation activation, wrong/expired/revoked invitation denial, disabled-account access, password reset/session revocation, origin checks, database rate limits, and full migration fidelity with repeat-import/content-mismatch rejection.

Source baseline: ClinicalQC version 18, commit `37d31a49a2984b5b0f91a5c74834fe74e282395e`. Auth approach adapted from the previously supplied ClinicalShift standalone package. Source preparation does not certify the final deployed infrastructure; final provider settings, actual email delivery, final hostname/TLS, and production data comparison are still required.
