# Architecture rules

- Canonical ICs (`canonical_ics` + `ic_authors`) are the only reporting source; every dashboard, Table 8.1 and export reads them via `src/lib/canonicalData.ts` and `src/lib/table81.ts`. Why: one calculation everywhere.
- Faculty create ICs only through the `submit_canonical_contribution` RPC; direct canonical inserts are admin-only. Why: duplicate checks, Under Review and audit are enforced server-side.
- Legacy `intellectual_contributions` writes sync to canonical via DB triggers (insert creates/links; update applies only safe, unreviewed, single-author changes and turns everything else into change requests). Why: no second source of truth and no silent overwrite of reviewed data.
- AE vs IC routing for CV items lives in `routeIcOrAe` in the parse-cv parser and follows the `classification_policies` crosswalk; ambiguous items go to review. Why: activities must not inflate IC totals.
- Evidence attachment is validated server-side in `attach_canonical_evidence` (path, type, size, existence). Why: client checks alone are bypassable.
