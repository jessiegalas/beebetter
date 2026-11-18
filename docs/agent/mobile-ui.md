# Mobile presentation system

## Daily check-in and provisional wellness features

Daily check-in opens in a Home bottom sheet the first time an admitted student reaches Home each local calendar day. The last prompted date is stored on the device per account. Opening it manually also counts as that day's prompt. Students can skip it or reopen it from Home. Optional details and private check-in history are available in the sheet. The form uses the existing student-owned check-in contract. OSAS reporting uses aggregate ratings.

`MOBILE_WELLNESS_AND_SUPPORT_ENABLED` remains false for the broader wellness sheet, self-management reflection and student support routes, reflection history, and wellness recommendation reads/subscriptions. Check-in history and the legacy check-in link use the active-student guard independently of this flag. The legacy link opens the Home sheet.

Do not re-enable these features as part of unrelated UI work. Re-enabling requires an explicit product decision and verification of navigation, admission, privacy/consent and recommendation behavior. The synthetic preview adapter can render retained screens independently; it does not make them available in the application.

## Design instructions and UI foundations

Read [shared frontend design instructions](frontend-design.md) before presentation changes. NativeWind v4, Tailwind CSS v3 and React Native Reusables are configured for incremental adoption. New registry controls live in mobile/src/components/ui; existing mobile-ui controls remain until intentionally migrated. Favor open layouts, whitespace and typography; use surfaces only when content needs a distinct boundary. Match supplied reference proportions and hierarchy.

## Styling guide

### Tokens and color roles

Use the semantic palettes, Typography, Spacing and Radii in mobile/src/constants/theme.ts. Light mode uses cream backgrounds, selective pale-yellow surfaces, ochre actions and brown text; dark mode follows the device setting. The canonical token source is [design-tokens.json](../../mobile/src/constants/design-tokens.json). Run npm run theme:sync after editing it; generated global.css, Tailwind and StyleSheet consumers share those values. Application state and authorization remain in the existing providers/database.

| Light token | Value | Use |
| --- | --- | --- |
| background | #f8f7de | Dominant screen background |
| surface | #f7ea87 | Featured sections and selected chips; use selectively |
| primary | #854d0d | Prominent actions and selected navigation |
| accent | #d29d30 | XP progress and restrained brand accents |
| foreground | #3a200c | Text and meaningful icons on light surfaces |

Use card for ordinary surfaces, muted for secondary text, border for decorative dividers and input for visible control boundaries. primaryForeground and accentForeground are paired text colors; never guess an on-color. focus provides keyboard focus feedback. disabled/disabledForeground retain readable inactive controls. success, warning and danger have paired status surfaces; labels/icons must communicate the status as well as color. In NativeWind the status utilities are bg-success/text-success-foreground, bg-warning/text-warning-foreground and bg-destructive/text-destructive-foreground (destructive is the solid danger action); use Badge for a soft danger status.

The app defaults to light appearance through APP_COLOR_SCHEME in mobile/src/constants/theme.ts. Settings > General > Dark Mode selects light or dark through the existing NativeWind appearance state; use-app-appearance.ts restores and persists that choice in AsyncStorage. A late startup read cannot overwrite a user toggle, and writes are serialized. ThemedText, ThemedView, useBeePalette, NativeWind, NAV_THEME and the status bar share the selected appearance. The retained dark palette uses warm dark backgrounds, pale-yellow primary actions and cream text. Use the current palette hook rather than importing BeeBetterColors directly into a screen. Existing ink/honey/honeyDark/honeyDeep/honeySoft/surfaceWarm and decorative aliases remain for gradual migration; add no new uses. They point into the same palette, never separate color definitions.

### Typography, spacing and geometry

