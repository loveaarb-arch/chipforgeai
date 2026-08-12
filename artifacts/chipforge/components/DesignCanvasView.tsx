/**
 * DesignCanvasView — Professional PCB-editor-style canvas.
 *
 * Components render as realistic IC packages (rectangular body + pin stubs on
 * all four sides).  Connections route as Manhattan (90°) traces colour-coded
 * by signal class.  Glowing vias mark every connection point.  Detail level
 * scales with zoom: reference IDs always visible; pin names and part numbers
 * appear above ~120 %.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ScrollView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { ComponentEditModal } from '@/components/ComponentEditModal';
import type { ChipComponent, ChipDesign } from '@workspace/api-client-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const CANVAS_SIZE  = 2400;
const TAP_SLOP     = 4;
const GRID_SIZE    = 20;
const GRID_VIS     = 40;          // dots every 40 px
const PIN_LENGTH   = 10;          // stub length outside body
const PIN_SPACING  = 16;          // vertical pitch between pins
const BODY_PAD_X   = 12;
const BODY_PAD_Y   = 10;

// Signal-class colours (PCB convention) — muted to avoid toy-like look
const SIG = {
  data:    '#1d9e5a',   // muted green
  clock:   '#2d6fbd',   // muted blue
  power:   '#c0392b',   // muted red
  control: '#b8860b',   // muted gold
  misc:    '#607a96',   // slate
} as const;

// ─── Type metadata ────────────────────────────────────────────────────────────

interface TypeMeta {
  accentColor: string;
  sigClass:    keyof typeof SIG;
  short:       string;
  refPrefix:   string;
  inputs:      string[];
  outputs:     string[];
  topPins:     number;   // decorative pins on top/bottom for PCB look
  bottomPins:  number;
}

const TYPE_META: Record<string, TypeMeta> = {
  // ── Digital logic ────────────────────────────────────────────────────────
  logic_gate:  { accentColor:'#2d8fa8', sigClass:'data',    short:'GATE', refPrefix:'U',  inputs:['A','B'],                outputs:['Q'],       topPins:2, bottomPins:2 },
  flip_flop:   { accentColor:'#a07820', sigClass:'clock',   short:'FF',   refPrefix:'U',  inputs:['D','CLK','RST'],        outputs:['Q','~Q'],  topPins:2, bottomPins:2 },
  multiplexer: { accentColor:'#7040a8', sigClass:'data',    short:'MUX',  refPrefix:'U',  inputs:['A','B','SEL'],          outputs:['Y'],       topPins:2, bottomPins:1 },
  alu:         { accentColor:'#b03030', sigClass:'data',    short:'ALU',  refPrefix:'U',  inputs:['A','B','Op'],           outputs:['R','Cf'],  topPins:3, bottomPins:2 },
  register:    { accentColor:'#1d8040', sigClass:'data',    short:'REG',  refPrefix:'U',  inputs:['D','CLK','EN'],         outputs:['Q'],       topPins:2, bottomPins:2 },
  memory:      { accentColor:'#5040a0', sigClass:'data',    short:'MEM',  refPrefix:'U',  inputs:['ADDR','DI','WE','CLK'],outputs:['DO'],      topPins:4, bottomPins:3 },
  clock:       { accentColor:'#2060a8', sigClass:'clock',   short:'CLK',  refPrefix:'Y',  inputs:[],                      outputs:['CLK'],     topPins:1, bottomPins:1 },
  io_port:     { accentColor:'#1878a0', sigClass:'control', short:'I/O',  refPrefix:'J',  inputs:[],                      outputs:['IO'],      topPins:2, bottomPins:2 },
  // ── Discrete / through-hole ──────────────────────────────────────────────
  led:         { accentColor:'#c0392b', sigClass:'power',   short:'LED',  refPrefix:'D',  inputs:['A','K'],                outputs:[],          topPins:1, bottomPins:1 },
  resistor:    { accentColor:'#9a7840', sigClass:'misc',    short:'R',    refPrefix:'R',  inputs:['1'],                   outputs:['2'],       topPins:1, bottomPins:1 },
  capacitor:   { accentColor:'#2060c0', sigClass:'power',   short:'C',    refPrefix:'C',  inputs:['+'],                   outputs:['-'],       topPins:1, bottomPins:1 },
  header_pin:  { accentColor:'#b08000', sigClass:'misc',    short:'HDR',  refPrefix:'J',  inputs:[],                      outputs:[],          topPins:3, bottomPins:3 },
  transistor:  { accentColor:'#606060', sigClass:'control', short:'Q',    refPrefix:'Q',  inputs:['B'],                   outputs:['C','E'],   topPins:1, bottomPins:1 },
  diode:       { accentColor:'#383838', sigClass:'misc',    short:'D',    refPrefix:'D',  inputs:['A'],                   outputs:['K'],       topPins:1, bottomPins:1 },
};

function getMeta(type: string): TypeMeta {
  return TYPE_META[type] ?? {
    accentColor: '#8494b3', sigClass: 'misc', short: type.slice(0,4).toUpperCase(),
    refPrefix: 'U', inputs: ['IN'], outputs: ['OUT'], topPins: 1, bottomPins: 1,
  };
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

const GRID_DOTS: { cx: number; cy: number }[] = (() => {
  const d: { cx: number; cy: number }[] = [];
  for (let x = 0; x <= CANVAS_SIZE; x += GRID_VIS)
    for (let y = 0; y <= CANVAS_SIZE; y += GRID_VIS)
      d.push({ cx: x, cy: y });
  return d;
})();

function snap(v: number) { return Math.round(v / GRID_SIZE) * GRID_SIZE; }

// ─── Pin geometry helpers ─────────────────────────────────────────────────────

/**
 * Returns the absolute canvas coordinate of a named pin on a component.
 * Side: 'left' | 'right' | 'top' | 'bottom', index within that side.
 */
