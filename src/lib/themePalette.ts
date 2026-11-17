import type { ThemeMode } from '../types/kanban';

export interface ModeColorPalette {
  canvasBg: string;
  surfaceBg: string;
  subtleBg: string;
  borderColor: string;
  textPrimary: string;
  textMuted: string;
  accent: string;
}

export interface AppColorPalettes {
  light: ModeColorPalette;
  dark: ModeColorPalette;
}

export interface PalettePreset {
  id: string;
  name: string;
  description: string;
  palettes: AppColorPalettes;
}

export const PALETTE_STORAGE_KEY = 'cadence_color_palettes_v1';

export const DEFAULT_PALETTES: AppColorPalettes = {
  light: {
    canvasBg: '#f8fafc',
    surfaceBg: '#ffffff',
    subtleBg: '#f1f5f9',
    borderColor: '#e2e8f0',
    textPrimary: '#0f172a',
    textMuted: '#64748b',
    accent: '#2563eb',
  },
  dark: {
    canvasBg: '#020617',
    surfaceBg: '#0f172a',
    subtleBg: '#1e293b',
    borderColor: '#334155',
    textPrimary: '#f1f5f9',
    textMuted: '#94a3b8',
    accent: '#2563eb',
  },
};

export const PALETTE_PRESETS: PalettePreset[] = [
  {
    id: 'default',
    name: 'Cadence Default',
    description: 'Cool slate surfaces with cobalt blue accent',
    palettes: DEFAULT_PALETTES,
  },
  {
    id: 'warm-studio',
    name: 'Warm Studio',
    description: 'Soft ivory paper and espresso charcoal with terracotta-indigo',
    palettes: {
      light: {
        canvasBg: '#faf8f5',
        surfaceBg: '#ffffff',
        subtleBg: '#f3efe9',
        borderColor: '#e5dfd5',
        textPrimary: '#1c1917',
        textMuted: '#78716c',
        accent: '#c2410c',
      },
      dark: {
        canvasBg: '#141210',
        surfaceBg: '#1c1917',
        subtleBg: '#292524',
        borderColor: '#44403c',
        textPrimary: '#f5f5f4',
        textMuted: '#a8a29e',
        accent: '#ea580c',
      },
    },
  },
  {
    id: 'botanical-sage',
    name: 'Botanical Sage',
    description: 'Calm mineral greens for long focus sprints',
    palettes: {
      light: {
        canvasBg: '#f4f7f5',
        surfaceBg: '#ffffff',
        subtleBg: '#e8efe9',
        borderColor: '#d5e0d7',
        textPrimary: '#11221a',
        textMuted: '#536b5e',
        accent: '#059669',
      },
      dark: {
        canvasBg: '#08120e',
        surfaceBg: '#0f1d17',
        subtleBg: '#182c23',
        borderColor: '#2b4539',
        textPrimary: '#ecf5ef',
        textMuted: '#8ca899',
        accent: '#10b981',
      },
    },
  },
  {
    id: 'nordic-frost',
    name: 'Nordic Frost',
    description: 'Crisp glacier blues and midnight steel',
    palettes: {
      light: {
        canvasBg: '#f3f7fa',
        surfaceBg: '#ffffff',
        subtleBg: '#e7eff6',
        borderColor: '#d2e0ec',
        textPrimary: '#0c1b2a',
        textMuted: '#536a80',
        accent: '#0284c7',
      },
      dark: {
        canvasBg: '#07111b',
        surfaceBg: '#0d1b2a',
        subtleBg: '#17293d',
        borderColor: '#2a4159',
        textPrimary: '#eef6fc',
        textMuted: '#8ba4bc',
        accent: '#0ea5e9',
      },
    },
  },
  {
    id: 'graphite-violet',
    name: 'Editorial Graphite',
    description: 'Neutral stone surfaces with royal violet controls',
    palettes: {
      light: {
        canvasBg: '#f7f7f9',
        surfaceBg: '#ffffff',
        subtleBg: '#ededf2',
        borderColor: '#dcdce5',
        textPrimary: '#18181b',
        textMuted: '#636370',
        accent: '#6d28d9',
      },
      dark: {
        canvasBg: '#09090d',
        surfaceBg: '#14141b',
        subtleBg: '#20202b',
        borderColor: '#343446',
        textPrimary: '#f4f4f7',
        textMuted: '#9898a8',
        accent: '#7c3aed',
      },
    },
  },
];

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

