import { openai } from "@workspace/integrations-openai-ai-server";

export interface ChipComponentData {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  bitWidth: number | null;
  properties: Record<string, string>;
}

export interface ChipConnectionData {
  id: string;
  fromComponentId: string;
  fromPort: string | null;
  toComponentId: string;
  toPort: string | null;
  label: string | null;
}

export interface ChipDesignData {
  components: ChipComponentData[];
  connections: ChipConnectionData[];
}

export interface ValidationIssueData {
  severity: "error" | "warning" | "info";
  message: string;
  componentId: string | null;
}

const MODEL = "gpt-5.4";

// Prohibited categories, verbatim from the product spec. Kept as a single
// source of truth so the safety-filter prompt and any future audit tooling
// stay in sync.
const PROHIBITED_CATEGORIES = [
  "weapons or systems designed to cause physical harm (e.g. munitions triggers, targeting systems, explosive detonators)",
  "cybersecurity abuse (e.g. malware delivery hardware, exploit chips, unauthorized intrusion devices)",
  "surveillance abuse (e.g. covert tracking devices, unauthorized wiretapping or mass-surveillance hardware)",
  "attacks on critical infrastructure (e.g. power grid, water treatment, or transportation sabotage systems)",
  "dangerous autonomous systems (e.g. weaponized drones, autonomous systems designed to evade human control or accountability)",
  "fraud or counterfeiting (e.g. card skimmers, counterfeit currency/goods authentication bypass, forged ID chips)",
];

/**
 * A short, human-readable explanation of why a matched category is harmful.
 * Shown to the user alongside the refusal so the block reads as a reasoned
 * decision rather than an opaque wall — and so a persistent, differently
 * worded attempt doesn't look like a fresh, unanswered question.
 */
const CATEGORY_EXPLANATIONS: Record<string, string> = {
  weapons:
    "it could be used to cause physical harm or death",
  cybersecurity:
    "it could be used to compromise or gain unauthorized access to computer systems",
  surveillance:
    "it could be used to covertly track or monitor people without their knowledge or consent",
  infrastructure:
    "it could be used to disrupt power, water, transportation, or other critical infrastructure that people depend on",
  autonomous:
    "it could be used to build systems that cause harm without human oversight or accountability",
  fraud:
    "it could be used to defraud people or forge/counterfeit protected goods or credentials",
};

function explainCategory(category: string | null): string {
  if (!category) return "it falls into a category we don't allow this tool to help design";
  const key = category.toLowerCase();
  const match = Object.entries(CATEGORY_EXPLANATIONS).find(([needle]) =>
    key.includes(needle),
  );
  return match ? match[1] : `it matches a prohibited category (${category})`;
}

/**
 * Message shown the first time a request in a project is blocked.
 *
 * Deliberately does NOT suggest starting a new project or any other next
 * step — if the request was a genuine attempt at harm, we should not be
 * handing back a workaround. Legitimate users who tripped this by mistake
 * can reach out through normal support channels.
 */
export function buildRefusalMessage(category: string | null): string {
  return (
    `I can't help with that request because ${explainCategory(category)}. ` +
    "This project has been locked and can no longer accept design requests, " +
    "even rephrased or reframed ones."
  );
}

/** Message shown for any further chat attempt in an already-locked project. */
export function buildLockedProjectMessage(category: string | null): string {
  return (
    `This project is locked because an earlier request in it was flagged (${
      category ?? "policy violation"
    }) — ${explainCategory(category)}. ` +
    "It can no longer send or receive design requests."
  );
}

function extractJson(content: string | null | undefined): unknown {
  if (!content) {
    throw new Error("AI response had no content");
  }
  return JSON.parse(content);
}

/**
 * Classifies a design request against the prohibited-use categories. Runs
 * before every generation call (initial and follow-up). Deterministic
 * structural safety (never generate, regardless of model output) is not
 * possible for open-ended natural language, so this is an LLM judgment call
 * with a conservative system prompt — err toward blocking when ambiguous.
 */
