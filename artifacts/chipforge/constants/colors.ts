/**
 * ChipForge design tokens — "circuit blueprint" theme.
 *
 * A single dark palette (deep navy PCB background, cyan trace-line accent,
 * amber for warnings) used throughout the app since this is a technical
 * EDA tool where a dark, blueprint-like canvas is the natural home for
 * block diagrams and HDL code.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#e6edf5',
    tint: '#22d3ee',

    // Core surfaces
    background: '#0b1220',
    foreground: '#e6edf5',

    // Cards / elevated surfaces
    card: '#121c31',
    cardForeground: '#e6edf5',

    // Primary action color (buttons, links, active states) — circuit trace cyan
    primary: '#22d3ee',
    primaryForeground: '#04141a',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#1b2740',
    secondaryForeground: '#c8d3e6',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#16213a',
    mutedForeground: '#8494b3',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#1e2b47',
    accentForeground: '#5eead4',

    // Warning (validation issues, blocked safety filter notices)
    warning: '#f5a524',
    warningForeground: '#241a02',

    // Destructive actions (delete, error states)
    destructive: '#f87171',
    destructiveForeground: '#1c0605',

    // Borders and input outlines
    border: '#22304f',
    input: '#1b2740',
  },

  // Border radius (in px) applied to cards, buttons, inputs, and modals.
  radius: 14,
};

export default colors;
