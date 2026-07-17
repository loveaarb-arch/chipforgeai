import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { PrimaryButton } from '@/components/PrimaryButton';
import {
  getGetProjectQueryKey,
  useCritiqueProjectDesign,
  useValidateProjectDesign,
  type ChipProject,
  type DesignFinding,
  type ValidationIssue,
} from '@workspace/api-client-react';

interface Props {
  projectId: number;
  project: ChipProject;
}

function severityIcon(severity: ValidationIssue['severity'] | DesignFinding['severity']) {
  if (severity === 'error') return 'x-circle';
  if (severity === 'warning') return 'alert-triangle';
  return 'info';
}

function FindingRow({
  severity,
  message,
  colors,
}: {
  severity: 'error' | 'warning' | 'info';
  message: string;
  colors: ReturnType<typeof useColors>;
}) {
  const color =
    severity === 'error'
      ? colors.destructive
      : severity === 'warning'
        ? colors.warning
        : colors.primary;
  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <Feather name={severityIcon(severity) as any} size={18} color={color} />
      <Text style={[styles.issueText, { color: colors.foreground }]}>{message}</Text>
    </View>
  );
}

export function ValidationPanel({ projectId, project }: Props) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<{
    issues: ValidationIssue[];
    suggestions: string[];
  } | null>(null);

  const validate = useValidateProjectDesign({
    mutation: { onSuccess: setResult },
  });

  const critique = useCritiqueProjectDesign({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      },
    },
  });

  const severityColor = (severity: ValidationIssue['severity']) =>
    severity === 'error'
      ? colors.destructive
      : severity === 'warning'
        ? colors.warning
        : colors.primary;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* ── Structural validation ──────────────────────────── */}
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
              <View key={index} style={[styles.row, { borderColor: colors.border }]}>
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
                <View key={index} style={[styles.row, { borderColor: colors.border }]}>
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

      {/* ── AI design critique ─────────────────────────────── */}
      <View style={[styles.section, { borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          AI design critique
        </Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          A senior-engineer-level review of your block diagram architecture —
          catches bottlenecks, missing pipeline stages, unreachable components,
          and fan-out issues before you generate HDL.
        </Text>

        <PrimaryButton
          title={project.designCritique ? 'Re-run critique' : 'Critique design'}
          onPress={() => critique.mutate({ id: projectId })}
          loading={critique.isPending}
          disabled={project.design.components.length === 0}
          variant="secondary"
        />

        {project.design.components.length === 0 ? (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Add components to the design before running a critique.
          </Text>
        ) : null}

        {project.designCritique && project.designCritique.length > 0 ? (
          project.designCritique.map((finding, index) => (
            <FindingRow
              key={index}
              severity={finding.severity}
              message={`[${finding.category}] ${finding.message}`}
              colors={colors}
            />
          ))
        ) : project.designCritique && project.designCritique.length === 0 ? (
          <View style={[styles.row, styles.okRow, { borderColor: colors.border }]}>
            <Feather name="check-circle" size={18} color={colors.primary} />
            <Text style={{ color: colors.foreground, marginLeft: 10 }}>
              No architectural issues found.
            </Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14 },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
    gap: 10,
  },
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
