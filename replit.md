# ChipForge

An AI-powered EDA (electronic design automation) assistant, built as a native mobile app: describe a digital chip in plain language, get an AI-generated block-diagram architecture, edit it visually, generate HDL (Verilog-style), run structural validation, and save numbered version snapshots — all under strict per-owner private access.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/chipforge run dev` — run the Expo mobile app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run typecheck:libs` — build/refresh shared `lib/*` packages (run this if `@workspace/db` or other lib exports look "missing" in a downstream package's typecheck)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec after editing `lib/api-spec/openapi.yaml`
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Mobile: Expo Router (React Native), Clerk (`@clerk/expo`) for auth, `react-native-svg` for wiring diagrams
- API: Express 5, Clerk (`@clerk/express`) for auth middleware
- DB: PostgreSQL + Drizzle ORM
- AI: Replit AI Integrations OpenAI proxy (`gpt-5.4`, non-streaming JSON mode)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec) → `@workspace/api-client-react` React Query hooks

## Where things live

- API contract: `lib/api-spec/openapi.yaml` (source of truth — edit here, then run codegen)
- DB schema: `lib/db/src/schema/chipProjects.ts`, `chipProjectVersions.ts`, `chipChatMessages.ts`
- Backend chip-design logic (AI calls, safety filter, structural validation): `artifacts/api-server/src/lib/design.ts`
- Encryption helpers: `artifacts/api-server/src/lib/crypto.ts`
- Project/version/chat data access + response shaping: `artifacts/api-server/src/lib/projectStore.ts`
- API routes: `artifacts/api-server/src/routes/projects.ts`
- Mobile screens: `artifacts/chipforge/app/(auth)/*` (sign-in/up), `artifacts/chipforge/app/(app)/*` (project list + workspace)
- Mobile diagram editor: `artifacts/chipforge/components/DesignCanvasView.tsx`
- Mobile brand tokens: `artifacts/chipforge/constants/colors.ts`

## Architecture decisions

- **Working design vs. version snapshots**: each project has one mutable `currentDesign` plus explicit, immutable, numbered version snapshots created only when the user taps "Save version". Restoring a version copies it back into the mutable working copy (not a checkout/branch model).
- **Encryption at rest**: the whole design blob (components, connections, HDL, netlist) is AES-256-GCM encrypted per project row and per version snapshot, with the key derived via SHA-256 of `SESSION_SECRET` (no separate encryption secret).
- **Validation split**: structural checks (unconnected pins, bit-width mismatches, missing clock/reset, naming conflicts) are deterministic/rule-based in `design.ts`; the AI only adds supplementary free-text suggestions on top — it does not decide pass/fail.
- **Safety filter**: a conservative LLM classification call runs before every AI chat turn; on block it returns the exact string `"I can't assist with that type of design."` and stores both chat messages with `blocked: true` without touching the design.
- **Ownership**: Clerk `userId` stored directly as `ownerId` on `chipProjects` — no local `users` table. Non-owners get exactly `"You do not have permission to access this project."` (403).

## Product

- Sign up / sign in with email+password or Google (Clerk).
- Create chip projects; describe the desired chip to an AI chat assistant that drafts/updates the block-diagram architecture.
- Visual pan/zoom block-diagram editor: drag components, edit type/label/bit-width, add/delete blocks; connections render as wires.
- Run structural validation (rule-based) plus AI suggestions.
- Generate Verilog-style HDL + netlist from the current design.
- Save numbered version snapshots and restore any prior version.
- AI refuses prohibited design categories (weapons, surveillance/jamming, malware, etc.) with a fixed refusal message.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After editing `lib/db/src/schema/*` or other `lib/*` packages, run `pnpm run typecheck:libs` (root `tsc --build`) before typechecking a consumer package — esbuild dev builds don't typecheck, and stale project-reference builds surface as false "missing export" errors.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `clerk-auth` skill for the canonical Clerk wiring pattern (do not improvise around it)
- See the `expo` skill for mobile UI conventions
