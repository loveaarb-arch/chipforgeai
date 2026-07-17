import React, { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { PrimaryButton } from '@/components/PrimaryButton';
import { exportDesignPackage, hasBlockingIssues } from '@/lib/exportDesign';
import {
  getGetProjectQueryKey,
  useGenerateProjectConstraints,
  useGenerateProjectHdl,
  useGenerateProjectTestbench,
  useReviewProjectHdl,
  useSynthesiseProject,
  useValidateProjectDesign,
  type ChipProject,
  type DesignFinding,
} from '@workspace/api-client-react';

interface Props {
  projectId: number;
  project: ChipProject;
}

function SynthStat({
  label,
  value,
  colors,
  highlight,
  wide,
}: {
  label: string;
  value: string | number;
  colors: ReturnType<typeof useColors>;
  highlight?: 'ok' | 'warning' | 'error';
  wide?: boolean;
}) {
  const valueColor =
    highlight === 'error'
      ? colors.destructive
      : highlight === 'warning'
        ? colors.warning
        : colors.foreground;
  return (
    <View style={[synthStatStyles.cell, wide && synthStatStyles.cellWide]}>
      <Text style={[synthStatStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[synthStatStyles.value, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const synthStatStyles = StyleSheet.create({
  cell: { width: '48%', marginBottom: 10 },
  cellWide: { width: '100%' },
  label: { fontSize: 11, fontFamily: 'Inter_400Regular', marginBottom: 2 },
  value: { fontSize: 16, fontWeight: '700', fontFamily: 'Inter_700Bold' },
});

function formatNetlist(netlist: string): string {
  try {
    return JSON.stringify(JSON.parse(netlist), null, 2);
  } catch {
    return netlist;
  }
}

export function HdlPanel({ projectId, project }: Props) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [isExporting, setIsExporting] = useState(false);
  const [xdcExpanded, setXdcExpanded] = useState(true);
  const [sdcExpanded, setSdcExpanded] = useState(true);
  const [testbenchExpanded, setTestbenchExpanded] = useState(true);
  const [xdcCopied, setXdcCopied] = useState(false);
  const [sdcCopied, setSdcCopied] = useState(false);
  const [testbenchCopied, setTestbenchCopied] = useState(false);

  const handleCopy = async (text: string, setCopied: (v: boolean) => void) => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const generateHdl = useGenerateProjectHdl({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      },
    },
  });
  const generateConstraints = useGenerateProjectConstraints({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      },
    },
  });
  const reviewHdl = useReviewProjectHdl({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      },
    },
  });
  const generateTestbench = useGenerateProjectTestbench({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      },
    },
  });
  const synthesise = useSynthesiseProject({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      },
    },
  });
  const validate = useValidateProjectDesign();

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const validation = await validate.mutateAsync({ id: projectId });
      if (hasBlockingIssues(validation)) {
        Alert.alert(
          'Fix errors before exporting',
          'Validation found structural errors (e.g. a missing clock source or a connection to an unknown component). Fix these in Validate or Diagram before exporting a design package.',
        );
        return;
      }
      await exportDesignPackage(project, validation);
    } catch (err) {
      Alert.alert(
        'Export failed',
        err instanceof Error ? err.message : 'Something went wrong while exporting.',
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <PrimaryButton
        title={project.hdlCode ? 'Regenerate HDL' : 'Generate HDL'}
        onPress={() => generateHdl.mutate({ id: projectId })}
        loading={generateHdl.isPending}
        disabled={project.design.components.length === 0}
      />

      {project.design.components.length === 0 ? (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Add or generate an architecture first — HDL is derived from the
          current block diagram.
        </Text>
      ) : null}

      {project.hdlCode ? (
        <View style={[styles.codeBlock, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.codeHeader}>
            <Feather name="code" size={14} color={colors.mutedForeground} />
            <Text style={[styles.codeHeaderText, { color: colors.mutedForeground }]}>
              module.v
            </Text>
          </View>
          <Text selectable style={[styles.codeText, { color: colors.foreground }]}>
            {project.hdlCode}
          </Text>
        </View>
      ) : (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          No HDL generated yet for the current design.
        </Text>
      )}

      {/* ── AI Synthesis Estimate ─────────────────────────── */}
      <View style={[styles.exportSection, { borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Synthesis estimate
        </Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          AI-estimated FPGA resource usage and timing on a Xilinx Artix-7 —
          LUT count, flip-flops, DSP slices, BRAMs, critical-path depth, and
          estimated max clock frequency. Requires HDL to be generated first.
        </Text>
        {!project.hdlCode ? (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Generate HDL above before running synthesis estimation.
          </Text>
        ) : (
          <PrimaryButton
            title={project.synthesisResult ? 'Re-run synthesis estimate' : 'Estimate synthesis'}
            onPress={() => synthesise.mutate({ id: projectId })}
            loading={synthesise.isPending}
            disabled={!project.hdlCode}
            variant="secondary"
          />
        )}
        {project.synthesisResult ? (
          <>
            {/* Resource table */}
            <View style={[styles.synthCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.synthDevice, { color: colors.mutedForeground }]}>
                {project.synthesisResult.targetDevice}
              </Text>
              <View style={styles.synthGrid}>
                <SynthStat label="LUTs" value={project.synthesisResult.lutCount} colors={colors} />
                <SynthStat label="Flip-flops" value={project.synthesisResult.flipFlopCount} colors={colors} />
                <SynthStat label="DSP slices" value={project.synthesisResult.dspSlices} colors={colors} />
                <SynthStat label="BRAMs" value={project.synthesisResult.bramBlocks} colors={colors} />
                <SynthStat label="Logic depth" value={`${project.synthesisResult.logicDepth} LUTs`} colors={colors} />
                <SynthStat
                  label="Est. Fmax"
                  value={`${project.synthesisResult.estimatedFmaxMhz.toFixed(0)} MHz`}
                  colors={colors}
                  highlight={project.synthesisResult.estimatedFmaxMhz < 50 ? 'error' : project.synthesisResult.estimatedFmaxMhz < 100 ? 'warning' : 'ok'}
                />
                <SynthStat
                  label="Utilisation"
                  value={`${project.synthesisResult.utilizationPercent.toFixed(1)}%`}
                  colors={colors}
                  highlight={project.synthesisResult.utilizationPercent > 80 ? 'error' : project.synthesisResult.utilizationPercent > 50 ? 'warning' : 'ok'}
                  wide
                />
              </View>
            </View>
            {/* Summary */}
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              {project.synthesisResult.summary}
            </Text>
            {/* Warnings */}
            {project.synthesisResult.warnings.map((w, i) => (
              <View key={i} style={[styles.findingRow, { borderColor: colors.border }]}>
                <Feather name="alert-triangle" size={16} color={colors.warning} />
                <Text style={[styles.findingText, { color: colors.foreground }]}>{w}</Text>
              </View>
            ))}
          </>
        ) : null}
      </View>

      {/* ── AI HDL Review ─────────────────────────────────── */}
      <View style={[styles.exportSection, { borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          AI HDL review
        </Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          A second AI pass over the generated Verilog — catches undriven
          signals, combinational loops, implicit latches, missing resets, and
          timing risks. Requires HDL to be generated first.
        </Text>
        {!project.hdlCode ? (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Generate HDL above before running a review.
          </Text>
        ) : (
          <PrimaryButton
            title={project.hdlReview ? 'Re-run HDL review' : 'Review HDL'}
            onPress={() => reviewHdl.mutate({ id: projectId })}
            loading={reviewHdl.isPending}
            disabled={!project.hdlCode}
            variant="secondary"
          />
        )}
        {project.hdlReview && project.hdlReview.length === 0 ? (
          <View style={[styles.findingRow, { borderColor: colors.border }]}>
            <Feather name="check-circle" size={16} color={colors.primary} />
            <Text style={[styles.findingText, { color: colors.foreground, marginLeft: 8 }]}>
              No issues found — HDL looks clean.
            </Text>
          </View>
        ) : null}
        {(project.hdlReview ?? []).map((finding: DesignFinding, i: number) => {
          const color =
            finding.severity === 'error'
              ? colors.destructive
              : finding.severity === 'warning'
                ? colors.warning
                : colors.primary;
          const icon =
            finding.severity === 'error' ? 'x-circle' : finding.severity === 'warning' ? 'alert-triangle' : 'info';
          return (
            <View key={i} style={[styles.findingRow, { borderColor: colors.border }]}>
              <Feather name={icon as any} size={16} color={color} />
              <Text style={[styles.findingText, { color: colors.foreground }]}>
                [{finding.category}] {finding.message}
              </Text>
            </View>
          );
        })}
      </View>

      {/* ── Testbench ──────────────────────────────────────── */}
      <View style={[styles.exportSection, { borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Testbench
        </Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Generates a Verilog testbench with clock/reset stimulus, input
          vectors, and expected output checks — plus a plain-language summary
          of what the test covers and whether the logic appears correct.
          Requires HDL to be generated first.
        </Text>
        {!project.hdlCode ? (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Generate HDL above before generating a testbench.
          </Text>
        ) : (
          <PrimaryButton
            title={project.testbench ? 'Regenerate testbench' : 'Generate testbench'}
            onPress={() => generateTestbench.mutate({ id: projectId })}
            loading={generateTestbench.isPending}
            disabled={!project.hdlCode}
            variant="secondary"
          />
        )}
        {project.testbenchSummary ? (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            {project.testbenchSummary}
          </Text>
        ) : null}
        {project.testbench ? (
          <View style={[styles.codeBlock, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.codeHeader}>
              <Pressable
                onPress={() => setTestbenchExpanded((v) => !v)}
                style={styles.codeHeaderLeft}
              >
                <Feather name="terminal" size={14} color={colors.mutedForeground} />
                <Text style={[styles.codeHeaderText, { color: colors.mutedForeground, flex: 1 }]}>
                  testbench.v
                </Text>
                <Feather
                  name={testbenchExpanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={colors.mutedForeground}
                />
              </Pressable>
              <Pressable
                onPress={() => handleCopy(project.testbench!, setTestbenchCopied)}
                style={styles.copyButton}
                hitSlop={8}
              >
                {testbenchCopied ? (
                  <Text style={[styles.copiedText, { color: colors.mutedForeground }]}>Copied!</Text>
                ) : (
                  <Feather name="copy" size={14} color={colors.mutedForeground} />
                )}
              </Pressable>
            </View>
            {testbenchExpanded ? (
              <Text selectable style={[styles.codeText, { color: colors.foreground }]}>
                {project.testbench}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {project.netlist ? (
        <View style={[styles.codeBlock, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.codeHeader}>
            <Feather name="share-2" size={14} color={colors.mutedForeground} />
            <Text style={[styles.codeHeaderText, { color: colors.mutedForeground }]}>
              netlist.json
            </Text>
          </View>
          <Text selectable style={[styles.codeText, { color: colors.foreground }]}>
            {formatNetlist(project.netlist)}
          </Text>
        </View>
      ) : null}

      <View style={[styles.exportSection, { borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Constraints
        </Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Generates XDC (Xilinx) and SDC (Synopsys / OpenROAD) constraint
          files — clock definitions, pin assignments, and timing constraints —
          as a starting point for your EDA tooling. Requires HDL to be
          generated first.
        </Text>

        {!project.hdlCode ? (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Generate HDL above before generating constraints.
          </Text>
        ) : (
          <PrimaryButton
            title={
              project.xdcConstraints
                ? 'Regenerate constraints'
                : 'Generate constraints'
            }
            onPress={() => generateConstraints.mutate({ id: projectId })}
            loading={generateConstraints.isPending}
            disabled={!project.hdlCode}
            variant="secondary"
          />
        )}

        {project.xdcConstraints ? (
          <View style={[styles.codeBlock, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.codeHeader}>
              <Pressable
                onPress={() => setXdcExpanded((v) => !v)}
                style={styles.codeHeaderLeft}
              >
                <Feather name="sliders" size={14} color={colors.mutedForeground} />
                <Text style={[styles.codeHeaderText, { color: colors.mutedForeground, flex: 1 }]}>
                  constraints.xdc
                </Text>
                <Feather
                  name={xdcExpanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={colors.mutedForeground}
                />
              </Pressable>
              <Pressable
                onPress={() => handleCopy(project.xdcConstraints!, setXdcCopied)}
                style={styles.copyButton}
                hitSlop={8}
              >
                {xdcCopied ? (
                  <Text style={[styles.copiedText, { color: colors.mutedForeground }]}>Copied!</Text>
                ) : (
                  <Feather name="copy" size={14} color={colors.mutedForeground} />
                )}
              </Pressable>
            </View>
            {xdcExpanded ? (
              <Text selectable style={[styles.codeText, { color: colors.foreground }]}>
                {project.xdcConstraints}
              </Text>
            ) : null}
          </View>
        ) : null}

        {project.sdcConstraints ? (
          <View style={[styles.codeBlock, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.codeHeader}>
              <Pressable
                onPress={() => setSdcExpanded((v) => !v)}
                style={styles.codeHeaderLeft}
              >
                <Feather name="sliders" size={14} color={colors.mutedForeground} />
                <Text style={[styles.codeHeaderText, { color: colors.mutedForeground, flex: 1 }]}>
                  constraints.sdc
                </Text>
                <Feather
                  name={sdcExpanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={colors.mutedForeground}
                />
              </Pressable>
              <Pressable
                onPress={() => handleCopy(project.sdcConstraints!, setSdcCopied)}
                style={styles.copyButton}
                hitSlop={8}
              >
                {sdcCopied ? (
                  <Text style={[styles.copiedText, { color: colors.mutedForeground }]}>Copied!</Text>
                ) : (
                  <Feather name="copy" size={14} color={colors.mutedForeground} />
                )}
              </Pressable>
            </View>
            {sdcExpanded ? (
              <Text selectable style={[styles.codeText, { color: colors.foreground }]}>
                {project.sdcConstraints}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={[styles.exportSection, { borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Export design package
        </Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Bundles the design, HDL, netlist, constraints, and a validation
          report into one file you can save or hand to an engineer. This is a
          pre-tapeout handoff — synthesis, physical design, DFT, packaging,
          and signoff for a specific foundry still need to happen before
          fabrication.
        </Text>
        <PrimaryButton
          title="Export design package"
          onPress={handleExport}
          loading={isExporting || validate.isPending}
          disabled={project.design.components.length === 0}
          variant="secondary"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14 },
  hint: { fontSize: 13, lineHeight: 20 },
  codeBlock: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  codeHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  copyButton: {
    paddingLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  copiedText: {
    fontSize: 11,
    fontWeight: '600',
  },
  codeHeaderText: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  codeText: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    lineHeight: 18,
    padding: 14,
  },
  exportSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
    gap: 10,
  },
  synthCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  synthDevice: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginBottom: 10,
  },
  synthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  findingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  findingText: { flex: 1, fontSize: 13, lineHeight: 19 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
});
