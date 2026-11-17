export interface FontOption {
  id: string;
  label: string;
  category: string;
  sample: string;
  stack: string;
}

export interface FontPreferences {
  displayFont: string;
  bodyFont: string;
  displayLetterSpacing: number;
  bodyLetterSpacing: number;
}

export const FONT_STORAGE_KEY = 'cadence_font_preferences_v1';

export const DEFAULT_FONT_PREFERENCES: FontPreferences = {
  displayFont: 'plus-jakarta-sans',
  bodyFont: 'dm-sans',
  displayLetterSpacing: 0,
  bodyLetterSpacing: 0,
};

export const DISPLAY_TRACKING_MIN = -0.02;
export const DISPLAY_TRACKING_MAX = 0.2;
export const BODY_TRACKING_MIN = -0.01;
export const BODY_TRACKING_MAX = 0.12;

export const FONT_OPTIONS: FontOption[] = [
  {
    id: 'plus-jakarta-sans',
    label: 'Plus Jakarta Sans',
    category: 'Default Headings',
    sample: 'Organize every sprint cleanly',
    stack: '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
  },
  {
    id: 'dm-sans',
    label: 'DM Sans',
    category: 'Default Body',
    sample: 'Clear tasks, priorities & timelines',
    stack: '"DM Sans", system-ui, -apple-system, sans-serif',
  },
  {
    id: 'michroma',
    label: 'Michroma',
    category: 'Micro-Futuristic',
    sample: 'Precision sprint telemetry',
    stack: '"Michroma", system-ui, sans-serif',
  },
  {
    id: 'audiowide',
    label: 'Audiowide',
    category: 'Techno Display',
    sample: 'Next-gen workflow control',
    stack: '"Audiowide", system-ui, sans-serif',
  },
  {
    id: 'zen-dots',
    label: 'Zen Dots',
    category: 'Sci-Fi Geometric',
    sample: 'Modular lane architecture',
    stack: '"Zen Dots", system-ui, sans-serif',
  },
  {
    id: 'bruno-ace-sc',
    label: 'Bruno Ace SC',
    category: 'Aero Small-Caps',
    sample: 'Launch sequence active',
    stack: '"Bruno Ace SC", system-ui, sans-serif',
  },
  {
    id: 'blinker',
    label: 'Blinker',
    category: 'Technical Sans',
    sample: 'Compact high-density clarity',
    stack: '"Blinker", system-ui, sans-serif',
  },
  {
    id: 'goldman',
    label: 'Goldman',
    category: 'Square Geometric',
    sample: 'Structured sprint milestones',
    stack: '"Goldman", system-ui, sans-serif',
  },
  {
    id: 'orbit',
    label: 'Orbit',
    category: 'Modular Sans',
    sample: 'Balanced workspace rhythm',
    stack: '"Orbit", system-ui, sans-serif',
  },
  {
    id: 'protest-riot',
    label: 'Protest Riot',
    category: 'Expressive Brush',
    sample: 'Bold creative momentum',
    stack: '"Protest Riot", system-ui, sans-serif',
  },
  {
    id: 'bangers',
    label: 'Bangers',
    category: 'Comic Impact',
    sample: 'Ship sprints with energy',
    stack: '"Bangers", system-ui, sans-serif',
  },
  {
    id: 'jolly-lodger',
    label: 'Jolly Lodger',
    category: 'Playful Gothic',
    sample: 'Midnight release party',
    stack: '"Jolly Lodger", system-ui, sans-serif',
  },
  {
    id: 'atkinson-hyperlegible',
    label: 'Atkinson Hyperlegible',
    category: 'Accessibility Sans',
    sample: 'Distinct letterforms for fast reading',
    stack: '"Atkinson Hyperlegible", system-ui, -apple-system, sans-serif',
  },
  {
    id: 'lexend',
    label: 'Lexend',
    category: 'Reading Fluency',
    sample: 'Effortless scanning across every lane',
    stack: '"Lexend", system-ui, -apple-system, sans-serif',
  },
];

