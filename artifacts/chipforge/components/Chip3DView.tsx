/**
 * Chip3DView — Isometric PCB "3D" visualizer.
 *
 * Renders the current ChipDesign as an isometric projection of a green PCB
 * board with 3D IC packages, gold copper traces, and solder-mask pads.
 * Pure SVG — no WebGL needed, works everywhere.
 */

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import type { ChipComponent, ChipDesign } from '@workspace/api-client-react';

// ─── Isometric constants ───────────────────────────────────────────────────────

const ISO_SCALE  = 0.08;     // design-px → ISO screen units
const COS30      = 0.866025;
const SIN30      = 0.5;
const BOARD_W    = 2400;     // matches DesignCanvasView CANVAS_SIZE
const BOARD_D    = 2400;
const BOARD_H    = 5;        // PCB slab thickness
const CHIP_H     = 18;       // IC package height above board

// SVG viewBox: computed from iso extents of the board corners
// iso(BOARD_W,0,*) → sx≈166  iso(0,BOARD_D,*) → sx≈-166
// iso(*,*,0) lowest y; iso(0,0,BOARD_H+CHIP_H) highest y ≈ -2
const VB_X = -175;
const VB_Y = -24;
const VB_W = 350;
const VB_H = 290;

// ─── Colour palettes ──────────────────────────────────────────────────────────

const ACCENT: Record<string, string> = {
  logic_gate:  '#2d8fa8',
  flip_flop:   '#a07820',
  multiplexer: '#7040a8',
  alu:         '#b03030',
  register:    '#1d8040',
  memory:      '#5040a0',
  clock:       '#2060a8',
  io_port:     '#1878a0',
};

const SHORT: Record<string, string> = {
  logic_gate:'GATE', flip_flop:'FF', multiplexer:'MUX',
  alu:'ALU', register:'REG', memory:'RAM', clock:'CLK', io_port:'I/O',
};

// ─── Isometric projection ─────────────────────────────────────────────────────

function iso(x: number, y: number, z: number) {
  return {
    sx: (x - y) * COS30 * ISO_SCALE,
    sy: ((x + y) * SIN30 - z) * ISO_SCALE,
  };
}

function pt(x: number, y: number, z: number): string {
  const p = iso(x, y, z);
  return `${p.sx.toFixed(2)},${p.sy.toFixed(2)}`;
}

function polyPts(corners: [number, number, number][]): string {
  return corners.map(([x, y, z]) => pt(x, y, z)).join(' ');
}

// Darken a hex colour by factor (0-1 = darker)
function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 0xff) * factor);
  const g = Math.round(((n >> 8)  & 0xff) * factor);
  const b = Math.round((n         & 0xff) * factor);
  return `rgb(${r},${g},${b})`;
}

// ─── Board component ──────────────────────────────────────────────────────────

function Board() {
  const bw = BOARD_W, bd = BOARD_D, bh = BOARD_H;
  const top   = '#1a5c2a';
  const right  = '#0e3a1a';   // x=bw face (right side)
  const front  = '#0b2d14';   // y=0 face (near side to viewer)

  return (
    <>
      {/* Front face (y=0, near to viewer) */}
      <Polygon
        points={polyPts([
          [0,  0, 0], [bw, 0, 0],
          [bw, 0, bh], [0, 0, bh],
        ])}
        fill={front} stroke="#0a2510" strokeWidth={0.4}
      />
      {/* Right face (x=bw) */}
      <Polygon
        points={polyPts([
          [bw, 0, 0], [bw, bd, 0],
          [bw, bd, bh], [bw, 0, bh],
        ])}
        fill={right} stroke="#0a2510" strokeWidth={0.4}
      />
      {/* Top face */}
      <Polygon
        points={polyPts([
          [0, 0, bh], [bw, 0, bh],
          [bw, bd, bh], [0, bd, bh],
        ])}
        fill={top} stroke="#1e6830" strokeWidth={0.5}
      />
      {/* Board outline engraving (subtle darker border on top) */}
      <Polygon
        points={polyPts([
          [30, 30, bh+0.1], [bw-30, 30, bh+0.1],
          [bw-30, bd-30, bh+0.1], [30, bd-30, bh+0.1],
        ])}
        fill="none" stroke="#155020" strokeWidth={0.6} strokeDasharray="6,3"
      />
    </>
  );
}

