# Full Dashboard Audit — Findings and Implementation Plan

I audited the live database (1,520 contribution records, 196 faculty, 189 accounts) and every page used by each account type. The headline result: the new rules were built into the **upload path and two admin pages only**. Nothing was applied to the information already stored, and most screens still use the old counting rules. That is why your tester sees old behaviour.

## What the stored data actually looks like right now

| Check | Result |
|---|---|
| Contributions with an AACSB reporting type assigned | 0 of 1,520 (all sit at "Needs Review") |
| Contributions separated as Academic Engagement | 0 (about 34 reviewing/workshop/accreditation/online-course items are counted as publications) |
| Contributions marked Verified | 0 of 1,520 |
| Shared-publication matching key filled | 0 of 1,520 (shared work counts once per author, not once per school) |
| Title holding the whole citation instead of the title | 525 |
| Missing author list | 402 |
| Missing journal / outlet | 417 |
| Outlet showing "DOI" or an author fragment | 15+ |
| Missing quartile | 575 |
| Missing Basic/Applied/Pedagogical | 90 |
| Faculty with no Discipline | 128 of 196 |
| Odd staffing value ("Part timer" instead of Part-Time) | 1 |
| Teaching load records | 0 |

Because every record is "Needs Review" and none is Verified, the school-level Intellectual Contributions total is effectively **zero**, and the Excel export produces an empty first sheet.

## Audit table

Accounts in the system: Admin (1), Faculty (188), Head of Department (role exists in the software but **no account uses it** — so that whole view is untested in practice). Academic vs Practitioner/part-time faculty share one Faculty view.

| Requirement | Applicable accounts | Faculty view | Admin view | Other views | Backend / data | Status | Exact gap | Root cause | Required fix |
|---|---|---|---|---|---|---|---|---|---|
| Original CV Item Type kept permanently | All | shown | shown | n/a | stored for all rows | Complete | — | — | — |
| Separate IC Reporting Type with agreed options | All | not shown | shown | not in HOD reports | column exists, 100% "Needs Review" | Broken | no record ever mapped | mapping runs only on new uploads; no backfill | one-off backfill of stored records + expose field in faculty and HOD views |
| Agreed initial mapping / Needs Review list | All | — | — | — | never executed on stored data | Missing | same as above | same | run the mapping over existing records |
| Academic Engagement separated from publications | All | mixed in | mixed in | mixed in | 0 rows classified | Broken | reviewing, workshops, accreditation, online-course and conference-chair items counted as publications | classification only applied at upload | reclassify stored rows; filter engagement out of every count |
| Basic / Applied / Pedagogical | All | shown | editable | used in HOD report | 90 blank | Partial | blanks and no admin bulk correction | not derived when the CV lacked it | fill from item type where safe; keep manual edits |
| IC field separation (Title, Authors, Year, Outlet, DOI, Quartile) | All | wrong for many | wrong for many | wrong | 525 titles hold whole citation, 402 no authors, 417 no outlet | Broken | stored rows never re-parsed after the parser was fixed | parser fixes applied to new uploads only | re-derive fields from the stored citation text for affected rows, without touching manually corrected rows |
| Verification: Verified / Under Review / Excluded | Admin, HOD | read-only | partial | partial | all rows Under Review | Partial | no "return to Under Review", no reclassify between IC and Engagement, no reporting-type change from the queue | queue built before the new rules | extend the review screen with those actions |
| Only Verified eligible items in totals | All | not applied | applied on master dashboard only | not applied | — | Partial | faculty, my-analytics, department overview and department reports still count every row including engagement and service-type items | each page has its own inline counting code | move every page onto the one shared counting rule |
| Duplicate / shared publication handling | All | — | — | — | matching key empty | Broken | same paper counts once per author at school level | key never written for stored rows | backfill the key; count unique at school level; show a "shared" marker |
| Proof upload / evidence | Faculty, Admin | works on profile | works | not in review queue | private storage, owner-scoped | Partial | admin cannot review/attach evidence from the verification queue | not built there | add evidence view/upload to the review screen |
| Practitioner / part-time rules (Rank & Tenure "Not Applicable", staffing "Adjunct") | Faculty, Admin | free-text choices | free-text choices | — | one stray "Part timer" value | Partial | rules not enforced or normalised | no shared normalisation for these three fields | add the options and normalise equivalents everywhere |
| Profile section order and add/edit/delete for sections 2–6 | Faculty, Admin | correct order, editable | editable | — | — | Complete | — | — | — |
| Admin can open any faculty profile fully | Admin | n/a | works | HOD limited to own department | permissions correct | Complete | — | — | — |
| Master dashboard filters (reporting type, category, department, discipline, campus, year, quartile, status) | Admin | n/a | present | — | data blank so filters look empty | Partial | filters work but have nothing to filter until backfill | data gap, not code | backfill first, then re-verify |
| Two-sheet Excel export (Summary + Supporting Records) | Admin | n/a | single-sheet, different columns | — | — | Missing | no Summary sheet; supporting sheet missing Employee ID, Title, Authors, Basic/Applied, duplicate marker | export written before the spec | rebuild export to the agreed two sheets using the shared counting rule |
| No re-upload required | All | — | — | — | 271 stored CV uploads available | Complete (once backfill runs) | — | — | backfill uses stored data only |

