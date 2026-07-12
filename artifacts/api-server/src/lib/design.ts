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

export const REFUSAL_MESSAGE = "I can't assist with that type of design.";

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
- "explanation" is a short (2-4 sentence), plain-language summary of what you built or changed, written to the user.
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
