import 'react-native-url-polyfill/auto';

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment variables. Check .env.local.');
}

const isServer = Platform.OS === 'web' && typeof window === 'undefined';

// Storage failures must reach Auth callers; silently swallowing removal errors
// can make a failed logout look successful while credentials remain persisted.
const safeStorage = {
  getItem: async (key: string): Promise<string | null> => isServer ? null : AsyncStorage.getItem(key),
  setItem: async (key: string, value: string): Promise<void> => {
    if (!isServer) await AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (!isServer) await AsyncStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: safeStorage,
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    detectSessionInUrl: false,
  },
});