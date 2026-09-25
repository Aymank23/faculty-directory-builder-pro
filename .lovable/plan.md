# AKSOB Dashboard V2: Final Architecture for Approval (rev. 2)

Scope: in-place re-architecture of the existing app, backend and accounts. **Nothing is implemented in this step.** No changes to the database, UI, classifications, pilot profiles or existing records until you approve implementation explicitly. The four-profile remediation testing is paused and folded into the V2 pilot (Phase 5).

Retained from rev. 1 without change:
- a single backend and source of truth
- the seven-tab Faculty Dashboard and the three-tab Master Dashboard
- a separate Services tab
- pilot-first migration and additive-only schema changes
- shared calculation services
- preservation of evidence and manual edits
- reconciliation testing

## 1. Verification audit: why 0 of 1,505 ICs are Verified

Findings (live database and the 5 Sep backup, both read-only):

| Check | Result |
|---|---|
| Live `status` vs `verification_status` | All 1,523 rows are `under_review` / `under_review`. No mismatch |
| Backup of 5 Sep | All 1,520 rows are `under_review` / `under_review`. Verified was never present |
| `verified_by`, `verification_date` | Empty on every row |
| Audit log | No verify, exclude or return-to-review actions have ever been recorded. The only IC actions are imports, pilot backfills, merges and edits |
| Aug migration that created `verification_status` | Copied the legacy value exactly: verified → verified, rejected → excluded, and everything else → under_review |

**Conclusion:** the zero count is the true state. It is not a data-loss or mapping bug. Every IC came from CV import or pilot backfill, and both set Under Review by design. No reviewer has verified anything yet. Table 8.1 eligibility logic can be built, but the table will show 0 until reviewers verify records. The pilot (Phase 5) includes a real verification pass on the four profiles so that Table 8.1 can be tested with actual numbers.

Unrelated observation, no action taken: the IC count is 1,523 total rows, of which 1,505 are ICs and 18 are Academic Engagement.

## 2. Architecture

```text
faculty_profiles (discipline, P/S, AACSB class)
      │ many-to-many
  ic_authors ──► canonical_ics  ◄── legacy_ic_link ── intellectual_contributions (existing faculty-owned rows, kept for traceability)
                       │
      activity_outputs (activity row → resulting canonical IC)  ← PE / AE / Service / Other Evidence rows
                       │
      shared service: classification → eligibility → points → Table 8.1
             ┌─────────┼──────────┐
   Faculty Dashboard  Master Dashboard  Table 8.1 / Excel
```

Every count, point value and Table 8.1 cell resolves to **canonical_ics**. The faculty-owned rows remain only as migration and audit history.

## 3. Canonical IC model (strengthened)

