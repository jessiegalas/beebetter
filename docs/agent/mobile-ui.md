# Mobile presentation system

## System note: provisional features disabled

Wellness, daily check-ins, self-management reflections/history and student OSAS support are not confirmed final features. They are temporarily disabled in the mobile frontend pending a future product decision.

MOBILE_WELLNESS_AND_SUPPORT_ENABLED in mobile/src/constants/features.ts is currently false. It hides Home entries and the wellness sheet, excludes the four screens through nested protected routes (including direct/deep links), and stops wellness recommendation reads/subscriptions. Existing screen implementations, data contracts and historical records are retained for future use. Admin OSAS functionality is unchanged.

Do not re-enable these features as part of unrelated UI work. Re-enabling requires an explicit product decision and verification of navigation, admission, privacy/consent and recommendation behavior. The synthetic preview adapter can render retained screens independently; it does not make them available in the application.

## Visual system

Use the semantic palettes, Typography, Spacing and Radii in mobile/src/constants/theme.ts. Light mode uses neutral surfaces with honey accents; dark mode follows the device setting. Application state and authorization remain in the existing providers/database.

The mobile-ui module provides ScreenFrame, Surface, Button, IconButton, Field, ChoiceChip, Sheet and Disclosure. Use one dominant action per task region, 48px touch targets, readable 14px metadata and 16px body copy. Ordinary surfaces have no shadow; reserve elevation for navigation and overlays. Preserve form labels, privacy/consent copy and failure retry paths.

Home summarizes existing lifetime progress and one quest. Quests retain contextual ranking and event meanings, with quick completion for active unlocked proof-free quests. Proof drafts belong to the quest screen, never a virtualized row. Details retain the questId routing contract.

Synthetic screen verification lives under mobile/scripts/ui-preview and must not connect to Supabase. Native picking, permission dialogs and notification actions require separate device validation. Capture narrow/large/tablet/landscape light and dark states, enlarged text and keyboard clearance before delivery.

Run `npm run test:ui` from mobile for quick completion, duplicate submission, failed completion, detail routing, retained proof drafts, account-scoped lifetimes, filters, disclosures, loading/focus states and navigation destinations. The shared hook harness is also used by account-access tests.

The screenshot adapter runs with `node scripts/ui-preview/server.cjs` from mobile. It renders actual screen components through React Native Web with synthetic providers, without loading Supabase. Query parameters select screen, width, theme, scale, scenario and detail; `baseline=1` reads the committed source using Git. The adapter is static: it verifies layout and rendered semantics, while callback behavior uses the interaction tests. It does not establish live browser hydration, screen-reader behavior, keyboard clearance or native picking/notification integration. Screenshots stay outside the repository.
