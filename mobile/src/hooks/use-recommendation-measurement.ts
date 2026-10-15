import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform, type View, useWindowDimensions } from 'react-native';
import { useIsFocused } from 'expo-router';
import { useQuestPriority } from '@/context/quest-priority-context';
import { useUserData } from '@/context/user-data-context';
import { createImpressionTracker, recommendationId } from '@/lib/recommendation-measurement';
import { MOBILE_RECOMMENDATION_MEASUREMENT_ENABLED } from '@/constants/features';
import type { RankedQuest } from '@/lib/quest-priority';

export function useRecommendationMeasurement(surface: 'home' | 'quest_board', items: RankedQuest[], enabled = true) {
  const { user } = useUserData(), { recordEvent } = useQuestPriority();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [windowFocused, setWindowFocused] = useState(() => Platform.OS !== 'web' || typeof document === 'undefined' || document.hasFocus());
  const [visible, setVisibleState] = useState<Set<string>>(new Set());
  const setVisible = useCallback((ids: Set<string>) => setVisibleState(previous => previous.size === ids.size && [...ids].every(id => previous.has(id)) ? previous : ids), []);
  const owner = user?.id;
  const tracker = useMemo(() => MOBILE_RECOMMENDATION_MEASUREMENT_ENABLED ? createImpressionTracker(surface, recommendationId(), event => { if (owner) recordEvent(event); }) : null, [surface, owner, recordEvent]);
  const active = MOBILE_RECOMMENDATION_MEASUREMENT_ENABLED && focused && foreground && windowFocused && enabled && !!user;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    const blur = () => setWindowFocused(false), focus = () => setWindowFocused(true);
    const androidBlur = Platform.OS === 'android' ? AppState.addEventListener('blur', blur) : null;
    const androidFocus = Platform.OS === 'android' ? AppState.addEventListener('focus', focus) : null;
    if (Platform.OS === 'web' && typeof window !== 'undefined') { window.addEventListener('blur', blur); window.addEventListener('focus', focus); }
    return () => { subscription.remove(); androidBlur?.remove(); androidFocus?.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') { window.removeEventListener('blur', blur); window.removeEventListener('focus', focus); }
    };
  }, []);
  useEffect(() => { tracker?.update(items, visible, active); }, [tracker, items, visible, active]);
  useEffect(() => () => tracker?.dispose(), [tracker]);
  const action = useCallback((item: RankedQuest, rank: number, type: 'selection' | 'snooze') => {
    if (MOBILE_RECOMMENDATION_MEASUREMENT_ENABLED && enabled && owner) tracker?.action(item, rank, type);
  }, [tracker, enabled, owner]);
  return { active, setVisible, action };
}
export function useHomeRecommendationVisibility(ref: React.RefObject<View | null>, viewportRef: React.RefObject<View | null>, id: string | undefined, active: boolean, setVisible: (ids: Set<string>) => void) {
  const { width, height } = useWindowDimensions();
  useEffect(() => {
    if (!active || !id) { setVisible(new Set()); return; }
    let alive = true;
    const measure = () => viewportRef.current?.measureInWindow((vx, vy, vw, vh) => {
      if (!alive) return;
      ref.current?.measureInWindow((x, y, w, h) => {
        if (!alive) return;
        const overlapW = Math.max(0, Math.min(x + w, vx + vw, width) - Math.max(x, vx, 0));
        const overlapH = Math.max(0, Math.min(y + h, vy + vh, height) - Math.max(y, vy, 0));
        setVisible(w * h > 0 && overlapW * overlapH / (w * h) >= .5 ? new Set([id]) : new Set());
      });
    });
    measure(); const timer = setInterval(measure, 100);
    return () => { alive = false; clearInterval(timer); };
  }, [ref, viewportRef, id, active, width, height, setVisible]);
}
