# Roadmap — AACSB dashboard in-place upgrade

## Phase 0 — Backup
- [ ] Export all tables to /mnt/documents/db-backup-2026-09-05 and verify row counts

## Phase 1 — Shared logic first
- [ ] Central counting/classification/status service (src/lib/icTaxonomy.ts extension)
- [ ] Route Faculty Overview, My Repository, My Analytics, Admin Faculty Profile, Master Dashboard, Export through it
- [ ] Also Department Overview + Department Reports
- [ ] Retire old `status` field from all reads; verification_status authoritative

## Phase 2 — Pilot on four profiles only (then STOP for approval)
- [ ] Baalbaki, Boustani, Farah, Aad — correct Title/Authors/Year/Outlet/DOI/Quartile where blank or wrong
- [ ] IC Reporting Type via agreed mapping; ambiguous stay Needs Review
- [ ] Academic Engagement separation
- [ ] Practitioner Professional Experience populated
- [ ] Basic/Applied/Pedagogical only where supported
- [ ] Shared-publication keys
- [ ] Keep Under Review unless already verified
- [ ] Per-faculty reconciliation report

## Phase 3+ (after approval)
- [ ] Remaining faculty backfill (no Discipline inference)
- [ ] Admin verification workflow (reclassify, reopen, evidence)
- [ ] Practitioner/staffing field options + normalisation (Adjunct is a status, not a role)
- [ ] Two-sheet Excel export
- [ ] Faculty-facing reporting type / record class display
