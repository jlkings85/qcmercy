# Mercy EMS Clinical Hub

Cloudflare Worker for `https://mercyems.net`. Uses existing ClinicalQC identity records in the `mercyqc` D1 database. No existing clinical tables, passwords, operator IDs, or audit records are replaced.

## Capabilities

- Email/password dashboard login using existing verified, enrolled QC accounts.
- Administrator-managed explicit links to verified QC and ClinicalShifts profiles, with an access audit trail.
- OAuth 2.1 / OpenID Connect provider using Better Auth 1.7.4, exact registered redirects, S256 PKCE, single-use authorization codes, and verified identity claims.
- QC client integration is in `../ClinicalQC/lib/hub-oauth.ts` and `/suite-login`. It is opt-in with `HUB_LOGIN_ENABLED=true` and `HUB_ORIGIN=https://mercyems.net`.
- All modules retain their data and module-specific roles. Cross-email profile links require an explicit administrator choice; previously linked subjects cannot be silently remapped.

## Rollout boundaries

The module status is read from `hub_modules`. Set `connected=1` only after the module client is deployed and its authorization round trip passes. Merely showing a module card does not enable SSO. Narcs and Evals retain their current access until their hosted source can be opened and integrated; Evals is a sample-data preview. Guidelines stays publicly readable.

Account invitations and password recovery initially remain in ClinicalQC. New outside-student identity onboarding requires a subsequent shared invitation workflow; do not create QC clinical profiles simply to grant another module access. Signing out of the dashboard ends its session; already-open module sessions follow their own lifetime. Connected clients recheck central access before allowing work. Global logout is not yet implemented.

## Deployment

1. `npm ci && npm test && npm run build`.
2. Apply the additive `migrations/0001_hub.sql` to `mercyqc` once; never apply the QC migration directory through this project.
3. Bind `DB` to `mercyqc`, `SHIFTS_DB` to `clinicalshift`, `HUB_ORIGIN` to the origin, and a new random `HUB_SECRET` (at least 32 bytes). The hub's signing secret must stay separate from existing application secrets.
4. Seed `hub_members` from verified QC accounts with active, linked operator records. Only the explicitly designated owner is initially a hub administrator. Seed their QC grants using existing operator IDs.
5. Register fixed first-party public clients with `requirePKCE=1`, `skipConsent=1`, and `tokenEndpointAuthMethod=none`. Redirects: `https://qc.mercyems.net/api/auth/callback/mercy-hub` and `https://clinicalshifts.app/api/auth/callback/mercy-hub`. No dynamic registration.
6. Upload `dist/worker.js` as an ESM Worker with `nodejs_compat`; attach the `mercyems.net` custom domain. Do not change existing module domains.
7. Deploy and verify each client before enabling its dashboard status. Preserve the previous Worker deployment for rollback. Disabling the client's feature flag restores its existing login.

## Validation

The test suite runs the actual Better Auth handlers against SQLite with a D1 adapter. It covers admin isolation, verified enrollment, cookie tampering, origin checks, exact redirect matching, PKCE, authorization-code replay, access revocation, profile-link safety, and an actual hub-to-QC OAuth callback preserving the existing identity. Set `CLINICALSHIFTS_SOURCE` to a ClinicalShifts checkout (default: `../../clinicalshifts`) to run the cross-email scheduling identity test as well; that test reports a skip when the checkout is absent. No live messages or accounts are created by tests.
