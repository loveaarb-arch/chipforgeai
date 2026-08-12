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
const BOARD_H    = 5;        // PCB slab thickness
const CHIP_H     = 18;       // IC package height above board
const BOARD_PAD  = 80;       // padding around component bounding box

// Empty-state board (no components)
const EMPTY_BW   = 600;
const EMPTY_BD   = 400;

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
  // Discrete
  led:         '#c0392b',
  resistor:    '#9a7840',
  capacitor:   '#1e50a8',
  header_pin:  '#b08000',
  transistor:  '#505050',
  diode:       '#282828',
};

const SHORT: Record<string, string> = {
  logic_gate:'GATE', flip_flop:'FF', multiplexer:'MUX',
  alu:'ALU', register:'REG', memory:'RAM', clock:'CLK', io_port:'I/O',
  led:'LED', resistor:'R', capacitor:'C', header_pin:'HDR',
  transistor:'Q', diode:'D',
};

// Discrete types render differently in 3D
const DISCRETE_TYPES = new Set(['led','resistor','capacitor','header_pin','transistor','diode']);

// Per-type 3D heights
const DISCRETE_H: Record<string, number> = {
  led:        26,
  resistor:   10,
  capacitor:  30,
  header_pin: 16,
  transistor: 22,
  diode:       9,
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

function Board({ bw, bd }: { bw: number; bd: number }) {
  const bh    = BOARD_H;
  const top   = '#1a5c2a';
  const right = '#0e3a1a';
  const front = '#0b2d14';
  const engPad = Math.min(20, bw * 0.06, bd * 0.06);

  return (
    <>
      <Polygon points={polyPts([[0,0,0],[bw,0,0],[bw,0,bh],[0,0,bh]])}
        fill={front} stroke="#0a2510" strokeWidth={0.4} />
      <Polygon points={polyPts([[bw,0,0],[bw,bd,0],[bw,bd,bh],[bw,0,bh]])}
        fill={right} stroke="#0a2510" strokeWidth={0.4} />
      <Polygon points={polyPts([[0,0,bh],[bw,0,bh],[bw,bd,bh],[0,bd,bh]])}
        fill={top} stroke="#1e6830" strokeWidth={0.5} />
      <Polygon
        points={polyPts([
          [engPad,engPad,bh+0.1],[bw-engPad,engPad,bh+0.1],
          [bw-engPad,bd-engPad,bh+0.1],[engPad,bd-engPad,bh+0.1],
        ])}
        fill="none" stroke="#155020" strokeWidth={0.5} strokeDasharray="4,2"
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

// ─── Discrete component 3D package ───────────────────────────────────────────

function DiscretePkg({ comp }: { comp: ChipComponent }) {
  const { x, y, width: w, height: h, type } = comp;
  const accent = ACCENT[type] ?? '#607a96';
  const ch = DISCRETE_H[type] ?? CHIP_H;
  const bh = BOARD_H;
  const cx = x + w / 2;
  const cy = y + h / 2;

  // Shared box faces (same as ChipPackage but with custom height + colour)
  const front = polyPts([[x,   y, bh],[x+w, y, bh],[x+w, y, bh+ch],[x,   y, bh+ch]]);
  const right  = polyPts([[x+w, y, bh],[x+w, y+h, bh],[x+w, y+h, bh+ch],[x+w, y, bh+ch]]);
  const top    = polyPts([[x, y, bh+ch],[x+w, y, bh+ch],[x+w, y+h, bh+ch],[x, y+h, bh+ch]]);

  const topFill   = shade(accent, 0.7);
  const frontFill = shade(accent, 0.38);
  const rightFill = shade(accent, 0.52);

  const lp = iso(cx, cy, bh + ch + 0.5);

  // --- Type-specific top decorations ---
  const topDeco = (() => {
    if (type === 'led') {
      // Bright dome circle on top face
      const dp = iso(cx, cy, bh + ch + 0.3);
      return <Circle cx={dp.sx} cy={dp.sy} r={3.5} fill={accent} opacity={0.95} />;
    }
    if (type === 'resistor') {
      // Colour bands across top face
      const bands = ['#e8a010', '#303030', '#e8a010'];
      return (
        <>
          {bands.map((c, i) => {
            const bx = x + w * (0.25 + i * 0.25);
            const A = iso(bx,   y,   bh + ch + 0.2);
            const B = iso(bx,   y+h, bh + ch + 0.2);
            const C = iso(bx+4, y+h, bh + ch + 0.2);
            const D = iso(bx+4, y,   bh + ch + 0.2);
            return (
              <Polygon key={i}
                points={`${A.sx},${A.sy} ${B.sx},${B.sy} ${C.sx},${C.sy} ${D.sx},${D.sy}`}
                fill={c} opacity={0.85}
              />
            );
          })}
        </>
      );
    }
    if (type === 'capacitor') {
      // "+" marking on top
      const tp = iso(cx, cy, bh + ch + 0.3);
      return (
        <SvgText x={tp.sx} y={tp.sy} fontSize={6} fill="#d0e8ff"
          textAnchor="middle" fontWeight="bold">+</SvgText>
      );
    }
    if (type === 'header_pin') {
      // Grid of gold pin dots
      const cols = 4, rows = 2;
      const dots: React.ReactNode[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const px = x + (w / (cols + 1)) * (c + 1);
          const py = y + (h / (rows + 1)) * (r + 1);
          const dp = iso(px, py, bh + ch + 0.3);
          dots.push(
            <Circle key={`${r}-${c}`} cx={dp.sx} cy={dp.sy} r={1.4}
              fill="#d4a800" stroke="#806000" strokeWidth={0.3} />
          );
        }
      }
      return <>{dots}</>;
    }
    if (type === 'transistor') {
      // Silver heatsink tab on top
      const tw = w * 0.3, tx = cx - tw / 2;
      const A = iso(tx,    y,   bh + ch + 0.2);
      const B = iso(tx,    y+h, bh + ch + 0.2);
      const C = iso(tx+tw, y+h, bh + ch + 0.2);
      const D = iso(tx+tw, y,   bh + ch + 0.2);
      return (
        <Polygon
          points={`${A.sx},${A.sy} ${B.sx},${B.sy} ${C.sx},${C.sy} ${D.sx},${D.sy}`}
          fill="#c0c0c0" opacity={0.9}
        />
      );
    }
    // diode — anode/cathode bar
    if (type === 'diode') {
      const mp = iso(cx, cy, bh + ch + 0.3);
      return (
        <SvgText x={mp.sx} y={mp.sy} fontSize={4} fill="#d0d0d0"
          textAnchor="middle">▷|</SvgText>
      );
    }
    return null;
  })();

  return (
    <>
      {/* Solder pads */}
      {[[x + w * 0.3, y],[x + w * 0.7, y]].map(([px, py], i) => {
        const pp = iso(px, py, BOARD_H);
        return <Rect key={i} x={pp.sx - 2} y={pp.sy - 1} width={4} height={2} fill="#b08000" rx={0.5} />;
      })}
      <Polygon points={front} fill={frontFill} stroke="#000" strokeWidth={0.3} />
      <Polygon points={right}  fill={rightFill} stroke="#000" strokeWidth={0.3} />
      <Polygon points={top}    fill={topFill}   stroke={accent} strokeWidth={0.4} strokeOpacity={0.5} />
      {topDeco}
      {/* Label */}
      <SvgText x={lp.sx} y={lp.sy} fontSize={4} fontWeight="bold"
        textAnchor="middle" fill="#e0e8f0" fontFamily="monospace" opacity={0.85}>
        {SHORT[type] ?? type.slice(0,3).toUpperCase()}
      </SvgText>
    </>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyBoard() {
  const bw = EMPTY_BW, bd = EMPTY_BD;
  const c = iso(bw / 2, bd / 2, BOARD_H + 1);
  return (
    <>
      <Board bw={bw} bd={bd} />
      <SvgText x={c.sx} y={c.sy - 6} fontSize={5} fill="#2a7a3a"
        textAnchor="middle" fontFamily="monospace">NO COMPONENTS</SvgText>
      <SvgText x={c.sx} y={c.sy + 3} fontSize={3.5} fill="#1e5a2a"
        textAnchor="middle">Add chips in Parts panel or Chat</SvgText>
    </>
  );
}

// ─── Compute dynamic viewBox from component bounding box ─────────────────────

function computeScene(components: ChipDesign['components']) {
  if (components.length === 0) {
    // Empty board
    const bw = EMPTY_BW, bd = EMPTY_BD;
    const corners = [
      iso(0, 0, 0), iso(bw, 0, 0), iso(bw, bd, 0), iso(0, bd, 0),
      iso(0, 0, BOARD_H + CHIP_H), iso(bw, 0, BOARD_H + CHIP_H),
    ];
    const margin = 10;
    const sxMin = Math.min(...corners.map(p => p.sx)) - margin;
    const sxMax = Math.max(...corners.map(p => p.sx)) + margin;
    const syMin = Math.min(...corners.map(p => p.sy)) - margin;
    const syMax = Math.max(...corners.map(p => p.sy)) + margin;
    return { boardW: bw, boardD: bd, vbX: sxMin, vbY: syMin, vbW: sxMax - sxMin, vbH: syMax - syMin };
  }

  // Compute tight bounding box of all components
  const maxCompH = Math.max(CHIP_H, ...components.map(c =>
    DISCRETE_H[c.type] ?? CHIP_H
  ));
  const rawMaxX = Math.max(...components.map(c => c.x + c.width));
  const rawMaxY = Math.max(...components.map(c => c.y + c.height));
  const boardW  = rawMaxX + BOARD_PAD;
  const boardD  = rawMaxY + BOARD_PAD;

  // ISO extents of all 8 corners of the board volume
  const topZ = BOARD_H + maxCompH + 4;
  const corners = [
    iso(0, 0, 0), iso(boardW, 0, 0), iso(boardW, boardD, 0), iso(0, boardD, 0),
    iso(0, 0, topZ), iso(boardW, 0, topZ), iso(boardW, boardD, topZ), iso(0, boardD, topZ),
  ];
  const margin = 8;
  const sxMin = Math.min(...corners.map(p => p.sx)) - margin;
  const sxMax = Math.max(...corners.map(p => p.sx)) + margin;
  const syMin = Math.min(...corners.map(p => p.sy)) - margin;
  const syMax = Math.max(...corners.map(p => p.sy)) + margin;
  return { boardW, boardD, vbX: sxMin, vbY: syMin, vbW: sxMax - sxMin, vbH: syMax - syMin };
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

  // Dynamic board size + viewBox — recomputed whenever components change
  const scene = useMemo(() => computeScene(design.components), [design.components]);
  const { boardW, boardD, vbX, vbY, vbW, vbH } = scene;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>3D Viewer</Text>
        <Text style={styles.headerSub}>
          {design.components.length} components · {design.connections.length} nets
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
        <Svg
          viewBox={`${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}`}
          style={[styles.svg, { aspectRatio: vbW / vbH }]}
          preserveAspectRatio="xMidYMid meet"
        >
          <Defs>
            <LinearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#06090f" />
              <Stop offset="100%" stopColor="#0b1220" />
            </LinearGradient>
          </Defs>

          {/* Background */}
          <Rect x={vbX} y={vbY} width={vbW} height={vbH} fill="url(#skyGrad)" />

          {design.components.length === 0 ? (
            <EmptyBoard />
          ) : (
            <>
              {/* Board fitted to components */}
              <Board bw={boardW} bd={boardD} />

              {/* Copper traces on board surface */}
              {traces.map(t => (
                <CopperTrace key={t.id} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />
              ))}

              {/* IC packages + discrete components (back to front) */}
              {sorted.map(c =>
                DISCRETE_TYPES.has(c.type)
                  ? <DiscretePkg  key={c.id} comp={c} />
                  : <ChipPackage  key={c.id} comp={c} />
              )}
            </>
          )}
        </Svg>

        {/* Hint */}
        <Text style={styles.hint}>
          Isometric view • Components shown at actual canvas positions
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
