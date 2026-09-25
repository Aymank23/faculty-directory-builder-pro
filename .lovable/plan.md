# AKSOB Dashboard V2 — Architecture Audit and Implementation Plan

Scope: in-place re-architecture of the existing app, backend and accounts. Nothing is implemented, reclassified or deleted until this plan is approved. The four-profile remediation testing that was in progress is paused. It will be folded into the V2 pilot (Phase 5).

## Key audit findings (from the live database, 25 Sep 2026)

| Fact | Value | Consequence |
|---|---|---|
| Faculty profiles | 196 | Reused as they are |
| IC rows (record_class = ic) | 1,505 | Reused. **0 are Verified**, so Table 8.1 would show 0 today |
| Academic Engagement rows (same table) | 18 | Reused |
| PE / Service / Qualifications / Awards / Experience | 592 / 479 / 684 / 161 / 125 | Reused |
| IC Reporting Type set | ~110 of 1,505 (rest "Needs Review") | Needs admin classification. Never auto-set |
| Values currently stored in IC Reporting Type | AKSOB historical subcategories (Peer-Reviewed Journals, Proceedings, Presentations, Editorial-Reviewed, Other IC Type…) | Kept as the subcategory. The 3-way Table 8.1 type is derived from it |
| Canonical key populated | 68 rows | Shared-publication detection is effectively inactive |
| ICs shared across ≥2 AKSOB faculty | 0 detected | No coauthor linking exists yet. Point allocation cannot be computed |
| P/S (faculty_sufficiency), AACSB class (faculty_qualification) | 76 of 196 | Blank values are shown as "Not set". Never inferred |
| Discipline | 69 of 196 | Blank values are shown as "Unassigned" row in Table 8.1. Never inferred |
| Scholarship Portfolio (ic_category) | Mostly set. Label variants exist ("Pedagogical/Teaching", "(PA)" suffix, one citation typed into the field) | Normalise the labels. Flag the garbage value for review |

## A. Current → Target architecture

```text
CURRENT                                   V2 (same app, same backend)
faculty_profiles ─┐                       faculty_profiles (+ discipline, P/S, AACSB class)
intellectual_contributions (per faculty)  canonical IC  ◄── ic_authors (IC ↔ AKSOB faculty, many-to-many)
engagements / services / quals / awards   AE | PE | Services | Education | Other Evidence (existing tables)
        │                                         │
  pages each count on their own           ONE shared service (icMetrics + new points/table81 helpers)
                                                  │
                                ┌─────────────────┼──────────────────┐
                        Faculty Dashboard   Master Dashboard     Table 8.1
                        (7 tabs)            (3 tabs)             (derived, never typed)
```
Both dashboards read the same rows through the same helper functions. The Master Faculty tab opens the same Faculty Dashboard page, not a copy.

## B. Feature mapping

| Existing item | Decision | Why |
|---|---|---|
| MasterDashboardPage | MODIFY | Becomes the 3 tabs Overview / Faculty / Table 8.1. Clickable KPIs drill into records |
| FacultyDirectoryPage | MOVE → Master "Faculty" tab | Only Name, Dept, Discipline, P/S, AACSB class and an Open icon. Status and validity are removed from view. Admin editing stays reachable from the profile |
| AACSBExportsPage | MODIFY | The two-sheet Excel is regenerated from Table 8.1 helpers |
| FacultyProfilePage + AdminFacultyProfilePage | MERGE → one Faculty Dashboard | Tabs Overview / IC / AE / PE / Services / Education / Other Evidence. Same component for faculty, HoD and admin. Permissions come from the existing access rules |
| FacultyOverviewPage, MyAnalyticsPage | RETIRE (redirect to Faculty Dashboard Overview) | Duplicate views |
| MyRepositoryPage | MODIFY → IC tab content | Add, edit and delete stay |
| CvSectionCard, ProofUploadCell | KEEP | Evidence stays in the workflow. Only the visible Evidence column is hidden in IC and Education |
| Professional Experience section | KEEP (under Education/Degrees as a secondary list) | Data is preserved. It does not count as a separate tab |
| Awards section | MOVE → Other Evidence | Per the crosswalk. Competitive research awards can be promoted to IC by an admin |
| VerificationQueuePage | MODIFY | Adds the crosswalk activity type, the Table 8.1 type, a coauthor-linking panel and a "conditional" review reason |
| Department Overview / Reports (HoD) | KEEP, rewire | Use the shared helpers and Department Points |
| UploadCvPage, parse-cv, cvArchive, CvArchiveCard | KEEP | New rows arrive as Under Review with a suggested crosswalk class only |
| Audit log, auth, user management | KEEP | Unchanged |
| icTaxonomy / icMetrics | MODIFY + ADD | Crosswalk table, 3-way type mapping, points and Table 8.1 aggregation |

