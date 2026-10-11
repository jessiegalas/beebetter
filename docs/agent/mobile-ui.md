# Mobile presentation system

## System note: provisional features disabled

Wellness, daily check-ins, self-management reflections/history and student OSAS support are not confirmed final features. They are temporarily disabled in the mobile frontend pending a future product decision.

MOBILE_WELLNESS_AND_SUPPORT_ENABLED in mobile/src/constants/features.ts is currently false. It hides Home entries and the wellness sheet, excludes the four screens through nested protected routes (including direct/deep links), and stops wellness recommendation reads/subscriptions. Existing screen implementations, data contracts and historical records are retained for future use. Admin OSAS functionality is unchanged.

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

Keep the existing platform fonts: Avenir Next on iOS, sans-serif on Android, system-ui on web. No font download is required. Use ThemedText (StyleSheet) or ui/Text (NativeWind). The scale in the token source is page 28/34 bold, section 20/28 bold, item 17/24 semibold, body 16/24 regular, label 14/20 semibold and metadata 14/20 regular (size/line height). Respect system text scaling and allow labels to wrap.

Spacing uses a 4-unit rhythm: xs=4, sm=8, md=12, lg=16, gutter=20, xl=24, section=32, page=48; half=2 is for fine alignment. Legacy numeric aliases remain. Use section spacing between task regions and smaller gaps within them. ScreenFrame uses 20-unit phone gutters, 24 on wider screens and a 720-unit maximum width.

Radii are sm=8, md=12 (controls), lg=16 (surfaces), xl=24 (overlays/navigation) and pill=999 (badges). The same rounded-sm/md/lg/xl/pill utilities consume these values. Borders.default=1; Borders.focus=2. Fields reserve their border width so focus does not shift content. Keep ordinary surfaces flat. BeeBetterShadow is the only shared elevation preset, reserved for overlays/navigation; avoid gradients and per-card shadows.

### Components and states

The mobile-ui module provides ScreenFrame, Surface, Button, IconButton, Field, ChoiceChip, Sheet, Disclosure, Badge and StatusMessage. Use one dominant action per task region, 48px touch targets, readable 14px metadata and 16px body copy. Ordinary surfaces have no shadow; reserve elevation for navigation and overlays. Preserve form labels, privacy/consent copy and failure retry paths.

Button intents are primary, secondary, quiet, destructive, accent and accent-quiet. Accent-quiet keeps the background transparent and uses accent-colored text and icons with pressed opacity and a keyboard focus border. Accent pairs accent/accentForeground for restrained golden actions. Primary uses primary/primaryForeground; pressed uses primaryPressed without fading text. Loading blocks submission and shows a spinner with busy semantics. Disabled uses explicit inactive colors. Secondary uses a pale surface; quiet stays transparent until pressed; destructive uses a danger label. Focus uses a contrasting inner border on primary buttons and focus on other controls. ChoiceChip exposes selected state and keyboard focus. Field preserves native input props/callbacks, a visible label, hints and alert text; editable=false uses inactive colors. Bare ui/Input requires the caller to supply a visible label and accessibilityLabel. ui/Button and ui/Text retain Reusables variants and text context.

Surface is an intentional boundary, not a required wrapper for every section; featured=true selects surface. Sheet retains dismissal and reduced-motion behavior, with a theme-aware scrim. Badge accepts accent, neutral, success, warning or danger plus an optional icon. StatusMessage handles loading, empty and error messages and accepts existing retry/action children. Use ScreenFrame, ThemedText and IconButton for page headers; native and web tabs and the root ThemeProvider share the navigation palette. Both platforms use the same three-control bottom bar in normal layout flow above the safe area: Home, Create quest and Quests. Profile and Skill Tree remain registered routes, reached through Home shortcuts and the side panel. Settings opens the dedicated settings/index screen; General opens settings/general with the persisted Dark Mode switch. Both routes remain inside active-student protection. Help & Support remains a muted disabled placeholder. Side-panel Log Out uses red text and icon on a borderless row with the existing confirmation and provider-owned sign-out.

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

To extend: first reuse an existing role/variant. If a new role has a real purpose, define it in both palettes in mobile/src/constants/design-tokens.json; add its NativeWind role mapping and Tailwind color entry if needed. Change spacing/radii/type/elevation there rather than duplicating literal values. Run npm run theme:sync to regenerate global.css (do not edit generated values), then npm run theme:check, npx tsc --noEmit, npm run lint and npm run test:ui. Inspect representative light/dark screens and enlarged text. Platform font families also live in the token source and are exposed through Fonts in theme.ts. Existing screens with custom map/status/splash colors, legacy password/custom form borders with low contrast and hand-tuned dimensions still need incremental migration; do not create new tokens to preserve arbitrary legacy decoration.

Home presents the context-aware recommended quest before existing lifetime progress, balanced streak/completion cards and Profile/Save Places/Skill Tree shortcuts. The header groups an SVG avatar fallback, real account name and current date between the menu and notification controls. The recommended quest uses two columns (content on the left, action on the right), stacking for enlarged text. The oversized existing category SVG sits behind the right side at low opacity (Academics: book, Health: health shield, Social: social network, Habits: infinity). Illustration selection follows the displayed recommended quest, matches trimmed category names without case sensitivity, and falls back to the book for custom/missing categories or no recommendation; the rounded outer Surface clips its overhang and the decorative layer ignores touches. Quest copy and the action sit above the faint illustration without an opaque overlay; the action uses transparent accent-quiet styling. Soft dividers separate recommendation, progress and shortcuts. The level link opens Skill Tree; completed-quest labels omit "all time". Quests retain contextual ranking and event meanings, with quick completion for active unlocked proof-free quests. Proof drafts belong to the quest screen, never a virtualized row. Details retain the questId routing contract.

Synthetic screen verification lives under mobile/scripts/ui-preview and must not connect to Supabase. Native picking, permission dialogs and notification actions require separate device validation. Capture narrow/large/tablet/landscape light and dark states, enlarged text and keyboard clearance before delivery.

Run `npm run test:ui` from mobile for quick completion, duplicate submission, failed completion, detail routing, retained proof drafts, account-scoped lifetimes, filters, disclosures, loading/focus states and navigation destinations. The shared hook harness is also used by account-access tests.

The screenshot adapter runs with `node scripts/ui-preview/server.cjs` from mobile. It renders actual screen components through React Native Web with synthetic providers, without loading Supabase. Query parameters select screen, width, theme, scale, scenario and detail; `baseline=1` reads the committed source using Git. The adapter is static: it verifies layout and rendered semantics, while callback behavior uses the interaction tests. It does not establish live browser hydration, screen-reader behavior, keyboard clearance or native picking/notification integration. Screenshots stay outside the repository.
