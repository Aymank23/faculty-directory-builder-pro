# Corrected Four-Profile Reconciliation Against Source CVs

The previous pilot only cleaned rows that were already in the database. This plan re-reconciles each of the four profiles **against the source CV documents**, section by section, recovers anything never extracted, and corrects misfiled records. No other faculty are touched.

## What the current data shows (verified now)

| Faculty | Contribution rows (total) | of which ICs | of which Academic Engagement | Qualifications | Prof. Experience | Prof. Engagement | Service | Awards |
|---|---|---|---|---|---|---|---|---|
| Annelie Moukaddem Baalbaki | 18 | 3 | 15 | 2 | 0 | 11 | 7 | 0 |
| Anne-Marie Boustani | 0 | 0 | 0 | 2 | 4 | 4 | 0 | 0 |
| Maya Farah Jibai | 46 | 46 | 0 | 4 | 0 | 4 | 7 | 2 |
| Samar Aad | 9 | 9 | 0 | 5 | 0 | 48 | 54 | 0 |

The two classes are mutually exclusive: Annelie's 18 rows are 3 research contributions **plus** 15 Academic Engagement entries, not 18 in addition to 15. The corrected report will always show total / IC / Academic Engagement side by side so this cannot be misread.


Two red flags confirm the user's findings:
- Samar Aad has only 9 contributions but 48 Professional Engagement and 54 Service rows — publications were almost certainly filed into the wrong sections by an older import.
- Boustani's four engagement rows match the report, so the two missing entries were never extracted.

The uploaded CV files for all four faculty are available locally, so re-reading the source is possible without asking anyone to upload again. One caveat: Samar Aad's stored upload is named "LAU AACSB CV Samar Aad without awards.docx" while the available file is "AACSB Academic Samar Aad.docx" — I will confirm they are the same CV content before using it, and ask for the exact file if they differ.

## Approach

### Step 1 — Extract ground truth from each source CV
For each of the four CVs, produce a complete machine-readable inventory of every table row in every section: Qualifications, Professional Experience, Intellectual Contributions (all sub-tables: PRJ, books, chapters, proceedings, presentations, grants, cases, other), Academic Engagement, Professional Engagement, Service, Awards. Placeholder/empty template rows are counted as invalid and listed separately, so "valid rows" is an auditable number.

### Step 2 — Match source rows to stored rows
Match by normalized DOI, then normalized title+year, then normalized activity/role+period. Every source row is labelled: matched, matched-but-misfiled (right data, wrong section), missing (never extracted), or duplicate. Every stored row with no source match is labelled extra (kept and flagged, never silently deleted — it may be a manual addition).

### Step 3 — Correct the four profiles only
- Insert missing valid rows into the correct section.
- Move misfiled rows to their correct section (Samar Aad's publications out of Engagement/Service; Academic vs Professional Engagement separation).
- Merge remaining duplicates by canonical key.
- Fill Original CV Item Type and IC Reporting Type using the exact agreed labels only, e.g. "Peer-Reviewed Academic/Professional Meeting Proceedings" — never a paraphrase such as "Peer-Reviewed Conference Proceedings".
- Preserve every manual correction; never overwrite a field that already holds a value the CV agrees with.
- All newly recovered or reclassified records stay **Under Review**. Nothing is auto-verified.
- Discipline is never inferred.

### Step 4 — Corrected reconciliation report
One table per faculty, one row per CV section, with the requested columns: Source CV valid rows | Stored rows | Missing rows recovered | Duplicates merged | Final section/classification | Remaining discrepancy. Any row that cannot be resolved is listed explicitly as a remaining discrepancy with the reason, rather than being hidden.

### Step 5 — Stop
Deliver the corrected report and wait for approval. No backfill of the remaining ~192 faculty.

## Technical notes

- Source extraction reuses `supabase/functions/parse-cv/parser.ts` (and the DOCX order-preserving extraction in `parse-docx`) run locally over the four files, so the audit uses the same logic as production rather than a parallel implementation.
- Classification and label mapping come only from `src/lib/icTaxonomy.ts`; the reporting-type label list there is the single source of allowed labels, so a mismatched label is a code fix in that file, not an ad-hoc string in SQL.
- Corrections are staged in `audit_log` first (as with the previous pilot), diffed, then applied in one faculty-scoped transaction with explicit `faculty_id IN (...)` guards on every statement.
- The 2026-09-05 backup in `/mnt/documents/db-backup-2026-09-05` remains the rollback point; a fresh snapshot of the four profiles' rows is taken immediately before applying changes.
- Existing unique constraints on DOI and canonical key are respected by deduplicating before update, avoiding the collision hit in the earlier run.
- If the source CV genuinely contains a row the parser cannot represent (unsupported layout), the parser is fixed rather than the row hand-inserted, so the fix carries over to the remaining faculty later.

## Out of scope

No migration or rebuild, no new backend or auth, no account removal, no CV re-upload requests, no changes to any faculty outside the four.
