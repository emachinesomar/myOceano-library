# Skill Registry — myOceano-library

Generated: 2026-05-11
Source: `~/.config/opencode/skills/`

## User Skills (from ~/.config/opencode/skills/)

### ai-sdk-5
- **Trigger**: Building AI chat features — breaking changes from v4.
- **Path**: `~/.config/opencode/skills/ai-sdk-5/SKILL.md`
- **Rules**:
  - `useChat` imported from `@ai-sdk/react` (not `ai`)
  - Use `DefaultChatTransport({ api: "/api/chat" })` — not old inline api param
  - `sendMessage({ text: input })` replaces `handleSubmit` + `handleInputChange`
  - `message.parts` array replaces `message.content` string — must filter `.type === "text"`
  - Server: `streamText` from `ai`, returns `result.toDataStreamResponse()`
  - `useCompletion` from `@ai-sdk/react` with `DefaultCompletionTransport`

### angular-architecture
- **Trigger**: Structuring Angular projects or deciding where to place components.
- **Path**: `~/.config/opencode/skills/angular/architecture/SKILL.md`
- **Rules**:
  - Scope Rule: 1 feature → `features/[name]/components/`, 2+ features → `features/shared/components/`
  - No `.component`, `.service`, `.model` suffixes — folder tells context (`user-profile.ts` not `user-profile.component.ts`)
  - `inject()` over constructor injection
  - `protected` for template-only members, `readonly` for inputs/outputs/queries
  - Name handlers for action (`saveUser`) not event (`handleClick`)

### angular-core
- **Trigger**: Creating Angular components, using signals, or setting up zoneless.
- **Path**: `~/.config/opencode/skills/angular/core/SKILL.md`
- **Rules**:
  - Standalone by default — do NOT set `standalone: true`
  - Function-based inputs/outputs (`input.required()`, `output()`, `model()`) — NEVER decorators
  - Signals for state: `signal()`, `computed()`, `effect()`
  - NO lifecycle hooks (`ngOnInit`, `ngOnChanges`, `ngOnDestroy`) — use `effect()` + `DestroyRef`
  - `inject()` over constructor injection
  - Native control flow: `@if`, `@for`, `@switch` — NOT `*ngIf`, `*ngFor`
  - Zoneless: `provideZonelessChangeDetection()`, uninstall `zone.js`, use `OnPush`

### angular-forms
- **Trigger**: Working with forms, validation, or form state in Angular.
- **Path**: `~/.config/opencode/skills/angular/forms/SKILL.md`
- **Rules**:
  - New apps with signals → Signal Forms (experimental, `@angular/forms/signals`)
  - Production apps → Reactive Forms with `fb.nonNullable.group()` for type safety
  - Use `getRawValue()` for typed values from Reactive Forms
  - Reactive Forms are synchronous — easier to test

### angular-performance
- **Trigger**: Optimizing Angular app performance, images, or lazy loading.
- **Path**: `~/.config/opencode/skills/angular/performance/SKILL.md`
- **Rules**:
  - Images: ALWAYS `ngSrc` (not `src`), set `width`+`height` (or `fill`), `priority` for LCP
  - `@defer` triggers: `on viewport`, `on interaction`, `on idle`, `on timer(500ms)`, `when condition`
  - Lazy routes via `loadComponent` or `loadChildren`
  - SSR via `provideClientHydration()`
  - NEVER trigger reflows/repaints in lifecycle hooks

### branch-pr
- **Trigger**: Creating, opening, or preparing PRs for review.
- **Path**: `~/.config/opencode/skills/branch-pr/SKILL.md`
- **Rules**:
  - Every PR MUST link an approved issue (`status:approved` label)
  - Every PR MUST have exactly one `type:*` label
  - Branch naming: `^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)\/[a-z0-9._-]+$`
  - Conventional commits: `type(scope): description`, no `Co-Authored-By` trailers
  - PR body: Closes #N, PR type checkbox, summary bullets, changes table, test plan
  - Run `shellcheck` on modified scripts before push

