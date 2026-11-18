import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from 'expo-router';

export function checkInDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function useDailyCheckIn(studentId: string | undefined, canPrompt: boolean) {
  const focused = useIsFocused();
  const [prompt, setPrompt] = useState<{ studentId: string; day: Date; initialWellbeing?: number } | null>(null);
  const shown = useRef(new Map<string, string>());
  const currentPrompt = prompt?.studentId === studentId ? prompt : null;
  const day = currentPrompt?.day ?? null;
  const storageKey = `daily-check-in:shown:${studentId}`;

  const open = useCallback((today = new Date(), initialWellbeing?: number) => {
    if (!studentId) return;
    const date = checkInDateKey(today);
    shown.current.set(studentId, date);
    setPrompt({ studentId, day: today, initialWellbeing });
    void AsyncStorage.setItem(storageKey, date).catch(() => {});
  }, [studentId, storageKey]);

  useEffect(() => {
    if (!studentId || !focused || !canPrompt || day) return;
    const owner = studentId;
    let revision = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function check(state: AppStateStatus | null = AppState.currentState) {
      clearTimeout(timer);
      const request = ++revision;
      if (state && state !== 'active') return;

      const now = new Date();
      const date = checkInDateKey(now);
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(() => check(), midnight.getTime() - now.getTime());
      if (shown.current.get(owner) === date) return;

      void AsyncStorage.getItem(storageKey).then(saved => {
        if (revision !== request || shown.current.get(owner) === date || checkInDateKey(new Date()) !== date) return;
        if (saved === date) shown.current.set(owner, date);
        else open(now);
      }).catch(() => {
        // If the previous prompt cannot be read, leave the manual entry available.
      });
    }

    const listener = AppState.addEventListener('change', check);
    check();
    return () => {
      revision++;
      clearTimeout(timer);
      listener.remove();
    };
  }, [studentId, focused, canPrompt, day, storageKey, open]);

  return { day: focused ? day : null, initialWellbeing: focused ? currentPrompt?.initialWellbeing : undefined, open, close: () => setPrompt(null) };
}
