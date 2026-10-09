# BeeBetter frontend design instructions

Read this guide before designing or changing either frontend. User references and explicit preferences take precedence over library defaults.

## Direction

BeeBetter should feel clean, minimal and fluid. Avoid stiff compositions that divide every piece of content into an identical rounded card. Group related content through whitespace, alignment and typography. Use a distinct surface only when it communicates a real boundary or interaction.

- Study supplied references for proportions, spacing, density, typography, navigation and visual hierarchy, not just colors. Preserve their defining characteristics when adapting them to BeeBetter content.
- Keep one clear primary action per task region. Reduce redundant labels, badges and decorative icons.
- Use restrained honey accents with neutral surfaces. Avoid decorative gradients, repeated shadows, oversized rounding and excessive bordered panels unless the reference specifically calls for them.
- Reusable code components do not require visibly boxed screen sections. Compose screens around the content and user task.
- Use a consistent type scale and spacing system. Keep layouts responsive, text scalable, controls labeled, focus visible and touch targets at least 48px on mobile. Respect reduced motion and system appearance.

## Tools and ownership

- Admin: React/Vite with Tailwind CSS v4 and shadcn/ui. Components live in `admin/src/components/ui`; merge classes with `admin/src/lib/utils.ts`. Use the `@/` source alias. Add individual components from the admin directory with `npx shadcn@latest add <component>`.
- Mobile: Expo/React Native with NativeWind v4 and Tailwind CSS v3, plus React Native Reusables. Components live in `mobile/src/components/ui`; merge classes with `mobile/src/lib/utils.ts`. Add individual components from the mobile directory with `npx @react-native-reusables/cli@latest add <component> --styling-library nativewind`.
- Each app owns its dependencies and lockfile. Do not share web DOM components with native screens or copy the admin Tailwind v4 configuration into mobile.
- Customize the copied component source to match references. Do not install entire template dashboards or all registry components by default.
- Existing screens retain their presentation until deliberately redesigned. Extend or migrate existing mobile-ui controls incrementally rather than creating competing button/form systems.
- Keep mobile semantic CSS tokens in `mobile/src/global.css` aligned with `mobile/src/constants/theme.ts`. Follow the device color scheme. Keep admin component tokens in `admin/src/index.css` aligned with its application theme.
- Admin omits Tailwind Preflight and places existing App.css rules in the legacy cascade layer below utilities. Component tokens use the --ui- prefix to avoid collisions with legacy palette variables; adapt raw var(--token) references in newly generated components to var(--ui-token). Review theme selectors when adopting new components; avoid accidental restyling of existing controls.

## Working from references

1. Identify the reference's defining layout and hierarchy; describe how those map to the actual screen content.
2. Build one representative screen before propagating a new direction across the application.
3. Render it and compare against the reference at matching viewport sizes. Correct spacing, proportions, density and hierarchy before polishing details.
4. Verify light/dark states, loading/empty/error states, focus, enlarged text and narrow layouts. State clearly when native/device or visual verification was unavailable.

Preserve authentication, authorization, quest progression, consent, reporting suppression and audit behavior during presentation changes. See [mobile presentation](mobile-ui.md) for mobile-specific behavior and verification.
