# Requirements-Completeness Audit and Consolidated Remediation Plan

Verified by reading the actual pages and querying the live data. No changes made.

## Why Academic Engagement Activities is missing from Maya Farah's profile

Two separate causes, both confirmed:

1. The faculty "My Profile" page has only seven sections and no Academic Engagement section at all. Its numbering is 1 Personal, 2 Qualifications, 3 Intellectual Contributions, 4 Professional Engagement, 5 Service, 6 Awards, then an unnumbered Professional Experience block. Academic Engagement was implemented in the CV reader, the stored data, the school-wide dashboard and the Excel export — but the faculty profile page was never rewired to it, so nothing on that page reads it.
2. The Intellectual Contributions section on that page lists every row in the contributions table without separating the two record classes. On a profile that does have Academic Engagement rows (Annelie Baalbaki, 18 rows) they currently appear inside Intellectual Contributions, which inflates what a faculty member sees.

Also worth knowing: Maya Farah's own record has 46 research contributions and zero Academic Engagement rows, so even once the section is added her section 4 will legitimately show "none recorded". The section must still be present, and it will be populated for practitioner profiles such as Annelie.

## Audit table

| Requirement | Faculty View | Practitioner / Part-Time View | Admin View | Master Dashboard | Backend / Data | Status | Evidence | Required fix |
|---|---|---|---|---|---|---|---|---|
| Exact 8-section My Profile order | No Academic Engagement section; Professional Experience unnumbered | Same page, same gap | Admin faculty profile has 5 sections only (no Academic Engagement, no Professional Experience) | n/a | Data supports it | **Missing** | FacultyProfilePage sections numbered 1,2,3,4=Professional Engagement,5,6 + unnumbered Experience; AdminFacultyProfilePage has sections 2,3,4,5,6 only | Add Academic Engagement as section 4, renumber, add Professional Experience as section 8, mirror on admin page |
| Academic Engagement excluded from IC totals | Not applied on profile page | Same | Admin profile KPIs count all rows | Applied | record_class column exists and is populated | **Partial** | FacultyProfilePage does not use the shared counting helpers at all; Annelie's 18 engagement rows sit inside her IC list | Route both profile pages through the shared counting helpers |
| Only three verification statuses (Verified / Under Review / Excluded) | Repository detail panel still prints the old status field | n/a | Admin profile KPI counts `status='verified'` | Uses new status | Both old `status` and new `verification_status` still stored | **Partial** | MyRepositoryPage detail dialog reads `viewIc.status`; AdminFacultyProfilePage KPI reads `i.status` | Retire every read of the legacy field; single label helper everywhere |
| Only Verified records in final totals | Repository shows all with filter | n/a | Admin KPIs not eligibility-filtered | Export applies eligibility | Every pilot row is Under Review, so verified totals are legitimately zero today | **Partial** | 0 verified rows across the four pilots | Apply the eligibility rule to admin/faculty KPIs too, and label totals "Verified only" |
| Part-time options: Academic Rank / Tenure = Not Applicable, FT-PT = Adjunct | Options absent from the edit form | Absent | Absent | Filters unaffected | Free-text columns, so values are storable | **Missing** | constants.ts: `ftPtStatuses = ['FT','PT']`; `academicRanks` and `tenureStatuses` contain no "Not Applicable" | Add the three options and normalise existing practitioner values |
| Academic vs Practitioner CV structures, Experience/Engagement separation | Experience shown but unnumbered | Practitioner sections present | Experience section absent | n/a | Separate tables exist and are populated | **Partial** | Admin page lacks Professional Experience card | Add Experience to admin page; keep both CV shapes in the 8-section frame |
| Complete extraction (outlet, authors, dates, identifiers, activity types) | Visible | Visible | Visible | Visible | Reconciled for the four pilots only | **Partial** | Pilot reconciliation complete; remaining ~192 faculty untouched by agreement | No action now; awaits your backfill approval |
| Add / Edit / Delete on sections 2-8 | Works via shared section card | Works | Works | n/a | RLS allows owner + HoD + admin | **Complete** | Shared CvSectionCard used on both profile pages | Extend to the new sections |
| Proof upload + status badge | Works for Engagement, Service, Experience | Works | Works | n/a | Private bucket + proof columns | **Complete** | Proof column rendered for the three proof tables | Decide whether Academic Engagement rows need proof too |
| Permanent Original CV Item Type | Not shown | Not shown | Not shown | Used | Stored | **Partial** | Column present in export and verification queue only | Show it read-only in the profile IC/Engagement tables |
| Separate IC Reporting Type, exact agreed option list | Not shown | Not shown | Not shown | Used | Stored, single source list in icTaxonomy | **Partial** | Only the verification queue exposes the list | Display it on profiles; keep the list as the only source of labels |
| Agreed initial mapping + Needs Review | n/a | n/a | Editable in queue | Counted | Applied on CV save | **Complete** | Mapping applied at save; unmapped items fall to Needs Review | none |
| Admin: reclassify, review evidence, verify, return to review, exclude | n/a | n/a | Verify and exclude only; no return-to-review, no record-class reclassification, no evidence viewer | n/a | Columns for reclassification exist and are unused | **Partial** | VerificationQueuePage has verify and reject/exclude actions only | Add return-to-review, IC vs Academic Engagement reclassification, evidence preview |
| Shared publications: visible per faculty, counted once school-wide | Visible | Visible | Visible | Not deduplicated | Canonical key + dedupe helpers written but unused | **Broken** | No page imports the dedupe helper; school KPIs double-count co-authored work | Use the school-level unique count on Master, Department and export totals; badge shared rows |
| Master Dashboard filters (reporting type, category, department, discipline, campus, year, quartile, status) | n/a | n/a | n/a | Reporting-type filter missing; others present | Field available | **Partial** | Master filter set: department, discipline, campus, category, type, year, quartile, status | Add IC Reporting Type filter and a reporting-type breakdown |
| Two-sheet Excel export with exact fields | n/a | n/a | n/a | n/a | Two sheets exist | **Partial** | Sheets "Intellectual Contributions" and "Academic Engagement"; engagement sheet lacks campus, activity type and period | Confirm the exact field list per sheet and complete it |
| CV archive (private, versioned, admin retrieval) | Shown | Shown | Shown | n/a | Private bucket + version columns | **Partial** | Archive card lists versions; a re-upload of an identical file still creates a new version, and the card reads a different timestamp field than the upload writes | Align the timestamp field, skip a new version when the file content is unchanged |

