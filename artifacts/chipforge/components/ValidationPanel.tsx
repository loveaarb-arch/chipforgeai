import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { PrimaryButton } from '@/components/PrimaryButton';
import {
  useValidateProjectDesign,
  type ValidationIssue,
} from '@workspace/api-client-react';

interface Props {
  projectId: number;
}

function severityIcon(severity: ValidationIssue['severity']) {
  if (severity === 'error') return 'x-circle';
  if (severity === 'warning') return 'alert-triangle';
  return 'info';
}

export function ValidationPanel({ projectId }: Props) {
  const colors = useColors();
  const [result, setResult] = useState<{
    issues: ValidationIssue[];
    suggestions: string[];
  } | null>(null);
  const validate = useValidateProjectDesign({
    mutation: { onSuccess: setResult },
  });

  const severityColor = (severity: ValidationIssue['severity']) =>
    severity === 'error'
      ? colors.destructive
      : severity === 'warning'
        ? colors.warning
        : colors.primary;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <PrimaryButton
        title="Run validation"
        onPress={() => validate.mutate({ id: projectId })}
        loading={validate.isPending}
      />

      {result ? (
        <>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Structural checks
          </Text>
          {result.issues.length === 0 ? (
            <View style={[styles.row, styles.okRow, { borderColor: colors.border }]}>
              <Feather name="check-circle" size={18} color={colors.primary} />
              <Text style={{ color: colors.foreground, marginLeft: 10 }}>
                No structural issues found.
              </Text>
            </View>
          ) : (
            result.issues.map((issue, index) => (
              <View
                key={index}
                style={[styles.row, { borderColor: colors.border }]}
              >
                <Feather
                  name={severityIcon(issue.severity) as any}
                  size={18}
                  color={severityColor(issue.severity)}
                />
                <Text style={[styles.issueText, { color: colors.foreground }]}>
                  {issue.message}
                </Text>
              </View>
            ))
          )}

          {result.suggestions.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                AI suggestions
              </Text>
              {result.suggestions.map((suggestion, index) => (
                <View
                  key={index}
                  style={[styles.row, { borderColor: colors.border }]}
                >
                  <Feather name="zap" size={16} color={colors.primary} />
                  <Text style={[styles.issueText, { color: colors.foreground }]}>
                    {suggestion}
                  </Text>
                </View>
              ))}
            </>
          ) : null}
        </>
      ) : (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Run validation to check for unconnected pins, bit-width mismatches,
          missing clock/reset signals, and naming conflicts — plus AI-suggested
          improvements.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 6,
    fontFamily: 'Inter_700Bold',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  okRow: { alignItems: 'center' },
  issueText: { marginLeft: 10, flex: 1, fontSize: 13, lineHeight: 19 },
  hint: { fontSize: 13, lineHeight: 20, marginTop: 4 },
});
