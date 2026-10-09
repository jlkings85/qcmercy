# Private app SSO gateway

ClinicalForms and ClinicalCredentials keep their existing private Sites projects, D1 databases, R2 buckets, and original generated hostnames. `clinicalapps-private-apps` serves the two ClinicalApps subdomains. It authenticates against the hub using authorization code + S256 PKCE, then checks the current member status, module grant, and app role on every request.

The gateway strips client-supplied identity headers, cookies, and authorization before forwarding. Each private upstream receives its own Site service token and a separate 30-second HMAC identity envelope bound to app, method, and path. The service token alone never establishes a person or role. Redirects cannot send the service token to another origin. Responses are private/no-store; upstream cookies are not forwarded.

## Runtime configuration

Gateway bindings: `DB` (existing hub authentication database), `HUB_ORIGIN`, and secrets `SITES_AUTH_SECRET`, `FORMS_SIGNING_SECRET`, `CREDENTIALS_SIGNING_SECRET`, `FORMS_SITE_TOKEN`, `CREDENTIALS_SITE_TOKEN`. Each Site has `CLINICALAPPS_SIGNING_SECRET` matching its gateway signing secret. No secret belongs in Git.

Apply additive migration `0002_site_roles.sql` before deploying the updated hub. Register exact callbacks `https://forms.clinicalapps.app/api/auth/callback/mercy-hub` and `https://credentials.clinicalapps.app/api/auth/callback/mercy-hub` for public clients `clinical-forms` and `clinical-credentials`, with S256 PKCE required. Grant access explicitly; dashboard administrator status does not automatically grant an app role.

Build with `npm ci && npm run build` from ClinicalHub. Outputs: `dist/worker.js` for the hub and `dist/sites-gateway.js` for the gateway. Deploy the private Sites through their own source/version workflow first. Preserve existing secrets and bindings when uploading the hub. Attach the forms and credentials Worker domains only after the private upstreams accept correctly signed identities and reject missing/forged assertions. Enable the two `hub_modules.connected` flags after the live redirects work.

Forms member access is limited to published forms and owned submissions/uploads. Preexisting unowned rows remain administrator-only. Form editing and review actions require an app administrator. Credentials keeps existing person/user IDs and links the verified shared email to the historical person account; member record checks remain in force. Original owner-private Site access remains available for recovery.

## Validation and rollback

`FORMS_SOURCE=/path/to/forms CREDENTIALS_SOURCE=/path/to/credentials npm test` includes actual app route authorization tests plus real BetterAuth OAuth round trips and live revocation checks. No real clinical data is written by tests. Production checks should be read-only and must not print service tokens or sensitive records.

October 9, 2026 deployment sources: Forms `b82cf1c2844dca4f5631f07ec083bf572394d665`; Credentials `4c27df9c0b5da5be8eb4655b230a0c853a7d0542`. Pre-cutover hub version: `5eddc96f-8fca-402b-802c-e1ae4f4ea9bc`.

For an emergency routing rollback, disable the two connected flags, detach only the forms/credentials gateway Worker domains, and restore their original DNS-only CNAME records to `custom-domains.chatgpt.site`. Their Site custom-domain associations remain intact. Keep additive ownership columns and access tables; do not reset or replace a clinical database or bucket. Restore the previous hub version if necessary. Rotate signing/service secrets in their respective secret managers when needed.