function pinPoint(c: ChipComponent, side: 'left'|'right', idx: number, total: number) {
  const stepY = c.height / (total + 1);
  const py = c.y + stepY * (idx + 1);
  return { x: side === 'left' ? c.x : c.x + c.width, y: py };
}

// ─── Manhattan trace router ───────────────────────────────────────────────────

/**
 * Produces an SVG path string for a Manhattan (orthogonal) route between two
 * points.  Uses a simple two-bend approach: exit horizontally, travel
 * vertically at the midpoint, enter horizontally.
 */
function manhattanPath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  if (Math.abs(y1 - y2) < 2) {
    // already horizontal
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  return `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`;
}

// ─── ComponentNode ────────────────────────────────────────────────────────────

function ComponentNode({
  component,
  refId,
  scale,
  onDragEnd,
  onPress,
}: {
  component: ChipComponent;
  refId:     string;
  scale:     number;
  onDragEnd: (id: string, x: number, y: number) => void;
  onPress:   (c: ChipComponent) => void;
}) {
  const meta  = getMeta(component.type);
  const color = meta.accentColor;

  const translateX = useSharedValue(component.x);
  const translateY = useSharedValue(component.y);
  const startX     = useSharedValue(component.x);
  const startY     = useSharedValue(component.y);
  const dragging   = useSharedValue(false);

  useEffect(() => {
    if (!dragging.value) {
      translateX.value = component.x;
      translateY.value = component.y;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [component.x, component.y]);

  const pan = Gesture.Pan()
    .minDistance(1)
    .onBegin(() => {
      dragging.value = true;
      startX.value   = translateX.value;
      startY.value   = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = startX.value + e.translationX / scale;
      translateY.value = startY.value + e.translationY / scale;
    })
    .onEnd((e) => {
      dragging.value = false;
      const moved = Math.abs(e.translationX) > TAP_SLOP || Math.abs(e.translationY) > TAP_SLOP;
      if (moved) {
        runOnJS(onDragEnd)(component.id, Math.round(translateX.value), Math.round(translateY.value));
      } else {
        runOnJS(onPress)(component);
      }
    })
    .onFinalize(() => { dragging.value = false; });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
    zIndex: dragging.value ? 10 : 1,
  }));

  const showDetail    = scale >= 1.2;
  const showPinNames  = scale >= 1.5;
  const inputCount    = meta.inputs.length  || 1;
  const outputCount   = meta.outputs.length || 1;
  const maxSidePins   = Math.max(inputCount, outputCount);

  // Body is sized to fit the pin count
  const bodyW = component.width;
  const bodyH = Math.max(component.height, (maxSidePins + 1) * PIN_SPACING + BODY_PAD_Y * 2);

  // Total node width includes pin stubs on both sides
  const nodeW = bodyW + PIN_LENGTH * 2;
  const nodeH = bodyH;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          pcbStyles.node,
          { width: nodeW, height: nodeH,
            // offset left so pin stubs don't shift the body
            marginLeft: -PIN_LENGTH, marginTop: 0 },
          animatedStyle,
          Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : undefined,
        ]}
      >
        {/* SVG overlay: pin stubs on left and right */}
        <Svg
          style={StyleSheet.absoluteFill}
          width={nodeW}
          height={nodeH}
          pointerEvents="none"
        >
          {/* Input pin stubs (left side) */}
          {meta.inputs.map((lbl, i) => {
            const py = (nodeH / (inputCount + 1)) * (i + 1);
            return (
              <React.Fragment key={`in-${i}`}>
                <Line
                  x1={0} y1={py} x2={PIN_LENGTH} y2={py}
                  stroke={color} strokeWidth={1.5}
                />
                <Circle cx={0} cy={py} r={2.5} fill={color} opacity={0.9} />
              </React.Fragment>
            );
          })}
          {/* Output pin stubs (right side) */}
          {meta.outputs.map((lbl, i) => {
            const py = (nodeH / (outputCount + 1)) * (i + 1);
            return (
              <React.Fragment key={`out-${i}`}>
                <Line
                  x1={nodeW - PIN_LENGTH} y1={py} x2={nodeW} y2={py}
                  stroke={color} strokeWidth={1.5}
                />
                <Circle cx={nodeW} cy={py} r={2.5} fill={color} opacity={0.9} />
              </React.Fragment>
            );
          })}
          {/* Top decorative pins */}
          {Array.from({ length: meta.topPins }).map((_, i) => {
            const px = PIN_LENGTH + BODY_PAD_X + ((bodyW - BODY_PAD_X * 2) / (meta.topPins + 1)) * (i + 1);
            return (
              <React.Fragment key={`top-${i}`}>
                <Line x1={px} y1={0} x2={px} y2={6} stroke={color} strokeWidth={1.2} opacity={0.5} />
                <Circle cx={px} cy={0} r={1.8} fill={color} opacity={0.4} />
              </React.Fragment>
            );
          })}
          {/* Bottom decorative pins */}
          {Array.from({ length: meta.bottomPins }).map((_, i) => {
            const px = PIN_LENGTH + BODY_PAD_X + ((bodyW - BODY_PAD_X * 2) / (meta.bottomPins + 1)) * (i + 1);
            return (
              <React.Fragment key={`bot-${i}`}>
                <Line x1={px} y1={nodeH} x2={px} y2={nodeH - 6} stroke={color} strokeWidth={1.2} opacity={0.5} />
                <Circle cx={px} cy={nodeH} r={1.8} fill={color} opacity={0.4} />
              </React.Fragment>
            );
          })}
        </Svg>

        {/* IC body */}
        <View
          style={[
            pcbStyles.icBody,
            {
              left:   PIN_LENGTH,
              width:  bodyW,
              height: bodyH,
              borderColor: color + '99',
              shadowColor: color,
            },
          ]}
        >
          {/* Notch (pin-1 indicator) */}
          <View style={[pcbStyles.notch, { borderColor: color + '60' }]} />

          {/* Reference designator — always visible */}
          <Text style={[pcbStyles.refId, { color: color }]}>{refId}</Text>

          {/* Type badge */}
          <View style={[pcbStyles.typeBadge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
            <Text style={[pcbStyles.typeText, { color }]}>{meta.short}</Text>
          </View>

          {/* Component label */}
          <Text style={pcbStyles.compLabel} numberOfLines={2}>{component.label}</Text>

          {/* Bit-width / detail — only when zoomed in */}
          {showDetail && component.bitWidth != null && (
            <Text style={[pcbStyles.partNum, { color: color + 'aa' }]}>
              [{component.bitWidth - 1}:0]
            </Text>
          )}

          {/* Pin name columns — only at high zoom */}
          {showPinNames && (
            <View style={pcbStyles.pinNameRow}>
              <View style={pcbStyles.pinNameCol}>
                {meta.inputs.map((lbl, i) => (
                  <Text key={i} style={[pcbStyles.pinName, { color: color + 'cc' }]}>{lbl}</Text>
                ))}
              </View>
              <View style={[pcbStyles.pinNameCol, { alignItems: 'flex-end' }]}>
                {meta.outputs.map((lbl, i) => (
                  <Text key={i} style={[pcbStyles.pinName, { color: color + 'cc' }]}>{lbl}</Text>
                ))}
              </View>
            </View>
          )}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nextId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

// ─── DesignCanvasView ─────────────────────────────────────────────────────────

interface Props {
  design:      ChipDesign;
  onChange:    (design: ChipDesign) => void;
  saving?:     boolean;
  grid?:       boolean;
  snap?:       boolean;
  darkCanvas?: boolean;
  hideToolbar?: boolean;
  externalScale?: number;
  onSelectComponent?: (id: string) => void;
  /** Set of layer IDs that are currently visible. Omit to show all. */
  visibleLayers?: Set<string>;
}

export function DesignCanvasView({
  design,
  onChange,
  saving,
  grid = true,
  snap: snapEnabled = true,
  darkCanvas = false,
  hideToolbar = false,
  externalScale,
  onSelectComponent,
  visibleLayers,
}: Props) {
  // Layer visibility helpers — defaults to showing everything when prop is omitted
  const layerOn = (id: string) => !visibleLayers || visibleLayers.has(id);
  const showComponents = layerOn('comp');
  const showTraces     = layerOn('topcu') || layerOn('botcu');
  const showVias       = layerOn('drill');
  const colors             = useColors();
  const [internalScale, setInternalScale] = useState(1);
  const scale = externalScale ?? internalScale;
  const setScale = (updater: number | ((s: number) => number)) => {
    if (externalScale === undefined) setInternalScale(updater as any);
  };
  const [editing, setEditing] = useState<ChipComponent | null>(null);

  // Reference designator map: component id → "U1", "Y2" etc.
  const refMap = useMemo(() => {
    const counters: Record<string, number> = {};
    const map = new Map<string, string>();
    for (const c of design.components) {
      const prefix = getMeta(c.type).refPrefix;
      counters[prefix] = (counters[prefix] ?? 0) + 1;
      map.set(c.id, `${prefix}${counters[prefix]}`);
    }
    return map;
  }, [design.components]);

  // ── Trace paths ────────────────────────────────────────────────────────────
  const traces = useMemo(() => {
    const byId = new Map(design.components.map(c => [c.id, c]));
    return design.connections
      .map(conn => {
        const from = byId.get(conn.fromComponentId);
        const to   = byId.get(conn.toComponentId);
        if (!from || !to) return null;

        const fromMeta = getMeta(from.type);
        const sigColor = SIG[fromMeta.sigClass];

        // Exit right-centre of source body; enter left-centre of dest body
        const x1 = from.x + from.width + PIN_LENGTH;
        const y1 = from.y + from.height / 2;
        const x2 = to.x - PIN_LENGTH;          // left pin of dest (pin stub end)
        const y2 = to.y + to.height / 2;

        return {
          id:    conn.id,
          d:     manhattanPath(x1, y1, x2, y2),
          color: sigColor,
          x1, y1, x2, y2,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
  }, [design]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const updatePosition = (id: string, x: number, y: number) => {
    const nx = snapEnabled ? snap(x) : x;
    const ny = snapEnabled ? snap(y) : y;
    onChange({ ...design, components: design.components.map(c => c.id === id ? { ...c, x: nx, y: ny } : c) });
  };

  const handleAdd = () => {
    const nc: ChipComponent = {
      id: nextId('comp'), type: 'register', label: 'New block',
      x: 80, y: 80, width: 130, height: 80, bitWidth: 8, properties: {},
    };
    onChange({ ...design, components: [...design.components, nc] });
    setEditing(nc);
  };

  const handleSave = (updated: ChipComponent) => {
    onChange({ ...design, components: design.components.map(c => c.id === updated.id ? updated : c) });
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    onChange({
      components:  design.components.filter(c => c.id !== id),
      connections: design.connections.filter(c => c.fromComponentId !== id && c.toComponentId !== id),
    });
    setEditing(null);
  };

  // ── Theme ──────────────────────────────────────────────────────────────────
  const canvasBg      = '#06090f';
  const gridDotColor  = 'rgba(0,200,180,0.18)';
  const toolbarBg     = '#0d1117';
  const toolbarBorder = '#1a2535';
  const fgColor       = '#c9d8eb';
  const mutedColor    = '#3a5570';

  return (
    <View style={[pcbStyles.root, { backgroundColor: canvasBg },
      Platform.OS === 'web' ? ({ cursor: 'crosshair' } as object) : undefined]}>

      {/* Toolbar */}
      {!hideToolbar && (
        <View style={[pcbStyles.toolbar, { borderBottomColor: toolbarBorder, backgroundColor: toolbarBg }]}>
          <Pressable onPress={handleAdd} style={[pcbStyles.toolbarBtn, { backgroundColor: colors.primary }]}>
            <Feather name="plus" size={14} color={colors.primaryForeground} />
            <Text style={[pcbStyles.toolbarBtnText, { color: colors.primaryForeground }]}>Place</Text>
          </Pressable>
          <View style={pcbStyles.zoomGroup}>
            <Pressable
              onPress={() => setScale(s => Math.max(0.3, Math.round((s - 0.15) * 100) / 100))}
              style={[pcbStyles.zoomBtn, { borderColor: toolbarBorder }]}
            >
              <Feather name="minus" size={13} color={fgColor} />
            </Pressable>
            <Text style={[pcbStyles.zoomLabel, { color: mutedColor }]}>{Math.round(scale * 100)}%</Text>
            <Pressable
              onPress={() => setScale(s => Math.min(2.5, Math.round((s + 0.15) * 100) / 100))}
              style={[pcbStyles.zoomBtn, { borderColor: toolbarBorder }]}
            >
              <Feather name="plus" size={13} color={fgColor} />
            </Pressable>
          </View>
          {saving && <Text style={{ color: mutedColor, fontSize: 11 }}>Saving…</Text>}
          <Text style={[pcbStyles.componentCount, { color: mutedColor }]}>
            {design.components.length} ICs · {design.connections.length} nets
          </Text>
        </View>
      )}

      {/* Canvas */}
      <ScrollView style={{ flex: 1 }}>
        <ScrollView horizontal>
          <View style={{ width: CANVAS_SIZE * scale, height: CANVAS_SIZE * scale }}>
            <View style={{
              width: CANVAS_SIZE, height: CANVAS_SIZE,
              backgroundColor: canvasBg,
              transform: [{ scale }], transformOrigin: '0 0',
            }}>

              {/* SVG: grid + traces + vias */}
              <Svg style={StyleSheet.absoluteFill} width={CANVAS_SIZE} height={CANVAS_SIZE}>
                <Defs>
                  {/* Via glow gradients — one per signal colour */}
                  {Object.entries(SIG).map(([k, c]) => (
                    <RadialGradient key={k} id={`via-${k}`} cx="50%" cy="50%" r="50%">
                      <Stop offset="0%"   stopColor={c} stopOpacity="1" />
                      <Stop offset="60%"  stopColor={c} stopOpacity="0.5" />
                      <Stop offset="100%" stopColor={c} stopOpacity="0" />
                    </RadialGradient>
                  ))}
                </Defs>

                {/* Grid dots */}
                {grid && GRID_DOTS.map(({ cx, cy }) => (
                  <Circle key={`g-${cx}-${cy}`} cx={cx} cy={cy} r={0.8} fill={gridDotColor} />
                ))}

                {/* Traces */}
                {showTraces && traces.map(w => (
                  <React.Fragment key={w.id}>
                    {/* Glow halo */}
                    <Path d={w.d} stroke={w.color} strokeWidth={4} fill="none" strokeOpacity={0.15} strokeLinecap="square" />
                    {/* Main trace */}
                    <Path d={w.d} stroke={w.color} strokeWidth={1.5} fill="none" strokeLinecap="square" />
                    {/* Vias at endpoints */}
                    {showVias && <>
                      <Circle cx={w.x1} cy={w.y1} r={9} fill={`url(#via-${traceKey(w.color)})`} />
                      <Circle cx={w.x1} cy={w.y1} r={3.5} fill={w.color} />
                      <Circle cx={w.x1} cy={w.y1} r={1.5} fill="#fff" opacity={0.8} />
                      <Circle cx={w.x2} cy={w.y2} r={9} fill={`url(#via-${traceKey(w.color)})`} />
                      <Circle cx={w.x2} cy={w.y2} r={3.5} fill={w.color} />
                      <Circle cx={w.x2} cy={w.y2} r={1.5} fill="#fff" opacity={0.8} />
                    </>}
                  </React.Fragment>
                ))}
              </Svg>

              {/* Empty state */}
              {design.components.length === 0 && (
                <View style={pcbStyles.emptyState}>
                  <Feather name="cpu" size={36} color="#1a3a5a" />
                  <Text style={pcbStyles.emptyText}>
                    Describe a chip in Chat, or tap components in the Build tab to place them here.
                  </Text>
                </View>
              )}

              {/* IC packages */}
              {showComponents && design.components.map(c => (
                <ComponentNode
                  key={c.id}
                  component={c}
                  refId={refMap.get(c.id) ?? 'U?'}
                  scale={scale}
                  onDragEnd={updatePosition}
                  onPress={comp => { setEditing(comp); onSelectComponent?.(comp.id); }}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      </ScrollView>

      <ComponentEditModal
        visible={!!editing}
        component={editing}
        onClose={() => setEditing(null)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </View>
  );
}

/** Map a hex colour back to a SIG key for gradient IDs */
function traceKey(color: string): string {
  for (const [k, v] of Object.entries(SIG)) { if (v === color) return k; }
  return 'misc';
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const pcbStyles = StyleSheet.create({
  root: { flex: 1 },

  // Toolbar
  toolbar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8, gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbarBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  toolbarBtnText: { fontSize: 12, fontWeight: '600' },
  zoomGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zoomBtn: { borderWidth: 1, borderRadius: 7, padding: 6 },
  zoomLabel: { fontSize: 11, minWidth: 34, textAlign: 'center' },
  componentCount: { fontSize: 11, marginLeft: 'auto' },

  // Component node wrapper (transparent — just for gesture + positioning)
  node: { position: 'absolute' },

  // IC body
  icBody: {
    position:        'absolute',
    top:             0,
    borderWidth:     1,
    borderRadius:    2,
    backgroundColor: '#08111e',
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: BODY_PAD_X,
    paddingVertical:   BODY_PAD_Y,
    gap:             3,
    shadowOpacity:   0.25,
    shadowRadius:    6,
    shadowOffset:    { width: 0, height: 0 },
    overflow:        'hidden',
  },

  // Notch (pin-1 corner indicator)
  notch: {
    position:     'absolute',
    top:          3,
    left:         3,
    width:        8,
    height:       8,
    borderRadius: 4,
    borderWidth:  1,
  },

  // Reference designator
  refId: {
    fontSize: 8, fontWeight: '700',
    fontFamily: 'monospace', letterSpacing: 0.5,
    alignSelf: 'flex-start',
    marginTop: 2,
  },

  // Type badge
  typeBadge: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1 },
  typeText:  { fontSize: 7, fontWeight: '700', letterSpacing: 1 },

  // Component name
  compLabel: { fontSize: 10, fontWeight: '600', color: '#d0e0f0', textAlign: 'center' },

  // Part number / bit-width
  partNum: { fontSize: 7, fontFamily: 'monospace' },

  // Pin name layout
  pinNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 2,
  },
  pinNameCol: { gap: 2 },
  pinName:    { fontSize: 7, fontFamily: 'monospace', letterSpacing: 0.2 },

  // Empty state
  emptyState: { position: 'absolute', top: 80, left: 40, right: 40, alignItems: 'center', gap: 14 },
  emptyText:  { fontSize: 13, textAlign: 'center', lineHeight: 20, color: '#1a3a5a' },
});
