# Mobile runtime

Read for routing, account/session lifecycle, provider state, or native configuration. Paths here are relative to `mobile/`.

## Ownership

- `package.json` uses `expo-router/entry`. `src/app/_layout.tsx` nests UserData, Location, and QuestPriority providers around a persistently mounted router stack.
- `Stack.Protected` admits verified active students. The UserData provider owns admission, invalidation, and logout; database active-account checks remain authoritative.
- `src/context/user-data-context.tsx` owns session/profile/quest state, student sign-in/sign-up/confirmation resend/sign-out, active-student admission, RPC reads, mutations, proofs, notification responses, and refreshes. Auth screens call its operations and render their explicit outcomes; they do not coordinate Supabase Auth separately. `src/hooks/use-user-data.ts` is a compatibility re-export, not another state implementation.
- `src/app/(tabs)/_layout.tsx` delegates to `src/components/app-tabs.tsx` (native) or `src/components/app-tabs.web.tsx` (Expo Router UI). Tabs: Home (`index`), Quests, Skill Tree, Profile.
- Other stack routes: auth, notifications, add-quest, manage-locations, wellness-check-in, self-management-reflection, wellness-history, support-requests.
- `src/supabase.ts` owns the client, AsyncStorage session persistence, and web-rendering guards. Preserve account-switch, request-generation, and unmount guards.

## Configuration and conventions

Use existing `@/` aliases, `src/constants/theme.ts`, and common components. Preserve `.web.tsx` alternatives, including date/time controls. Before Expo-dependent work, consult the repository's versioned [Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/).

`app.config.js` extends `app.json` with Android Maps configuration and, in the current working tree, Firebase configuration for push. `eas.json` owns build profiles. Android Maps requires `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` and native configuration. Never log environment values; public values are bundled into clients.

User data and location refresh on a 60-second active cadence and on resume; ranking refreshes every 30 seconds while active and on resume. Background geofence events do not run a continuous ranking service. See [location and notifications](location-and-notifications.md) before changing refresh or notification behavior.

See [testing](testing.md) for mocked Auth coverage and physical-device acceptance; [known limitations](known-limitations.md) for data bounds and historical documentation caveats.
