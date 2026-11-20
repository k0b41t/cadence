import { LIMITS } from '../types/kanban';

export const BUNDLED_BG_PATH_REGEX =
  /^\/src\/assets\/(images|backgrounds)\/[a-zA-Z0-9_\-.]+\.(jpg|jpeg|png|webp|avif|svg)$/;

const bundledImageModules = import.meta.glob<string>(
  ['/src/assets/images/*.{jpg,jpeg,png,webp,avif,svg}', '/src/assets/backgrounds/*.{jpg,jpeg,png,webp,avif,svg}'],
  { eager: true, query: '?url', import: 'default' }
);

export interface BundledBackgroundAsset {
  canonicalPath: string;
  resolvedUrl: string;
  fileName: string;
  folder: 'images' | 'backgrounds';
  suggestedLabel: string;
}

const KNOWN_ASSET_LABELS: Record<string, string> = {
  bg_slate_horizon_1795211535501: 'Slate Horizon',
  bg_warm_atelier_1795211536698: 'Warm Atelier',
  bg_deep_fjord_1795211536746: 'Deep Fjord',
  bg_linen_dunes_1795211536037: 'Linen Dunes',
};

export function formatBackgroundLabelFromFileName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '');
  if (KNOWN_ASSET_LABELS[stem]) {
    return KNOWN_ASSET_LABELS[stem];
  }
  const withoutTimestamp = stem.replace(/_\d{10,16}$/, '');
  const words = withoutTimestamp
    .replace(/^bg_/, '')
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
  const label = words.join(' ').trim();
  return (label || stem).slice(0, LIMITS.BOARD_BG_LABEL_MAX);
}

export function getBundledBackgroundAssets(): BundledBackgroundAsset[] {
  return Object.entries(bundledImageModules)
    .map(([canonicalPath, resolvedUrl]) => {
      const normalized = canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`;
      const segments = normalized.split('/');
      const fileName = segments[segments.length - 1] ?? normalized;
      const folder = normalized.includes('/src/assets/backgrounds/') ? 'backgrounds' : 'images';
      return {
        canonicalPath: normalized,
        resolvedUrl: typeof resolvedUrl === 'string' && resolvedUrl ? resolvedUrl : normalized,
        fileName,
        folder,
        suggestedLabel: formatBackgroundLabelFromFileName(fileName),
      } satisfies BundledBackgroundAsset;
    })
    .filter((asset) => isValidBundledBackgroundPath(asset.canonicalPath))
    .sort((a, b) => a.suggestedLabel.localeCompare(b.suggestedLabel));
}

export function isValidBundledBackgroundPath(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > LIMITS.BOARD_BG_URL_MAX) return false;
  if (trimmed.includes('..')) return false;
  return BUNDLED_BG_PATH_REGEX.test(trimmed);
}

export function isValidBoardBackgroundUrl(raw: string, allowEmpty = true): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return allowEmpty;
  if (trimmed.length > LIMITS.BOARD_BG_URL_MAX) return false;
  if (isValidBundledBackgroundPath(trimmed)) return true;
  if (!/^https?:\/\/[^\s]+$/i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeBoardBackgroundUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (isValidBundledBackgroundPath(trimmed)) return trimmed;
  if (!/^https?:\/\/[^\s]+$/i.test(trimmed)) {
    throw new Error(
      'Background must be an http(s):// URL or a bundled /src/assets/backgrounds/ or /src/assets/images/ file.'
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Please enter a valid background image URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// and https:// background URLs are allowed.');
  }
  if (trimmed.length > LIMITS.BOARD_BG_URL_MAX) {
    throw new Error(`Background image URL must be ${LIMITS.BOARD_BG_URL_MAX} characters or fewer.`);
  }
  return trimmed;
}

export function resolveSafeBoardBackgroundUrl(raw: string | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed || trimmed.length > LIMITS.BOARD_BG_URL_MAX) return null;
  if (isValidBundledBackgroundPath(trimmed)) {
    const bundled = bundledImageModules[trimmed];
    return typeof bundled === 'string' && bundled ? bundled : trimmed;
  }
  if (!/^https?:\/\/[^\s]+$/i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function sanitizeBuildAssetFileName(originalName: string): string | null {
  const trimmed = originalName.trim();
  const match = trimmed.match(/^(.*)\.(jpg|jpeg|png|webp|avif|svg)$/i);
  if (!match) return null;
  const rawBase = match[1]
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 64);
  const ext = match[2].toLowerCase();
  const base = rawBase || 'board_bg';
  return `${base}.${ext}`;
}
