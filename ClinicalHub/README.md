# Mercy EMS Clinical Hub

Cloudflare Worker for `https://clinicalapps.app`. Uses existing ClinicalQC identity records in the `mercyqc` D1 database. No existing clinical tables, passwords, operator IDs, or audit records are replaced.

## Capabilities

- Email/password dashboard login using existing verified, enrolled QC accounts.
- Administrator-managed explicit links to verified QC, ClinicalShifts, and ClinicalNarcs profiles, with an access audit trail.
- Account suspension and administrator assignment, with server-enforced self-lockout and concurrency protection.
- Searchable accounts, connection status, native profile selection, and per-app enable/disable controls. ClinicalEvals inherits the Shifts profile and its clinical permissions.
- OAuth 2.1 / OpenID Connect provider using Better Auth 1.7.4, exact registered redirects, S256 PKCE, single-use authorization codes, and verified identity claims.
- QC client integration is in `../ClinicalQC/lib/hub-oauth.ts` and `/suite-login`. It is opt-in with `HUB_LOGIN_ENABLED=true` and `HUB_ORIGIN=https://clinicalapps.app`.
- All modules retain their data and module-specific roles. Cross-email profile links require an explicit administrator choice; previously linked subjects cannot be silently remapped.

## Rollout boundaries

The module status is read from `hub_modules`. Set `connected=1` only after the module client is deployed and its authorization round trip passes. Merely showing a module card does not enable SSO. Narcs uses the additive adapter in `clients/narcs.mjs`, preserving its native Worker modules and auth schema. Evals opens through the authenticated ClinicalShifts evaluations route. Guidelines stays publicly readable.

Account invitations and password recovery initially remain in ClinicalQC. New outside-student identity onboarding requires a subsequent shared invitation workflow; do not create QC clinical profiles simply to grant another module access. Signing out of the dashboard ends its session; already-open module sessions follow their own lifetime. Connected clients recheck central access before allowing work. Global logout is not yet implemented.

## Deployment

1. `npm ci && npm test && npm run build`.
2. Apply the additive `migrations/0001_hub.sql` to `mercyqc` once; never apply the QC migration directory through this project.
3. Bind `DB` to `mercyqc`, `SHIFTS_DB` to `clinicalshift`, `NARCS_DB` to `clinicalnarcs`, `HUB_ORIGIN` to the origin, and a new random `HUB_SECRET` (at least 32 bytes). The hub's signing secret must stay separate from existing application secrets.
4. Seed `hub_members` from verified QC accounts with active, linked operator records. Only the explicitly designated owner is initially a hub administrator. Seed their QC grants using existing operator IDs.
5. Register fixed first-party public clients with `requirePKCE=1`, `skipConsent=1`, and `tokenEndpointAuthMethod=none`. Redirects: the exact `https://qc.clinicalapps.app/api/auth/callback/mercy-hub`, `https://shifts.clinicalapps.app/api/auth/callback/mercy-hub`, and `https://narcs.clinicalapps.app/api/auth/callback/mercy-hub` URLs. Existing old-domain QC and Shifts callbacks remain registered during transition. No dynamic registration.
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

## Current rollout status — October 5, 2026

The dashboard is deployed at `https://clinicalapps.app`. All seven destination URLs are enabled. QC, Narcs, and Shifts retain their original Worker code and databases with updated canonical login URLs. The old QC and Shifts hostnames redirect to the new addresses using `redirects.mjs`. Evals routes through the existing authenticated Shifts evaluation area. Forms, Guidelines, and Credentials retain their Sites audience restrictions.

No clinical records, existing passwords, or app permission grants were changed by this rollout. Native login pages and old-address redirects were verified in the browser. The initial domain-only rollout left SSO disabled. See the later SSO rollout below for current status. Truck-check QC/temp and narc-seal integration remains separate unfinished work.

The legacy Narcs Site remains available. Its nine original history entries have matching record identifiers, revisions, request IDs, event IDs and timestamps in the standalone database, which also contains a newer settings revision. Both live inventories are empty. Sample-state payloads were truncated by the source viewer, so the sample-state comparison was not byte-for-byte.

Rollback: retain prior Worker versions and restore the old canonical URL if needed. To restore old hostname routing, reattach `qc.mercyems.net` to `clinicalqc` and `clinicalshifts.app` to `clinicalshift`. Do not change database bindings or delete either app. The dashboard destination list can be reverted independently; it does not grant access or enable SSO.

## Shared login and administration — October 5, 2026

Deployed shared login for QC, Narcs, Shifts, and Evals. Sign in at `https://clinicalapps.app` using an enabled, verified existing ClinicalQC account. Administrators use **Accounts & access**. QC, Narcs, and Shifts have separate native profile links; Evals uses the Shifts link and its existing evaluation permissions. Shared grants never assign or elevate native clinical roles. The designated owner's existing profiles are linked explicitly, including the different Shifts email address. No clinical profiles or passwords were copied, reset, or merged.

The Narcs adapter and the Evals launch adapter are deployed as additional Worker modules. All 71 existing Narcs modules and all 68 existing Shifts modules were retained; the original default export remains the underlying application. `clients/preserved-upload.mjs` creates this additive multipart upload. Future native builds must include these adapters (or equivalent source integration) before redeploying; otherwise the next native build will remove the additions. The Shifts scheduled handler is preserved. QC only needed its preexisting opt-in feature flags enabled.

**Access behavior:** suspending a shared account blocks its dashboard and linked connected apps on the next request. Disabling a module grant blocks that module's linked native profile, including older native sessions. Unlinked native accounts retain their prior login and permissions during rollout. A shared administrator cannot disable or demote themselves. Previously linked profiles cannot be reassigned through this UI. Central grant changes and account changes are audited.

**Validation:** 11 automated checks passed with real Better Auth handlers, native QC and Shifts source, and Narcs session compatibility checked against its native authentication configuration. Tests cover cross-email links, no new clinical identities, code replay, exact redirects, PKCE, CSRF, admin isolation, revocation, the fixed Evals destination, and unchanged Narcs inventory/profile records. Live browser checks confirmed all four app launches reach the central login with S256 PKCE at the new callback hosts. An actual user-password sign-in in the live browser has not been performed.

**Still separate:** Forms and Credentials retain their owner-private Sites access gate. They are visibly marked separate access, with no ineffective central permission toggles. Extending staff SSO to these apps requires a supported external identity path and server-side authorization for their data, review, builder, and upload routes. Guidelines remains public. New identity enrollment/recovery still uses ClinicalQC; central invitations and global logout are not implemented.

**Rollback:** turn off `HUB_LOGIN_ENABLED` for a client to restore its native login. Before this update the Worker versions were Hub `1830ceae-f850-4520-bb18-cda2b89d0f3d`, Narcs `3df13f52-0494-498f-9cb3-761786c5f18e`, Shifts `8290d304-8294-47fd-892f-294b4e10cd23`, and QC `9e158db2-127a-48e0-8ed4-4ae87d23777a`. Existing database bindings must be preserved. Set affected `hub_modules.connected=0` if rolling back. Do not remove users, profiles, records, or their retained grant mappings.