// ─── IC Package ───────────────────────────────────────────────────────────────

function ChipPackage({ comp }: { comp: ChipComponent }) {
  const { x, y, width: w, height: h } = comp;
  const accent = ACCENT[comp.type] ?? '#607a96';
  const label  = SHORT[comp.type]  ?? comp.type.slice(0, 4).toUpperCase();
  const bh = BOARD_H;
  const ch = CHIP_H;

  // Draw back-to-front: right face → front face → top face
  // Front face: y (near side)
  const front = polyPts([
    [x,   y, bh],    [x+w, y, bh],
    [x+w, y, bh+ch], [x,   y, bh+ch],
  ]);
  // Right face: x+w
  const right = polyPts([
    [x+w, y,   bh],    [x+w, y+h, bh],
    [x+w, y+h, bh+ch], [x+w, y,   bh+ch],
  ]);
  // Top face
  const top = polyPts([
    [x,   y,   bh+ch], [x+w, y,   bh+ch],
    [x+w, y+h, bh+ch], [x,   y+h, bh+ch],
  ]);

  // Label position (centre of top face in iso)
  const cx = x + w / 2, cy = y + h / 2;
  const lp = iso(cx, cy, bh + ch + 0.5);

  // Pad positions (gold SMD pads at corners of board footprint)
  const padPts: [number, number][] = [
    [x + w * 0.25, y], [x + w * 0.75, y],
    [x + w * 0.25, y + h], [x + w * 0.75, y + h],
  ];

  const topFill   = shade(accent, 0.55);
  const frontFill = shade(accent, 0.3);
  const rightFill = shade(accent, 0.4);

  return (
    <>
      {/* Solder pads on board */}
      {padPts.map(([px, py], i) => {
        const pp = iso(px, py, BOARD_H);
        return (
          <Rect
            key={i}
            x={pp.sx - 2} y={pp.sy - 1}
            width={4} height={2}
            fill="#b08000" rx={0.5}
          />
        );
      })}

      {/* Front face */}
      <Polygon points={front} fill={frontFill} stroke="#000" strokeWidth={0.3} />
      {/* Right face */}
      <Polygon points={right} fill={rightFill} stroke="#000" strokeWidth={0.3} />
      {/* Top face */}
      <Polygon points={top}   fill={topFill}   stroke={accent} strokeWidth={0.5} strokeOpacity={0.6} />

      {/* Notch indicator on top-front-left corner */}
      {(() => {
        const np = iso(x + 8, y + 4, bh + ch + 0.2);
        return <Circle cx={np.sx} cy={np.sy} r={1.5} fill="#ddd" opacity={0.7} />;
      })()}

      {/* Label on top face */}
      <SvgText
        x={lp.sx} y={lp.sy}
        fontSize={4.5} fontWeight="bold"
        textAnchor="middle" fill="#e0e8f0"
        fontFamily="monospace"
        opacity={0.9}
      >
        {label}
      </SvgText>
    </>
  );
}

// ─── Copper trace ─────────────────────────────────────────────────────────────