export async function runSafetyCheck(
  userMessage: string,
): Promise<{ allowed: boolean; category: string | null }> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 512,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a safety classifier for an AI chip design assistant. Decide whether the user's request is asking to design, or materially assist in designing, hardware/circuitry for any of these prohibited categories:\n${PROHIBITED_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n\nGeneral-purpose educational or benign digital logic (ALUs, registers, counters, memory controllers, general I/O, general communication, general encryption/decryption for legitimate security research, general robotics/automation) is ALLOWED even if it could theoretically be repurposed, unless the request explicitly targets one of the prohibited categories above.\n\nWhen genuinely ambiguous, err toward blocking.\n\nRespond with strict JSON: {"allowed": boolean, "category": string | null}. "category" must be null when allowed is true, otherwise a short label naming which category matched.`,
      },
      { role: "user", content: userMessage },
    ],
  });

  const parsed = extractJson(response.choices[0]?.message?.content) as {
    allowed?: boolean;
    category?: string | null;
  };

  return {
    allowed: parsed.allowed !== false,
    category: parsed.allowed === false ? parsed.category ?? "unspecified" : null,
  };
}

/**
 * Generates or updates a chip's block-diagram architecture from a natural
 * language request. The model returns the FULL new design state (not a
 * diff) so the caller can simply replace the working design.
 */
export async function generateArchitecture(params: {
  userMessage: string;
  currentDesign: ChipDesignData;
  recentHistory: { role: "user" | "assistant"; content: string }[];
}): Promise<{ design: ChipDesignData; explanation: string }> {
  const { userMessage, currentDesign, recentHistory } = params;

  const response = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an expert digital chip architect helping a user design digital circuits via natural language. You output a complete block-diagram architecture as JSON.

Component types you can use (type field, free text but prefer these): register, alu, mux, demux, adder, counter, memory, rom, io_port, controller, fsm, clock, decoder, encoder, comparator, shifter, bus.

Respond with strict JSON of this exact shape:
{
  "components": [
    { "id": string, "type": string, "label": string, "x": number, "y": number, "width": number, "height": number, "bitWidth": number | null, "properties": { [key: string]: string } }
  ],
  "connections": [
    { "id": string, "fromComponentId": string, "fromPort": string | null, "toComponentId": string, "toPort": string | null, "label": string | null }
  ],
  "explanation": string
}

Rules:
- "explanation" is a short (2-4 sentence), plain-language summary of what you built or changed, written to the user. If the design looks reasonably complete (has components and connections), end with one short actionable sentence telling the user how to hand it off: generate HDL in the HDL tab, then use "Export design package" there to bundle the design, HDL, netlist, and validation report into a file they can send to a manufacturer or engineer. Do not claim the design is fabrication-ready — it still needs synthesis, physical design, and signoff by that engineer/manufacturer — but be concrete that exporting and sending it is something they can do right now, not a future capability.
- Lay components out on a canvas: x/y in pixels (0-1200 range), width/height sized to fit the label (typically 120-220 wide, 60-100 tall), spaced so boxes do not overlap.
- Every connection's fromComponentId/toComponentId MUST reference an id present in "components".
- Preserve existing component ids, positions, and properties when the user asks for an incremental change (e.g. "add a counter") — only add/modify what's needed. Start from the CURRENT DESIGN provided below.
- If the user asks for something structurally incoherent or impossible to represent as digital logic, do your best reasonable interpretation rather than refusing.`,
      },
      {
        role: "user",
        content: `CURRENT DESIGN:\n${JSON.stringify(currentDesign)}`,
      },
      ...recentHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: userMessage },
    ],
  });

  const parsed = extractJson(response.choices[0]?.message?.content) as {
    components?: ChipComponentData[];
    connections?: ChipConnectionData[];
    explanation?: string;
  };

  return {
    design: {
      components: parsed.components ?? [],
      connections: normalizeConnections(parsed.connections),
    },
    explanation: parsed.explanation ?? "Updated the design.",
  };
}

/**
 * The LLM's JSON output sometimes omits the (optional) "label" field on a
 * connection entirely instead of emitting `label: null`. The API response
 * schema validates label as `string | null` — not `undefined` — so an
 * omitted key made the whole project fail to load with a 500 on every
 * subsequent GET, until the design was edited again. Normalize here so
 * malformed model output can never reach storage.
 */
export function normalizeConnections(
  connections: ChipConnectionData[] | undefined,
): ChipConnectionData[] {
  return (connections ?? []).map((connection) => ({
    ...connection,
    label: connection.label ?? null,
  }));
}

/**
 * Generates Verilog-style HDL and a JSON netlist for a design. Output scope
 * is deliberately limited to HDL/netlist generation for the user to hand off
 * to real EDA tooling — not fabrication-ready output, and not cycle-accurate
 * simulation of complex processors.
 */
export async function generateHdl(
  design: ChipDesignData,
): Promise<{ hdlCode: string; netlist: unknown }> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an expert digital design engineer. Given a block-diagram chip design (components + connections as JSON), produce:
1. "hdlCode": a single Verilog-style HDL module (or set of modules) implementing the design's structure at a reasonable level of abstraction. Include comments. This is for the user to review and hand to their own EDA/simulation tools — it does not need to be synthesis-perfect, but must be syntactically well-formed Verilog.
2. "netlist": a JSON object describing the module ports and net-level connections between components (an array of nets, each listing the component/port pairs it connects).

Respond with strict JSON: { "hdlCode": string, "netlist": object }`,
      },
      { role: "user", content: JSON.stringify(design) },
    ],
  });

  const parsed = extractJson(response.choices[0]?.message?.content) as {
    hdlCode?: string;
    netlist?: unknown;
  };

  return {
    hdlCode: parsed.hdlCode ?? "",
    netlist: parsed.netlist ?? {},
  };
}

