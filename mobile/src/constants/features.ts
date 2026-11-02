/**
 * System note: wellness, check-ins, reflections/history and student OSAS support
 * are provisional; their inclusion in the final product is undecided.
 * Temporarily disable their mobile entries, routes and recommendation reads.
 * Retain implementations and existing records for a future product decision.
 * See docs/agent/mobile-ui.md before re-enabling.
 */
export const MOBILE_WELLNESS_AND_SUPPORT_ENABLED: boolean = false;

/** Enable only after database attribution and device visibility release checks pass. */
export const MOBILE_RECOMMENDATION_MEASUREMENT_ENABLED: boolean = false;

/** Build-time switch for push delivery/responses and the notifications screen.
 * Disabled startup still attempts token revocation. Also gates presentation of
 * geofence reminders without disabling geofence detection or event recording. */
export const MOBILE_NOTIFICATIONS_ENABLED: boolean = true;

/** Background geofence registration/detection; foreground GPS remains independent. */
export const MOBILE_GEOFENCING_ENABLED: boolean = true;
