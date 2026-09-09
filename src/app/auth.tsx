import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { BeeBetterColors as COLORS, BeeBetterShadow } from '@/constants/theme';
import { supabase } from '@/supabase';

export default function AuthScreen() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setFeedback('Please enter both email and password to continue.');
      return;
    }

    if (password.length < 6) {
      setFeedback('Your password must have at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      if (mode === 'sign-up') {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              display_name: name.trim() || undefined,
            },
          },
        });
        if (error) throw error;

        if (data.session) {
          router.replace('/(tabs)');
          return;
        }

        setFeedback('Account registered! If confirmation is required, please check your email, then sign in.');
        setMode('sign-in');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (error) throw error;
        if (data.session) {
          router.replace('/(tabs)');
        }
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to sign in. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Logo Mark */}
          <View style={styles.mark}>
            <Ionicons name="sparkles" size={28} color={COLORS.ink} />
          </View>

          <ThemedText style={styles.title}>
            {mode === 'sign-in' ? 'Welcome to BeeBetter' : 'Start your journey'}
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            {mode === 'sign-in'
              ? 'Sign in to access your quests, streak, and skill tree.'
              : 'Create an account to level up your habits and daily goals.'}
          </ThemedText>

          {/* Mode Switcher */}
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'sign-in' && styles.modeButtonActive]}
              onPress={() => {
                setMode('sign-in');
                setFeedback(null);
              }}>
              <ThemedText style={[styles.modeText, mode === 'sign-in' && styles.modeTextActive]}>
                Sign in
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'sign-up' && styles.modeButtonActive]}
              onPress={() => {
                setMode('sign-up');
                setFeedback(null);
              }}>
              <ThemedText style={[styles.modeText, mode === 'sign-up' && styles.modeTextActive]}>
                Create account
              </ThemedText>
            </TouchableOpacity>
          </View>

          {/* Sign-up Name Field */}
          {mode === 'sign-up' && (
            <>
              <ThemedText style={styles.label}>Full Name</ThemedText>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Jessie Galas"
                placeholderTextColor={COLORS.muted}
                autoCapitalize="words"
              />
            </>
          )}

          {/* Email Field */}
          <ThemedText style={styles.label}>Email address</ThemedText>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={COLORS.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Password Field */}
          <ThemedText style={styles.label}>Password</ThemedText>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor={COLORS.muted}
            secureTextEntry
            autoCapitalize="none"
          />

          {feedback && <ThemedText style={styles.feedback}>{feedback}</ThemedText>}

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={submit}
            disabled={isSubmitting}
            activeOpacity={0.8}>
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <ThemedText style={styles.submitText}>
                {mode === 'sign-in' ? 'Sign in' : 'Create account'}
              </ThemedText>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 40 },
  mark: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.honey,
    marginBottom: 24,
    ...BeeBetterShadow,
  },
  title: { color: COLORS.ink, fontSize: 26, fontWeight: '800' },
  subtitle: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 24 },
  modeRow: { flexDirection: 'row', backgroundColor: COLORS.surfaceMuted, borderRadius: 13, padding: 4, marginBottom: 20 },
  modeButton: { flex: 1, alignItems: 'center', borderRadius: 10, paddingVertical: 10 },
  modeButtonActive: { backgroundColor: COLORS.card, ...BeeBetterShadow },
  modeText: { color: COLORS.muted, fontSize: 12, fontWeight: '800' },
  modeTextActive: { color: COLORS.ink },
  label: { color: COLORS.ink, fontSize: 12, fontWeight: '800', marginBottom: 7 },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    color: COLORS.ink,
    marginBottom: 16,
    ...BeeBetterShadow,
  },
  feedback: { color: COLORS.danger, fontSize: 12, lineHeight: 17, marginBottom: 14 },
  submitButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    backgroundColor: COLORS.ink,
    borderRadius: 13,
    marginTop: 8,
    ...BeeBetterShadow,
  },
  submitButtonDisabled: { opacity: 0.65 },
  submitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
