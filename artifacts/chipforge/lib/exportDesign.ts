import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { ChipProject, ValidationResult } from '@workspace/api-client-react';

/**
 * This is deliberately NOT a foundry submission package. A real tapeout
 * requires validated PDK-specific synthesis, physical design, DFT insertion,
 * packaging, and signoff tied to a target foundry, tool-generated GDSII/OASIS
 * output, and legal/process collateral -- none of which this app can produce.
 * This bundle is the honest handoff point: the block-diagram design, the
 * AI-drafted HDL/netlist, and a validation summary, for a professional
 * engineer to take into real EDA tooling.
 */
const PACKAGE_DISCLAIMER = `This is a PRE-TAPEOUT design handoff, not a foundry-ready submission.

It contains the block-diagram design, AI-drafted HDL (Verilog-style) and a
JSON netlist, and a basic validation report. Before this can go to a foundry,
a qualified engineer still needs to run, at minimum:
  - Logic synthesis against a target process/PDK
  - Physical design (floorplanning, placement, routing)
  - DFT (design-for-test) insertion
  - Packaging and pinout finalization
  - Full signoff (timing, power, DRC/LVS) and GDSII/OASIS generation

None of those steps are performed by this app. Treat everything below as a
starting point for professional review, not as fabrication-ready output.`;

export interface ExportValidation {
  issues: ValidationResult['issues'];
  suggestions: string[];
}

export function hasBlockingIssues(validation: ExportValidation | null): boolean {
  return (validation?.issues ?? []).some((issue) => issue.severity === 'error');
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'chipforge-project';
}

function section(title: string, body: string): string {
  return `\n\n## ${title}\n\n${body}`;
}

/**
 * Builds a single human- and machine-readable bundle (design JSON, HDL,
 * netlist JSON, and a validation summary) as one markdown document. A single
 * file is used instead of a multi-file archive because the sharing surface
 * on both iOS and Android hands off one file at a time to the destination
 * app -- one clearly-sectioned document is more reliable than asking the
 * user to individually share several files.
 */
export function buildExportBundle(
  project: ChipProject,
  validation: ExportValidation | null,
): string {
  const generatedAt = new Date().toISOString();

  const issuesText =
    validation && validation.issues.length > 0
      ? validation.issues
          .map((issue) => `- [${issue.severity.toUpperCase()}] ${issue.message}`)
          .join('\n')
      : 'No structural issues were found by validation.';

  const suggestionsText =
    validation && validation.suggestions.length > 0
      ? validation.suggestions.map((s) => `- ${s}`).join('\n')
      : 'No suggestions recorded.';

  const validationSection = validation
    ? `${issuesText}\n\n### AI suggestions\n\n${suggestionsText}`
    : 'Validation was not run before export. Run validation in the app before relying on this package.';

  let body = `# ${project.name} — Chip Forge AI design export

Generated: ${generatedAt}
${project.description ? `Description: ${project.description}\n` : ''}
${PACKAGE_DISCLAIMER}`;

  body += section(
    'Block-diagram design (JSON)',
    '```json\n' + JSON.stringify(project.design, null, 2) + '\n```',
  );

  body += section(
    'Generated HDL',
    project.hdlCode
      ? '```verilog\n' + project.hdlCode + '\n```'
      : 'No HDL has been generated for this design yet.',
  );

  body += section(
    'Generated netlist (JSON)',
    project.netlist
      ? '```json\n' + JSON.stringify(JSON.parse(project.netlist), null, 2) + '\n```'
      : 'No netlist has been generated for this design yet.',
  );

  body += section('Validation report', validationSection);

  if (project.xdcConstraints) {
    body += section(
      'Constraints — XDC (Xilinx)',
      '```tcl\n' + project.xdcConstraints + '\n```',
    );
  }

  if (project.sdcConstraints) {
    body += section(
      'Constraints — SDC (Synopsys / OpenROAD)',
      '```tcl\n' + project.sdcConstraints + '\n```',
    );
  }

  return body;
}

/**
 * Writes the export bundle to a temporary file and hands it to the platform
 * share sheet so the user can save it, email it to an engineer, or move it
 * into their own EDA tooling.
 */
export async function exportDesignPackage(
  project: ChipProject,
  validation: ExportValidation | null,
): Promise<void> {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device.');
  }

  const bundle = buildExportBundle(project, validation);
  const directory = new Directory(Paths.cache, 'chipforge-exports');
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }

  const fileName = `${slugify(project.name)}-design-export.md`;
  const file = new File(directory, fileName);
  file.create({ overwrite: true });
  file.write(bundle);

  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/markdown',
    dialogTitle: `Export ${project.name} design package`,
  });
}
