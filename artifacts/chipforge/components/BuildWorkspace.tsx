/**
 * BuildWorkspace — KiCad-style split layout.
 *
 * Left:  black grid canvas (DesignCanvasView in darkCanvas mode, flex: 1)
 * Right: white EDA panel (~148 px) — Layers, Components, Design, Properties
 */

import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { DesignCanvasView } from '@/components/DesignCanvasView';
import type { ChipComponent, ChipDesign } from '@workspace/api-client-react';

// ─── Palette colours (used only in the right panel) ───────────────────────────

const TYPE_COLOR: Record<string, string> = {
  logic_gate:  '#818cf8',
  flip_flop:   '#22d3ee',
  multiplexer: '#fb923c',
  alu:         '#f59e0b',
  register:    '#34d399',
  memory:      '#a78bfa',
  clock:       '#fb7185',
  io_port:     '#38bdf8',
};

// ─── DRC / ERC / Auto-Route ───────────────────────────────────────────────────

function runDRC(design: ChipDesign): string {
  const issues: string[] = [];
  const connectedIds = new Set([
    ...design.connections.map((c) => c.fromComponentId),
    ...design.connections.map((c) => c.toComponentId),
  ]);
  for (const c of design.components)
    if (!connectedIds.has(c.id))
      issues.push(`⚠ "${c.label}" — floating (no connections)`);
  const seqTypes = ['flip_flop', 'register', 'memory'];
  for (const c of design.components)
    if (seqTypes.includes(c.type) && !design.connections.some((cn) => cn.toComponentId === c.id))
      issues.push(`⚠ "${c.label}" has no inputs — needs CLK`);
  if (design.components.length > 0 && !design.components.some((c) => c.type === 'io_port'))
    issues.push('⚠ No I/O port found — add input/output pins');
  return issues.length === 0
    ? '✓ No DRC violations.\n\nAll structural checks passed.'
    : `Found ${issues.length} issue${issues.length > 1 ? 's' : ''}:\n\n${issues.join('\n\n')}`;
}

function runERC(design: ChipDesign): string {
  const issues: string[] = [];
  const byId = new Map(design.components.map((c) => [c.id, c]));
  const fanOut = new Map<string, number>();
  for (const conn of design.connections)
    fanOut.set(conn.fromComponentId, (fanOut.get(conn.fromComponentId) ?? 0) + 1);
  fanOut.forEach((count, id) => {
    if (count > 4) {
      const comp = byId.get(id);
      if (comp) issues.push(`⚠ "${comp.label}" drives ${count} loads — high fan-out`);
    }
  });
  const fwdMap = new Map<string, Set<string>>();
  for (const conn of design.connections) {
    if (!fwdMap.has(conn.fromComponentId)) fwdMap.set(conn.fromComponentId, new Set());
    fwdMap.get(conn.fromComponentId)!.add(conn.toComponentId);
  }
  for (const [from, tos] of fwdMap)
    for (const to of tos)
      if (fwdMap.get(to)?.has(from))
        issues.push(`⚠ Loop: "${byId.get(from)?.label}" ↔ "${byId.get(to)?.label}"`);
  if (design.components.length > 1 && design.connections.length === 0)
    issues.push('⚠ No wires — all components are unconnected');
  return issues.length === 0
    ? '✓ No ERC violations.\n\nAll electrical checks passed.'
    : `Found ${issues.length} issue${issues.length > 1 ? 's' : ''}:\n\n${issues.join('\n\n')}`;
}