/**
 * Generates XDC (Xilinx Design Constraints) and SDC (Synopsys Design
 * Constraints / OpenROAD) files from a chip design and its HDL. Both formats
 * are open industry standards — no tool attribution required.
 *
 * The AI picks a reasonable default clock frequency based on the component
 * types present. These files are a starting point for hand-off to real EDA
 * tooling, not synthesis-verified constraints.
 */
export async function generateConstraints(
  design: ChipDesignData,
  hdlCode: string,
): Promise<{ xdc: string; sdc: string }> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an expert digital design engineer specializing in EDA constraint files. Given a chip block-diagram design (components + connections) and its Verilog HDL, produce two constraint files:

1. "xdc": a Xilinx XDC constraints file. Include:
   - create_clock constraints for each clock signal (pick a reasonable frequency in MHz based on the component types — e.g. 100 MHz for general logic, 50 MHz for memory-heavy designs)
   - set_input_delay and set_output_delay for I/O ports (reference the generated clock)
   - set_false_path for any asynchronous reset signals
   - Brief comments explaining each section

2. "sdc": a Synopsys Design Constraints / OpenROAD SDC file covering the same timing intent:
   - create_clock for the primary clock
   - set_input_delay and set_output_delay for I/O
   - set_false_path for async resets
   - Brief comments explaining each section

Both files must use only standard XDC/SDC syntax. Do not reference proprietary vendor libraries or PDKs. These are pre-synthesis handoff constraints for a qualified engineer to refine.

