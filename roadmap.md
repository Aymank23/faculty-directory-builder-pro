# Roadmap — AACSB dashboard in-place upgrade

## Phase 0 — Backup
- [x] Export all tables to /mnt/documents/db-backup-2026-09-05 and verify row counts

## Phase 1 — Shared logic first
- [ ] Central counting/classification/status service (src/lib/icTaxonomy.ts extension)
- [ ] Route Faculty Overview, My Repository, My Analytics, Admin Faculty Profile, Master Dashboard, Export through it
- [ ] Also Department Overview + Department Reports
- [ ] Retire old `status` field from all reads; verification_status authoritative

## Phase 2 — Pilot on four profiles only (then STOP for approval)
- [x] Cleaning pass on existing stored rows (done 2026-09-05)
- [x] Four filled CVs received; independent DOCX inventory rebuilt (no production parser)
- [x] Corrections applied to the four profiles only, all Under Review
- [x] Full-accounting reconciliation report v2 in /mnt/documents (5 items flagged for human decision)
- [ ] AWAITING APPROVAL before touching any other faculty

## Phase 2b — Permanent CV archive
- [x] Private `cv-archive` bucket + storage policies (faculty own / HoD department / admin all)
- [x] cv_uploads: storage_path, version, file_size, mime_type, content_hash, archived_at
- [x] Upload flow archives the original document; version history shown on faculty + admin profile

## Phase 3+ (after approval)
- [ ] Remaining faculty backfill (no Discipline inference)
- [ ] Admin verification workflow (reclassify, reopen, evidence)
- [ ] Practitioner/staffing field options + normalisation (Adjunct is a status, not a role)
- [ ] Two-sheet Excel export
- [ ] Faculty-facing reporting type / record class display
