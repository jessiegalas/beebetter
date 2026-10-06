# Mobile guidance

## Identity & Stack

Student app: Expo SDK 57, React Native 0.86, React 19.2, TypeScript 6, Expo Router.
Read [root rules](../AGENTS.md) first. Paths below are relative to `mobile/`.

## Strict Guardrails

- ALWAYS keep session/profile/quest state and admission/logout ownership in `src/context/user-data-context.tsx`; `use-user-data.ts` is a re-export.
- ALWAYS preserve the mounted router, verified active-student admission, request/unmount/account-switch guards, and native/web alternatives.
- NEVER add React Native or environment-dependent imports to `src/lib/student-validation.ts`; admin imports it.
- NEVER award XP/set completion locally; use `complete_quest`, reload server state, and preserve duplicate/proof/failure-cleanup guards.
- NEVER use deprecated `is_nearby` as live proximity; background permission denial must not disable foreground GPS.
- ALWAYS exclude private notes/reflection text from recommendation context.
- ALWAYS preserve fresh ownership/status/proof checks for notification actions and session-safe token cleanup.
- Consult versioned [Expo SDK 57 docs](https://docs.expo.dev/versions/v57.0.0/) before Expo-dependent changes.

## Commands

Run from this directory; select checks for affected behavior:

```powershell
npx tsc --noEmit
npm run lint
npm run test:context
npm run test:workspace
npm run test:students
npm run test:auth
node scripts/test-quest-notifications.cjs
```

## System note: provisional features

Wellness/check-ins, reflections/history and student OSAS support are temporarily disabled in the mobile frontend because their inclusion in the final product is undecided. Keep `MOBILE_WELLNESS_AND_SUPPORT_ENABLED` false during unrelated work; retain implementations and records for possible future use. See [mobile UI system note](../docs/agent/mobile-ui.md#system-note-provisional-features-disabled) for scope and re-enablement requirements.

## Documentation Map

Read only for the task; deeper paths are repository-relative via `../docs/agent/`.

- Routing/providers/session/config → [mobile runtime](../docs/agent/mobile-runtime.md).
- Signup/profile/shared validation → [enrollment](../docs/agent/enrollment.md).
- Quests/proofs/progression → [quest system](../docs/agent/quest-system.md).
- Ranking/filters/events → [recommendations](../docs/agent/recommendations.md).
- GPS/time/reminders/actions → [location and notifications](../docs/agent/location-and-notifications.md).
- Wellness/reflections/support privacy → [privacy and security](../docs/agent/privacy-security.md).
- Device/shared-module checks → [testing](../docs/agent/testing.md); affected discrepancies/data bounds → [known limitations](../docs/agent/known-limitations.md).
