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

  const needsVerification =
    signUp.status === 'missing_requirements' &&
    signUp.unverifiedFields.includes('email_address') &&
    signUp.missingFields.length === 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {needsVerification ? (
          <>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Verify your email
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Enter the code we sent to {emailAddress}
            </Text>
            <AuthTextField
              label="Verification code"
              value={code}
              onChangeText={setCode}
              keyboardType="numeric"
              placeholder="123456"
              errorMessage={errors.fields.code?.message}
            />
            <PrimaryButton
              title="Verify"
              onPress={handleVerify}
              loading={fetchStatus === 'fetching'}
              disabled={!code}
            />
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Create your account
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Start designing chips with AI assistance
            </Text>

            <AuthTextField
              label="Email address"
              autoCapitalize="none"
              keyboardType="email-address"
              value={emailAddress}
              onChangeText={setEmailAddress}
              placeholder="you@example.com"
              errorMessage={errors.fields.emailAddress?.message}
            />
            <AuthTextField
              label="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              errorMessage={errors.fields.password?.message}
            />

            <PrimaryButton
              title="Sign up"
              onPress={handleSubmit}
              loading={fetchStatus === 'fetching'}
              disabled={!emailAddress || !password}
            />

            <View style={styles.footerRow}>
              <Text style={{ color: colors.mutedForeground }}>
                Already have an account?{' '}
              </Text>
              <Link href="/(auth)/sign-in">
                <Text style={{ color: colors.primary, fontWeight: '600' }}>
                  Sign in
                </Text>
              </Link>
            </View>

            <View nativeID="clerk-captcha" />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
    fontFamily: 'Inter_700Bold',
  },
  subtitle: { fontSize: 14, marginBottom: 24, fontFamily: 'Inter_400Regular' },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
});