## C. Data-model gap analysis

| Requirement | Existing support | Change? | Proposed solution | Risk |
|---|---|---|---|---|
| Discipline, P/S, AACSB class | Columns exist | No | Normalise the values only | Low |
| Latest degree | highest_degree + qualifications | No | Derived | Low |
| Canonical IC shared by several faculty | Each faculty member has their own row. canonical_key is sparse | **Yes** | New `ic_authors` link table (ic_id, faculty_id, department at time of the IC, is_primary, confirmed_by). Existing rows stay. Duplicates across faculty are linked to one canonical IC, and the other rows are marked `duplicate_of` rather than deleted | Medium. Matching is proposed by the system and confirmed by an admin |
| Total authors | Free-text `authors` | Yes (one column) | `total_authors` int, derived from the citation and editable | Low |
| AKSOB and same-department author counts | None | No stored column | Computed live from `ic_authors` | None |
| School / Department Points | None | No stored column | Computed: 1/AKSOB authors and 1/same-department authors | None |
| Scholarship Portfolio | ic_category | No | Normalise the 3 labels | Low |
| Table 8.1 IC Reporting Type (3-way) | ic_reporting_type holds historical subcategories | Yes (one column) | Keep the subcategory. Add derived `table81_type` (PRJ / Additional / All Other) via a fixed mapping | Low |
| Crosswalk activity type | original_cv_item_type (free text) | Yes (one column) | Add `activity_type` (controlled list from the crosswalk) on IC, engagements and awards. The original CV text is kept untouched | Low |
| Conditional flag | None | Yes | `eligibility` = include / exclude / conditional plus `condition_note`. Conditional items stay out of totals until an admin resolves them | Low |
| Quartile | Column exists | No | — | — |
| Verification (3-state) | Exists | No | Unchanged | — |
| AE vs PE | AE lives in the IC table (record_class). PE has its own table | No | Keep both. AE never feeds Table 8.1 | — |
| Services | Table exists | No | Services tab | — |
| Other Evidence | Awards table only | Yes (one category column) | Add `evidence_category` on awards_recognition (Award / Grant-Project / Media-Outreach / Other). Grants not treated as IC go here | Low |
| Evidence, CV versions, audit | Exist | No | — | — |

## D. Crosswalk → deterministic classification spec (for your review)

| Original activity type | Destination | Table 8.1 | 3-way type (historical subcategory) | Condition | Human review? |
|---|---|---|---|---|---|
| PRJ article (Scopus-indexed) | IC | Include | Peer-Reviewed Journal Article | Completed/published. Quartile is an attribute | No |
| Practice-oriented / trade / magazine / newspaper article | IC | Include | Additional (Editorial-Reviewed) **or** All Other | Additional only if editorial review is documented | Yes |
| Academic conference proceeding | IC | Include | Additional (Proceedings) | — | No |
| Academic conference paper presentation | IC | Include | Additional (Presentations) | — | No |
| Academic conference keynote | IC | Include | Additional (Presentations) | Substantive and documented | Yes |
| Case study with demonstrable impact | IC | Include | Additional (Case Studies) | — | No |
| Scholarly book; book chapter / monograph | IC | Include | Additional | — | No |
| Textbook (new or substantially revised) | IC | Include | Additional (Textbooks) | Adoption evidence | Yes |
| Book review in PRJ; published letter to PRJ editor | IC | Include | Additional | — | No |
| Report from sponsored research | IC | Include | All Other | Review process may upgrade it | Yes |
| Working paper in a qualifying outlet | IC | **Conditional** | All Other | DOI available | Yes (if no DOI → excluded) |
| Competitive research grant received | IC | Include | Additional (Competitive Grants) | Grant must be competitive | Yes |
| Internal / noncompetitive grant; grant proposal | Other Evidence | Exclude | — | Award may be counted only if competitive | Yes |
| International research recognition award | Other Evidence | **Conditional** (the crosswalk says "Exclude" but also "count when competitive") | Additional (Competitive Awards) | Competitive research award | Yes — please confirm |
| Policy development / advisory panel / standards development | PE or AE | Exclude | Additional (Practice Standards/Public Policy) only for a distinct authored output, recorded as a separate IC | The output must exist | Yes |
| Editor-in-Chief / Executive Editor; journal reviewer | AE | Exclude | N/A | — | No |
| Conference organiser/chair; graduate supervision; guest lectures; online-course design/training; curriculum/accreditation frameworks | AE | Exclude | N/A | — | No |
| Consulting; board membership; entrepreneurship; exec-ed workshops; faculty-development workshops; speeches; invited presentations; panels; jury; certifications; internships; associations; partnerships; university–business collaboration | PE | Exclude | N/A | A distinct published output is recorded separately as an IC | No |
| Vocational education leading to a credential | Education/Degrees (or PE) | Exclude | N/A | — | No |
| University / school / department / community service | Services | Exclude | N/A | — | No |
| Media / outreach, other awards | Other Evidence | Exclude | N/A | — | No |

