/**
 * EdaBuildPanel — professional EDA-style sidebar for the Build tab.
 *
 * Four collapsible sections that mirror real EDA tools:
 *   1. Layers   — visibility, lock, colour, active-layer selection
 *   2. Components — tap-to-place schematic symbol palette
 *   3. Design   — grid/snap toggles + DRC / ERC / auto-route / AI actions
 *   4. Properties — width, height, layer, rotation, coords, net & pin name
 *
 * A component is "selected" the moment it is tapped in the palette so the
 * Properties panel immediately reflects what was just placed.
 */

import React, { useState, useCallback } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import type { ChipComponent, ChipDesign } from '@workspace/api-client-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Layer {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
}

interface ComponentDef {
  type: ChipComponent['type'];
  label: string;
  symbol: string;   // text-based shorthand rendered in the symbol box
  category: string;
  defaultWidth: number;
  defaultHeight: number;
  defaultBitWidth: number | null;
}

interface DesignSettings {
  grid: boolean;
  snap: boolean;
}

interface SelectedProps {
  width: string;
  height: string;
  layer: string;
  rotation: string;
  x: string;
  y: string;
  netName: string;
  pinName: string;
}

interface Props {
  design: ChipDesign;
  onChange: (d: ChipDesign) => void;
  onGoToDiagram: () => void;
  onValidate?: () => void;
  onAiAssist?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_LAYERS: Layer[] = [
  { id: 'metal1',  name: 'Metal 1',    color: '#22d3ee', visible: true,  locked: false },
  { id: 'metal2',  name: 'Metal 2',    color: '#818cf8', visible: true,  locked: false },
  { id: 'poly',    name: 'Poly',       color: '#f59e0b', visible: true,  locked: false },
  { id: 'ndiff',   name: 'N-Diffusion',color: '#34d399', visible: true,  locked: false },
  { id: 'pdiff',   name: 'P-Diffusion',color: '#fb7185', visible: false, locked: false },
  { id: 'contact', name: 'Contact',    color: '#a3a3a3', visible: true,  locked: true  },
];

const COMPONENT_DEFS: ComponentDef[] = [
  // Logic gates
  { type: 'logic_gate', label: 'AND Gate',    symbol: '&',   category: 'Logic',    defaultWidth: 80,  defaultHeight: 56,  defaultBitWidth: 1 },
  { type: 'logic_gate', label: 'OR Gate',     symbol: '≥1',  category: 'Logic',    defaultWidth: 80,  defaultHeight: 56,  defaultBitWidth: 1 },
  { type: 'logic_gate', label: 'XOR Gate',    symbol: '=1',  category: 'Logic',    defaultWidth: 80,  defaultHeight: 56,  defaultBitWidth: 1 },
  { type: 'logic_gate', label: 'NOT Gate',    symbol: '1',   category: 'Logic',    defaultWidth: 64,  defaultHeight: 48,  defaultBitWidth: 1 },
  { type: 'logic_gate', label: 'NAND',        symbol: '&̄',  category: 'Logic',    defaultWidth: 80,  defaultHeight: 56,  defaultBitWidth: 1 },
  { type: 'logic_gate', label: 'NOR',         symbol: '≥1̄', category: 'Logic',    defaultWidth: 80,  defaultHeight: 56,  defaultBitWidth: 1 },
  // Sequential
  { type: 'flip_flop',  label: 'Flip-Flop',   symbol: 'D▷', category: 'Seq',     defaultWidth: 96,  defaultHeight: 72,  defaultBitWidth: 1 },
  // Combinational
  { type: 'multiplexer',label: 'Multiplexer',  symbol: 'MUX', category: 'Comb',   defaultWidth: 96,  defaultHeight: 80,  defaultBitWidth: 1 },
  { type: 'alu',        label: 'Decoder',      symbol: 'DEC', category: 'Comb',   defaultWidth: 96,  defaultHeight: 80,  defaultBitWidth: 1 },
  // Storage
  { type: 'register',   label: 'Register',     symbol: 'REG', category: 'Storage',defaultWidth: 112, defaultHeight: 72,  defaultBitWidth: 8 },
  { type: 'memory',     label: 'Memory Cell',  symbol: 'RAM', category: 'Storage',defaultWidth: 128, defaultHeight: 80,  defaultBitWidth: 8 },
  // Clocking / I-O
  { type: 'clock',      label: 'Clock',        symbol: '⏱',  category: 'IO',     defaultWidth: 72,  defaultHeight: 56,  defaultBitWidth: null },
  { type: 'io_port',    label: 'Input Pin',    symbol: '▶I', category: 'IO',     defaultWidth: 64,  defaultHeight: 48,  defaultBitWidth: 1 },
  { type: 'io_port',    label: 'Output Pin',   symbol: 'O▶', category: 'IO',     defaultWidth: 64,  defaultHeight: 48,  defaultBitWidth: 1 },
  { type: 'io_port',    label: 'Power (VDD)',   symbol: 'VDD',category: 'IO',     defaultWidth: 48,  defaultHeight: 48,  defaultBitWidth: null },
  { type: 'io_port',    label: 'Ground (GND)',  symbol: 'GND',category: 'IO',     defaultWidth: 48,  defaultHeight: 48,  defaultBitWidth: null },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Collapsible section header */
function SectionHeader({
  title,
  open,
  onToggle,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onToggle}
      style={[styles.sectionHeader, { borderBottomColor: colors.border, backgroundColor: colors.muted }]}
    >
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
      <Feather name={open ? 'chevron-up' : 'chevron-down'} size={13} color={colors.mutedForeground} />
    </Pressable>
  );
}

/** A single row in the Layers panel */
function LayerRow({
  layer,
  active,
  onToggleVisible,
  onToggleLock,
  onSetActive,
}: {
  layer: Layer;
  active: boolean;
  onToggleVisible: () => void;
  onToggleLock: () => void;
  onSetActive: () => void;
}) {
  const colors = useColors();
  return (
    <View style={[styles.layerRow, active && { backgroundColor: colors.accent }]}>
      {/* Active indicator */}
      <Pressable onPress={onSetActive} style={styles.layerActiveBtn} hitSlop={6}>
        <View style={[
          styles.layerActiveDot,
          { borderColor: colors.primary },
          active && { backgroundColor: colors.primary },
        ]} />
      </Pressable>

      {/* Colour swatch */}
      <Pressable style={[styles.layerSwatch, { backgroundColor: layer.color }]} />

      {/* Name */}
      <Pressable onPress={onSetActive} style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={[styles.layerName, { color: active ? colors.primary : colors.foreground }]}
        >
          {layer.name}
        </Text>
      </Pressable>

      {/* Visible eye */}
      <Pressable onPress={onToggleVisible} hitSlop={6} style={styles.layerIconBtn}>
        <Feather
          name={layer.visible ? 'eye' : 'eye-off'}
          size={13}
          color={layer.visible ? colors.foreground : colors.mutedForeground}
        />
      </Pressable>

      {/* Lock */}
      <Pressable onPress={onToggleLock} hitSlop={6} style={styles.layerIconBtn}>
        <Feather
          name={layer.locked ? 'lock' : 'unlock'}
          size={13}
          color={layer.locked ? colors.warning : colors.mutedForeground}
        />
      </Pressable>
    </View>
  );
}

/** Schematic symbol chip — tap to place */
function ComponentChip({
  def,
  onPlace,
}: {
  def: ComponentDef;
  onPlace: (def: ComponentDef) => void;
}) {
  const colors = useColors();
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => onPlace(def)}
      style={[
        styles.compChip,
        { borderColor: pressed ? colors.primary : colors.border, backgroundColor: colors.card },
        pressed && { backgroundColor: colors.accent },
      ]}
    >
      {/* Symbol box */}
      <View style={[styles.compSymbol, { borderColor: colors.border }]}>
        <Text style={[styles.compSymbolText, { color: colors.primary }]} numberOfLines={1}>
          {def.symbol}
        </Text>
      </View>
      {/* Label */}
      <Text style={[styles.compLabel, { color: colors.foreground }]} numberOfLines={2}>
        {def.label}
      </Text>
    </Pressable>
  );
}