Respond with strict JSON: { "xdc": string, "sdc": string }`,
      },
      {
        role: "user",
        content: JSON.stringify({ design, hdlCode }),
      },
    ],
  });

  const parsed = extractJson(response.choices[0]?.message?.content) as {
    xdc?: string;
    sdc?: string;
  };

  return {
    xdc: parsed.xdc ?? "",
    sdc: parsed.sdc ?? "",
  };
}

export interface SynthesisResult {
  targetDevice: string;
  lutCount: number;
  flipFlopCount: number;
  dspSlices: number;
  bramBlocks: number;
  estimatedFmaxMhz: number;
  logicDepth: number;
  utilizationPercent: number;
  warnings: string[];
  summary: string;
}

/**
 * Validates and normalizes a raw LLM synthesis result so a malformed response
 * never bricks the project on a subsequent GET.
 */
export function normalizeSynthesisResult(raw: unknown): SynthesisResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const int = (v: unknown, fallback: number) =>
    typeof v === "number" && isFinite(v) ? Math.round(Math.max(0, v)) : fallback;
  const float = (v: unknown, fallback: number) =>
    typeof v === "number" && isFinite(v) ? Math.max(0, v) : fallback;
  const str = (v: unknown, fallback: string) =>
    typeof v === "string" && v.trim() ? v.trim() : fallback;
  const strArr = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [];

  return {
    targetDevice: str(r.targetDevice, "Xilinx Artix-7 (xc7a35t)"),
    lutCount: int(r.lutCount, 0),
    flipFlopCount: int(r.flipFlopCount, 0),
    dspSlices: int(r.dspSlices, 0),
    bramBlocks: int(r.bramBlocks, 0),
    estimatedFmaxMhz: float(r.estimatedFmaxMhz, 0),
    logicDepth: int(r.logicDepth, 0),
    utilizationPercent: Math.min(100, float(r.utilizationPercent, 0)),
    warnings: strArr(r.warnings),
    summary: str(r.summary, ""),
  };
}

export interface DesignFinding {
  severity: "error" | "warning" | "info";
  category: string;
  message: string;
}

const VALID_SEVERITIES = new Set(["error", "warning", "info"]);

/**
 * Sanitizes raw LLM finding output before it is persisted. Drops entries that
 * are not objects or are missing a message string, and coerces unrecognised
 * severity values to "info" so a model returning a bad enum never bricks the
 * project on a subsequent GET.
 */
export function normalizeFindings(raw: unknown): DesignFinding[] {
  if (!Array.isArray(raw)) return [];
  const out: DesignFinding[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const message = typeof r.message === "string" ? r.message.trim() : null;
    if (!message) continue; // drop entries with no message
    const severity = VALID_SEVERITIES.has(r.severity as string)
      ? (r.severity as DesignFinding["severity"])
      : "info";
    const category =
      typeof r.category === "string" && r.category.trim()
        ? r.category.trim()
        : "general";
    out.push({ severity, category, message });
  }
  return out;
}

/**
 * AI HDL reviewer — runs a second AI pass over generated Verilog to catch
 * real HDL-level issues that deterministic structural checks can't see:
 * undriven signals, combinational loops, implicit latches, timing risks, etc.
 * Returns structured findings with severity levels for display in the HDL tab.
 */
export async function reviewHdl(
  design: ChipDesignData,
  hdlCode: string,
): Promise<{ findings: DesignFinding[] }> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a senior digital design engineer performing a code review of AI-generated Verilog HDL. Your job is to identify real, specific issues in the code — not generic advice.

Analyze the HDL for:
- Undriven or floating signals (wires assigned nowhere)
- Combinational feedback loops (logic that feeds back on itself without a register)
- Implicit latches (incomplete if/case statements in always blocks)
- Missing or incorrect sensitivity lists
- Clock domain crossings without synchronizers
- Timing risks (long combinational paths)
- Naming conflicts or reserved keyword collisions
- Syntax issues or incomplete module port declarations
- Missing reset conditions on registers/flip-flops
- Bit-width mismatches between assignments

For each issue found, categorize it and rate its severity:
- "error": will prevent synthesis or cause functional failure
- "warning": may cause functional issues or synthesis warnings, should be addressed
- "info": style/best-practice improvement, low risk

Be specific — reference signal names, module names, or line patterns from the actual HDL. If the HDL looks clean and well-formed, return a small number of "info" findings noting what's good.

Respond with strict JSON: { "findings": [{ "severity": "error"|"warning"|"info", "category": string, "message": string }] }`,
      },
      {
        role: "user",
        content: JSON.stringify({ design, hdlCode }),
      },
    ],
  });

  const parsed = extractJson(response.choices[0]?.message?.content) as {
    findings?: unknown;
  };

  return { findings: normalizeFindings(parsed.findings) };
}

/**
 * AI design critic — analyses the block-diagram architecture (not the HDL)
 * for structural and architectural problems. Runs before HDL generation so
 * engineers can fix the diagram first. Returns the same DesignFinding format
 * for a unified display pattern across all three AI review features.
 */
export async function critiqueDesign(
  design: ChipDesignData,
): Promise<{ findings: DesignFinding[] }> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a senior chip architect reviewing a block-diagram design. Your job is to flag real architectural problems — not generic commentary.

Analyze the block diagram for:
- Bottlenecks: single components doing too many things, or a bus/mux that will be saturated
- Missing pipeline stages: long combinational chains that need register stages for timing closure
- Redundant components: duplicate logic that could be shared
- Unreachable components: components with no path to/from I/O
- Missing components: sequential designs without explicit clock/reset sources
- Fan-out problems: one output driving too many inputs without buffering
- Fan-in problems: too many inputs to a single combinational block
- Asymmetric designs: e.g. unbalanced tree structures that will cause routing pressure
- Missing error/status signaling for controllers or FSMs
- Design clarity issues: ambiguous or non-standard component naming

Rate each finding:
- "error": fundamental flaw that will make synthesis fail or the design nonfunctional
- "warning": architectural weakness that will cause problems in timing, area, or power
- "info": improvement opportunity — not a blocker, but worth considering

Be specific — reference the actual component labels and connection patterns from the design. If the architecture looks solid, say so with a few "info" findings.