## Consolidated remediation plan (in order)

1. **Profile structure** — rebuild both profile pages on the exact 8-section order, with Academic Engagement as section 4 reading `record_class='academic_engagement'` and Intellectual Contributions restricted to `record_class='ic'`. Add Professional Experience as section 8 on the faculty page and add the missing Qualifications-through-Experience set on the admin page. Show Original CV Item Type and IC Reporting Type as read-only columns.
2. **Single counting path** — every KPI, chart, table and export goes through the shared counting helpers: three statuses only, verified-only final totals, Academic Engagement never in IC totals, legacy status field no longer read anywhere.
3. **Shared publications** — school-level and department-level totals use the canonical-key unique count; per-faculty views keep showing the row, marked "Shared".
4. **Part-time / practitioner options** — add Not Applicable ranks and tenure, Adjunct FT-PT status, everywhere those dropdowns appear, and normalise existing practitioner values without inferring anything new.
5. **Admin verification workflow** — reclassify between IC and Academic Engagement, change reporting type, open evidence, verify, return to review, exclude, each written to the audit log.
6. **Master Dashboard** — add the reporting-type filter and breakdown so all nine filters are present.
7. **Export** — finalise the two sheets against your exact field list.
8. **CV archive fixes** — content-hash check before creating a version, and the correct upload timestamp on the history card.
9. **Regression pass** — walk the faculty, practitioner, HoD-equivalent and admin views in the running app and confirm each row of the audit table by looking at the screen, not the code, before handing back for testing.

## Technical notes

- Profile pages: `src/pages/FacultyProfilePage.tsx`, `src/pages/AdminFacultyProfilePage.tsx`; shared section UI `src/components/CvSectionCard.tsx`.
- Counting/eligibility/shared-publication helpers already exist in `src/lib/icMetrics.ts`; label lists in `src/lib/icTaxonomy.ts` stay the only source of reporting-type strings.
- No migration is needed for items 1-3, 5-7: `record_class`, `verification_status`, `ic_reporting_type`, `original_cv_item_type` and `canonical_key` are all present and populated. Item 4 touches option lists plus a scoped normalisation update; item 8 touches the archive helper only.
- Out of scope until you approve separately: backfilling the remaining ~192 faculty, any auto-verification, any Discipline inference, and any rebuild or auth change.

## Open question

Please confirm the exact field list for each of the two export sheets, so item 7 is completed against your list rather than my reconstruction.
