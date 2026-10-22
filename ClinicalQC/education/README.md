# ClinicalQC documents and required education

This additive Worker module provides authenticated document access and per-operator education acknowledgements. It wraps the existing deployed ClinicalQC entry point so that central login, people management, mail, and Fleet integration remain intact.

## Behavior

- Only newly inserted live QC failures create assignments; historical imports are excluded.
- An initial failure allows 24 hours from the recorded QC time for a passing linked repeat.
- A passing linked repeat received before the deadline cancels pending education. A failed linked repeat assigns it immediately.
- At the deadline an outstanding assignment blocks new live QC submissions. The database trigger enforces the same restriction independently of the UI.
- Each assigned policy, guideline, and bulletin must be opened and explicitly acknowledged. The meter manual is reference-only.
- Completion stores the staff identity, document version/hash, and acknowledgement time in the audit trail. It does not close exceptions or release device holds.
- The assignment stores specific document IDs, preserving the required versions when the library changes.

## Runtime and deployment

Worker: `clinicalqc`. Existing D1 binding: `DB`. Add KV binding `QC_DOCUMENTS`, namespace `1f75fc58f572476b88ff9fad21848b04`. Original files are private KV values keyed by SHA-256; do not commit document contents or credentials to the repository.

Apply the table portion of `schema.sql`, register `documents.json` metadata, then apply its triggers. Do not backfill assignments from old QC records.

The production entry point at this release is `central-entry.mjs`, which wraps `fleet-entry.js`. Deploy `education.mjs`, `education-navigation.mjs`, and the entry module below while retaining every existing module, asset, binding, compatibility setting, and route:

```js
// education-entry.mjs
import native from './central-entry.mjs';
import {withEducation} from './education.mjs';
export * from './central-entry.mjs';
export default withEducation(native);
```

Do not replace the deployed Worker with the older repository build: the central and Fleet modules were deployed separately. A future full build must preserve those integrations and wrap its final handler with `withEducation`.

Routes: `/education`, `/api/education`, `/api/education/file/:id`, `/api/education/open`, `/api/education/acknowledge`, and reviewer-only `/api/education/review`. The navigation script is added to authenticated application HTML; authentication uses the existing app's account checks. Documents & Education is a sidebar menu item with a mobile shortcut. Navigation remains present during application rerenders and does not depend on the badge request succeeding. The UI shows outstanding assignments and a reviewer acknowledgement table.

Run `node test.mjs` on Node 24 to exercise deadlines, repeats, database enforcement, acknowledgement requirements, and access controls in an isolated in-memory database.