Respond with strict JSON: { "findings": [{ "severity": "error"|"warning"|"info", "category": string, "message": string }] }`,
      },
      {
        role: "user",
        content: JSON.stringify(design),
      },
    ],
  });

  const parsed = extractJson(response.choices[0]?.message?.content) as {
    findings?: unknown;
  };

  return { findings: normalizeFindings(parsed.findings) };
}

/**
 * AI testbench generator — produces a Verilog testbench with stimulus vectors
 * and expected outputs for the design, plus a plain-language summary of what
 * the test covers and whether the logic appears correct. No simulation is
 * actually run — the AI reasons about correctness from the design and HDL.
 */
export async function generateTestbench(
  design: ChipDesignData,
  hdlCode: string,
): Promise<{ testbench: string; testbenchSummary: string }> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a senior verification engineer. Given a chip block-diagram design and its Verilog HDL, produce:

1. "testbench": a complete Verilog testbench module (\`tb_<module_name>\`) that:
   - Instantiates the DUT (design under test) from the HDL
   - Generates clock and reset stimulus
   - Applies meaningful input vectors that cover the key functional paths
   - Uses \`$display\` / \`$monitor\` to log expected vs actual outputs
   - Uses \`$finish\` to terminate cleanly
   - Includes comments explaining each test case
   - Is syntactically valid Verilog that would run in a standard simulator

2. "testbenchSummary": a plain-language paragraph (3-5 sentences) explaining:
   - What the testbench covers (which inputs, which paths, which corner cases)
   - What the expected behaviour is
   - Whether the design logic appears correct based on your analysis (be honest — flag any logic you suspect is wrong)
   - What the engineer should do to run it (general simulator guidance, not tool-specific)

Respond with strict JSON: { "testbench": string, "testbenchSummary": string }`,
      },
      {
        role: "user",
        content: JSON.stringify({ design, hdlCode }),
      },
    ],
  });

  const parsed = extractJson(response.choices[0]?.message?.content) as {
    testbench?: string;
    testbenchSummary?: string;
  };

  return {
    testbench: parsed.testbench ?? "",
    testbenchSummary: parsed.testbenchSummary ?? "",
  };
}

/**
 * AI synthesis estimator — analyses the Verilog HDL and produces FPGA
 * resource utilisation and timing estimates without running a real synthesiser.
 * The model has been trained on millions of synthesis reports and knows what
 * typical constructs cost in LUTs, flip-flops, DSP slices, and logic depth.
 * Results are realistic enough to make design decisions; not a replacement for
 * Vivado/Quartus for final sign-off.
 */
export async function estimateSynthesis(
  design: ChipDesignData,
  hdlCode: string,
): Promise<SynthesisResult> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a senior FPGA engineer with deep knowledge of synthesis toolchains (Vivado, Quartus, Yosys). Given a Verilog HDL design, estimate its post-synthesis resource utilisation and timing on a Xilinx Artix-7 (xc7a35t) FPGA — which has 20,800 LUTs, 41,600 flip-flops, 90 DSP slices, and 50 BRAMs.

Analyse the HDL carefully:
- Count registers (always @(posedge clk) blocks) → flip-flops
- Count combinational logic (always @(*), assign) → LUTs
- Identify multipliers, MACs, large adders → DSP slices
- Identify memories, FIFOs, large arrays → BRAMs
- Trace the critical combinational path (LUT levels from input to output) → logicDepth
- Estimate Fmax from logicDepth (each LUT level costs ~0.3–0.5ns on Artix-7 at typical conditions, so Fmax = 1000 / (logicDepth * 0.4) MHz, capped at 450MHz)
- Calculate utilizationPercent as (lutCount / 20800) * 100

Be specific and realistic. A 4-bit adder uses ~4 LUTs. A 32-bit multiplier uses 3–4 DSP slices. A simple FSM with 4 states uses ~10–20 LUTs. A 256x8 register file uses ~16 BRAMs.

Flag specific concerns as warnings — e.g. "32-bit multiplier in module alu will consume 4 DSP slices and reduce Fmax to ~120MHz", "deep combinational chain of 18 LUT levels will limit Fmax to ~55MHz".

Write a plain-language summary (3–4 sentences) covering what the design synthesises to, the dominant resource, timing outlook, and whether it fits the Artix-7.