const VALID_FONT_IDS = new Set(FONT_OPTIONS.map((f) => f.id));

function clampTracking(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.round(Math.max(min, Math.min(max, value)) * 1000) / 1000;
}

export function getFontOption(id: string | undefined, fallbackId: string): FontOption {
  const target = id && VALID_FONT_IDS.has(id) ? id : fallbackId;
  return FONT_OPTIONS.find((f) => f.id === target) ?? FONT_OPTIONS[0];
}

export function loadStoredFonts(): FontPreferences {
  if (typeof window === 'undefined') return DEFAULT_FONT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(FONT_STORAGE_KEY);
    if (!raw) return DEFAULT_FONT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<FontPreferences>;
    return {
      displayFont:
        parsed.displayFont && VALID_FONT_IDS.has(parsed.displayFont)
          ? parsed.displayFont
          : DEFAULT_FONT_PREFERENCES.displayFont,
      bodyFont:
        parsed.bodyFont && VALID_FONT_IDS.has(parsed.bodyFont)
          ? parsed.bodyFont
          : DEFAULT_FONT_PREFERENCES.bodyFont,
      displayLetterSpacing: clampTracking(
        parsed.displayLetterSpacing,
        DISPLAY_TRACKING_MIN,
        DISPLAY_TRACKING_MAX,
        DEFAULT_FONT_PREFERENCES.displayLetterSpacing
      ),
      bodyLetterSpacing: clampTracking(
        parsed.bodyLetterSpacing,
        BODY_TRACKING_MIN,
        BODY_TRACKING_MAX,
        DEFAULT_FONT_PREFERENCES.bodyLetterSpacing
      ),
    };
  } catch {
    return DEFAULT_FONT_PREFERENCES;
  }
}

export function saveStoredFonts(fonts: FontPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify(fonts));
  } catch {
    // Ignore storage quota errors
  }
}

export function areFontsDefault(fonts: FontPreferences): boolean {
  return (
    fonts.displayFont === DEFAULT_FONT_PREFERENCES.displayFont &&
    fonts.bodyFont === DEFAULT_FONT_PREFERENCES.bodyFont &&
    Math.abs(fonts.displayLetterSpacing) < 0.001 &&
    Math.abs(fonts.bodyLetterSpacing) < 0.001
  );
}

export function applyFontsToDocument(fonts: FontPreferences): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  if (fonts.displayFont === DEFAULT_FONT_PREFERENCES.displayFont) {
    root.style.removeProperty('--font-display');
  } else {
    const displayOpt = getFontOption(fonts.displayFont, DEFAULT_FONT_PREFERENCES.displayFont);
    root.style.setProperty('--font-display', displayOpt.stack);
  }

  if (fonts.bodyFont === DEFAULT_FONT_PREFERENCES.bodyFont) {
    root.style.removeProperty('--font-sans');
  } else {
    const bodyOpt = getFontOption(fonts.bodyFont, DEFAULT_FONT_PREFERENCES.bodyFont);
    root.style.setProperty('--font-sans', bodyOpt.stack);
  }

  if (Math.abs(fonts.displayLetterSpacing) >= 0.001) {
    root.setAttribute('data-custom-display-tracking', 'true');
    root.style.setProperty('--font-display-tracking', `${fonts.displayLetterSpacing.toFixed(3)}em`);
  } else {
    root.removeAttribute('data-custom-display-tracking');
    root.style.removeProperty('--font-display-tracking');
  }

  if (Math.abs(fonts.bodyLetterSpacing) >= 0.001) {
    root.setAttribute('data-custom-body-tracking', 'true');
    root.style.setProperty('--font-body-tracking', `${fonts.bodyLetterSpacing.toFixed(3)}em`);
  } else {
    root.removeAttribute('data-custom-body-tracking');
    root.style.removeProperty('--font-body-tracking');
  }
}
