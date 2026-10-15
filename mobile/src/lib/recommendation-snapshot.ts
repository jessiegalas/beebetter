import type { Quest } from '../context/user-data-context';
import { hasFreshPosition, prioritizeQuests, type PriorityContext } from './quest-priority';
import { isFresh } from './recommendation-facts';

/** Sample wall time at the evaluation boundary, including source-driven evaluations
 * between clock ticks. Device timestamps never determine the recommendation clock. */
export function recommendationSnapshot(quests: Quest[], input: PriorityContext,
  errors: { quests?: string; profile?: string; places?: string } = {}, clock = Date.now) {
  const now = clock(), context = { ...input, now };
  const needsPlaces = quests.some(q => q.location_id);
  const contextError = errors.quests ||
    (quests.length > 0 && (!isFresh(input.candidatesUpdatedAt, now) || !isFresh(input.factsUpdatedAt, now))
      ? 'Recommendations need a refresh. Your quests are still available.' : null) ||
    (needsPlaces && (errors.places || (!isFresh(input.placesUpdatedAt, now) ? 'Saved places need a refresh to verify location fit.' : null))) ||
    (quests.length > 0 && input.personalGoal && errors.profile ? errors.profile : null) || null;
  return { now, ranked: prioritizeQuests(quests, context), contextError, locationAvailable: hasFreshPosition(context) };
}
