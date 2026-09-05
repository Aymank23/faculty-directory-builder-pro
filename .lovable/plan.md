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

The reconciliation chain is explicit and has five stages, each compared against the next:

```text
Source DOCX content
  -> independent source inventory (built without the production parser)
  -> production parser output
  -> stored database records
  -> records displayed on the dashboards
```

### Step 1 — Independent source inventory (no production parser)
Read each DOCX package directly and walk tables and paragraphs in true document order, capturing every heading, table, row and cell verbatim. From that raw dump, build a section-by-section inventory by hand-verified rules — section headings as they literally appear in the AACSB template, one entry per source table row. Placeholder/empty template rows are listed separately so "valid rows" is an auditable number. Each inventory row keeps its section, row index and raw cell text so any later claim can be traced back to a specific cell.

This inventory is the ground truth. The production parser is not used to build it, because the point of the exercise is to catch what the parser missed.

### Step 2 — Run the production parser and diff it against the inventory
Run `parse-cv` locally over the same four files and compare row-for-row with the inventory. Every difference (missing row, merged rows, wrong section, wrong column) is recorded as a **parser defect**, with the source cell that proves it. Defects are fixed in the parser and the diff is re-run until the parser reproduces the inventory, before any data is written.

### Step 3 — Diff inventory against the stored database, then against the dashboards
Match by normalized DOI, then normalized title+year, then normalized activity/role+period. Every source row is labelled: matched, matched-but-misfiled (right data, wrong section), missing (never extracted), or duplicate. Every stored row with no source match is labelled extra and kept with a flag — never silently deleted, since it may be a manual addition. Finally, the corrected records are read back through the actual dashboard pages (Faculty Overview, My Repository, My Analytics, Admin Faculty Profile, Master Dashboard, Export) to confirm what is displayed matches what is stored.

### Step 4 — Correct the four profiles only
- Insert missing valid rows into the correct section.
- Move misfiled rows to their correct section (Samar Aad's publications out of Engagement/Service; Academic vs Professional Engagement separation).
- Merge remaining duplicates by canonical key.
- Fill Original CV Item Type and IC Reporting Type using the exact agreed labels only, e.g. "Peer-Reviewed Academic/Professional Meeting Proceedings" — never a paraphrase such as "Peer-Reviewed Conference Proceedings".
- Preserve every manual correction; never overwrite a field that already holds a value the CV agrees with.
- All newly recovered or reclassified records stay **Under Review**. Nothing is auto-verified.
- Discipline is never inferred.

### Step 5 — Corrected reconciliation report
One table per faculty, one row per CV section, with the requested columns: Source CV valid rows | Stored rows | Missing rows recovered | Duplicates merged | Final section/classification | Remaining discrepancy. Contribution rows always show total / IC / Academic Engagement separately so the two classes are never double-counted. A separate list records every parser defect found and fixed.

**Full accounting rule:** every valid source-CV row lands in exactly one final category — Intellectual Contribution, Academic Engagement, Professional Engagement, Professional Experience, Qualification, Service, Award, merged duplicate, excluded, or Needs Review — or it is listed by name in an "Unresolved" list with the reason. Per faculty, the section totals plus the unresolved list must add up to the source valid-row count, and the report prints that arithmetic check so no row can disappear silently.

### Step 6 — Stop
Deliver the corrected report and wait for approval. No backfill of the remaining ~192 faculty.


## Technical notes

- The independent inventory is produced by unpacking each DOCX and reading `word/document.xml` in document order (tables and paragraphs interleaved), so nothing depends on `parse-cv`. Output is a per-faculty inventory file plus a raw section dump for spot-checking.
- Production parser output comes from `supabase/functions/parse-cv/parser.ts` and the order-preserving DOCX extraction in `parse-docx`, run locally over the same files, and is treated as a subject under test, not as ground truth.

- Classification and label mapping come only from `src/lib/icTaxonomy.ts`; the reporting-type label list there is the single source of allowed labels, so a mismatched label is a code fix in that file, not an ad-hoc string in SQL.
- Corrections are staged in `audit_log` first (as with the previous pilot), diffed, then applied in one faculty-scoped transaction with explicit `faculty_id IN (...)` guards on every statement.
- The 2026-09-05 backup in `/mnt/documents/db-backup-2026-09-05` remains the rollback point; a fresh snapshot of the four profiles' rows is taken immediately before applying changes.
- Existing unique constraints on DOI and canonical key are respected by deduplicating before update, avoiding the collision hit in the earlier run.
- If the source CV genuinely contains a row the parser cannot represent (unsupported layout), the parser is fixed rather than the row hand-inserted, so the fix carries over to the remaining faculty later.

## Out of scope

No migration or rebuild, no new backend or auth, no account removal, no CV re-upload requests, no changes to any faculty outside the four.
