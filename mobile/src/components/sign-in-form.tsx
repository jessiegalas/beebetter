import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import * as React from 'react';
import { type TextInput, View } from 'react-native';

type SignInFormProps = {
  email: string;
  password: string;
  busy: boolean;
  emailError?: string;
  passwordError?: string;
  emailMaxLength: number;
  messages?: React.ReactNode;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onEmailBlur: () => void;
  onPasswordBlur: () => void;
  onSubmit: () => void;
};

export function SignInForm({
  email,
  password,
  busy,
  emailError,
  passwordError,
  emailMaxLength,
  messages,
  onEmailChange,
  onPasswordChange,
  onEmailBlur,
  onPasswordBlur,
  onSubmit,
}: SignInFormProps) {
  const passwordInputRef = React.useRef<TextInput>(null);
  const [showPassword, setShowPassword] = React.useState(false);
  const [emailFocused, setEmailFocused] = React.useState(false);
  const [passwordFocused, setPasswordFocused] = React.useState(false);

  return (
    <View className="gap-4">
      <View className="gap-2">
        <Label nativeID="student-email-label" htmlFor="student-email">Email address *</Label>
        <Input
          id="student-email"
          accessibilityLabel="Email address, required"
          aria-invalid={!!emailError}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          className={`h-[50px] rounded-md bg-card px-3 text-base ${emailError ? 'border-destructive' : emailFocused ? 'border-ring' : ''}`}
          editable={!busy}
          keyboardType="email-address"
          maxLength={emailMaxLength}
          onBlur={() => { setEmailFocused(false); onEmailBlur(); }}
          onChangeText={onEmailChange}
          onFocus={() => setEmailFocused(true)}
          onSubmitEditing={() => passwordInputRef.current?.focus()}
          placeholder="you@example.com"
          returnKeyType="next"
          submitBehavior="submit"
          value={email}
        />
        {emailError ? <Text accessibilityRole="alert" className="text-destructive text-sm">{emailError}</Text> : null}
      </View>
      <View className="gap-2">
        <Label nativeID="student-password-label" htmlFor="student-password">Password *</Label>
        <View className={`flex-row items-center rounded-md border bg-card ${passwordError ? 'border-destructive' : passwordFocused ? 'border-ring' : 'border-input'}`}>
          <Input
            ref={passwordInputRef}
            id="student-password"
            accessibilityLabel="Password, required"
            aria-invalid={!!passwordError}
            autoCapitalize="none"
            autoComplete="current-password"
            autoCorrect={false}
            className="h-[50px] flex-1 border-0 bg-transparent px-3 text-base"
            editable={!busy}
            onBlur={() => { setPasswordFocused(false); onPasswordBlur(); }}
            onChangeText={onPasswordChange}
            onFocus={() => setPasswordFocused(true)}
            onSubmitEditing={onSubmit}
            placeholder="Your password"
            returnKeyType="send"
            secureTextEntry={!showPassword}
            submitBehavior="submit"
            textContentType="password"
            value={password}
          />
          <Button
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            className="mr-1 h-10 px-3"
            disabled={busy}
            onPress={() => setShowPassword(value => !value)}
            variant="ghost">
            <Text>{showPassword ? 'Hide' : 'Show'}</Text>
          </Button>
        </View>
        {passwordError ? <Text accessibilityRole="alert" className="text-destructive text-sm">{passwordError}</Text> : null}
      </View>
      {messages}
      <Button
        accessibilityState={{ busy, disabled: busy }}
        className="h-12 w-full rounded-md"
        disabled={busy}
        onPress={onSubmit}>
        <Text>{busy ? 'Signing in...' : 'Sign in'}</Text>
      </Button>
    </View>
  );
}
