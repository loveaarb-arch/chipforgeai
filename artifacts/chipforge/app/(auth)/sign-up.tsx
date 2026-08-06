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
import { useAuth, useSignUp } from '@clerk/expo';
import { useColors } from '@/hooks/useColors';
import { AuthTextField } from '@/components/AuthTextField';
import { PrimaryButton } from '@/components/PrimaryButton';

export default function SignUpScreen() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const { isSignedIn } = useAuth();
  const colors = useColors();

  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const handleSubmit = async () => {
    const { error } = await signUp.password({ emailAddress, password });
    if (error) return;
    await signUp.verifications.sendEmailCode();
  };

  const handleVerify = async () => {
    await signUp.verifications.verifyEmailCode({ code });
    if (signUp.status === 'complete') {
      await signUp.finalize({});
    }
  };

  if (signUp.status === 'complete' || isSignedIn) return null;

  const globalError = errors.global?.[0]?.message;

  const needsVerification =
    signUp.status === 'missing_requirements' &&
    signUp.unverifiedFields.includes('email_address') &&
    signUp.missingFields.length === 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Brand — only shown on main sign-up form */}
        {!needsVerification && (
          <View style={styles.brand}>
            <View style={[styles.logoWrap, { borderColor: colors.border }]}>
              <View style={[styles.logoGrid, { borderColor: colors.primary + '40' }]}>
                <View style={[styles.logoDot, { backgroundColor: colors.primary }]} />
                <View style={[styles.logoDot, { backgroundColor: colors.primary + '50' }]} />
                <View style={[styles.logoDot, { backgroundColor: colors.primary + '50' }]} />
                <View style={[styles.logoDot, { backgroundColor: colors.primary }]} />
              </View>
            </View>
            <Text style={[styles.appName, { color: colors.foreground }]}>ChipForge</Text>
            <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
              AI-powered chip design
            </Text>
          </View>
        )}

        {needsVerification ? (
          <View style={[styles.formCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.formTitle, { color: colors.foreground }]}>Verify your email</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Enter the code we sent to {emailAddress}
            </Text>
            <AuthTextField
              label="Verification code"
              value={code}
              onChangeText={setCode}
              keyboardType="numeric"
              placeholder=""
              errorMessage={errors.fields.code?.message}
            />
            <PrimaryButton
              title="Verify"
              onPress={handleVerify}
              loading={fetchStatus === 'fetching'}
              disabled={!code}
            />
          </View>
        ) : (
          <View style={[styles.formCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.formTitle, { color: colors.foreground }]}>Create account</Text>

            <AuthTextField
              label="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={emailAddress}
              onChangeText={setEmailAddress}
              placeholder=""
              errorMessage={errors.fields.emailAddress?.message}
            />
            <AuthTextField
              label="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder=""
              errorMessage={errors.fields.password?.message}
            />

            {globalError ? (
              <Text style={[styles.globalError, { color: colors.destructive }]}>
                {globalError}
              </Text>
            ) : null}

            <PrimaryButton
              title="Sign up"
              onPress={handleSubmit}
              loading={fetchStatus === 'fetching'}
              disabled={!emailAddress || !password}
            />

            <View nativeID="clerk-captcha" />
          </View>
        )}

        {!needsVerification && (
          <View style={styles.footerRow}>
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
              Already have an account?{' '}
            </Text>
            <Link href="/(auth)/sign-in">
              <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>
                Sign in
              </Text>
            </Link>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 20 },

  brand: { alignItems: 'center', gap: 8, marginBottom: 4 },
  logoWrap: {
    width: 52,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  logoGrid: {
    width: 28,
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 5,
    gap: 4,
  },
  logoDot: { width: 7, height: 7, borderRadius: 2 },
  appName: { fontSize: 20, fontWeight: '700', fontFamily: 'Inter_700Bold', letterSpacing: -0.3 },
  tagline: { fontSize: 13, fontFamily: 'Inter_400Regular' },

  formCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 20,
    gap: 4,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 16,
    fontFamily: 'Inter_400Regular',
    lineHeight: 19,
  },

  footerRow: { flexDirection: 'row', justifyContent: 'center' },
  globalError: {
    fontSize: 12,
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
  },
});
