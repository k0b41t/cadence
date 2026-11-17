import { useEffect, useState, type CSSProperties } from 'react';
import { Moon, Palette, RotateCcw, Sun, Type, X } from 'lucide-react';
import {
  areFontsDefault,
  BODY_TRACKING_MAX,
  BODY_TRACKING_MIN,
  DEFAULT_FONT_PREFERENCES,
  DISPLAY_TRACKING_MAX,
  DISPLAY_TRACKING_MIN,
  FONT_OPTIONS,
  getFontOption,
  type FontPreferences,
} from '../lib/themeFonts';
import {
  DEFAULT_PALETTES,
  getContrastRatio,
  isModePaletteDefault,
  normalizeHex,
  PALETTE_PRESETS,
  type AppColorPalettes,
  type ModeColorPalette,
} from '../lib/themePalette';
import type { ThemeMode } from '../types/kanban';

interface ThemeSettingsModalProps {
  activeTheme: ThemeMode;
  palettes: AppColorPalettes;
  fonts: FontPreferences;
  onChangePalettes: (next: AppColorPalettes) => void;
  onChangeFonts: (next: FontPreferences) => void;
  onSwitchTheme: (mode: ThemeMode) => void;
  onClose: () => void;
}

const COLOR_ROLES: Array<{
  key: keyof ModeColorPalette;
  label: string;
  description: string;
}> = [
  {
    key: 'canvasBg',
    label: 'App Background',
    description: 'Main workspace backdrop behind columns',
  },
  {
    key: 'surfaceBg',
    label: 'Cards, Sidebar & Header',
    description: 'Elevated workspace panels and task cards',
  },
  {
    key: 'subtleBg',
    label: 'Columns & Controls',
    description: 'Kanban lane surfaces, tabs, and hover wells',
  },
  {
    key: 'borderColor',
    label: 'Borders & Inputs',
    description: 'Hairline dividers and form field outlines',
  },
  {
    key: 'textPrimary',
    label: 'Primary Text',
    description: 'Headings, card titles, and active labels',
  },
  {
    key: 'textMuted',
    label: 'Muted Text',
    description: 'Metadata, helper hints, and timestamps',
  },
  {
    key: 'accent',
    label: 'Primary Accent',
    description: 'Action buttons, active board, and focus rings',
  },
];