function autoRoute(design: ChipDesign): ChipDesign {
  if (design.components.length === 0) return design;
  const inDeg = new Map<string, number>(design.components.map((c) => [c.id, 0]));
  const outEdges = new Map<string, string[]>(design.components.map((c) => [c.id, []]));
  for (const conn of design.connections) {
    inDeg.set(conn.toComponentId, (inDeg.get(conn.toComponentId) ?? 0) + 1);
    outEdges.get(conn.fromComponentId)?.push(conn.toComponentId);
  }
  const layers: string[][] = [];
  const visited = new Set<string>();
  let queue = [...inDeg.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  while (queue.length > 0) {
    layers.push(queue);
    queue.forEach((id) => visited.add(id));
    const next: string[] = [];
    for (const id of queue)
      for (const nb of outEdges.get(id) ?? []) {
        const nd = (inDeg.get(nb) ?? 1) - 1;
        inDeg.set(nb, nd);
        if (nd === 0 && !visited.has(nb)) next.push(nb);
      }
    queue = next;
  }
  const unvisited = design.components.map((c) => c.id).filter((id) => !visited.has(id));
  if (unvisited.length > 0) layers.push(unvisited);
  const byId = new Map(design.components.map((c) => [c.id, c]));
  const PAD_X = 60, PAD_Y = 36;
  const newPos = new Map<string, { x: number; y: number }>();
  let x = PAD_X;
  for (const layer of layers) {
    const layerW = Math.max(...layer.map((id) => byId.get(id)?.width ?? 140));
    let y = PAD_Y;
    for (const id of layer) {
      newPos.set(id, { x, y });
      y += (byId.get(id)?.height ?? 80) + PAD_Y;
    }
    x += layerW + PAD_X + 80;
  }
  return {
    ...design,
    components: design.components.map((c) => {
      const pos = newPos.get(c.id);
      return pos ? { ...c, x: pos.x, y: pos.y } : c;
    }),
  };
}

// ─── Layer data ───────────────────────────────────────────────────────────────

interface Layer { id: string; name: string; color: string; visible: boolean }
const DEFAULT_LAYERS: Layer[] = [
  { id: 'metal1',  name: 'Metal 1',     color: '#22d3ee', visible: true  },
  { id: 'metal2',  name: 'Metal 2',     color: '#818cf8', visible: true  },
  { id: 'poly',    name: 'Poly',        color: '#f59e0b', visible: true  },
  { id: 'ndiff',   name: 'N-Diff',      color: '#34d399', visible: true  },
  { id: 'pdiff',   name: 'P-Diff',      color: '#fb7185', visible: false },
  { id: 'contact', name: 'Contact',     color: '#a3a3a3', visible: true  },
];

// ─── Component palette data ───────────────────────────────────────────────────

interface CompDef {
  type: ChipComponent['type'];
  label: string;
  symbol: string;
  w: number; h: number;
  bits: number | null;
}
const COMP_DEFS: CompDef[] = [
  { type: 'logic_gate',  label: 'AND',     symbol: '&',    w: 80,  h: 56,  bits: 1 },
  { type: 'logic_gate',  label: 'OR',      symbol: '≥1',   w: 80,  h: 56,  bits: 1 },
  { type: 'logic_gate',  label: 'XOR',     symbol: '=1',   w: 80,  h: 56,  bits: 1 },
  { type: 'logic_gate',  label: 'NOT',     symbol: '1̄',   w: 64,  h: 48,  bits: 1 },
  { type: 'logic_gate',  label: 'NAND',    symbol: '&̄',   w: 80,  h: 56,  bits: 1 },
  { type: 'logic_gate',  label: 'NOR',     symbol: '≥1̄',  w: 80,  h: 56,  bits: 1 },
  { type: 'flip_flop',   label: 'FF',      symbol: 'D▷',   w: 96,  h: 72,  bits: 1 },
  { type: 'multiplexer', label: 'MUX',     symbol: 'MUX',  w: 96,  h: 80,  bits: 1 },
  { type: 'alu',         label: 'DEC',     symbol: 'DEC',  w: 96,  h: 80,  bits: 1 },
  { type: 'register',    label: 'REG',     symbol: 'REG',  w: 112, h: 72,  bits: 8 },
  { type: 'memory',      label: 'RAM',     symbol: 'RAM',  w: 128, h: 80,  bits: 8 },
  { type: 'clock',       label: 'CLK',     symbol: '⏱',   w: 72,  h: 56,  bits: null },
  { type: 'io_port',     label: 'IN',      symbol: '▶I',   w: 64,  h: 48,  bits: 1 },
  { type: 'io_port',     label: 'OUT',     symbol: 'O▶',   w: 64,  h: 48,  bits: 1 },
  { type: 'io_port',     label: 'VDD',     symbol: 'VDD',  w: 48,  h: 48,  bits: null },
  { type: 'io_port',     label: 'GND',     symbol: 'GND',  w: 48,  h: 48,  bits: null },
];

// ─── Right panel sub-components ───────────────────────────────────────────────

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <View>
      <Pressable style={s.secHeader} onPress={() => setOpen((o) => !o)}>
        <Text style={s.secTitle}>{title}</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={11} color="#6b7280" />
      </Pressable>
      {open && children}
    </View>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  design:       ChipDesign;
  onChange:     (d: ChipDesign) => void;
  saving?:      boolean;
  onValidate?:  () => void;
  onAiAssist?:  () => void;
  grid:         boolean;
  snap:         boolean;
  onGridChange: (v: boolean) => void;
  onSnapChange: (v: boolean) => void;
}

// ─── BuildWorkspace ───────────────────────────────────────────────────────────

