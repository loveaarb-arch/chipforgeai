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
      const { error: sendError } = await signIn.mfa.sendEmailCode();
      if (sendError) {
        console.error('Failed to send client-trust code:', JSON.stringify(sendError));
      }
    } else {
      console.error('Sign-in attempt not complete:', signIn.status);
    }
  };

  const handleVerifyClientTrust = async () => {
    await signIn.mfa.verifyEmailCode({ code });
    if (signIn.status === 'complete') {
      await signIn.finalize({});
    }
  };

  const globalError = errors.global?.[0]?.message;

  if (signIn.status === 'needs_client_trust') {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.formCard}>
            <Text style={[styles.title, { color: colors.foreground }]}>Verify device</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              A code was sent to {emailAddress}. Enter it below.
            </Text>
            <AuthTextField
              label="Verification code"
              value={code}
              onChangeText={setCode}
              keyboardType="numeric"
              placeholder=""
              errorMessage={errors.fields.code?.message}
            />
            {globalError ? (
              <Text style={[styles.globalError, { color: colors.destructive }]}>{globalError}</Text>
            ) : null}
            <PrimaryButton
              title="Verify"
              onPress={handleVerifyClientTrust}
              loading={fetchStatus === 'fetching'}
              disabled={!code}
            />
            <View style={styles.footerRow}>
              <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}
                onPress={() => signIn.mfa.sendEmailCode()}>
                Resend
              </Text>
              <Text style={{ color: colors.border }}>{'  ·  '}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}
                onPress={() => signIn.reset()}>
                Start over
              </Text>
            </View>
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
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Brand */}
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

        {/* Form */}
        <View style={[styles.formCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.formTitle, { color: colors.foreground }]}>Sign in</Text>

          <AuthTextField
            label="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={emailAddress}
            onChangeText={setEmailAddress}
            placeholder=""
            errorMessage={errors.fields.identifier?.message}
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
            <Text style={[styles.globalError, { color: colors.destructive }]}>{globalError}</Text>
          ) : null}

          <PrimaryButton
            title="Sign in"
            onPress={handleSubmit}
            loading={fetchStatus === 'fetching'}
            disabled={!emailAddress || !password}
          />
        </View>

        <View style={styles.footerRow}>
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
            No account?{' '}
          </Text>
          <Link href="/(auth)/sign-up">
            <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>
              Sign up
            </Text>
          </Link>
        </View>
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

  title: { fontSize: 20, fontWeight: '700', fontFamily: 'Inter_700Bold', marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 16, fontFamily: 'Inter_400Regular', lineHeight: 19 },

  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },

  globalError: {
    fontSize: 12,
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
  },
});
