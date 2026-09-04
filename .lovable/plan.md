# Confirm Publish and Re-verify the Four Controlled CVs

Two things to close out: make sure the published URL is actually serving the new
frontend, and re-run the parser checks against the four controlled CVs.

## 1. Confirm the publish landed

The publish was already scheduled in the previous step, so the deploy captured the
project as of that moment. What remains is verification, not a second publish.

- Fetch the published URL once and confirm it responds.
- Load the published site in a headless browser and check that the new frontend is
  actually being served, not a cached older bundle. Concrete markers to look for:
  - Master Dashboard KPI cards reading "Verified ICs", "Excluded",
    "Academic Engagement", and "IC Type Needs Review".
  - The Proof column with upload button and status badge in the faculty repository
    sections (engagements, experience, services).
  - The IC Reporting Type dropdown in the Verification Queue.
- If any marker is missing, republish once and re-check rather than repeatedly
  polling.

Note: sign-in on this app uses the custom `app_users` login, so the published-site
check will need the existing test credentials to reach the dashboard and repository
routes. Public/unauthenticated routes (login page, asset bundle hash) can be
verified without credentials.

## 2. Re-verify the four controlled CVs still parse correctly

Target CVs, all already present as fixtures:

- `AACSB_Practitioner_Annelie_Baalbaki.docx`
- `AACSB_Practitioner_Anne-Marie_Boustani.docx`
- `AACSB_Academic_Maya_Farah.docx`
- `AACSB_Academic_Samar_Aad.docx`

Steps:

- Run the existing frontend regression suite (`src/test/cv-parser.test.ts`) which
  already covers these files.
- Run the edge function Deno tests for `parse-cv` so the deployed parser logic is
  covered too.
- For each CV, confirm the previously accepted result still holds:
  - All six sections extract (Qualifications, ICs, Engagement, Service, Awards,
    Experience).
  - Zero rows flagged `needs_review`.
  - No cross-section leakage and no header rows saved as data.
  - `original_cv_item_type` preserved verbatim, `ic_reporting_type` and
    `canonical_key` derived.

## 3. Report

A short pass/fail table per CV plus confirmation of which published-URL markers were
observed. If anything regressed, report the specific CV and section rather than
silently fixing, so you can decide next steps.

## Technical notes

- No schema changes, no migrations, and no parser edits are planned. This is a
  verification pass; edits happen only if a check fails and you approve them.
- Backend (edge functions, database, storage) already deploys automatically, so the
  parser running in production is current regardless of the frontend publish.
- The 12 unresolved critical security findings (open RLS policies on `app_users`,
  `faculty_profiles`, `intellectual_contributions`, etc., plus the public `evidence`
  bucket) are out of scope here. They are worth a dedicated follow-up, since the
  published site is publicly reachable and those policies currently allow anonymous
  read/write of faculty data.
