/**
 * DesignCanvasView — vibrant EDA-style canvas.
 *
 * Every component type gets its own accent colour, a left stripe, labelled
 * pin indicators, and a type badge. Connections are smooth bezier curves
 * coloured by the source component type, with junction dots at each end.
 * A dot grid and snap-to-grid are driven by parent-controlled props.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScrollView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { ComponentEditModal } from '@/components/ComponentEditModal';
import type { ChipComponent, ChipDesign } from '@workspace/api-client-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const CANVAS_SIZE = 2400;
const TAP_SLOP    = 4;
const GRID_SIZE   = 20;
const GRID_VIS    = 40;

// ─── Type metadata ────────────────────────────────────────────────────────────

interface TypeMeta {
  color:   string;
  short:   string;
  inputs:  string[];
  outputs: string[];
}

const TYPE_META: Record<string, TypeMeta> = {
  logic_gate:  { color: '#818cf8', short: 'GATE', inputs: ['A','B'],                outputs: ['Q']      },
  flip_flop:   { color: '#22d3ee', short: 'FF',   inputs: ['D','CLK','RST'],        outputs: ['Q','~Q'] },
  multiplexer: { color: '#fb923c', short: 'MUX',  inputs: ['A','B','SEL'],          outputs: ['Y']      },
  alu:         { color: '#f59e0b', short: 'ALU',  inputs: ['A','B','Op'],           outputs: ['R','Cf'] },
  register:    { color: '#34d399', short: 'REG',  inputs: ['D','CLK','EN'],         outputs: ['Q']      },
  memory:      { color: '#a78bfa', short: 'MEM',  inputs: ['ADDR','DI','WE','CLK'], outputs: ['DO']     },
  clock:       { color: '#fb7185', short: 'CLK',  inputs: [],                       outputs: ['CLK']    },
  io_port:     { color: '#38bdf8', short: 'I/O',  inputs: [],                       outputs: ['IO']     },
};

function getTypeMeta(type: string): TypeMeta {
  return (
    TYPE_META[type] ??
    { color: '#8494b3', short: type.slice(0, 4).toUpperCase(), inputs: ['A'], outputs: ['Q'] }
  );
}

// ─── Grid helpers ─────────────────────────────────────────────────────────────

function snapToGrid(v: number) {
  return Math.round(v / GRID_SIZE) * GRID_SIZE;
}

/** Pre-built dot positions — same every render, so computed once at module load */
const GRID_DOTS: { cx: number; cy: number }[] = (() => {
  const dots: { cx: number; cy: number }[] = [];
  for (let x = 0; x <= CANVAS_SIZE; x += GRID_VIS)
    for (let y = 0; y <= CANVAS_SIZE; y += GRID_VIS)
      dots.push({ cx: x, cy: y });
  return dots;
})();

// ─── ComponentNode ────────────────────────────────────────────────────────────