### chained-pr
- **Trigger**: PRs over 400 lines, stacked PRs, review slices.
- **Path**: `~/.config/opencode/skills/chained-pr/SKILL.md`
- **Rules**:
  - Split PRs over 400 changed lines unless maintainer accepts `size:exception`
  - Each PR reviewable in ≤60 minutes
  - One deliverable work unit per PR; keep tests/docs with the unit
  - Every child PR must include dependency diagram marking current PR with `📍`
  - Stacked PRs: each slice lands independently to main
  - Feature Branch Chain: tracker PR (draft), child PRs target parent branch

### cognitive-doc-design
- **Trigger**: Writing guides, READMEs, RFCs, onboarding, architecture, or review-facing docs.
- **Path**: `~/.config/opencode/skills/cognitive-doc-design/SKILL.md`
- **Rules**:
  - Lead with the answer — decision/action/outcome first, context after
  - Progressive disclosure: happy path first, then details/edge cases
  - Chunking: group related info, keep flat lists short
  - Signposting: headings, labels, callouts, summaries
  - Recognition over recall: tables, checklists, examples, templates
  - Review empathy: design so reviewers verify intent without reconstructing story

### comment-writer
- **Trigger**: PR feedback, issue replies, reviews, Slack messages, or GitHub comments.
- **Path**: `~/.config/opencode/skills/comment-writer/SKILL.md`
- **Rules**:
  - Be useful fast: start with actionable point, don't recap PR before feedback
  - Warm and direct: thoughtful teammate, not corporate bot
  - Keep it short: 1-3 paragraphs or tight bullet list
  - Explain WHY when asking for change (technical reason)
  - Avoid pile-ons: comment on highest-value issue only
  - Match thread language; no em dashes

### django-drf
- **Trigger**: Building REST APIs with Django — ViewSets, Serializers, Filters.
- **Path**: `~/.config/opencode/skills/django-drf/SKILL.md`
- **Rules**:
  - `ModelViewSet` with `get_serializer_class()` for read/create/update serializers
  - Separate Read, Create, Update serializers — use `write_only=True` for passwords
  - Filters via `django_filters` with `FilterSet` and `lookup_expr`
  - Custom permissions extending `BasePermission`: `has_object_permission` / `has_permission`
  - `PageNumberPagination` with `page_size_query_param`
  - `DefaultRouter` for URL routing

### github-pr
- **Trigger**: Creating PRs, writing PR descriptions, or using gh CLI for pull requests.
- **Path**: `~/.config/opencode/skills/github-pr/SKILL.md`
- **Rules**:
  - PR title = conventional commit: `type(scope): short description`
  - PR body: Summary (WHAT and WHY), Changes list, Testing checklist, `Closes #N`
  - Atomic commits: one thing per commit, don't mix concerns
  - `gh pr create --title "type(scope): desc" --body "..."` for creation
  - Use HEREDOC for complex descriptions; `--draft` for WIP

### go-testing
- **Trigger**: Go tests, go test coverage, Bubbletea teatest, golden files.
- **Path**: `~/.config/opencode/skills/go-testing/SKILL.md`
- **Rules**:
  - Table-driven tests with `t.Run(tt.name, ...)`
  - `t.TempDir()` for filesystem tests — never real home directory
  - Integration tests skippable with `testing.Short()`
  - Bubbletea: test `Model.Update()` directly; use `teatest` only for interactive flows
  - Golden files: deterministic, update via `-update`, rerun without `-update`
  - Small mocks/interfaces around system boundaries

### issue-creation
- **Trigger**: Creating GitHub issues, bug reports, or feature requests.
- **Path**: `~/.config/opencode/skills/issue-creation/SKILL.md`
- **Rules**:
  - Blank issues disabled — MUST use template (bug_report.yml or feature_request.yml)
  - Every issue gets `status:needs-review` automatically on creation
  - Maintainer MUST add `status:approved` before any PR can be opened
  - Questions go to Discussions, not issues
  - Pre-flight: search duplicates, check approval workflow understanding