Respond with strict JSON:
{
  "targetDevice": "Xilinx Artix-7 (xc7a35t)",
  "lutCount": number,
  "flipFlopCount": number,
  "dspSlices": number,
  "bramBlocks": number,
  "estimatedFmaxMhz": number,
  "logicDepth": number,
  "utilizationPercent": number,
  "warnings": string[],
  "summary": string
}`,
      },
      {
        role: "user",
        content: JSON.stringify({ design, hdlCode }),
      },
    ],
  });

  const parsed = extractJson(response.choices[0]?.message?.content);
  const result = normalizeSynthesisResult(parsed);
  if (!result) {
    throw new Error("Synthesis estimation returned an unusable response from the AI.");
  }
  return result;
}

/**
 * Deterministic structural checks — never hallucinated, always computed
 * directly from the design graph.
 */
function runStructuralChecks(design: ChipDesignData): ValidationIssueData[] {
  const issues: ValidationIssueData[] = [];
  const componentIds = new Set(design.components.map((c) => c.id));
  const connectedIds = new Set<string>();

  for (const conn of design.connections) {
    connectedIds.add(conn.fromComponentId);
    connectedIds.add(conn.toComponentId);
    if (!componentIds.has(conn.fromComponentId)) {
      issues.push({
        severity: "error",
        message: `Connection "${conn.id}" references unknown source component "${conn.fromComponentId}".`,
        componentId: null,
      });
    }
    if (!componentIds.has(conn.toComponentId)) {
      issues.push({
        severity: "error",
        message: `Connection "${conn.id}" references unknown target component "${conn.toComponentId}".`,
        componentId: null,
      });
    }
  }

  for (const component of design.components) {
    if (!connectedIds.has(component.id)) {
      issues.push({
        severity: "warning",
        message: `Component "${component.label}" has no connections — its pins are unconnected.`,
        componentId: component.id,
      });
    }
  }

  // Bit-width mismatch checks between directly connected components.
  const byId = new Map(design.components.map((c) => [c.id, c]));
  for (const conn of design.connections) {
    const from = byId.get(conn.fromComponentId);
    const to = byId.get(conn.toComponentId);
    if (
      from?.bitWidth != null &&
      to?.bitWidth != null &&
      from.bitWidth !== to.bitWidth
    ) {
      issues.push({
        severity: "warning",
        message: `Bit-width mismatch: "${from.label}" (${from.bitWidth}-bit) connects to "${to.label}" (${to.bitWidth}-bit).`,
        componentId: conn.toComponentId,
      });
    }
  }

  // Missing clock/reset for sequential-sounding components.
  const sequentialTypes = ["register", "counter", "fsm", "memory"];
  const hasSequential = design.components.some((c) =>
    sequentialTypes.includes(c.type.toLowerCase()),
  );
  const hasClock = design.components.some((c) =>
    c.type.toLowerCase().includes("clock"),
  );
  if (hasSequential && !hasClock) {
    issues.push({
      severity: "error",
      message:
        "The design has sequential elements (registers/counters/memory) but no clock source component.",
      componentId: null,
    });
  }
  const hasResetProperty = design.components.some((c) =>
    Object.keys(c.properties ?? {}).some((k) => k.toLowerCase().includes("reset")),
  );
  if (hasSequential && !hasResetProperty) {
    issues.push({
      severity: "info",
      message:
        "No component declares a reset property — consider adding an explicit reset signal for sequential elements.",
      componentId: null,
    });
  }

  // Naming conflicts.
  const labelCounts = new Map<string, number>();
  for (const c of design.components) {
    labelCounts.set(c.label, (labelCounts.get(c.label) ?? 0) + 1);
  }
  for (const [label, count] of labelCounts) {
    if (count > 1) {
      issues.push({
        severity: "warning",
        message: `${count} components share the label "${label}" — consider renaming for clarity.`,
        componentId: null,
      });
    }
  }

  return issues;
}

export async function validateDesign(
  design: ChipDesignData,
): Promise<{ issues: ValidationIssueData[]; suggestions: string[] }> {
  const issues = runStructuralChecks(design);

  if (design.components.length === 0) {
    return {
      issues,
      suggestions: [
        "Start a conversation with the AI assistant to generate an initial architecture.",
      ],
    };
  }

  const response = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a digital design reviewer. Given a chip design (components + connections) and a list of structural issues already detected by deterministic checks, produce 3-6 concise, practical suggestions (plain language, one sentence each) for how to fix or improve the design. Do not repeat the issues verbatim — give actionable next steps. If there are no issues, suggest possible robustness or clarity improvements. Respond with strict JSON: { "suggestions": string[] }`,
      },
      {
        role: "user",
        content: JSON.stringify({ design, detectedIssues: issues }),
      },
    ],
  });

  const parsed = extractJson(response.choices[0]?.message?.content) as {
    suggestions?: string[];
  };

  return { issues, suggestions: parsed.suggestions ?? [] };
}