- **canonical_ics** is the one authoritative record per publication or output. It holds the title, year, outlet, DOI, authors text, total_authors, quartile, Scholarship Portfolio, historical AKSOB reporting type, original CV item type, verification_status, eligibility, condition_note and evidence reference.
- **ic_authors**: canonical_ic_id, faculty_id, department_snapshot (the faculty member's department when linked), author_position (optional), link_status (proposed / confirmed) and confirmed_by/at. There is one row per AKSOB author.
- **legacy_ic_link**: maps each existing `intellectual_contributions` row to its canonical IC, recording the match method (DOI / title+year / manual). Legacy rows are never deleted. After the cut-over they become read-only history.
- Derived at read time and never stored:
  - AKSOB authors = the number of confirmed ic_authors
  - same-department authors = confirmed ic_authors whose department_snapshot equals the viewing faculty member's department
  - School Points = 1 / AKSOB authors
  - Department Points = 1 / same-department authors
- Verification, classification and evidence live on the canonical IC. A shared publication is verified once, and the result applies to every coauthor.
- Only an admin can merge two canonical ICs or split one. Every merge or split is written to the audit log.

## 4. Activity versus resulting output

- Every activity row has exactly **one primary destination**: AE, PE, Services, Education or Other Evidence.
- A distinct output produced by that activity is a **separate canonical IC**. It is connected through **activity_outputs** (activity_table, activity_id, canonical_ic_id, relationship such as "published report from consulting").
- Double-counting prevention:
  - The activity never contributes to IC totals. Only the linked canonical IC can, and only if it is eligible.
  - A canonical IC counts once no matter how many activities link to it.
  - The UI shows the link as a small "Resulting output" badge on the activity and a "Arising from" note on the IC.
- Examples:
  - A consulting engagement (PE) links to a published consulting report (IC, subject to review).
  - Development of an accreditation standard (AE) links to an authored standard (IC, Practice Standards/Public Policy).
  - A grant received (Other Evidence) links to a competitive award (IC), but only if the award is judged competitive.

## 5. Classification chain (Table 8.1)

```text
Original CV Item Type (verbatim, never edited)
   → Historical AKSOB IC Reporting Type (existing field, editable by admin, preserved)
      → Table 8.1 Reporting Type (DERIVED, not editable)
```

The 3-way type is computed by a fixed lookup from the historical type:

| Historical AKSOB type | Table 8.1 type |
|---|---|
| Peer-Reviewed Journals | Peer-Reviewed Journal Articles |
| Editorial-Reviewed Journals and Articles | Additional Peer-/Editorial-Reviewed ICs |
| Peer-Reviewed Academic/Professional Meeting Proceedings | Additional |
| Academic/Professional Meeting Presentations | Additional |
| Competitive Research Grants Received | Additional |
| Textbooks | Additional |
| Case Studies | Additional |
| Professional Practice Standards or Public Policy | Additional |
| Scholarly Book / Chapter / Book Review / Letter to Editor (new historical values, as in the crosswalk) | Additional |
| Other IC Type Selected by the School | All Other ICs |
| Needs Review / Not Applicable / blank | none (ineligible) |

Ambiguous or conditional cases (for example editorial review not documented, a working paper without a DOI, or competitiveness unknown) keep eligibility = conditional and verification = Under Review until resolved. They never receive a derived type by default.

## 6. Professional Experience

This stays a **separate dataset** in its existing `professional_experience` table. It is not migrated into Education.

Proposal: show it as a clearly labelled, collapsible subsection at the bottom of the PE tab, headed "Professional Experience (employment history, not counted as engagement)". Its rows are excluded from the PE totals and KPIs. The data also stays accessible in the admin detailed record.

Alternative for you to choose instead: visible only in the admin detailed record. This is entry D-4 in the register.

## 7. Decision Register

| # | Conflict / open point | Sources | Proposed interpretation | Final approved decision |
|---|---|---|---|---|
| D-1 | International Research Recognition Award | Crosswalk says "Exclude" in the Table 8.1 column but "count when competitive" in the note | Treat as Conditional: Other Evidence by default, linked IC only if an admin confirms it is competitive | **Unresolved — not implemented** |
| D-2 | Faculty Development Workshop | Faculty tutorial says AE, the crosswalk (Appendix C) says PE | No assumption. Such items are held as "Unrouted" in the review queue | **Unresolved — not implemented** |
| D-3 | Working-paper rule | Crosswalk: "Conditional if DOI is available" | Include as All Other IC only when a DOI is present and the item is verified. Otherwise excluded | Pending |
| D-4 | Where Professional Experience appears | Your feedback | PE subsection (see section 6) or admin record only | Pending |
| D-5 | Trade/practice articles without documented editorial review | Crosswalk | All Other ICs. Upgrade to Additional when evidence is uploaded | Pending |
| D-6 | Grant: internal vs competitive | Crosswalk | Default Other Evidence. A linked IC is created only when competitiveness is confirmed | Pending |

## 8. Crosswalk → deterministic spec (unchanged from rev. 1 except for D-1 and D-2)

| Original activity type | Primary destination | Table 8.1 | Historical type | Condition | Review? |
|---|---|---|---|---|---|
| PRJ article | IC | Include | Peer-Reviewed Journals | Published | No |
| Practice/trade/magazine article | IC | Include | Editorial-Reviewed or Other IC | Editorial review documented (D-5) | Yes |
| Conference proceeding | IC | Include | Proceedings | — | No |
| Conference paper presentation | IC | Include | Presentations | — | No |
| Conference keynote | IC | Include | Presentations | Substantive and documented | Yes |
| Case study with impact | IC | Include | Case Studies | — | No |
| Scholarly book, chapter, monograph | IC | Include | Scholarly Book/Chapter | — | No |
| Textbook | IC | Include | Textbooks | Adoption evidence | Yes |
| Book review / letter to editor in a PRJ | IC | Include | Book Review / Letter | — | No |
| Sponsored-research report | IC | Include | Other IC | Review process | Yes |
| Working paper | IC | Conditional | Other IC | DOI (D-3) | Yes |
| Competitive research grant | Other Evidence + linked IC | Conditional | Competitive Grants | Competitive (D-6) | Yes |
| Internal grant / grant proposal | Other Evidence | Exclude | — | — | No |
| International research award | Other Evidence | **D-1 unresolved** | — | — | Yes |
| Policy / standards / advisory output | PE or AE + linked IC | Conditional | Practice Standards/Public Policy | A distinct authored output exists | Yes |
| Editorial role, reviewer, conference organiser/chair, supervision, guest lecture, online-course design/training, curriculum/accreditation work | AE | Exclude | — | — | No |
| Faculty Development Workshop | **D-2 unresolved** | Exclude | — | — | Yes |
| Consulting, boards, entrepreneurship, exec-ed, speeches, invited talks, panels, jury, certifications, internships, associations, partnerships, collaborations | PE | Exclude | — | A linked output is possible | No |
| Vocational credential | Education | Exclude | — | — | No |
| University/school/department/community service | Services | Exclude | — | — | No |
| Media/outreach, other awards | Other Evidence | Exclude | — | — | No |

## 9. Schema proposal (additive only; applied in Phase 1 after approval)

| Object | Change |
|---|---|
| `canonical_ics` | New table (fields as in section 3), with RLS: visible to anyone who can view at least one linked author, edited by admins and the linked faculty |
| `ic_authors` | New table. Unique on (canonical_ic_id, faculty_id) |
| `legacy_ic_link` | New table, one row per existing IC row |
| `activity_outputs` | New table (activity_table, activity_id, canonical_ic_id, relationship) |
| `awards_recognition` | + `evidence_category` (Award / Grant-Project / Media-Outreach / Other) |
| AE, PE, service and award rows | + `activity_type` (controlled crosswalk list), with the original CV text kept as-is |
| Existing tables | No columns are dropped or renamed. `intellectual_contributions` keeps working until the cut-over |
| Derived values | 3-way type, points and counts are computed in shared functions and never stored |

## 10. Migration logic (pilot first)

1. Take a fresh backup and record row counts.
2. For the four pilot faculty only, group the existing IC rows by DOI, then by normalised title plus year. Create one canonical IC per group with link_status = proposed, plus the legacy links. A group spanning several faculty becomes one canonical IC with several proposed authors.
3. Carry over the verification status, historical type, portfolio, evidence and manual edits from the legacy row. When rows in a group disagree, keep the most recently edited value and flag the conflict for an admin. Nothing is overwritten silently.
4. Admins confirm the author links, crosswalk activity types and conditional items in the Verification Queue. Real verification happens there too.
5. Produce a reconciliation report: legacy rows → canonical ICs → Table 8.1 cells, with points per faculty. **STOP for approval.**
6. Roll out to the remaining faculty department by department, with the same confirm-before-count rule.

## 11. Implementation phases

1. Schema additions (section 9).
2. Shared logic: the classification chain, eligibility, points and Table 8.1 aggregation, with unit tests covering the 4 tutorial point scenarios.
3. Faculty Dashboard with 7 tabs, including the PE subsection for Professional Experience (subject to D-4).
4. Master Dashboard with 3 tabs, plus the Excel export built on the same aggregation.
5. Pilot migration and verification on the four profiles, then reconciliation. STOP.
6. School-wide rollout after approval.

## 12. Acceptance tests (rev. 1 list plus new checks)

- One pilot edit to a canonical IC updates every linked faculty dashboard, the Master Overview, Table 8.1 and the Excel export identically.
- A shared publication counts as 1 school IC. The 4 tutorial scenarios give 1.00/1.00, 0.50/0.50, 0.33/0.50 and 0.25/1.00.
- A PE activity with a linked output: the activity is absent from IC totals, and the output counts once, only if it is eligible.
- Only records that are Verified, with an Include classification and a derived Table 8.1 type, reach Table 8.1. Conditional, Under Review and Excluded records are absent. D-1 and D-2 items never count.
- For each discipline: Basic + Applied + Pedagogy = Total = the sum of the three reporting types. Drill-down 1 and drill-down 2 reconcile to each cell.
- Every legacy row maps to exactly one canonical IC. Evidence, manual edits, CV versions and audit entries match the backup.
- Professional Experience is never counted in PE or Education totals.
- Role checks: faculty see their own dashboard, HoDs see their department, and admins see everything.