### jira-epic
- **Trigger**: User asks to create an epic, large feature, or multi-task initiative.
- **Path**: `~/.config/opencode/skills/jira-epic/SKILL.md`
- **Rules**:
  - Title format: `[EPIC] Feature Name`
  - Sections: Feature Overview (what/who/why), Requirements by area, Technical Considerations (performance/data/UI), Implementation Checklist
  - Mermaid diagrams for architecture, data flow, state, ER
  - Jira Wiki markup via MCP (`customfield_10363`), NOT Markdown
  - `customfield_10359` (Team) required: UI, API, or SDK
  - Output Markdown ready to paste, then convert to Wiki markup for Jira API

### jira-task
- **Trigger**: User asks to create a Jira task, ticket, or issue.
- **Path**: `~/.config/opencode/skills/jira-task/SKILL.md`
- **Rules**:
  - Multi-component work → split into separate tasks per component
  - Title format: `[TYPE] description (component)` — BUG, FEATURE, ENHANCEMENT, REFACTOR, DOCS, CHORE
  - Bugs → sibling tasks; Features → parent (user-facing) + child tasks (technical)
  - Affected Files section with full paths
  - Jira Wiki markup via MCP (`customfield_10363`), NOT Markdown
  - Parent task for features has no technical details (for PM/stakeholders)

### judgment-day
- **Trigger**: Judgment day, dual review, adversarial review, juzgar.
- **Path**: `~/.config/opencode/skills/judgment-day/SKILL.md`
- **Rules**:
  - Launch two blind judges in parallel with identical target and criteria
  - Wait for both before synthesis; never accept partial verdict
  - Classify warnings: `WARNING (real)` if normal use triggers it, else `INFO`
  - Ask before fixing Round 1 confirmed issues
  - Re-judge after fixes before commit/push/done
  - Terminal states: `JUDGMENT: APPROVED` or `JUDGMENT: ESCALATED`

### nextjs-15
- **Trigger**: Working with Next.js — routing, Server Actions, data fetching.
- **Path**: `~/.config/opencode/skills/nextjs-15/SKILL.md`
- **Rules**:
  - App Router file conventions: `layout.tsx`, `page.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`
  - Server Components are default (async component, no directive)
  - Server Actions: `"use server"`, `revalidatePath()`, `redirect()`
  - Parallel data fetching: `Promise.all([...])`, streaming with `<Suspense>`
  - Route Handlers: `NextRequest`/`NextResponse` for API routes
  - Middleware at root level with `matcher` config

### playwright
- **Trigger**: Writing E2E tests — Page Objects, selectors, MCP workflow.
- **Path**: `~/.config/opencode/skills/playwright/SKILL.md`
- **Rules**:
  - MCP workflow first: navigate → snapshot → interact → screenshot → verify flow → document selectors
  - File structure: `base-page.ts`, `helpers.ts`, `{page-name}/{page-name}-page.ts`, `{page-name}.spec.ts`
  - One `.spec.ts` per feature (NO separate files for critical path vs validation)
  - Selector priority: `getByRole` > `getByLabel` > `getByText` > `getByTestId` (last resort)
  - Reuse existing page objects; hoist duplicated methods to `BasePage` or `helpers.ts`
  - Tags: `@critical`, `@high`, `@medium`, `@low` + `@e2e` + feature tag + test ID

### pytest
- **Trigger**: Writing Python tests — fixtures, mocking, markers.
- **Path**: `~/.config/opencode/skills/pytest/SKILL.md`
- **Rules**:
  - Fixtures with teardown: `yield` pattern for cleanup
  - `conftest.py` for shared fixtures across test files
  - Mocking with `unittest.mock.patch` and `MagicMock`
  - `@pytest.mark.parametrize` for multiple input/expected cases
  - Custom markers in `pyproject.toml`; `@pytest.mark.asyncio` for async tests
  - `pytest -v -x -k "filter" -m "marker" --cov=src --tb=short`