## Root-cause summary

1. **No backfill.** Every new rule (reporting type, engagement split, field separation, shared-publication key) was wired into the upload pipeline. The 1,520 records already in the system were never reprocessed, so the whole application looks unchanged.
2. **Duplicated counting logic.** Six screens each count contributions with their own inline code and the old single "status" field. Only the master dashboard and the export use the new shared rule, which is why behaviour differs by account.
3. **Two status fields coexist.** The old field and the new three-state field are both written; older screens read the old one.
4. **Review screen predates the rules,** so admins have no way to reclassify or reopen a record.
5. **Head-of-Department view is effectively dead** — no account holds that role, so nothing there has ever been exercised.

## Mandatory safeguards (agreed)

1. Take a full backup of the database (all tables exported and stored) before any correction runs. Nothing is changed until the backup is confirmed.
2. Phase 1 runs on **four test profiles only** first: Annelie Baalbaki, Anne-Marie Boustani, Maya Farah, Samar Aad — using their already stored CVs. No re-upload.
3. Backfilled records stay **Under Review**. Nothing is auto-verified; an existing verified decision is kept as-is.
4. One shared counting/classification service used by every dashboard. No page keeps its own counting rules.
5. The three-state verification field becomes the single authoritative status; the old status field is retired from all reads and kept only as a legacy copy so nothing breaks mid-migration.
6. After the four-profile run, a reconciliation report (source CV record vs stored record vs what each view displays, plus every remaining discrepancy) is delivered and **work stops for your approval** before touching the other faculty.
7. Manually corrected values are never overwritten — corrections only fill blank or demonstrably wrong fields, and any row that was edited by a person is left untouched.

## Implementation plan (in order)

**Phase 0 — Backup**
Export every table to a downloadable file set and confirm row counts against the live database.

**Phase 1a — Pilot on the four test profiles (then STOP)**
1. Re-derive Authors / Title / Year / Outlet / DOI / Quartile from the stored citation text where a field is blank or clearly wrong (title holding the whole citation, outlet showing "DOI" or an author fragment).
2. Assign the AACSB reporting type from the Original CV Item Type; genuinely ambiguous items stay Needs Review.
3. Move reviewing, guest lectures/workshops, conference chairing, online-course design/training and accreditation items to Academic Engagement.
4. Fill the shared-publication matching key (identifier, else title + year).
5. Fill Basic/Applied/Pedagogical only where the item type makes it unambiguous.
6. Confirm practitioner Professional Experience rows are populated for Baalbaki and Boustani.
7. Walk each of the four end to end: stored CV → fields → profile sections → item type → reporting type → engagement split → verification state → Faculty dashboard → Admin dashboard → Master dashboard → export, checking values against the source CV.
8. Deliver the reconciliation report and stop for approval.

**Phase 1b — Remaining faculty (only after approval)**
Same six corrections applied to the other records, plus normalising staffing values ("Part timer" → Part-Time) and filling Discipline where the department implies it; anything ambiguous is listed for your decision rather than guessed.

**Phase 2 — One counting rule everywhere**
Route faculty overview, my repository, my analytics, department overview, department reports, admin faculty profile, master dashboard and export through the single shared service (eligible = publication-class + Verified + a real reporting type; school totals de-duplicated by the shared key), and switch every screen off the old status field.


**Phase 3 — Admin review screen**
Add: change reporting type, change Basic/Applied/Pedagogical, move between publication and Academic Engagement, view/upload evidence, Verify, return to Under Review, Exclude — all recorded in the audit log.

**Phase 4 — Practitioner fields**
Add "Not Applicable" to Rank and Tenure, "Adjunct" to staffing, and normalise equivalents in profile, directory filters and exports.

**Phase 5 — Excel export rebuild**
Sheet 1 Summary (totals by reporting type, category, department, discipline, year, quartile). Sheet 2 Supporting Records with the exact agreed columns including Employee ID and the shared-record marker. Totals must equal the dashboard.

**Phase 6 — Faculty-facing reporting type**
Show reporting type and record class (publication vs Academic Engagement) read-only in the faculty repository and profile.

## Regression testing plan

End-to-end per test faculty (stored CV → stored records → profile → classification → verification → faculty dashboard → admin dashboard → master dashboard → export), checking values against the source CV, not just "it loaded":
- one academic full-time CV, one practitioner/part-time CV, one adjunct
- a publication shared by two AKSOB faculty (visible on both profiles, counted once at school level)
- a re-processed CV (must create no duplicates)
- one record in each of Verified / Under Review / Excluded, confirming only Verified reaches totals and that dashboard totals equal export totals
- Admin, Faculty, and a test Head-of-Department account, since that role has never been exercised

## Note

No project migration, rebuild, new backend or account removal is involved. All work is in place on the existing application, and Phase 1 only fills blank or demonstrably wrong values — manually corrected entries are left untouched.
