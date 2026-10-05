# Mercy EMS Clinical Hub

Cloudflare Worker for `https://clinicalapps.app`. Uses existing ClinicalQC identity records in the `mercyqc` D1 database. No existing clinical tables, passwords, operator IDs, or audit records are replaced.

## Capabilities

- Email/password dashboard login using existing verified, enrolled QC accounts.
- Administrator-managed explicit links to verified QC and ClinicalShifts profiles, with an access audit trail.
- OAuth 2.1 / OpenID Connect provider using Better Auth 1.7.4, exact registered redirects, S256 PKCE, single-use authorization codes, and verified identity claims.
- QC client integration is in `../ClinicalQC/lib/hub-oauth.ts` and `/suite-login`. It is opt-in with `HUB_LOGIN_ENABLED=true` and `HUB_ORIGIN=https://clinicalapps.app`.
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
6. Upload `dist/worker.js` as an ESM Worker with `nodejs_compat`; attach the `clinicalapps.app` custom domain. Follow the staged module cutover below.
7. Deploy and verify each client before enabling its dashboard status. Preserve the previous Worker deployment for rollback. Disabling the client's feature flag restores its existing login.

## Validation

The test suite runs the actual Better Auth handlers against SQLite with a D1 adapter. It covers admin isolation, verified enrollment, cookie tampering, origin checks, exact redirect matching, PKCE, authorization-code replay, access revocation, profile-link safety, and an actual hub-to-QC OAuth callback preserving the existing identity. Set `CLINICALSHIFTS_SOURCE` to a ClinicalShifts checkout (default: `../../clinicalshifts`) to run the cross-email scheduling identity test as well; that test reports a skip when the checkout is absent. No live messages or accounts are created by tests.

## ClinicalApps domain rollout

The dashboard is intended for `clinicalapps.app`. This source change does not configure DNS or deploy any app. The Worker name, database bindings, historical profile IDs, and authentication restrictions are preserved.

| Module | Intended address |
| --- | --- |
| ClinicalForms | forms.clinicalapps.app |
| ClinicalQC | qc.clinicalapps.app |
| ClinicalNarcs | narcs.clinicalapps.app |
| ClinicalShifts | shifts.clinicalapps.app |
| ClinicalEvals | evals.clinicalapps.app |
| ClinicalGuidelines | guidelines.clinicalapps.app |
| ClinicalCredentials | credentials.clinicalapps.app |

`CLINICALAPPS_LIVE_MODULES` is an initially empty comma-separated list of module IDs. Until a module is included, its card uses its existing address and labels the new address as planned. Only fixed first-party destinations are accepted. A domain activation does not grant access or enable shared login. Forms and Credentials appear for administrators only until their identity integration exists; adding cards does not widen private app access.

For each module:

1. Identify the current production Worker/Site and database, preserve its previous deployment, and attach the exact custom hostname using its hosting provider. Keep the old address available during validation. Do not point a custom hostname directly at a different app's database or owner-private legacy copy.
2. Verify TLS, native login, existing records, roles, uploads, password-recovery links, and signatures at the new address. Update canonical application URL and trusted origins in that application's configuration. Narcs currently has a separate standalone rollout: reconcile its inventory and native signatures before replacing the legacy Site destination.
3. For QC and Shifts shared login, register both old and new **exact** `/api/auth/callback/mercy-hub` URLs during transition, configure the client issuer as `https://clinicalapps.app`, and verify the full round trip without creating a new profile. Never use wildcard callbacks or shared parent-domain cookies. Set `hub_modules.connected=1` only after this works. If a previously connected module changes address, disable its connected status until verified again.
4. Add its ID to `CLINICALAPPS_LIVE_MODULES` after the new address passes. Retest the dashboard link. Roll back by removing the ID and restoring the prior native URL configuration/deployment if necessary. Retire old callbacks and domains only after the transition is complete.

QC/temperature and narc seal entry from a truck check remain separate integration work. They must use the actual signed-in operator, native validation and audit records, stable request IDs for retry deduplication, and per-destination saved/pending/failed status. Narc seal observations must not imply an inventory count, reseal, or another person's signature. Domain routing alone does not implement this workflow.
