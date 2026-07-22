/**
 * BuildWorkspace — KiCad-style EDA layout.
 *
 * ┌──────────────────────────────┬───────────────┐
 * │  black canvas toolbar        │  Visibles      │
 * ├──────────────────────────────│  Layer│Render  │
 * │                              │  ─────────────│
 * │   BLACK GRID WORKSPACE       │  ■ Metal 1  ☑ │
 * │   (chip lives here)          │  ■ Metal 2  ☑ │
 * │                              │  …             │
 * │                              │  ─── PARTS ───│
 * │                              │  tile tile     │
 * │                              │  ─── TOOLS ───│
 * ├──────────────────────────────│  DRC ERC …     │
 * │  status bar                  │                │
 * └──────────────────────────────┴───────────────┘
 */

import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { DesignCanvasView } from '@/components/DesignCanvasView';
import type { ChipComponent, ChipDesign } from '@workspace/api-client-react';

// ─── Colours ──────────────────────────────────────────────────────────────────

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
      issues.push(`⚠ "${c.label}" has no inputs`);
  if (design.components.length > 0 && !design.components.some((c) => c.type === 'io_port'))
    issues.push('⚠ No I/O port found — add input/output pins');
  return issues.length === 0
    ? '✓ No DRC violations.\n\nAll structural checks passed.'
    : `${issues.length} issue${issues.length > 1 ? 's' : ''}:\n\n${issues.join('\n\n')}`;
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
      if (comp) issues.push(`⚠ "${comp.label}" — high fan-out (${count})`);
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
    : `${issues.length} issue${issues.length > 1 ? 's' : ''}:\n\n${issues.join('\n\n')}`;
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
    for (const id of layer) { newPos.set(id, { x, y }); y += (byId.get(id)?.height ?? 80) + PAD_Y; }
    x += layerW + PAD_X + 80;
  }
  return {
    ...design,
    components: design.components.map((c) => { const p = newPos.get(c.id); return p ? { ...c, ...p } : c; }),
  };
}

// ─── Layer data ───────────────────────────────────────────────────────────────

interface LayerDef { id: string; name: string; color: string; visible: boolean; active?: boolean }
const DEFAULT_LAYERS: LayerDef[] = [
  { id: 'metal1',  name: 'Metal 1',  color: '#e05252', visible: true,  active: true },
  { id: 'metal2',  name: 'Metal 2',  color: '#5490e0', visible: true  },
  { id: 'poly',    name: 'Poly',     color: '#34d399', visible: true  },
  { id: 'ndiff',   name: 'N‑Diff',   color: '#a78bfa', visible: true  },
  { id: 'pdiff',   name: 'P‑Diff',   color: '#fbbf24', visible: true  },
  { id: 'contact', name: 'Contact',  color: '#94a3b8', visible: true  },
  { id: 'nwell',   name: 'N‑Well',   color: '#22d3ee', visible: false },
  { id: 'silkF',   name: 'Silk_F',   color: '#f0f0f0', visible: true  },
  { id: 'silkB',   name: 'Silk_B',   color: '#c0c0c0', visible: false },
  { id: 'maskF',   name: 'Mask_F',   color: '#fb7185', visible: true  },
  { id: 'pcbedge', name: 'PCB_Edges',color: '#facc15', visible: true  },
];

// ─── Component palette ────────────────────────────────────────────────────────

