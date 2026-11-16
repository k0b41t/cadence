import type { PresetColumnBgColor } from '../types/kanban';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export const PRESET_COLUMN_COLORS: Record<
  PresetColumnBgColor,
  { r: number; g: number; b: number; hex: string; label: string }
> = {
  amber: { r: 245, g: 158, b: 11, hex: '#f59e0b', label: 'Yellow' },
  red: { r: 239, g: 68, b: 68, hex: '#ef4444', label: 'Red' },
  emerald: { r: 16, g: 185, b: 129, hex: '#10b981', label: 'Green' },
  blue: { r: 59, g: 130, b: 246, hex: '#3b82f6', label: 'Blue' },
  violet: { r: 139, g: 92, b: 246, hex: '#8b5cf6', label: 'Purple' },
  slate: { r: 100, g: 116, b: 139, hex: '#64748b', label: 'Slate' },
};

export const RGB_PALETTE_QUICK_SWATCHES: Array<{ label: string; r: number; g: number; b: number }> = [
  { label: 'Yellow', r: 245, g: 158, b: 11 },
  { label: 'Orange', r: 249, g: 115, b: 22 },
  { label: 'Red', r: 239, g: 68, b: 68 },
  { label: 'Rose', r: 244, g: 63, b: 94 },
  { label: 'Green', r: 16, g: 185, b: 129 },
  { label: 'Teal', r: 20, g: 184, b: 166 },
  { label: 'Blue', r: 59, g: 130, b: 246 },
  { label: 'Purple', r: 139, g: 92, b: 246 },
  { label: 'Slate', r: 100, g: 116, b: 139 },
];

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export function isPresetColumnColor(value: string): value is PresetColumnBgColor {
  return value in PRESET_COLUMN_COLORS;
}

export function isValidColumnColorValue(value: string): boolean {
  return isPresetColumnColor(value) || HEX_COLOR_REGEX.test(value);
}

export function clampRgbChannel(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(255, Math.round(val)));
}

export function rgbToHex(r: number, g: number, b: number): string {
  const cr = clampRgbChannel(r).toString(16).padStart(2, '0');
  const cg = clampRgbChannel(g).toString(16).padStart(2, '0');
  const cb = clampRgbChannel(b).toString(16).padStart(2, '0');
  return `#${cr}${cg}${cb}`;
}

export function normalizeColumnColorValue(value: string): string {
  const trimmed = (value ?? '').trim();
  if (isPresetColumnColor(trimmed)) return trimmed;
  if (HEX_COLOR_REGEX.test(trimmed)) return trimmed.toLowerCase();
  return 'amber';
}

export function parseColumnColorToRgb(color: string): RgbColor {
  const trimmed = (color ?? '').trim();
  if (isPresetColumnColor(trimmed)) {
    const preset = PRESET_COLUMN_COLORS[trimmed];
    return { r: preset.r, g: preset.g, b: preset.b };
  }
  if (HEX_COLOR_REGEX.test(trimmed)) {
    return {
      r: parseInt(trimmed.slice(1, 3), 16),
      g: parseInt(trimmed.slice(3, 5), 16),
      b: parseInt(trimmed.slice(5, 7), 16),
    };
  }
  return { r: 245, g: 158, b: 11 };
}

export function formatRgbLabel(color: string): string {
  const { r, g, b } = parseColumnColorToRgb(color);
  return `${r}, ${g}, ${b}`;
}