function ComponentNode({
  component,
  scale,
  onDragEnd,
  onPress,
}: {
  component: ChipComponent;
  scale:     number;
  onDragEnd: (id: string, x: number, y: number) => void;
  onPress:   (c: ChipComponent) => void;
}) {
  const meta  = getTypeMeta(component.type);
  const color = meta.color;

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
      const moved =
        Math.abs(e.translationX) > TAP_SLOP || Math.abs(e.translationY) > TAP_SLOP;
      if (moved) {
        runOnJS(onDragEnd)(
          component.id,
          Math.round(translateX.value),
          Math.round(translateY.value),
        );
      } else {
        runOnJS(onPress)(component);
      }
    })
    .onFinalize(() => { dragging.value = false; });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
    zIndex: dragging.value ? 10 : 1,
  }));

  // Show pin details only when there's enough room
  const showPins      = component.height >= 50;
  const showPinLabels = component.height >= 64 && component.width >= 110;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          styles.node,
          { width: component.width, height: component.height, borderColor: color + '80' },
          animatedStyle,
        ]}
      >
        {/* Left accent stripe */}
        <View style={[styles.nodeStripe, { backgroundColor: color }]} />

        {/* Three-column layout: input pins | center content | output pins */}
        <View style={styles.nodeRow}>

          {/* Input pins */}
          {showPins && meta.inputs.length > 0 && (
            <View style={styles.pinsCol}>
              {meta.inputs.map((lbl, i) => (
                <View key={i} style={styles.pinRowLeft}>
                  <View style={[styles.pinDot, { backgroundColor: color }]} />
                  {showPinLabels && (
                    <Text style={[styles.pinLabel, { color: color + 'bb' }]} numberOfLines={1}>
                      {lbl}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Centre: type badge + label + bit-width */}
          <View style={styles.nodeCenter}>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: color + '22', borderColor: color + '55' },
              ]}
            >
              <Text style={[styles.typeText, { color }]}>{meta.short}</Text>
            </View>
            <Text style={styles.nodeLabel} numberOfLines={2}>
              {component.label}
            </Text>
            {component.bitWidth != null && (
              <Text style={[styles.bitWidth, { color: color + 'aa' }]}>
                [{component.bitWidth - 1}:0]
              </Text>
            )}
          </View>

          {/* Output pins */}
          {showPins && meta.outputs.length > 0 && (
            <View style={[styles.pinsCol, { alignItems: 'flex-end' }]}>
              {meta.outputs.map((lbl, i) => (
                <View key={i} style={styles.pinRowRight}>
                  {showPinLabels && (
                    <Text style={[styles.pinLabel, { color: color + 'bb' }]} numberOfLines={1}>
                      {lbl}
                    </Text>
                  )}
                  <View style={[styles.pinDot, { backgroundColor: color }]} />
                </View>
              ))}
            </View>
          )}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function nextId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

// ─── DesignCanvasView ─────────────────────────────────────────────────────────

interface Props {
  design:   ChipDesign;
  onChange: (design: ChipDesign) => void;
  saving?:  boolean;
  grid?:    boolean;
  snap?:    boolean;
}

export function DesignCanvasView({
  design,
  onChange,
  saving,
  grid = true,
  snap = true,
}: Props) {
  const colors              = useColors();
  const [scale, setScale]   = useState(1);
  const [editing, setEditing] = useState<ChipComponent | null>(null);

  // ── Bezier wire paths ──────────────────────────────────────────────────────
  const wirePaths = useMemo(() => {
    const byId = new Map(design.components.map((c) => [c.id, c]));
    return design.connections
      .map((conn) => {
        const from = byId.get(conn.fromComponentId);
        const to   = byId.get(conn.toComponentId);
        if (!from || !to) return null;

        // Exit the right-centre of source; enter the left-centre of destination
        const x1 = from.x + from.width;
        const y1 = from.y + from.height / 2;
        const x2 = to.x;
        const y2 = to.y + to.height / 2;

        // Horizontal control-point offset — tighter for close pairs, wider for far ones
        const ctrl = Math.max(55, Math.abs(x2 - x1) * 0.42);

        return {
          id:    conn.id,
          d:     `M ${x1} ${y1} C ${x1 + ctrl} ${y1} ${x2 - ctrl} ${y2} ${x2} ${y2}`,
          color: getTypeMeta(from.type).color,
          x1, y1, x2, y2,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
  }, [design]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const updateComponentPosition = (id: string, x: number, y: number) => {
    const nx = snap ? snapToGrid(x) : x;
    const ny = snap ? snapToGrid(y) : y;
    onChange({
      ...design,
      components: design.components.map((c) => (c.id === id ? { ...c, x: nx, y: ny } : c)),
    });
  };

  const handleAddComponent = () => {
    const newComponent: ChipComponent = {
      id:         nextId('comp'),
      type:       'register',
      label:      'New block',
      x:          80,
      y:          80,
      width:      150,
      height:     88,
      bitWidth:   8,
      properties: {},
    };
    onChange({ ...design, components: [...design.components, newComponent] });
    setEditing(newComponent);
  };

  const handleSaveComponent = (updated: ChipComponent) => {
    onChange({
      ...design,
      components: design.components.map((c) => (c.id === updated.id ? updated : c)),
    });
    setEditing(null);
  };

  const handleDeleteComponent = (id: string) => {
    onChange({
      components:  design.components.filter((c) => c.id !== id),
      connections: design.connections.filter(
        (conn) => conn.fromComponentId !== id && conn.toComponentId !== id,
      ),
    });
    setEditing(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* Toolbar */}
      <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={handleAddComponent}
          style={[styles.toolbarBtn, { backgroundColor: colors.primary }]}
        >
          <Feather name="plus" size={14} color={colors.primaryForeground} />
          <Text style={[styles.toolbarBtnText, { color: colors.primaryForeground }]}>
            Add block
          </Text>
        </Pressable>

        <View style={styles.zoomGroup}>
          <Pressable
            onPress={() => setScale((s) => Math.max(0.3, Math.round((s - 0.15) * 100) / 100))}
            style={[styles.zoomBtn, { borderColor: colors.border }]}
          >
            <Feather name="minus" size={13} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.zoomLabel, { color: colors.mutedForeground }]}>
            {Math.round(scale * 100)}%
          </Text>
          <Pressable
            onPress={() => setScale((s) => Math.min(2.5, Math.round((s + 0.15) * 100) / 100))}
            style={[styles.zoomBtn, { borderColor: colors.border }]}
          >
            <Feather name="plus" size={13} color={colors.foreground} />
          </Pressable>
        </View>

        {saving && (
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Saving…</Text>
        )}

        <Text style={[styles.componentCount, { color: colors.mutedForeground }]}>
          {design.components.length} block{design.components.length !== 1 ? 's' : ''} ·{' '}
          {design.connections.length} wire{design.connections.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Scrollable canvas */}
      <ScrollView style={{ flex: 1 }}>
        <ScrollView horizontal>
          <View style={{ width: CANVAS_SIZE * scale, height: CANVAS_SIZE * scale }}>
            <View
              style={{
                width:           CANVAS_SIZE,
                height:          CANVAS_SIZE,
                transform:       [{ scale }],
                transformOrigin: '0 0',
              }}
            >
              {/* SVG layer: grid dots + bezier wires */}
              <Svg
                style={StyleSheet.absoluteFill}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
              >
                {/* Dot grid */}
                {grid &&
                  GRID_DOTS.map(({ cx, cy }) => (
                    <Circle key={`g-${cx}-${cy}`} cx={cx} cy={cy} r={1} fill={colors.border} />
                  ))}

                {/* Bezier connections */}
                {wirePaths.map((w) => (
                  <React.Fragment key={w.id}>
                    <Path
                      d={w.d}
                      stroke={w.color}
                      strokeWidth={1.5}
                      fill="none"
                      strokeLinecap="round"
                    />
                    {/* Junction dots at both ends */}
                    <Circle cx={w.x1} cy={w.y1} r={3.5} fill={w.color} />
                    <Circle cx={w.x2} cy={w.y2} r={3.5} fill={w.color} />
                  </React.Fragment>
                ))}
              </Svg>

              {/* Empty-state hint */}
              {design.components.length === 0 && (
                <View style={styles.emptyState}>
                  <Feather name="cpu" size={36} color={colors.mutedForeground} />
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                    Describe a chip in Chat, or tap components in the Build tab to place them here.
                  </Text>
                </View>
              )}

              {/* Component nodes */}
              {design.components.map((c) => (
                <ComponentNode
                  key={c.id}
                  component={c}
                  scale={scale}
                  onDragEnd={updateComponentPosition}
                  onPress={setEditing}
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
        onSave={handleSaveComponent}
        onDelete={handleDeleteComponent}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  toolbar: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: 12,
    paddingVertical:   8,
    gap:            10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbarBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
  },
  toolbarBtnText: { fontSize: 12, fontWeight: '600' },
  zoomGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zoomBtn: { borderWidth: 1, borderRadius: 7, padding: 6 },
  zoomLabel: { fontSize: 11, minWidth: 34, textAlign: 'center' },
  componentCount: { fontSize: 11, marginLeft: 'auto' },

  // ── Node ──────────────────────────────────────────────────────────────────
  node: {
    position:        'absolute',
    borderWidth:     1.5,
    borderRadius:    10,
    backgroundColor: '#0d1829',
    overflow:        'hidden',
  },
  nodeStripe: {
    position: 'absolute',
    left:     0,
    top:      0,
    bottom:   0,
    width:    4,
    zIndex:   1,
  },
  nodeRow: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    paddingLeft:    12,   // clears the stripe
    paddingRight:   6,
    paddingVertical: 6,
    gap:            4,
  },

  // Pins
  pinsCol: {
    flexShrink:     0,
    gap:            5,
    justifyContent: 'space-around',
    alignSelf:      'stretch',
  },
  pinRowLeft:  { flexDirection: 'row',         alignItems: 'center', gap: 3 },
  pinRowRight: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3 },
  pinDot:  { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  pinLabel:{ fontSize: 8, letterSpacing: 0.3, flexShrink: 1 },

  // Centre content
  nodeCenter: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    gap:             3,
    paddingHorizontal: 2,
  },
  typeBadge: {
    borderWidth: 1, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  typeText:  { fontSize: 8, fontWeight: '700', letterSpacing: 1 },
  nodeLabel: {
    fontSize: 11, fontWeight: '600',
    color: '#e6edf5', textAlign: 'center',
  },
  bitWidth: { fontSize: 8 },

  // Empty state
  emptyState: {
    position:  'absolute',
    top:       80,
    left:      40,
    right:     40,
    alignItems: 'center',
    gap:        14,
  },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