export function ThemeSettingsModal({
  activeTheme,
  palettes,
  fonts,
  onChangePalettes,
  onChangeFonts,
  onSwitchTheme,
  onClose,
}: ThemeSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'colors' | 'fonts'>('colors');
  const [editingMode, setEditingMode] = useState<ThemeMode>(activeTheme);
  const [fontTarget, setFontTarget] = useState<'display' | 'body' | 'both'>('both');
  const [hexDrafts, setHexDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const currentModePalette = palettes[editingMode];
  const currentDefaults = DEFAULT_PALETTES[editingMode];
  const isDefaultMode = isModePaletteDefault(currentModePalette, editingMode);
  const isDefaultFonts = areFontsDefault(fonts);
  const isAllDefault =
    isModePaletteDefault(palettes.light, 'light') &&
    isModePaletteDefault(palettes.dark, 'dark') &&
    isDefaultFonts;

  const activeDisplayOption = getFontOption(
    fonts.displayFont,
    DEFAULT_FONT_PREFERENCES.displayFont
  );
  const activeBodyOption = getFontOption(
    fonts.bodyFont,
    DEFAULT_FONT_PREFERENCES.bodyFont
  );

  const textContrast = getContrastRatio(
    currentModePalette.textPrimary,
    currentModePalette.surfaceBg
  );
  const accentContrast = getContrastRatio('#ffffff', currentModePalette.accent);

  const handleTabSelect = (mode: ThemeMode) => {
    setEditingMode(mode);
    setHexDrafts({});
    if (activeTheme !== mode) {
      onSwitchTheme(mode);
    }
  };

  const updateColor = (key: keyof ModeColorPalette, rawHex: string) => {
    const normalized = normalizeHex(rawHex, currentModePalette[key]);
    onChangePalettes({
      ...palettes,
      [editingMode]: {
        ...currentModePalette,
        [key]: normalized,
      },
    });
  };

  const handleHexInputChange = (key: keyof ModeColorPalette, value: string) => {
    const formatted = value.startsWith('#') ? value.slice(0, 7) : `#${value.slice(0, 6)}`;
    setHexDrafts((prev) => ({ ...prev, [key]: formatted }));
    if (/^#[0-9a-fA-F]{6}$/.test(formatted)) {
      updateColor(key, formatted);
    }
  };

  const handleHexInputBlur = (key: keyof ModeColorPalette) => {
    setHexDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleResetMode = () => {
    setHexDrafts({});
    onChangePalettes({
      ...palettes,
      [editingMode]: { ...DEFAULT_PALETTES[editingMode] },
    });
  };

  const handleResetFonts = () => {
    onChangeFonts({ ...DEFAULT_FONT_PREFERENCES });
  };

  const handleResetAll = () => {
    setHexDrafts({});
    onChangePalettes({
      light: { ...DEFAULT_PALETTES.light },
      dark: { ...DEFAULT_PALETTES.dark },
    });
    onChangeFonts({ ...DEFAULT_FONT_PREFERENCES });
  };

  const handleApplyPreset = (presetPalettes: AppColorPalettes) => {
    setHexDrafts({});
    onChangePalettes({
      light: { ...presetPalettes.light },
      dark: { ...presetPalettes.dark },
    });
  };

  const handleSelectFont = (fontId: string) => {
    if (fontTarget === 'display') {
      onChangeFonts({ ...fonts, displayFont: fontId });
    } else if (fontTarget === 'body') {
      onChangeFonts({ ...fonts, bodyFont: fontId });
    } else {
      onChangeFonts({ ...fonts, displayFont: fontId, bodyFont: fontId });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-settings-heading"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Palette className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="min-w-0">
              <h2
                id="theme-settings-heading"
                className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 truncate"
              >
                Appearance &amp; Theme
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Customize Light/Dark color palettes and typography on this device.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close appearance settings"
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Section Tabs */}
        <div className="px-6 pt-3 pb-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/30 shrink-0">
          <div
            role="tablist"
            aria-label="Appearance categories"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'colors'}
              onClick={() => setActiveTab('colors')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'colors'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Color Palette</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'fonts'}
              onClick={() => setActiveTab('fonts')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'fonts'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              <span>Fonts</span>
            </button>
          </div>

          <div
            role="group"
            aria-label="Preview light or dark mode"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
          >
            <button
              type="button"
              onClick={() => handleTabSelect('light')}
              aria-pressed={editingMode === 'light'}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                editingMode === 'light'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Light Mode</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabSelect('dark')}
              aria-pressed={editingMode === 'dark'}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                editingMode === 'dark'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Dark Mode</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'colors' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Curated Themes
                </div>
                {!isDefaultMode && (
                  <button
                    type="button"
                    onClick={handleResetMode}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md transition-colors whitespace-nowrap"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset {editingMode === 'light' ? 'Light' : 'Dark'} colors</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                {PALETTE_PRESETS.map((preset) => {
                  const modeView = preset.palettes[editingMode];
                  const isActive =
                    palettes.light.canvasBg === preset.palettes.light.canvasBg &&
                    palettes.light.accent === preset.palettes.light.accent &&
                    palettes.dark.canvasBg === preset.palettes.dark.canvasBg &&
                    palettes.dark.accent === preset.palettes.dark.accent;

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyPreset(preset.palettes)}
                      title={preset.description}
                      className={`p-2.5 rounded-lg border text-left transition-colors space-y-2 ${
                        isActive
                          ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/60 dark:bg-slate-950/40'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <span
                          style={{ '--sw': modeView.canvasBg } as CSSProperties}
                          className="w-4 h-4 rounded-sm border border-slate-300/70 dark:border-slate-700 bg-[color:var(--sw)]"
                        />
                        <span
                          style={{ '--sw': modeView.surfaceBg } as CSSProperties}
                          className="w-4 h-4 rounded-sm border border-slate-300/70 dark:border-slate-700 bg-[color:var(--sw)]"
                        />
                        <span
                          style={{ '--sw': modeView.accent } as CSSProperties}
                          className="w-4 h-4 rounded-sm border border-slate-300/70 dark:border-slate-700 bg-[color:var(--sw)]"
                        />
                      </div>
                      <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                        {preset.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2-Column Active Editor + Live Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {activeTab === 'colors' ? (
              <div className="lg:col-span-7 divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {COLOR_ROLES.map((role) => {
                  const value = currentModePalette[role.key];
                  const defaultValue = currentDefaults[role.key];
                  const displayHex = hexDrafts[role.key] ?? value;
                  const isModified = value !== defaultValue;

                  return (
                    <div
                      key={role.key}
                      className="px-4 py-3 flex items-center justify-between gap-3 bg-white dark:bg-slate-900"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {role.label}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {role.description}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isModified && (
                          <button
                            type="button"
                            onClick={() => {
                              handleHexInputBlur(role.key);
                              updateColor(role.key, defaultValue);
                            }}
                            title={`Reset to default (${defaultValue})`}
                            aria-label={`Reset ${role.label} to default`}
                            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <input
                          type="color"
                          value={value}
                          onChange={(e) => {
                            handleHexInputBlur(role.key);
                            updateColor(role.key, e.target.value);
                          }}
                          aria-label={`${role.label} color picker for ${editingMode} mode`}
                          className="w-8 h-8 rounded-md border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer p-0.5"
                        />

                        <input
                          type="text"
                          value={displayHex}
                          onChange={(e) => handleHexInputChange(role.key, e.target.value)}
                          onBlur={() => handleHexInputBlur(role.key)}
                          maxLength={7}
                          aria-label={`${role.label} hex code for ${editingMode} mode`}
                          className="w-20 px-2 py-1.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="lg:col-span-7 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      Apply to
                    </span>
                    <div
                      role="group"
                      aria-label="Font application target"
                      className="inline-flex items-center gap-0.5 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    >
                      {(
                        [
                          { id: 'both', label: 'Headings & Body' },
                          { id: 'display', label: 'Headings' },
                          { id: 'body', label: 'Body' },
                        ] as const
                      ).map((target) => (
                        <button
                          key={target.id}
                          type="button"
                          onClick={() => setFontTarget(target.id)}
                          aria-pressed={fontTarget === target.id}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            fontTarget === target.id
                              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                          }`}
                        >
                          {target.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {!isDefaultFonts && (
                    <button
                      type="button"
                      onClick={handleResetFonts}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md transition-colors whitespace-nowrap"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset fonts</span>
                    </button>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-4 space-y-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <label
                          htmlFor="display-letter-spacing"
                          className="text-xs font-semibold text-slate-900 dark:text-slate-100"
                        >
                          Heading Letter Spacing
                        </label>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Helps bolded display headers breathe cleanly.
                        </p>
                      </div>
                      <span className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {fonts.displayLetterSpacing > 0 ? '+' : ''}
                        {fonts.displayLetterSpacing.toFixed(2)}em
                      </span>
                    </div>

                    <input
                      id="display-letter-spacing"
                      type="range"
                      min={DISPLAY_TRACKING_MIN}
                      max={DISPLAY_TRACKING_MAX}
                      step={0.01}
                      value={fonts.displayLetterSpacing}
                      onChange={(e) =>
                        onChangeFonts({
                          ...fonts,
                          displayLetterSpacing: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-blue-600 cursor-pointer"
                    />

                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        { label: 'Default (0)', value: 0 },
                        { label: '+0.03em', value: 0.03 },
                        { label: '+0.06em', value: 0.06 },
                        { label: '+0.10em', value: 0.1 },
                        { label: '+0.14em', value: 0.14 },
                      ].map((preset) => {
                        const active = Math.abs(fonts.displayLetterSpacing - preset.value) < 0.005;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() =>
                              onChangeFonts({
                                ...fonts,
                                displayLetterSpacing: preset.value,
                              })
                            }
                            className={`px-2 py-1 text-[11px] font-mono tabular-nums rounded-md border transition-colors whitespace-nowrap ${
                              active
                                ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="body-letter-spacing"
                        className="text-xs font-semibold text-slate-900 dark:text-slate-100"
                      >
                        Body Letter Spacing
                      </label>
                      <span className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {fonts.bodyLetterSpacing > 0 ? '+' : ''}
                        {fonts.bodyLetterSpacing.toFixed(2)}em
                      </span>
                    </div>

                    <input
                      id="body-letter-spacing"
                      type="range"
                      min={BODY_TRACKING_MIN}
                      max={BODY_TRACKING_MAX}
                      step={0.01}
                      value={fonts.bodyLetterSpacing}
                      onChange={(e) =>
                        onChangeFonts({
                          ...fonts,
                          bodyLetterSpacing: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {FONT_OPTIONS.map((font) => {
                    const isDisplay = fonts.displayFont === font.id;
                    const isBody = fonts.bodyFont === font.id;
                    const isSelectedForTarget =
                      fontTarget === 'display'
                        ? isDisplay
                        : fontTarget === 'body'
                          ? isBody
                          : isDisplay && isBody;

                    let activeRoleText: string | null = null;
                    if (isDisplay && isBody) {
                      activeRoleText = 'Headings & Body';
                    } else if (isDisplay) {
                      activeRoleText = 'Headings';
                    } else if (isBody) {
                      activeRoleText = 'Body';
                    }

                    return (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => handleSelectFont(font.id)}
                        style={
                          {
                            '--card-font': font.stack,
                            '--card-tracking': `${fonts.displayLetterSpacing.toFixed(3)}em`,
                          } as CSSProperties
                        }
                        className={`p-3 rounded-lg border text-left transition-colors space-y-1.5 ${
                          isSelectedForTarget || isDisplay || isBody
                            ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/35'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="[font-family:var(--card-font)] [letter-spacing:var(--card-tracking)] text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                            {font.label}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                            {activeRoleText ?? font.category}
                          </span>
                        </div>
                        <div className="[font-family:var(--card-font)] text-xs text-slate-600 dark:text-slate-400 truncate">
                          {font.sample}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Live Mode Preview Card + Readability & Font Summary */}
            <div className="lg:col-span-5 space-y-3">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {editingMode === 'light' ? 'Light Mode' : 'Dark Mode'} Preview
              </div>

              <div
                style={
                  {
                    '--pv-canvas': currentModePalette.canvasBg,
                    '--pv-surface': currentModePalette.surfaceBg,
                    '--pv-subtle': currentModePalette.subtleBg,
                    '--pv-border': currentModePalette.borderColor,
                    '--pv-text': currentModePalette.textPrimary,
                    '--pv-muted': currentModePalette.textMuted,
                    '--pv-accent': currentModePalette.accent,
                    '--pv-display-font': activeDisplayOption.stack,
                    '--pv-body-font': activeBodyOption.stack,
                    '--pv-display-tracking': `${fonts.displayLetterSpacing.toFixed(3)}em`,
                    '--pv-body-tracking': `${fonts.bodyLetterSpacing.toFixed(3)}em`,
                  } as CSSProperties
                }
                className="[font-family:var(--pv-body-font)] [letter-spacing:var(--pv-body-tracking)] rounded-xl border border-[color:var(--pv-border)] bg-[color:var(--pv-canvas)] p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-[color:var(--pv-border)]">
                  <span className="[font-family:var(--pv-display-font)] [letter-spacing:var(--pv-display-tracking)] text-sm font-bold text-[color:var(--pv-text)] truncate">
                    Sprint Board
                  </span>
                  <span className="px-2.5 py-1 text-[11px] font-semibold text-white bg-[color:var(--pv-accent)] rounded-md whitespace-nowrap shrink-0">
                    New task
                  </span>
                </div>

                <div className="rounded-lg border border-[color:var(--pv-border)] bg-[color:var(--pv-subtle)] p-2.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[color:var(--pv-text)]">
                    <span className="[font-family:var(--pv-display-font)] [letter-spacing:var(--pv-display-tracking)]">
                      In Progress
                    </span>
                    <span className="font-mono tabular-nums text-[color:var(--pv-muted)]">2/4</span>
                  </div>
                  <div className="rounded-md border border-[color:var(--pv-border)] bg-[color:var(--pv-surface)] p-2.5 space-y-1">
                    <div className="text-xs font-medium text-[color:var(--pv-text)]">
                      Refine workspace theme
                    </div>
                    <div className="text-[11px] text-[color:var(--pv-muted)] tabular-nums">
                      High · Nov 19 · design
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-400">Headings</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                    {activeDisplayOption.label}
                    {Math.abs(fonts.displayLetterSpacing) >= 0.001
                      ? ` (${fonts.displayLetterSpacing > 0 ? '+' : ''}${fonts.displayLetterSpacing.toFixed(2)}em)`
                      : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-400">Body text</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                    {activeBodyOption.label}
                    {Math.abs(fonts.bodyLetterSpacing) >= 0.001
                      ? ` (${fonts.bodyLetterSpacing > 0 ? '+' : ''}${fonts.bodyLetterSpacing.toFixed(2)}em)`
                      : ''}
                  </span>
                </div>
                <div className="pt-1 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Text contrast</span>
                  <span
                    className={`font-mono tabular-nums font-medium ${
                      textContrast >= 4.5
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {textContrast.toFixed(1)}:1 {textContrast >= 4.5 ? '· Pass' : '· Low contrast'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Button contrast</span>
                  <span
                    className={`font-mono tabular-nums font-medium ${
                      accentContrast >= 3
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {accentContrast.toFixed(1)}:1 {accentContrast >= 3 ? '· Readable' : '· Bright accent'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Preferences are stored locally on this machine.
            </span>
            {!isAllDefault && (
              <button
                type="button"
                onClick={handleResetAll}
                className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline whitespace-nowrap"
              >
                Reset all defaults
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