Use bundled VT323 for screen titles, labels, reading, and text entry. Use `ScreenHeader`, `ThemedText` with `type="title"`, or `ui/Text` with `variant="h1"` for screen titles. The [mobile UI specification](../ui-spec.md#typography) lists the shared type roles. Respect system text scaling and allow labels to wrap.

Spacing uses a 4-unit rhythm: xs=4, sm=8, md=12, lg=16, gutter=20, xl=24, section=32, page=48; half=2 is for fine alignment. Legacy numeric aliases remain. Use section spacing between task regions and smaller gaps within them. ScreenFrame uses 20-unit phone gutters, 24 on wider screens and a 720-unit maximum width.

Radii are sm=8, md=12 (controls), lg=16 (surfaces), xl=24 (overlays/navigation) and pill=999 (badges). The same rounded-sm/md/lg/xl/pill utilities consume these values. Borders.default=1; Borders.focus=2. Fields reserve their border width so focus does not shift content. Keep ordinary surfaces flat. BeeBetterShadow is the only shared elevation preset, reserved for overlays/navigation; avoid gradients and per-card shadows.

### Components and states

The mobile-ui module provides `ScreenFrame`, `ScreenHeader`, `Surface`, `Button`, `IconButton`, `Field`, `ChoiceChip`, `Sheet`, `Disclosure`, `Badge`, and `StatusMessage`. Use one dominant action per task region, 48dp interactive targets, 18dp metadata, and 20dp body copy. Ordinary surfaces are flat. Preserve form labels, privacy and consent copy, and failure retry paths.

Button intents are primary, secondary, quiet, destructive, accent and accent-quiet. Accent-quiet keeps the background transparent and uses accent-colored text and icons with pressed opacity and a keyboard focus border. Accent pairs accent/accentForeground for restrained golden actions. Primary uses primary/primaryForeground; pressed uses primaryPressed without fading text. Loading blocks submission and shows a spinner with busy semantics. Disabled uses explicit inactive colors. Secondary uses a pale surface; quiet stays transparent until pressed; destructive uses a danger label. Focus uses a contrasting inner border on primary buttons and focus on other controls. ChoiceChip exposes selected state and keyboard focus. Field preserves native input props/callbacks, a visible label, hints and alert text; editable=false uses inactive colors. Bare ui/Input requires the caller to supply a visible label and accessibilityLabel. ui/Button and ui/Text retain Reusables variants and text context.

Surface is an intentional boundary, not a required wrapper for every section; featured=true selects surface. Sheet retains dismissal and reduced-motion behavior, with a theme-aware scrim. Badge accepts accent, neutral, success, warning or danger plus an optional icon. StatusMessage handles loading, empty and error messages and accepts existing retry/action children. Use ScreenFrame, ThemedText and IconButton for page headers; native and web tabs and the root ThemeProvider share the navigation palette. Both platforms use the same three-control bottom bar in normal layout flow above the safe area: Home, Create quest and Quests. Profile is available from the side panel. Skill Tree is available from its Home card and the side panel. Settings opens the dedicated settings/index screen; General opens settings/general with the persisted Dark Mode switch. Both routes remain inside active-student protection. Help & Support remains a muted disabled placeholder. Side-panel Log Out uses red text and icon on a borderless row with the existing confirmation and provider-owned sign-out.

### Consumption examples

StyleSheet/shared controls (inside an existing screen):

```tsx
import { View } from 'react-native';
import { Button, Field, Surface } from '@/components/mobile-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing, useBeePalette } from '@/constants/theme';

function GoalForm({ onSave }: { onSave: () => void }) {
  const c = useBeePalette();
  return <View style={{ gap: Spacing.lg }}>
    <ThemedText type="title">Your next step</ThemedText>
    <ThemedText style={{ color: c.muted }}>Choose a manageable goal.</ThemedText>
    <Surface><Field label="Goal" placeholder="Read one chapter" /></Surface>
    <Button label="Save goal" onPress={onSave} />
  </View>;
}
```

NativeWind/Reusables (inside an existing screen):

```tsx
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

function GoalControls({ onSave }: { onSave: () => void }) {
  return <View className="gap-lg bg-background">
    <Text variant="h2">Your next step</Text>
    <Text variant="small">Goal</Text>
    <Input accessibilityLabel="Goal" placeholder="Read one chapter" />
    <Button onPress={onSave}><Text>Save goal</Text></Button>
  </View>;
}
```

### Accessibility and extension

Normal text needs 4.5:1; large text and meaningful control boundaries/icons need 3:1. The token check verifies primary/secondary text, both themes, primary pressed/disabled states, status text and input/focus boundaries. Cream on light ochre measures 6.31:1 and brown on amber 6.18:1. White on amber fails normal-text contrast; use accentForeground. Color alone never identifies success/failure/selection. Keep 48-unit touch targets, explicit labels, focus feedback, reduced motion and safe-area clearance. Token contrast checks do not establish whole-screen accessibility or native screen-reader behavior.

To extend: first reuse an existing role/variant. If a new role has a real purpose, define it in both palettes in mobile/src/constants/design-tokens.json; add its NativeWind role mapping and Tailwind color entry if needed. Change spacing/radii/type/elevation there rather than duplicating literal values. Run npm run theme:sync to regenerate global.css (do not edit generated values), then npm run theme:check, npx tsc --noEmit, npm run lint and npm run test:ui. Inspect representative light/dark screens and enlarged text. The token source also owns the VT323 family, exposed as `AppFont` in `theme.ts`. Existing screens with custom map/status/splash colors, legacy password/custom form borders with low contrast and hand-tuned dimensions still need incremental migration; do not create new tokens to preserve arbitrary legacy decoration.

Home follows the [Home pattern in the UI spec](../ui-spec.md#home). Profile and Save Places are in the side menu. Quests retain contextual ranking and event meanings, with quick completion for active unlocked proof-free quests. Proof drafts belong to the quest screen. The picker and completion coordinator check allowed file types and the 10 MiB limit before upload. Create/Edit and Saved Places use shared labeled fields. Quest filters and category selection use the shared sheet and choices. Completed history supports saved category labels and cursor paging. Completion feedback uses the server-confirmed XP receipt across Quests and notification entry points. Details retain the questId routing contract.

Synthetic screen verification lives under mobile/scripts/ui-preview and must not connect to Supabase. Native picking, permission dialogs and notification actions require separate device validation. Capture narrow/large/tablet/landscape light and dark states, enlarged text and keyboard clearance before delivery.

Run `npm run test:ui` from mobile for quick completion, duplicate submission, failed completion, detail routing, retained proof drafts, account-scoped lifetimes, filters, disclosures, loading/focus states and navigation destinations. The shared hook harness is also used by account-access tests.

The screenshot adapter runs with `node scripts/ui-preview/server.cjs` from mobile. It renders actual screen components through React Native Web with synthetic providers, without loading Supabase. Query parameters select screen, width, theme, scale, scenario and detail; `baseline=1` reads the committed source using Git. The adapter is static: it verifies layout and rendered semantics, while callback behavior uses the interaction tests. It does not establish live browser hydration, screen-reader behavior, keyboard clearance or native picking/notification integration. Screenshots stay outside the repository.
