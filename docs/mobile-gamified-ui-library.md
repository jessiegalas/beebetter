# BeeBetter gamified UI library

Use [Login](../mobile/src/app/auth.tsx) for the shape and hierarchy of pixel controls, and [Skill Tree](../mobile/src/app/(tabs)/skill-tree.tsx) for buds, leaves, and growth. The [mobile UI specification](ui-spec.md) owns design rules. The [pixel asset guide](pixel-assets.md) covers creating and exporting artwork.

## Components

| Component | Status | Reuse and variants |
| --- | --- | --- |
| `PixelButton` | Exists | Home, Quest Details, and Create/Edit Quest use `layout="wrap"` for their main quest actions. Login uses the fixed PNG variant. Use existing intents and preserve focus, disabled, and busy states. Check long labels such as “Submit proof and complete” at large text sizes. [Button](../mobile/src/components/pixel/pixel-button.tsx) |
| `PixelFrame` | Exists | Use for the featured quest on Home and reward panels. Keep dense lists lightweight. [Frame](../mobile/src/components/pixel/pixel-frame.tsx) |
| `XpBadge`, `XpProgress`, `RewardPanel`, `GrowthLeaf` | Exist | Use compact XP for previews and earned XP for confirmed rewards. Share the meter across Home, Profile, completion, and Skill Tree, with clear account and branch labels. Use the leaf for completed growth. [XP and rewards](../mobile/src/components/xp-visuals.tsx) |
| `CategoryBadge` | Implemented | Pair a shared category glyph with the actual category name. Use compact sizing in rows and a larger presentation on the featured quest. Give custom and legacy category names a common fallback glyph. |
| `QuestStatus` | Implemented | Pair the established visual states with live text. Cover available, proof required, locked, pending review, needs revision, and completed where the surface exposes those states. Compose with existing controls so quick completion retains its checked, busy, and accessible states. |
| `ChoiceChip` pixel variant | Implemented | Use `appearance="pixel"` for filters and wizard selections. Distinguish selected, focused, pressed, and disabled states. Apply the same visual cues to the quest tab selector while retaining tab semantics. [ChoiceChip](../mobile/src/components/mobile-ui.tsx) · [Quest tabs](../mobile/src/components/quest-list.tsx) |
| `AchievementEmblem` | Implemented | Render the existing achievement IDs in earned and locked treatments, beside the existing title and status. Reuse individual motifs for matching progress summaries where they convey the same meaning. |

## Artwork inventory

| Asset family | First reusable set | Consumers |
| --- | --- | --- |
| Growth | Reuse the existing leaf and Skill Tree's bud treatment. Share their geometry where it can retain the current graph and reward sizing. | Skill Tree, completion, and completed quest history. [Tree artwork](../mobile/src/prototypes/skill-tree/generated-tree-svg.tsx) · [Reward artwork](../mobile/src/components/xp-visuals.tsx) |
| Categories | Book, repeat, people, and heart glyphs for Academics, Habits, Social, and Health. A generic quest glyph covers custom and legacy labels. | Featured quest, quest lists and details, Create/Edit category picker, Completed history, and Skill Tree list mode. [Shared glyph source](../mobile/src/components/pixel/pixel-glyph.tsx) |
| Quest states | Share the bud and leaf for available and completed where there is space for a distinct glyph. Add lock and proof glyphs, and reuse labels for pending review and needs revision. | Quest board, Details, and in-app Notifications. The quick-complete checkbox keeps a visible check when checked. [Quest row states](../mobile/src/components/quest-list.tsx#L103) |
| Achievements | Five emblems for First Flight, Busy Worker, Hive Rising, On A Roll, and Master Pollinator. Start with a shared grid and earned/locked treatments. | Profile achievements. The streak motif can also support the same streak count on Home. [Achievement definitions](../mobile/src/lib/progression.ts#L114) |
| Companion | One BeeBetter companion with adventure and resting poses on a 24 × 24 source grid. | Create/Edit Quest, with reuse in a quest empty state if the illustration supports the message. [Companion sources](../mobile/assets/pixel/companion/source.json) |

Use the spec's 3dp grid and semantic palettes for UI glyphs. Use transparent PNG exports for fixed illustrations and grid-aligned vector artwork for theme-aware glyphs. Keep titles, status, and XP as live text. Include light, dark, and enlarged-text samples when reviewing a component change.

## Screen replacements

| Screen | Replace or extend |
| --- | --- |
| Home | Give the recommendation one stepped frame, a shared category glyph, and a pixel “View quest” action. Reuse the existing XP elements and align the streak and completion symbols with Profile. [Home](../mobile/src/app/(tabs)/index.tsx#L65) |
| Quests, Details, and Completed | Use `CategoryBadge` in rows and Details, and `QuestStatus` where state needs explanation. Use the pixel selector treatment for tabs and filters, and `PixelButton` for “Complete quest.” Completed gets a small leaf beside read-only history. [Board and Details](../mobile/src/app/(tabs)/quests.tsx) · [Completed history](../mobile/src/components/completed-quests.tsx) |
| Create/Edit Quest | Replace the gray companion placeholders with the two poses. Reuse `CategoryBadge`, the pixel choice treatment, and `PixelButton` for Continue and Save. Retain the step indicators, shared fields, and validation. [Quest wizard](../mobile/src/components/quest-wizard.tsx) |
| Profile | Replace the generic Ionicons achievement glyphs with `AchievementEmblem`. Reuse the streak and completion symbols from Home and the category badge or leaf in history where useful. [Profile achievements](../mobile/src/app/(tabs)/profile.tsx#L141) |
| Skill Tree | Keep the existing scene as the growth reference. Use the category glyphs in list mode and the shared leaf treatment in recent completions. [Tree and list modes](../mobile/src/app/(tabs)/skill-tree.tsx#L181) |
| In-app Notifications | Replace inline XP text with the compact badge. Use a small leaf and earned XP for confirmed quick completion, and a neutral message for repeat attempts. Share quest status iconography. [Notifications](../mobile/src/app/notifications.tsx#L78) |
| Login, navigation, Settings, and Saved Places | Build around Login's existing pixel CTA and the shared bottom bar's honeycomb Create action. Keep routine navigation, fields, and settings controls clear. [Login](../mobile/src/app/auth.tsx#L126) · [Bottom bar](../mobile/src/components/app-bottom-bar.tsx) · [Saved Places](../mobile/src/app/manage-locations.tsx) |

## Review and asset maintenance

- From the mobile directory, run `node scripts/ui-preview/server.cjs` and open `/?screen=library&width=320&theme=dark&scale=1.5` on the server's local port. The catalog includes both companion poses, all quest statuses, achievement states, and a long button label in idle and busy states.
- Regenerate companion exports with `node scripts/build-quest-companion.cjs`. Pass `--check` to verify the density files against the editable grid.
- Review the live Home → Quest Details → confirmed reward → Skill Tree flow on a native build. Use that pass to verify touch targets, focus, reduced motion, and density rendering.