export function normalizeHex(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return HEX_REGEX.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

function sanitizeModePalette(
  raw: Partial<ModeColorPalette> | undefined,
  defaults: ModeColorPalette
): ModeColorPalette {
  return {
    canvasBg: normalizeHex(raw?.canvasBg, defaults.canvasBg),
    surfaceBg: normalizeHex(raw?.surfaceBg, defaults.surfaceBg),
    subtleBg: normalizeHex(raw?.subtleBg, defaults.subtleBg),
    borderColor: normalizeHex(raw?.borderColor, defaults.borderColor),
    textPrimary: normalizeHex(raw?.textPrimary, defaults.textPrimary),
    textMuted: normalizeHex(raw?.textMuted, defaults.textMuted),
    accent: normalizeHex(raw?.accent, defaults.accent),
  };
}

export function loadStoredPalettes(): AppColorPalettes {
  if (typeof window === 'undefined') return DEFAULT_PALETTES;
  try {
    const raw = window.localStorage.getItem(PALETTE_STORAGE_KEY);
    if (!raw) return DEFAULT_PALETTES;
    const parsed = JSON.parse(raw) as Partial<AppColorPalettes>;
    return {
      light: sanitizeModePalette(parsed.light, DEFAULT_PALETTES.light),
      dark: sanitizeModePalette(parsed.dark, DEFAULT_PALETTES.dark),
    };
  } catch {
    return DEFAULT_PALETTES;
  }
}

export function saveStoredPalettes(palettes: AppColorPalettes): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(palettes));
  } catch {
    // Ignore storage quota errors
  }
}

