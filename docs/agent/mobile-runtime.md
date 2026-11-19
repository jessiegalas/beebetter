# Mobile runtime

Read for routing, account/session lifecycle, provider state, or native configuration. Paths here are relative to `mobile/`.

## Ownership

- `package.json` uses `expo-router/entry`. `src/app/_layout.tsx` nests UserData, Location, and QuestPriority providers around a persistently mounted router stack.
- `Stack.Protected` admits verified active students. The UserData provider owns admission, invalidation, and logout; database active-account checks remain authoritative.
- `src/context/user-data-context.tsx` owns session/profile/quest state, student sign-in/sign-up/confirmation resend/recovery/onboarding/sign-out, active-student admission, mutations, proofs, notification responses, and refreshes. `src/lib/student-workspace.ts` owns workspace reads, profile fallback mapping, candidate pagination, scoped errors, cancellation and per-slice coalescing; it returns updates for provider-owned state after admission. `retryWorkspace(slice)` revalidates admission before retrying a slice; ordinary `refresh()` retains the full-read behavior. Auth screens call its operations and render their explicit outcomes; they do not coordinate Supabase Auth separately. `src/hooks/use-user-data.ts` is a compatibility re-export, not another state implementation.
- `src/app/(tabs)/_layout.tsx` delegates through native/web wrappers to `src/components/app-navigation.tsx`. Expo Router retains Home (`index`), Quests, Skill Tree and Profile. The visible shared bottom bar contains Home, Create quest (the existing add-quest stack route) and Quests; Profile and Skill Tree are reached through Home shortcuts and the menu.
- Other stack routes: auth, notifications, add-quest, manage-locations, wellness-check-in, self-management-reflection, wellness-history, support-requests.
- `src/supabase.ts` owns the client, AsyncStorage session persistence, and web-rendering guards. Preserve account-switch, request-generation, and unmount guards.

## Configuration and conventions

Use existing `@/` aliases, `src/constants/theme.ts`, and common components. Preserve `.web.tsx` alternatives, including date/time controls. Before Expo-dependent work, consult the repository's versioned [Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/).

`app.config.js` extends `app.json` with Android Maps configuration and, in the current working tree, Firebase configuration for push. `eas.json` owns build profiles. Android Maps requires `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` and native configuration. Never log environment values; public values are bundled into clients.

## Android USB development-client troubleshooting

When a physical Android device shows an Expo development-client connection error, distinguish a missing/unreachable Metro server from an app crash before changing native code:

1. From the repository root, run `adb devices -l` and confirm the phone is listed as `device`. Record its model and Android version with `adb shell getprop ro.product.model` and `adb shell getprop ro.build.version.release` only when device compatibility is in question.
2. Confirm whether the installed app is a development client or a standalone build. A development client needs a running Metro server; a standalone build should load its embedded JavaScript bundle without Metro.
3. Read the error shown on the phone and relevant Android/React Native error log lines. If it names a host and port, check that Metro is listening and that the device can reach that address. For USB, check `adb reverse --list`; do not assume a remembered LAN address is still reachable.
4. For this project's USB workflow, run `npm run start:usb` from `mobile/`. The script establishes `adb reverse` for port 8081, starts Expo bound to localhost, and opens the connected Android device. Keep this process running while using the development client.
5. Confirm Expo reports `Android Bundled` and the phone leaves the development-client error screen. Check the resumed activity and filtered crash logs if it still fails; only investigate app/native code when there is evidence of a separate runtime or build error.

Do not treat starting Metro as a fix for a standalone/release build. Build/install the appropriate standalone profile when the app must run without a development server. Keep logs narrow and never copy environment values, tokens, or student data into notes or reports.

An Expo config warning is separate from Metro reachability. During the Infinix USB check, Expo warned that `android.googleServicesFile` resolved to `../google-services.json`, while the local file was in `mobile/google-services.json`. The app still bundled and opened; investigate/fix that path separately for Firebase/build behavior rather than attributing the Metro connection failure to it. EAS Android builds also require the configured `GOOGLE_SERVICES_JSON` file.

User data and location refresh on a 60-second active cadence and on resume; ranking refreshes every 30 seconds while active and on resume. Background geofence events do not run a continuous ranking service. See [location and notifications](location-and-notifications.md) before changing refresh or notification behavior.

See [testing](testing.md) for mocked Auth coverage and physical-device acceptance; [known limitations](known-limitations.md) for data bounds and historical documentation caveats.

Auth operations preserve error codes and return `session_created` separately from active student admission. Pending recovery is persisted outside the workspace; incomplete confirmed registrations return to onboarding. Native token refresh follows AppState, overlapping reads coalesce, and workspace slice errors retain verified admission. See [authentication rollout](../../supabase/STUDENT_AUTH_ROLLOUT.md) for PKCE/implicit links, redirects and release gates.
