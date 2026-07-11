import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { useSignIn } from '@clerk/expo';
import { useColors } from '@/hooks/useColors';
import { AuthTextField } from '@/components/AuthTextField';
import { PrimaryButton } from '@/components/PrimaryButton';

export default function SignInScreen() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const colors = useColors();

  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const handleSubmit = async () => {
    const { error } = await signIn.password({ emailAddress, password });
    if (error) return;

    if (signIn.status === 'complete') {
      await signIn.finalize({});
    } else if (signIn.status === 'needs_client_trust') {
      // New/untrusted device or browser context — Clerk requires a one-time
      // email code before it will trust this client. `supportedSecondFactors`
      // is only populated for real MFA enrollment, not client-trust checks,
      // so gating on it meant sendEmailCode() never actually ran. Send
      // unconditionally instead.
      const { error: sendError } = await signIn.mfa.sendEmailCode();
      if (sendError) {
        console.error('Failed to send client-trust code:', JSON.stringify(sendError));
      }
    } else {
      // Surfaces cases like MFA or unsupported second factors instead of
      // silently doing nothing when status never reaches 'complete'.
      console.error('Sign-in attempt not complete:', signIn.status);
    }
  };

  const handleVerifyClientTrust = async () => {
    await signIn.mfa.verifyEmailCode({ code });
    if (signIn.status === 'complete') {
      await signIn.finalize({});
    }
  };

  // Errors not tied to a specific field (rate limiting, session conflicts,
  // etc.) live in `errors.global` and were previously swallowed entirely,
  // making failed sign-ins look like the button did nothing.
  const globalError = errors.global?.[0]?.message;

  if (signIn.status === 'needs_client_trust') {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.title, { color: colors.foreground }]}>
            Verify this device
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            We sent a verification code to {emailAddress}. Enter it below to
            finish signing in.
          </Text>

          <AuthTextField
            label="Verification code"
            value={code}
            onChangeText={setCode}
            keyboardType="numeric"
            placeholder="123456"
            errorMessage={errors.fields.code?.message}
          />

          {globalError ? (
            <Text style={[styles.globalError, { color: colors.destructive }]}>
              {globalError}
            </Text>
          ) : null}

          <PrimaryButton
            title="Verify"
            onPress={handleVerifyClientTrust}
            loading={fetchStatus === 'fetching'}
            disabled={!code}
          />

          <View style={styles.footerRow}>
            <Text
              style={{ color: colors.primary, fontWeight: '600' }}
              onPress={() => signIn.mfa.sendEmailCode()}
            >
              Resend code
            </Text>
            <Text style={{ color: colors.mutedForeground }}>{'   '}</Text>
            <Text
              style={{ color: colors.primary, fontWeight: '600' }}
              onPress={() => signIn.reset()}
            >
              Start over
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <View style={[styles.logoMark, { borderColor: colors.primary }]}>
            <View style={[styles.logoDot, { backgroundColor: colors.primary }]} />
          </View>
          <Text style={[styles.appName, { color: colors.foreground }]}>
            ChipForge
          </Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            Describe a chip. Watch it take shape.
          </Text>
        </View>

        <Text style={[styles.title, { color: colors.foreground }]}>
          Welcome back
        </Text>

        <AuthTextField
          label="Email address"
          autoCapitalize="none"
          keyboardType="email-address"
          value={emailAddress}
          onChangeText={setEmailAddress}
          placeholder="you@example.com"
          errorMessage={errors.fields.identifier?.message}
        />
        <AuthTextField
          label="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          errorMessage={errors.fields.password?.message}
        />

        {globalError ? (
          <Text style={[styles.globalError, { color: colors.destructive }]}>
            {globalError}
          </Text>
        ) : null}

        <PrimaryButton
          title="Sign in"
          onPress={handleSubmit}
          loading={fetchStatus === 'fetching'}
          disabled={!emailAddress || !password}
        />

        <View style={styles.footerRow}>
          <Text style={{ color: colors.mutedForeground }}>
            Don&apos;t have an account?{' '}
          </Text>
          <Link href="/(auth)/sign-up">
            <Text style={{ color: colors.primary, fontWeight: '600' }}>
              Sign up
            </Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  brand: { alignItems: 'center', marginBottom: 40 },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  logoDot: { width: 14, height: 14, borderRadius: 4 },
  appName: { fontSize: 24, fontWeight: '700', fontFamily: 'Inter_700Bold' },
  tagline: { fontSize: 14, marginTop: 4, fontFamily: 'Inter_400Regular' },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 24,
    fontFamily: 'Inter_700Bold',
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 20,
    marginTop: -12,
    fontFamily: 'Inter_400Regular',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  globalError: {
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
  },
});