Two points in the crosswalk need your ruling before Phase 2:
1. International Research Recognition Award: the crosswalk says both "Exclude" and "count when competitive". The plan treats it as Conditional.
2. Faculty Development Workshop: the crosswalk routes it to PE (Appendix C), but the tutorial routes faculty development to AE. The plan follows the crosswalk (PE) unless you say otherwise.

## E. Impact on existing data (nothing is changed during the audit)

- **Reused directly:** faculty profiles, qualifications, services, PE, experience, evidence files, CV archive, audit log, verification states, manual edits.
- **Derived with no change to the source:** 3-way Table 8.1 type from the stored subcategory; points; counts; latest degree.
- **Needs reclassification (proposed by the system, confirmed by an admin, pilot first):** ~1,395 ICs still at "Needs Review"; Scholarship Portfolio label variants; awards → Other Evidence categories; grants and working papers → conditional.
- **Needs new linking:** coauthor detection across faculty using DOI and normalised title plus year. Every proposed link is confirmed by an admin before points change.
- **Cannot be safely transformed without source evidence:** "editorial review documented", "competitive grant", "textbook adoption", "working-paper DOI", missing Discipline/P/S/AACSB class for about 120 faculty. These stay Conditional or "Not set" and are never guessed.

## F. Implementation phases

1. **Backup and schema additions.** Take a fresh backup. Add `ic_authors`, `table81_type`, `activity_type`, `eligibility`/`condition_note`, `total_authors`, `duplicate_of` and `evidence_category`. These are additions only, with access rules mirroring the existing tables.
2. **Shared logic.** Add the crosswalk table, 3-way mapping, points functions and Table 8.1 aggregation to the central service, with unit tests. Map the existing subcategories.
3. **Faculty Dashboard (7 tabs).** One component for all roles. Retire the duplicate pages with redirects.
4. **Master Dashboard (3 tabs) and export.** Clickable KPIs, Faculty directory and Table 8.1 with both drill-downs. The Excel export uses the same aggregation.
5. **Pilot (Baalbaki, Boustani, Farah, Aad only).** Propose crosswalk classes and coauthor links. An admin confirms them in the Verification Queue. Produce a reconciliation report. **STOP for approval.**
6. **School-wide rollout** after approval. Suggestions are batched by department and still need admin confirmation.

## G. Regression and acceptance tests

- Editing one pilot IC changes that faculty member's IC tab, the Master Overview, Table 8.1 and the Excel export identically.
- Each record appears in exactly one of IC / AE / PE / Services / Education / Other Evidence. AE and PE never count in Table 8.1.
- Only records that are Verified, with record class IC, a reporting type set and eligibility "include", reach Table 8.1. Under Review, Excluded and Conditional records are absent.
- A publication linked to 2 AKSOB faculty counts as 1 school IC, with 0.5 school points on each profile. The 4 tutorial scenarios reproduce 1.00/1.00, 0.50/0.50, 0.33/0.50 and 0.25/1.00.
- For each discipline: Basic + Applied + Pedagogy = Total, and the sum of the three reporting types = the same Total. Drill-down 1 and drill-down 2 totals equal the Table 8.1 cell.
- Master "Total Faculty" and the P/S and AACSB class distributions equal the Faculty tab row counts under the same filters.
- Pilot manual edits, evidence files, CV versions and audit entries match the pre-V2 backup.
- Faculty see only their own dashboard, HoDs see their department, and admins see everything. This is checked with pilot faculty, HoD and admin accounts.

## Technical notes

- No new project, backend, authentication or parallel dataset is created. All schema changes are additive, and nothing is dropped.
- Points, counts and Table 8.1 are always computed and never stored as totals.
- The legacy `status` column remains read-only fallback. `verification_status` stays authoritative.