/** Toggle row for Design settings */
function DesignToggleRow({
  label,
  value,
  onToggle,
}: {
  label: string;
  value: boolean;
  onToggle: () => void;
}) {
  const colors = useColors();
  return (
    <View style={[styles.toggleRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.muted, true: colors.primary + '80' }}
        thumbColor={value ? colors.primary : colors.mutedForeground}
        ios_backgroundColor={colors.muted}
        style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
      />
    </View>
  );
}

/** Action button row in Design panel */
function DesignActionBtn({
  icon,
  label,
  accent,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  accent?: boolean;
  onPress?: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.actionBtn,
        {
          borderColor: accent ? colors.primary : colors.border,
          backgroundColor: accent ? colors.primary + '18' : colors.card,
        },
      ]}
    >
      <Feather name={icon} size={13} color={accent ? colors.primary : colors.mutedForeground} />
      <Text style={[styles.actionBtnLabel, { color: accent ? colors.primary : colors.foreground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Properties field row */
function PropRow({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.propRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.propLabel, { color: colors.mutedForeground }]}>{label}</Text>
      {readOnly ? (
        <Text style={[styles.propValue, { color: colors.foreground }]}>{value || '—'}</Text>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChange}
          style={[styles.propInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
          placeholderTextColor={colors.mutedForeground}
          placeholder="—"
        />
      )}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EdaBuildPanel({ design, onChange, onGoToDiagram, onValidate, onAiAssist }: Props) {
  const colors = useColors();

  // Section open/close state
  const [layersOpen,     setLayersOpen]     = useState(true);
  const [componentsOpen, setComponentsOpen] = useState(true);
  const [designOpen,     setDesignOpen]     = useState(true);
  const [propsOpen,      setPropsOpen]      = useState(true);

  // Layers
  const [layers,      setLayers]      = useState<Layer[]>(DEFAULT_LAYERS);
  const [activeLayer, setActiveLayer] = useState('metal1');

  // Design settings
  const [settings, setSettings] = useState<DesignSettings>({ grid: true, snap: true });

  // Last-placed component → drives Properties
  const [selectedProps, setSelectedProps] = useState<SelectedProps>({
    width: '', height: '', layer: '', rotation: '0°',
    x: '', y: '', netName: '', pinName: '',
  });
  const [hasSelection, setHasSelection] = useState(false);

  // ── Layer helpers ─────────────────────────────────────────────────────────

  const toggleVisible = useCallback((id: string) =>
    setLayers(ls => ls.map(l => l.id === id ? { ...l, visible: !l.visible } : l)), []);

  const toggleLock = useCallback((id: string) =>
    setLayers(ls => ls.map(l => l.id === id ? { ...l, locked: !l.locked } : l)), []);

  // ── Place component ───────────────────────────────────────────────────────

  const handlePlace = useCallback((def: ComponentDef) => {
    const stagger = design.components.length;
    const x = 80 + (stagger % 5) * 140;
    const y = 80 + Math.floor(stagger / 5) * 120;

    const newComp: ChipComponent = {
      id: `${def.type}_${Date.now()}`,
      type: def.type,
      label: def.label,
      x,
      y,
      width: def.defaultWidth,
      height: def.defaultHeight,
      bitWidth: def.defaultBitWidth,
      properties: {},
    };
    onChange({ ...design, components: [...design.components, newComp] });

    // Reflect in properties panel
    setSelectedProps({
      width:    `${def.defaultWidth}`,
      height:   `${def.defaultHeight}`,
      layer:    activeLayer,
      rotation: '0°',
      x:        `${x}`,
      y:        `${y}`,
      netName:  '',
      pinName:  def.label,
    });
    setHasSelection(true);
  }, [design, onChange, activeLayer]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

        {/* ── LAYERS ─────────────────────────────────────────────────────── */}
        <SectionHeader title="Layers" open={layersOpen} onToggle={() => setLayersOpen(o => !o)} />
        {layersOpen && (
          <View style={{ paddingBottom: 4 }}>
            {layers.map(layer => (
              <LayerRow
                key={layer.id}
                layer={layer}
                active={activeLayer === layer.id}
                onToggleVisible={() => toggleVisible(layer.id)}
                onToggleLock={() => toggleLock(layer.id)}
                onSetActive={() => setActiveLayer(layer.id)}
              />
            ))}
          </View>
        )}

        {/* ── COMPONENTS ─────────────────────────────────────────────────── */}
        <SectionHeader title="Components" open={componentsOpen} onToggle={() => setComponentsOpen(o => !o)} />
        {componentsOpen && (
          <View style={styles.compGrid}>
            {COMPONENT_DEFS.map(def => (
              <ComponentChip key={def.label} def={def} onPlace={handlePlace} />
            ))}
          </View>
        )}

        {/* ── DESIGN ─────────────────────────────────────────────────────── */}
        <SectionHeader title="Design" open={designOpen} onToggle={() => setDesignOpen(o => !o)} />
        {designOpen && (
          <View style={{ paddingBottom: 8 }}>
            <DesignToggleRow
              label="Grid"
              value={settings.grid}
              onToggle={() => setSettings(s => ({ ...s, grid: !s.grid }))}
            />
            <DesignToggleRow
              label="Snap to Grid"
              value={settings.snap}
              onToggle={() => setSettings(s => ({ ...s, snap: !s.snap }))}
            />
            <View style={styles.actionGroup}>
              <DesignActionBtn icon="check-circle"    label="Design Rule Check (DRC)" />
              <DesignActionBtn icon="zap"             label="Electrical Rule Check (ERC)" />
              <DesignActionBtn icon="share-2"         label="Auto Route" />
              <DesignActionBtn icon="cpu"             label="AI Assistant"     accent onPress={onAiAssist} />
              <DesignActionBtn icon="shield"          label="Validate Design"  accent onPress={onValidate} />
              <DesignActionBtn icon="layout"          label="Switch to Diagram" onPress={onGoToDiagram} />
            </View>
          </View>
        )}

        {/* ── PROPERTIES ─────────────────────────────────────────────────── */}
        <SectionHeader title="Properties" open={propsOpen} onToggle={() => setPropsOpen(o => !o)} />
        {propsOpen && (
          <View style={{ paddingBottom: 16 }}>
            {!hasSelection ? (
              <Text style={[styles.noSelText, { color: colors.mutedForeground }]}>
                Tap a component above to place it — its properties will appear here.
              </Text>
            ) : (
              <>
                <PropRow
                  label="Width"
                  value={selectedProps.width}
                  onChange={v => setSelectedProps(p => ({ ...p, width: v }))}
                />
                <PropRow
                  label="Height"
                  value={selectedProps.height}
                  onChange={v => setSelectedProps(p => ({ ...p, height: v }))}
                />
                <PropRow
                  label="Layer"
                  value={layers.find(l => l.id === selectedProps.layer)?.name ?? selectedProps.layer}
                  readOnly
                />
                <PropRow
                  label="Rotation"
                  value={selectedProps.rotation}
                  onChange={v => setSelectedProps(p => ({ ...p, rotation: v }))}
                />
                <PropRow
                  label="Coordinates"
                  value={`(${selectedProps.x}, ${selectedProps.y})`}
                  readOnly
                />
                <PropRow
                  label="Net Name"
                  value={selectedProps.netName}
                  onChange={v => setSelectedProps(p => ({ ...p, netName: v }))}
                />
                <PropRow
                  label="Pin Name"
                  value={selectedProps.pinName}
                  onChange={v => setSelectedProps(p => ({ ...p, pinName: v }))}
                />
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontFamily: 'Inter_700Bold',
  },

  // Layer rows
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  layerActiveBtn: { padding: 2 },
  layerActiveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  layerSwatch: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  layerName: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  layerIconBtn: { padding: 3 },

  // Component grid
  compGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
    gap: 6,
  },
  compChip: {
    width: '30%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    gap: 5,
    minWidth: 80,
  },
  compSymbol: {
    width: 44,
    height: 32,
    borderWidth: 1.5,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compSymbolText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  compLabel: {
    fontSize: 10,
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
    lineHeight: 14,
  },

  // Design toggles
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toggleLabel: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },

  // Design action buttons
  actionGroup: { paddingHorizontal: 10, paddingTop: 8, gap: 5 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  actionBtnLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },

  // Properties
  propRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  propLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    width: 90,
    flexShrink: 0,
  },
  propValue: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    flex: 1,
    textAlign: 'right',
  },
  propInput: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    textAlign: 'right',
    minHeight: 28,
  },

  noSelText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    padding: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