### react-19
- **Trigger**: Writing React components — no useMemo/useCallback needed.
- **Path**: `~/.config/opencode/skills/react-19/SKILL.md`
- **Rules**:
  - NO manual memoization — React Compiler handles optimization automatically
  - Named imports only (`import { useState } from "react"`), NEVER `import React`
  - Server Components first (default, no directive); `"use client"` only when needed
  - `use()` hook for promises (suspends) and conditional context
  - `useActionState` for form pending state
  - `ref` is just a prop — no `forwardRef` needed

### tailwind-4
- **Trigger**: Styling with Tailwind — cn(), theme variables, no var() in className.
- **Path**: `~/.config/opencode/skills/tailwind-4/SKILL.md`
- **Rules**:
  - NEVER `var()` in className — use Tailwind semantic classes
  - NEVER hex colors in className — use Tailwind color scale
  - `cn()` for conditional classes and merging — NOT for static classes
  - `style` prop for truly dynamic values (width, opacity)
  - Arbitrary values (`w-[327px]`) OK for one-offs, NOT for colors
  - `var()` constants only for libraries that don't accept `className` (Recharts, etc.)

### typescript
- **Trigger**: Writing TypeScript code — types, interfaces, generics.
- **Path**: `~/.config/opencode/skills/typescript/SKILL.md`
- **Rules**:
  - Const types: create `as const` object first, extract type via `(typeof X)[keyof typeof X]`
  - Flat interfaces: nested objects get dedicated interfaces (reference, not inline)
  - NEVER use `any` — use `unknown` + type guards, or generics
  - `import type` for type-only imports
  - Type guard functions: `value is Type` return type annotation

### work-unit-commits
- **Trigger**: Implementation, commit splitting, chained PRs, or keeping tests and docs with code.
- **Path**: `~/.config/opencode/skills/work-unit-commits/SKILL.md`
- **Rules**:
  - Commit by work unit (deliverable behavior/fix), not by file type
  - Keep tests with the code they verify, docs with the feature they explain
  - Tell a story: reviewer should understand why each commit exists from diff + message
  - Each commit should be candidate for chained PR
  - Before commit: one clear purpose, repo works after only this commit, rollback reasonable
  - SDD workload guard: if tasks forecast >400 lines, group into chained PRs before implementation

### zod-4
- **Trigger**: Using Zod for validation — breaking changes from v3.
- **Path**: `~/.config/opencode/skills/zod-4/SKILL.md`
- **Rules**:
  - Breaking: `z.email()` not `z.string().email()`, `z.uuid()`, `z.url()` — top-level validators
  - Breaking: `error` param replaces `message` param and `required_error`
  - Breaking: `z.string().min(1)` replaces `z.string().nonempty()`
  - `safeParse(data)` returns `{ success, data/error }`, use `.error.issues` for errors
  - `z.discriminatedUnion("status", [...])` for tagged unions (more efficient)
  - `z.coerce.number()` / `z.coerce.date()` for type coercion

### zustand-5
- **Trigger**: Managing React state with Zustand.
- **Path**: `~/.config/opencode/skills/zustand-5/SKILL.md`
- **Rules**:
  - `create` from `zustand` with typed interface
  - Selectors for re-render control: `useStore(s => s.field)` — use `useShallow` for multiple fields
  - `persist` middleware for localStorage; `immer` middleware for mutable updates
  - Slices pattern for splitting large stores into composable modules
  - `getState()` / `subscribe()` for accessing store outside React components
  - `devtools` middleware with store name for Redux DevTools

## Project Convention Files

None detected — project is empty, no AGENTS.md or convention files exist.

## Notes

- No project-level skills detected (project is empty).
- All 25 non-SDD skills scanned from `~/.config/opencode/skills/`.
- SDD skills (`sdd-*`), `_shared`, and `skill-registry` excluded per scan rules.