export function BuildWorkspace({
  design,
  onChange,
  saving,
  onValidate,
  onAiAssist,
  grid,
  snap,
  onGridChange,
  onSnapChange,
}: Props) {
  const [layers, setLayers] = useState<Layer[]>(DEFAULT_LAYERS);
  const [scale, setScale]   = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedComp = design.components.find((c) => c.id === selectedId) ?? null;

  // Place a new component from the palette
  function placeComponent(def: CompDef) {
    const id = `comp_${Date.now().toString(36)}`;
    const newComp: ChipComponent = {
      id,
      type:       def.type,
      label:      def.label,
      x:          60,
      y:          60 + design.components.length * 24,
      width:      def.w,
      height:     def.h,
      bitWidth:   def.bits ?? null,
      properties: {},
    };
    onChange({ ...design, components: [...design.components, newComp] });
    setSelectedId(id);
  }

  function toggleLayer(id: string) {
    setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
  }

  return (
    <View style={s.root}>

      {/* ── Left: canvas ─────────────────────────────────────────────────── */}
      <View style={s.canvasArea}>

        {/* Thin canvas toolbar */}
        <View style={s.canvasBar}>
          <Pressable
            style={s.zoomBtn}
            onPress={() => setScale((sc) => Math.max(0.25, Math.round((sc - 0.15) * 100) / 100))}
          >
            <Feather name="minus" size={12} color="#8aa4c0" />
          </Pressable>
          <Text style={s.zoomLabel}>{Math.round(scale * 100)}%</Text>
          <Pressable
            style={s.zoomBtn}
            onPress={() => setScale((sc) => Math.min(3, Math.round((sc + 0.15) * 100) / 100))}
          >
            <Feather name="plus" size={12} color="#8aa4c0" />
          </Pressable>

          <Text style={s.canvasStats}>
            {design.components.length} blk · {design.connections.length} wire
          </Text>

          {saving && <Text style={s.savingLabel}>Saving…</Text>}
        </View>

        {/* Canvas */}
        <DesignCanvasView
          design={design}
          onChange={onChange}
          grid={grid}
          snap={snap}
          darkCanvas
          hideToolbar
          externalScale={scale}
          onSelectComponent={setSelectedId}
        />
      </View>

      {/* ── Right: white EDA panel ────────────────────────────────────────── */}
      <ScrollView style={s.panel} contentContainerStyle={s.panelContent} bounces={false}>

        {/* LAYERS */}
        <PanelSection title="LAYERS">
          {layers.map((l) => (
            <Pressable
              key={l.id}
              style={s.layerRow}
              onPress={() => toggleLayer(l.id)}
            >
              <View style={[s.layerSwatch, { backgroundColor: l.color }]} />
              <Text style={[s.layerName, !l.visible && s.layerHidden]}>{l.name}</Text>
              <Feather
                name={l.visible ? 'eye' : 'eye-off'}
                size={11}
                color={l.visible ? '#374151' : '#d1d5db'}
              />
            </Pressable>
          ))}
        </PanelSection>

        <View style={s.divider} />

        {/* COMPONENTS */}
        <PanelSection title="COMPONENTS">
          <View style={s.compGrid}>
            {COMP_DEFS.map((def, i) => {
              const col = TYPE_COLOR[def.type] ?? '#6b7280';
              return (
                <Pressable key={i} style={s.compTile} onPress={() => placeComponent(def)}>
                  <View style={[s.compSymbolBox, { borderColor: col + '60', backgroundColor: col + '12' }]}>
                    <Text style={[s.compSymbol, { color: col }]}>{def.symbol}</Text>
                  </View>
                  <Text style={s.compLabel} numberOfLines={1}>{def.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </PanelSection>

        <View style={s.divider} />

        {/* DESIGN */}
        <PanelSection title="DESIGN">
          <View style={s.toggleRow}>
            <Text style={s.toggleLabel}>Grid</Text>
            <Switch
              value={grid}
              onValueChange={onGridChange}
              thumbColor="#fff"
              trackColor={{ false: '#d1d5db', true: '#3b82f6' }}
              style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
            />
          </View>
          <View style={s.toggleRow}>
            <Text style={s.toggleLabel}>Snap</Text>
            <Switch
              value={snap}
              onValueChange={onSnapChange}
              thumbColor="#fff"
              trackColor={{ false: '#d1d5db', true: '#3b82f6' }}
              style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
            />
          </View>

          {/* Action buttons */}
          {([
            { icon: 'check-circle' as const, label: 'DRC',        onPress: () => Alert.alert('DRC', runDRC(design)) },
            { icon: 'zap'          as const, label: 'ERC',        onPress: () => Alert.alert('ERC', runERC(design)) },
            { icon: 'share-2'      as const, label: 'Auto Route', onPress: () => onChange(autoRoute(design)) },
            { icon: 'cpu'          as const, label: 'AI Assist',  onPress: onAiAssist, accent: true },
            { icon: 'shield'       as const, label: 'Validate',   onPress: onValidate, accent: true },
          ] as { icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress?: () => void; accent?: boolean }[]).map((btn) => (
            <Pressable
              key={btn.label}
              style={({ pressed }) => [
                s.actionBtn,
                btn.accent && s.actionBtnAccent,
                pressed && s.actionBtnPressed,
              ]}
              onPress={btn.onPress}
            >
              <Feather name={btn.icon} size={11} color={btn.accent ? '#fff' : '#374151'} />
              <Text style={[s.actionBtnText, btn.accent && s.actionBtnTextAccent]}>
                {btn.label}
              </Text>
            </Pressable>
          ))}
        </PanelSection>

        <View style={s.divider} />

        {/* PROPERTIES */}
        <PanelSection title="PROPERTIES">
          {!selectedComp ? (
            <Text style={s.emptyProps}>Tap a component to see its properties.</Text>
          ) : (
            <>
              <PropRow label="ID"    value={selectedComp.id.slice(0, 12)} />
              <PropRow label="Type"  value={selectedComp.type.replace('_', ' ')} />
              <PropRow label="Label" value={selectedComp.label} />
              <PropRow label="X"     value={String(Math.round(selectedComp.x))} />
              <PropRow label="Y"     value={String(Math.round(selectedComp.y))} />
              <PropRow label="W"     value={String(selectedComp.width)} />
              <PropRow label="H"     value={String(selectedComp.height)} />
              {selectedComp.bitWidth != null && (
                <PropRow label="Bits" value={String(selectedComp.bitWidth)} />
              )}
            </>
          )}
        </PanelSection>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function PropRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.propRow}>
      <Text style={s.propKey}>{label}</Text>
      <Text style={s.propVal} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PANEL_W = 148;

const s = StyleSheet.create({
  root:        { flex: 1, flexDirection: 'row', backgroundColor: '#080c10' },

  // Canvas side
  canvasArea:  { flex: 1, flexDirection: 'column' },
  canvasBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: '#0d1117',
    borderBottomWidth: 1, borderBottomColor: '#1e2a38',
  },
  zoomBtn:     { padding: 4, borderRadius: 4 },
  zoomLabel:   { fontSize: 10, color: '#6b8aaa', minWidth: 30, textAlign: 'center' },
  canvasStats: { fontSize: 10, color: '#3d5a78', marginLeft: 4 },
  savingLabel: { fontSize: 10, color: '#3b82f6', marginLeft: 'auto' },

  // Right panel
  panel: {
    width:           PANEL_W,
    backgroundColor: '#ffffff',
    borderLeftWidth: 1,
    borderLeftColor: '#e5e7eb',
  },
  panelContent: { paddingBottom: 16 },
  divider:      { height: 1, backgroundColor: '#e5e7eb', marginVertical: 2 },

  // Section header
  secHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: '#f9fafb',
  },
  secTitle: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, color: '#6b7280' },

  // Layers
  layerRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5 },
  layerSwatch: { width: 10, height: 10, borderRadius: 2, flexShrink: 0 },
  layerName:   { flex: 1, fontSize: 11, color: '#111827' },
  layerHidden: { color: '#9ca3af' },

  // Component grid
  compGrid:  { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  compTile:  { width: 60, alignItems: 'center', gap: 2, paddingVertical: 4 },
  compSymbolBox: {
    width: 44, height: 32,
    borderRadius: 5, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  compSymbol: { fontSize: 12, fontWeight: '700' },
  compLabel:  { fontSize: 9, color: '#374151', textAlign: 'center' },

  // Design toggles
  toggleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 2 },
  toggleLabel: { fontSize: 11, color: '#374151' },

  // Action buttons
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginHorizontal: 10, marginTop: 4, paddingHorizontal: 8, paddingVertical: 6,
    borderRadius: 6, borderWidth: 1, borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  actionBtnAccent:     { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  actionBtnPressed:    { opacity: 0.7 },
  actionBtnText:       { fontSize: 11, color: '#374151', flex: 1 },
  actionBtnTextAccent: { color: '#ffffff' },

  // Properties
  emptyProps:  { fontSize: 10, color: '#9ca3af', paddingHorizontal: 10, paddingVertical: 8, fontStyle: 'italic' },
  propRow:     { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 3, gap: 4 },
  propKey:     { fontSize: 10, color: '#6b7280', width: 32, flexShrink: 0 },
  propVal:     { fontSize: 10, color: '#111827', flex: 1 },
});