export function isModePaletteDefault(palette: ModeColorPalette, mode: ThemeMode): boolean {
  const def = DEFAULT_PALETTES[mode];
  return (
    palette.canvasBg === def.canvasBg &&
    palette.surfaceBg === def.surfaceBg &&
    palette.subtleBg === def.subtleBg &&
    palette.borderColor === def.borderColor &&
    palette.textPrimary === def.textPrimary &&
    palette.textMuted === def.textMuted &&
    palette.accent === def.accent
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = normalizeHex(hex, '#000000');
  return {
    r: parseInt(clean.slice(1, 3), 16),
    g: parseInt(clean.slice(3, 5), 16),
    b: parseInt(clean.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g)
    .toString(16)
    .padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

export function mixHex(hexA: string, hexB: string, weightB: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const t = Math.max(0, Math.min(1, weightB));
  return rgbToHex(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t
  );
}

function linearChannel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}

export function getContrastRatio(hexA: string, hexB: string): number {
  const lumA = getRelativeLuminance(hexA);
  const lumB = getRelativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

const SLATE_VAR_NAMES = [
  '--color-slate-50',
  '--color-slate-100',
  '--color-slate-200',
  '--color-slate-300',
  '--color-slate-400',
  '--color-slate-500',
  '--color-slate-600',
  '--color-slate-700',
  '--color-slate-800',
  '--color-slate-900',
  '--color-slate-950',
] as const;

const BLUE_VAR_NAMES = [
  '--color-blue-50',
  '--color-blue-100',
  '--color-blue-200',
  '--color-blue-300',
  '--color-blue-400',
  '--color-blue-500',
  '--color-blue-600',
  '--color-blue-700',
  '--color-blue-800',
  '--color-blue-900',
  '--color-blue-950',
] as const;

export function applyPaletteToDocument(
  palettes: AppColorPalettes,
  activeTheme: ThemeMode
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const active = palettes[activeTheme];

  if (isModePaletteDefault(active, activeTheme)) {
    root.style.removeProperty('--cadence-surface-white');
    SLATE_VAR_NAMES.forEach((v) => root.style.removeProperty(v));
    BLUE_VAR_NAMES.forEach((v) => root.style.removeProperty(v));
    return;
  }

  if (activeTheme === 'light') {
    root.style.setProperty('--cadence-surface-white', active.surfaceBg);
    root.style.setProperty('--color-slate-50', active.canvasBg);
    root.style.setProperty('--color-slate-100', active.subtleBg);
    root.style.setProperty('--color-slate-200', active.borderColor);
    root.style.setProperty('--color-slate-300', mixHex(active.borderColor, active.textMuted, 0.28));
    root.style.setProperty('--color-slate-400', mixHex(active.textMuted, active.borderColor, 0.32));
    root.style.setProperty('--color-slate-500', active.textMuted);
    root.style.setProperty('--color-slate-600', mixHex(active.textMuted, active.textPrimary, 0.36));
    root.style.setProperty('--color-slate-700', mixHex(active.textMuted, active.textPrimary, 0.62));
    root.style.setProperty('--color-slate-800', mixHex(active.textMuted, active.textPrimary, 0.84));
    root.style.setProperty('--color-slate-900', active.textPrimary);
    root.style.setProperty('--color-slate-950', mixHex(active.textPrimary, '#000000', 0.45));

    root.style.setProperty('--color-blue-50', mixHex(active.accent, active.surfaceBg, 0.92));
    root.style.setProperty('--color-blue-100', mixHex(active.accent, active.surfaceBg, 0.85));
    root.style.setProperty('--color-blue-200', mixHex(active.accent, active.surfaceBg, 0.72));
    root.style.setProperty('--color-blue-300', mixHex(active.accent, '#ffffff', 0.55));
    root.style.setProperty('--color-blue-400', mixHex(active.accent, '#ffffff', 0.32));
    root.style.setProperty('--color-blue-500', mixHex(active.accent, '#ffffff', 0.14));
    root.style.setProperty('--color-blue-600', active.accent);
    root.style.setProperty('--color-blue-700', mixHex(active.accent, '#000000', 0.16));
    root.style.setProperty('--color-blue-800', mixHex(active.accent, '#000000', 0.3));
    root.style.setProperty('--color-blue-900', mixHex(active.accent, '#000000', 0.44));
    root.style.setProperty('--color-blue-950', mixHex(active.accent, '#000000', 0.6));
  } else {
    root.style.removeProperty('--cadence-surface-white');
    root.style.setProperty('--color-slate-950', active.canvasBg);
    root.style.setProperty('--color-slate-900', active.surfaceBg);
    root.style.setProperty('--color-slate-800', active.subtleBg);
    root.style.setProperty('--color-slate-700', active.borderColor);
    root.style.setProperty('--color-slate-600', mixHex(active.borderColor, active.textMuted, 0.34));
    root.style.setProperty('--color-slate-500', mixHex(active.textMuted, active.borderColor, 0.3));
    root.style.setProperty('--color-slate-400', active.textMuted);
    root.style.setProperty('--color-slate-300', mixHex(active.textMuted, active.textPrimary, 0.45));
    root.style.setProperty('--color-slate-200', mixHex(active.textMuted, active.textPrimary, 0.72));
    root.style.setProperty('--color-slate-100', active.textPrimary);
    root.style.setProperty('--color-slate-50', mixHex(active.textPrimary, '#ffffff', 0.5));

    root.style.setProperty('--color-blue-50', mixHex(active.accent, '#ffffff', 0.9));
    root.style.setProperty('--color-blue-100', mixHex(active.accent, '#ffffff', 0.8));
    root.style.setProperty('--color-blue-200', mixHex(active.accent, '#ffffff', 0.68));
    root.style.setProperty('--color-blue-300', mixHex(active.accent, '#ffffff', 0.52));
    root.style.setProperty('--color-blue-400', mixHex(active.accent, '#ffffff', 0.32));
    root.style.setProperty('--color-blue-500', mixHex(active.accent, '#ffffff', 0.14));
    root.style.setProperty('--color-blue-600', active.accent);
    root.style.setProperty('--color-blue-700', mixHex(active.accent, '#000000', 0.16));
    root.style.setProperty('--color-blue-800', mixHex(active.accent, active.canvasBg, 0.4));
    root.style.setProperty('--color-blue-900', mixHex(active.accent, active.canvasBg, 0.55));
    root.style.setProperty('--color-blue-950', mixHex(active.accent, active.canvasBg, 0.72));
  }
}