interface CompDef {
  type: ChipComponent['type'];
  label: string;
  symbol: string;
  w: number; h: number;
  bits: number | null;
}
const COMP_DEFS: CompDef[] = [
  { type: 'logic_gate',  label: 'AND',  symbol: '&',   w: 80,  h: 56,  bits: 1 },
  { type: 'logic_gate',  label: 'OR',   symbol: '≥1',  w: 80,  h: 56,  bits: 1 },
  { type: 'logic_gate',  label: 'XOR',  symbol: '=1',  w: 80,  h: 56,  bits: 1 },
  { type: 'logic_gate',  label: 'NOT',  symbol: '1̄',  w: 64,  h: 48,  bits: 1 },
  { type: 'logic_gate',  label: 'NAND', symbol: '&̄',  w: 80,  h: 56,  bits: 1 },
  { type: 'logic_gate',  label: 'NOR',  symbol: '≥̄',  w: 80,  h: 56,  bits: 1 },
  { type: 'flip_flop',   label: 'FF',   symbol: 'D▷',  w: 96,  h: 72,  bits: 1 },
  { type: 'multiplexer', label: 'MUX',  symbol: 'MUX', w: 96,  h: 80,  bits: 1 },
  { type: 'alu',         label: 'DEC',  symbol: 'DEC', w: 96,  h: 80,  bits: 1 },
  { type: 'register',    label: 'REG',  symbol: 'REG', w: 112, h: 72,  bits: 8 },
  { type: 'memory',      label: 'RAM',  symbol: 'RAM', w: 128, h: 80,  bits: 8 },
  { type: 'clock',       label: 'CLK',  symbol: '⏱',  w: 72,  h: 56,  bits: null },
  { type: 'io_port',     label: 'IN',   symbol: '▶I',  w: 64,  h: 48,  bits: 1 },
  { type: 'io_port',     label: 'OUT',  symbol: 'O▶',  w: 64,  h: 48,  bits: 1 },
  { type: 'io_port',     label: 'VDD',  symbol: 'VDD', w: 48,  h: 48,  bits: null },
  { type: 'io_port',     label: 'GND',  symbol: 'GND', w: 48,  h: 48,  bits: null },
];

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
  const [layers, setLayers]       = useState<LayerDef[]>(DEFAULT_LAYERS);
  const [activeLayer, setActive]  = useState('metal1');
  const [panelTab, setPanelTab]   = useState<'layer' | 'render'>('layer');
  const [scale, setScale]         = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedComp = design.components.find((c) => c.id === selectedId) ?? null;

  function placeComponent(def: CompDef) {
    const id = `comp_${Date.now().toString(36)}`;
    const newComp: ChipComponent = {
      id,
      type:       def.type,
      label:      def.label,
      x:          60 + (design.components.length % 6) * 20,
      y:          60 + (design.components.length % 8) * 16,
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

  const blks  = design.components.length;
  const wires = design.connections.length;
  const nets  = new Set(design.connections.map((c) => c.id)).size;

  return (
    <View style={s.root}>

      {/* ── LEFT: canvas column ─────────────────────────────────────────── */}
      <View style={s.canvasCol}>

        {/* Canvas mini-toolbar */}
        <View style={s.canvasBar}>
          <Pressable style={s.zBtn} onPress={() => setScale((v) => Math.max(0.25, +((v - 0.15).toFixed(2))))}>
            <Feather name="minus" size={11} color="#5a7a9a" />
          </Pressable>
          <Text style={s.zLabel}>{Math.round(scale * 100)}%</Text>
          <Pressable style={s.zBtn} onPress={() => setScale((v) => Math.min(3, +((v + 0.15).toFixed(2))))}>
            <Feather name="plus" size={11} color="#5a7a9a" />
          </Pressable>

          <View style={s.barSep} />

          <Pressable style={s.barToggle} onPress={() => onGridChange(!grid)}>
            <View style={[s.barToggleDot, grid && s.barToggleDotOn]} />
            <Text style={s.barToggleLabel}>Grid</Text>
          </Pressable>
          <Pressable style={s.barToggle} onPress={() => onSnapChange(!snap)}>
            <View style={[s.barToggleDot, snap && s.barToggleDotOn]} />
            <Text style={s.barToggleLabel}>Snap</Text>
          </Pressable>

          {saving && <Text style={s.savingDot}>●</Text>}
        </View>

        {/* Canvas — pure black, dark mode */}
        <View style={{ flex: 1 }}>
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

        {/* Status bar — KiCad-style bottom strip */}
        <View style={s.statusBar}>
          <StatusChip label="Blks"  value={String(blks)}  />
          <StatusChip label="Wires" value={String(wires)} />
          <StatusChip label="Nets"  value={String(nets)}  accent />
          <StatusChip label="Uncon" value={String(Math.max(0, blks - (wires > 0 ? blks : 0)))} />
          <View style={{ flex: 1 }} />
          {selectedComp && (
            <Text style={s.statusCoords}>
              {selectedComp.label}  x {Math.round(selectedComp.x)}  y {Math.round(selectedComp.y)}
            </Text>
          )}
        </View>
      </View>

      {/* ── RIGHT: Visibles panel ───────────────────────────────────────── */}
      <View style={s.panel}>

        {/* Panel header */}
        <View style={s.panelHeader}>
          <Text style={s.panelTitle}>Visibles</Text>
        </View>

        {/* Layer / Render tabs */}
        <View style={s.tabRow}>
          <Pressable
            style={[s.panelTab, panelTab === 'layer' && s.panelTabActive]}
            onPress={() => setPanelTab('layer')}
          >
            <Text style={[s.panelTabText, panelTab === 'layer' && s.panelTabTextActive]}>Layer</Text>
          </Pressable>
          <Pressable
            style={[s.panelTab, panelTab === 'render' && s.panelTabActive]}
            onPress={() => setPanelTab('render')}
          >
            <Text style={[s.panelTabText, panelTab === 'render' && s.panelTabTextActive]}>Render</Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} bounces={false}>

          {/* ── LAYER TAB ─────────────────────────────────────────────── */}
          {panelTab === 'layer' && (
            <>
              {layers.map((l) => (
                <Pressable
                  key={l.id}
                  style={[s.layerRow, l.id === activeLayer && s.layerRowActive]}
                  onPress={() => setActive(l.id)}
                >
                  {/* Colored swatch — double-border style like KiCad */}
                  <View style={[s.swatch, { backgroundColor: l.color }]}>
                    {l.id === activeLayer && <View style={s.swatchInner} />}
                  </View>
                  <Text style={[s.layerName, !l.visible && s.layerNameHidden]} numberOfLines={1}>
                    {l.name}
                  </Text>
                  {/* Checkbox */}
                  <Pressable onPress={() => toggleLayer(l.id)} hitSlop={6} style={s.checkbox}>
                    <View style={[s.checkboxBox, l.visible && s.checkboxChecked]}>
                      {l.visible && <Feather name="check" size={8} color="#fff" />}
                    </View>
                  </Pressable>
                </Pressable>
              ))}
            </>
          )}

          {/* ── RENDER TAB (component palette + tools) ─────────────────── */}
          {panelTab === 'render' && (
            <>
              {/* Section: Parts */}
              <View style={s.renderSection}>
                <Text style={s.renderSectionTitle}>PARTS</Text>
              </View>
              <View style={s.compGrid}>
                {COMP_DEFS.map((def, i) => {
                  const col = TYPE_COLOR[def.type] ?? '#6b7280';
                  return (
                    <Pressable key={i} style={s.compTile} onPress={() => placeComponent(def)}>
                      <View style={[s.compBox, { borderColor: col + '70', backgroundColor: col + '18' }]}>
                        <Text style={[s.compSym, { color: col }]}>{def.symbol}</Text>
                      </View>
                      <Text style={s.compLbl} numberOfLines={1}>{def.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Section: Tools */}
              <View style={s.renderSection}>
                <Text style={s.renderSectionTitle}>TOOLS</Text>
              </View>

              {([
                { icon: 'check-circle' as const, label: 'DRC',       cb: () => Alert.alert('DRC', runDRC(design)) },
                { icon: 'zap'          as const, label: 'ERC',       cb: () => Alert.alert('ERC', runERC(design)) },
                { icon: 'share-2'      as const, label: 'Auto Route',cb: () => onChange(autoRoute(design)) },
                { icon: 'cpu'          as const, label: 'AI Assist', cb: onAiAssist,  accent: true },
                { icon: 'shield'       as const, label: 'Validate',  cb: onValidate,  accent: true },
              ] as { icon: React.ComponentProps<typeof Feather>['name']; label: string; cb?: () => void; accent?: boolean }[]).map((btn) => (
                <Pressable
                  key={btn.label}
                  style={({ pressed }) => [s.toolBtn, btn.accent && s.toolBtnAccent, pressed && { opacity: 0.7 }]}
                  onPress={btn.cb}
                >
                  <Feather name={btn.icon} size={10} color={btn.accent ? '#fff' : '#374151'} />
                  <Text style={[s.toolBtnText, btn.accent && s.toolBtnTextAccent]}>{btn.label}</Text>
                </Pressable>
              ))}

              {/* Properties */}
              {selectedComp && (
                <>
                  <View style={s.renderSection}>
                    <Text style={s.renderSectionTitle}>PROPERTIES</Text>
                  </View>
                  <View style={s.propsBlock}>
                    <PropRow k="Type"  v={selectedComp.type.replace('_', ' ')} />
                    <PropRow k="Label" v={selectedComp.label} />
                    <PropRow k="X"     v={String(Math.round(selectedComp.x))} />
                    <PropRow k="Y"     v={String(Math.round(selectedComp.y))} />
                    <PropRow k="W"     v={String(selectedComp.width)} />
                    <PropRow k="H"     v={String(selectedComp.height)} />
                    {selectedComp.bitWidth != null && (
                      <PropRow k="Bits" v={String(selectedComp.bitWidth)} />
                    )}
                  </View>
                </>
              )}
            </>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function StatusChip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={s.statusChip}>
      <Text style={s.statusLabel}>{label}</Text>
      <Text style={[s.statusValue, accent && s.statusValueAccent]}>{value}</Text>
    </View>
  );
}

function PropRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.propRow}>
      <Text style={s.propKey}>{k}</Text>
      <Text style={s.propVal} numberOfLines={1}>{v}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PANEL_W  = 152;
const BAR_H    = 28;
const STATUS_H = 22;

// Panel colours (light, like KiCad's Visibles pane)
const P_BG      = '#f0f0f0';
const P_BORDER  = '#b8b8b8';
const P_ACTIVE  = '#d8e8ff';
const P_TEXT    = '#1a1a1a';
const P_MUTED   = '#6b7280';
const P_TAB_ACT = '#ffffff';

// Canvas colours
const C_BG      = '#000000';
const C_BAR_BG  = '#0d1117';
const C_BAR_BD  = '#1e2a38';
const C_STATUS  = '#0a0f18';

const s = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: C_BG },

  // ── Canvas column ──────────────────────────────────────────────────────────
  canvasCol: { flex: 1, flexDirection: 'column', backgroundColor: C_BG },

  canvasBar: {
    height: BAR_H,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8,
    backgroundColor: C_BAR_BG,
    borderBottomWidth: 1, borderBottomColor: C_BAR_BD,
  },
  zBtn:      { padding: 3, borderRadius: 3 },
  zLabel:    { fontSize: 10, color: '#5a7a9a', minWidth: 28, textAlign: 'center', fontVariant: ['tabular-nums'] },
  barSep:    { width: 1, height: 14, backgroundColor: C_BAR_BD, marginHorizontal: 4 },
  barToggle: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 2 },
  barToggleDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2d3f54' },
  barToggleDotOn: { backgroundColor: '#3b82f6' },
  barToggleLabel: { fontSize: 9, color: '#4a6080' },
  savingDot: { fontSize: 8, color: '#3b82f6', marginLeft: 4 },

  statusBar: {
    height: STATUS_H,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 8,
    backgroundColor: C_STATUS,
    borderTopWidth: 1, borderTopColor: '#0f1923',
  },
  statusChip:        { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statusLabel:       { fontSize: 9, color: '#2d4a66' },
  statusValue:       { fontSize: 9, color: '#4a7aaa', fontVariant: ['tabular-nums'] },
  statusValueAccent: { color: '#e05252' },
  statusCoords:      { fontSize: 9, color: '#2d4a66', fontVariant: ['tabular-nums'] },

  // ── Right panel ────────────────────────────────────────────────────────────
  panel: {
    width: PANEL_W,
    backgroundColor: P_BG,
    borderLeftWidth: 1, borderLeftColor: P_BORDER,
    flexDirection: 'column',
  },

  panelHeader: {
    height: 20,
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: '#d8d8d8',
    borderBottomWidth: 1, borderBottomColor: P_BORDER,
  },
  panelTitle: { fontSize: 10, fontWeight: '700', color: P_TEXT, letterSpacing: 0.3 },

  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#c8c8c8',
    borderBottomWidth: 1, borderBottomColor: P_BORDER,
  },
  panelTab: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 5,
    borderRightWidth: 1, borderRightColor: P_BORDER,
    backgroundColor: '#c8c8c8',
  },
  panelTabActive:     { backgroundColor: P_TAB_ACT, borderBottomColor: P_TAB_ACT },
  panelTabText:       { fontSize: 10, color: '#555', fontWeight: '400' },
  panelTabTextActive: { color: P_TEXT, fontWeight: '600' },

  // Layer rows — compact, KiCad-style
  layerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 6, paddingVertical: 3,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd',
    gap: 5,
    backgroundColor: P_BG,
  },
  layerRowActive: { backgroundColor: P_ACTIVE },

  swatch: {
    width: 12, height: 12, borderRadius: 2, flexShrink: 0,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)',
  },
  swatchInner: {
    width: 4, height: 4, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.7)',
  },

  layerName:       { flex: 1, fontSize: 10, color: P_TEXT },
  layerNameHidden: { color: '#b0b0b0' },

  checkbox:        { padding: 2 },
  checkboxBox: {
    width: 12, height: 12, borderRadius: 2,
    borderWidth: 1, borderColor: '#9ca3af',
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#2563eb', borderColor: '#2563eb' },

  // Render tab — parts grid
  renderSection: {
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: '#e0e0e0',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P_BORDER,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: P_BORDER,
  },
  renderSectionTitle: { fontSize: 9, fontWeight: '700', color: P_MUTED, letterSpacing: 0.8 },

  compGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 4, gap: 3 },
  compTile: { width: 66, alignItems: 'center', gap: 2, paddingVertical: 3 },
  compBox: {
    width: 50, height: 30, borderRadius: 4, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  compSym: { fontSize: 11, fontWeight: '700' },
  compLbl: { fontSize: 8, color: '#374151', textAlign: 'center' },

  // Tool buttons
  toolBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginHorizontal: 6, marginTop: 3, paddingHorizontal: 7, paddingVertical: 5,
    borderRadius: 4, borderWidth: 1, borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  toolBtnAccent:     { backgroundColor: '#2563eb', borderColor: '#1d4ed8' },
  toolBtnText:       { fontSize: 10, color: '#374151', flex: 1 },
  toolBtnTextAccent: { color: '#ffffff' },

  // Properties
  propsBlock: { paddingHorizontal: 8, paddingVertical: 4 },
  propRow:    { flexDirection: 'row', paddingVertical: 2, gap: 4 },
  propKey:    { fontSize: 9, color: P_MUTED, width: 28, flexShrink: 0 },
  propVal:    { fontSize: 9, color: P_TEXT, flex: 1 },
});