function CopperTrace({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const bh = BOARD_H;
  const A = iso(x1, y1, bh);
  const B = iso(x2, y2, bh);
  // Manhattan mid-point
  const mx = (x1 + x2) / 2;
  const M1 = iso(mx, y1, bh);
  const M2 = iso(mx, y2, bh);
  const d = `M ${A.sx.toFixed(1)} ${A.sy.toFixed(1)} L ${M1.sx.toFixed(1)} ${M1.sy.toFixed(1)} L ${M2.sx.toFixed(1)} ${M2.sy.toFixed(1)} L ${B.sx.toFixed(1)} ${B.sy.toFixed(1)}`;
  return (
    <>
      <Path d={d} stroke="#b08000" strokeWidth={1.5} fill="none" strokeOpacity={0.5} />
      <Path d={d} stroke="#d4a800" strokeWidth={0.6} fill="none" />
    </>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyBoard() {
  return (
    <>
      <Board />
      {/* Centred placeholder text on board top */}
      {(() => {
        const c = iso(BOARD_W / 2, BOARD_D / 2, BOARD_H + 1);
        return (
          <>
            <SvgText x={c.sx} y={c.sy - 8} fontSize={7} fill="#2a7a3a"
              textAnchor="middle" fontFamily="monospace">
              NO COMPONENTS
            </SvgText>
            <SvgText x={c.sx} y={c.sy + 2} fontSize={5} fill="#1e5a2a"
              textAnchor="middle">
              Add chips in Parts panel or Chat
            </SvgText>
          </>
        );
      })()}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Chip3DView({ design }: { design: ChipDesign }) {
  const byId = useMemo(() =>
    new Map(design.components.map(c => [c.id, c])),
    [design.components],
  );

  // Painter's algorithm: render back-to-front (smallest x+y = farthest from viewer)
  const sorted = useMemo(() =>
    [...design.components].sort((a, b) => (b.x + b.y) - (a.x + a.y)),
    [design.components],
  );

  // Trace endpoints (centre-right of source → centre-left of dest)
  const traces = useMemo(() =>
    design.connections
      .map(conn => {
        const from = byId.get(conn.fromComponentId);
        const to   = byId.get(conn.toComponentId);
        if (!from || !to) return null;
        return {
          id: conn.id,
          x1: from.x + from.width,
          y1: from.y + from.height / 2,
          x2: to.x,
          y2: to.y + to.height / 2,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null),
    [design.connections, byId],
  );

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>3D Viewer</Text>
        <Text style={styles.headerSub}>
          {design.components.length} ICs · {design.connections.length} nets
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
        <Svg
          viewBox={`${VB_X} ${VB_Y} ${VB_W} ${VB_H}`}
          style={styles.svg}
          preserveAspectRatio="xMidYMid meet"
        >
          <Defs>
            <LinearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#06090f" />
              <Stop offset="100%" stopColor="#0b1220" />
            </LinearGradient>
          </Defs>

          {/* Background */}
          <Rect x={VB_X} y={VB_Y} width={VB_W} height={VB_H} fill="url(#skyGrad)" />

          {design.components.length === 0 ? (
            <EmptyBoard />
          ) : (
            <>
              {/* Board */}
              <Board />

              {/* Copper traces on board surface */}
              {traces.map(t => (
                <CopperTrace key={t.id} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />
              ))}

              {/* IC packages (back to front) */}
              {sorted.map(c => (
                <ChipPackage key={c.id} comp={c} />
              ))}
            </>
          )}
        </Svg>

        {/* Legend */}
        <View style={styles.legend}>
          {Object.entries(ACCENT).map(([type, color]) => (
            <View key={type} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.legendTxt}>{SHORT[type]}</Text>
            </View>
          ))}
        </View>

        {/* Hint */}
        <Text style={styles.hint}>
          Isometric view • Edit components in the Build tab
        </Text>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#06090f',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a2840',
    backgroundColor: '#0d1525',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#c9d8eb',
    letterSpacing: 0.5,
  },
  headerSub: {
    fontSize: 10,
    color: '#4a6a8a',
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 24,
  },
  svg: {
    width: '100%',
    aspectRatio: VB_W / VB_H,
    maxWidth: 520,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  legendTxt: {
    fontSize: 9,
    color: '#4a6a8a',
    fontFamily: 'monospace',
  },
  hint: {
    fontSize: 9,
    color: '#2a4060',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
