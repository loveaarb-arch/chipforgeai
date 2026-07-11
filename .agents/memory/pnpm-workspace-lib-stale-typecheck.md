---
name: pnpm workspace lib packages need tsc --build before consumer typecheck
description: Why a workspace app's typecheck reports "missing exports" from a shared lib right after editing that lib's schema/source files.
---

In a pnpm-workspace monorepo where shared packages under `lib/*` are wired in
via TypeScript project references (not published/rebuilt on every save),
editing a lib's source (e.g. adding a new Drizzle table export in
`lib/db/src/schema/`) does not automatically get picked up by a consumer
package's `tsc -p tsconfig.json --noEmit`. The consumer's typecheck reports
misleading errors like "module has no exported member X" or TS6305 ("referenced
project not built") even though the new export clearly exists in source.

**Why:** these lib packages typically have no per-package `build` script;
they're compiled incrementally via the root `tsc --build` (commonly exposed
as a `typecheck:libs` script), and consumers resolve their `.d.ts` from the
lib's last build output, not its live source.

**How to apply:** whenever you edit a file under a workspace `lib/*` package
in a project that uses this pattern, run the root build/typecheck-libs script
(e.g. `pnpm run typecheck:libs`, a `tsc --build`) before typechecking any
package that depends on it. If a consumer typecheck shows a "missing export"
for something you just added, always rebuild the libs first before assuming
the code itself is wrong.
