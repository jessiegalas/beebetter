# Admin guidance

## Identity & Stack

Browser management/OSAS app: React 19.2, Vite 8, TypeScript 6, Supabase.
Read [root rules](../AGENTS.md) first. Navigation uses local section state; paths below are relative to `admin/`.

## Strict Guardrails

- ALWAYS require an active role from `admin_get_my_role`; session presence is insufficient.
- Keep privileged management in guarded RPCs; super-admin grants target existing Auth users.
- ALWAYS preserve server pagination/search/filtering and stale-request guards; assignment search is separate from the displayed page.
- ALWAYS keep `AdminModals.tsx` compatible with shared mobile student validation and unchanged legacy enrollment values.
- NEVER reassign quest owners or turn admin quest editing into proof review/completion awards.
- ALWAYS preserve explicit sections at semester activation; do not copy sections/move students automatically or rename used sections.
- NEVER edit withdrawn support cases or erase retained assignment/notes; use authorized staff choices and case RPCs.
- NEVER rebuild OSAS aggregates from raw records or fall back to legacy summary RPCs.
- ALWAYS log exports successfully before CSV download; retain suppression refusal, formula escaping, and null/withheld semantics.
- ALWAYS preserve permission denial/loading/error states and request/export filter consistency.

## Commands

Run from this directory; select checks for affected behavior:

```powershell
npm run build
npm run lint
npm run test:report
```

## Documentation Map

Read only for the task; paths are relative to this directory.

- Management/roles/RPC mapping/reporting/CSV/support → [admin and OSAS](../docs/agent/admin-osas.md).
- Student edits/semesters/sections/history → [enrollment](../docs/agent/enrollment.md).
- Assignment/editing contracts → [quest system](../docs/agent/quest-system.md).
- Disclosure/permission boundaries → [privacy and security](../docs/agent/privacy-security.md).
- Client/shared-validation/role checks → [testing](../docs/agent/testing.md).
- Subgroup privacy/timezone/old docs → [known limitations](../docs/agent/known-limitations.md).
