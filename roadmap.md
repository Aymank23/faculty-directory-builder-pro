# Roadmap — AACSB dashboard in-place upgrade

## Phase 0 — Backup
- [ ] Export all tables to /mnt/documents/db-backup-2026-09-05 and verify row counts

## Phase 1 — Shared logic first
- [ ] Central counting/classification/status service (src/lib/icTaxonomy.ts extension)
- [ ] Route Faculty Overview, My Repository, My Analytics, Admin Faculty Profile, Master Dashboard, Export through it
- [ ] Also Department Overview + Department Reports
- [ ] Retire old `status` field from all reads; verification_status authoritative

## Phase 2 — Pilot on four profiles only (then STOP for approval)
- [x] Cleaning pass on existing stored rows (done 2026-09-05)
- [ ] BLOCKED: source-CV reconciliation — the four filled CVs are not stored anywhere
      (cv_uploads keeps only file names; evidence bucket has no .docx). The files in
      user-uploads are blank AACSB templates. Need the four filled DOCX files from the user.
- [ ] Independent DOCX inventory (no production parser) per section, in document order
- [ ] Diff inventory vs production parser output → fix parser defects
- [ ] Diff inventory vs stored DB rows vs dashboard display
- [ ] Apply corrections to the four profiles only; keep Under Review
- [ ] Full-accounting reconciliation report (every source row in exactly one category or Unresolved)


## Phase 3+ (after approval)
- [ ] Remaining faculty backfill (no Discipline inference)
- [ ] Admin verification workflow (reclassify, reopen, evidence)
- [ ] Practitioner/staffing field options + normalisation (Adjunct is a status, not a role)
- [ ] Two-sheet Excel export
- [ ] Faculty-facing reporting type / record class display
