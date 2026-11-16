import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import {
  clampRgbChannel,
  parseColumnColorToRgb,
  RGB_PALETTE_QUICK_SWATCHES,
  rgbToHex,
} from '../lib/colorUtils';

interface RgbPalettePickerProps {
  color: string;
  ruleIndex: number;
  onChange: (nextHex: string) => void;
}

const SWATCH_BG_CLASSES: Record<string, string> = {
  Yellow: 'bg-amber-500 border-amber-600',
  Orange: 'bg-orange-500 border-orange-600',
  Red: 'bg-red-500 border-red-600',
  Rose: 'bg-rose-500 border-rose-600',
  Green: 'bg-emerald-500 border-emerald-600',
  Teal: 'bg-teal-500 border-teal-600',
  Blue: 'bg-blue-500 border-blue-600',
  Purple: 'bg-violet-500 border-violet-600',
  Slate: 'bg-slate-500 border-slate-600',
};

function drawRgbPaletteCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const colorWidth = Math.round(w * 0.88);
  const grayWidth = w - colorWidth;

  // Hue spectrum across colorWidth
  const hueGrad = ctx.createLinearGradient(0, 0, colorWidth, 0);
  hueGrad.addColorStop(0, '#ff0000');
  hueGrad.addColorStop(0.17, '#ffff00');
  hueGrad.addColorStop(0.33, '#00ff00');
  hueGrad.addColorStop(0.5, '#00ffff');
  hueGrad.addColorStop(0.67, '#0000ff');
  hueGrad.addColorStop(0.83, '#ff00ff');
  hueGrad.addColorStop(1, '#ff0000');
  ctx.fillStyle = hueGrad;
  ctx.fillRect(0, 0, colorWidth, h);

  // Top light tint -> mid vivid -> bottom deep shade
  const lightGrad = ctx.createLinearGradient(0, 0, 0, h);
  lightGrad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
  lightGrad.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
  lightGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
  lightGrad.addColorStop(1, 'rgba(0, 0, 0, 0.88)');
  ctx.fillStyle = lightGrad;
  ctx.fillRect(0, 0, colorWidth, h);

  // Right grayscale strip
  const grayGrad = ctx.createLinearGradient(0, 0, 0, h);
  grayGrad.addColorStop(0, '#f8fafc');
  grayGrad.addColorStop(0.5, '#64748b');
  grayGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grayGrad;
  ctx.fillRect(colorWidth, 0, grayWidth, h);
}

export function RgbPalettePicker({ color, ruleIndex, onChange }: RgbPalettePickerProps) {
  const rgb = parseColumnColorToRgb(color);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);

  const [rInput, setRInput] = useState(String(rgb.r));
  const [gInput, setGInput] = useState(String(rgb.g));
  const [bInput, setBInput] = useState(String(rgb.b));
  const [hexInput, setHexInput] = useState(hex);
  const [dragging, setDragging] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setRInput(String(rgb.r));
    setGInput(String(rgb.g));
    setBInput(String(rgb.b));
    setHexInput(hex);
  }, [rgb.r, rgb.g, rgb.b, hex]);

  useEffect(() => {
    if (canvasRef.current) {
      drawRgbPaletteCanvas(canvasRef.current);
    }
  }, []);

  const pickColorFromPointer = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const relX = Math.max(0, Math.min(rect.width - 1, e.clientX - rect.left));
    const relY = Math.max(0, Math.min(rect.height - 1, e.clientY - rect.top));
    const px = Math.floor((relX / rect.width) * canvas.width);
    const py = Math.floor((relY / rect.height) * canvas.height);

    const pixel = ctx.getImageData(
      Math.max(0, Math.min(canvas.width - 1, px)),
      Math.max(0, Math.min(canvas.height - 1, py)),
      1,
      1
    ).data;

    const nextHex = rgbToHex(pixel[0], pixel[1], pixel[2]);
    setRInput(String(pixel[0]));
    setGInput(String(pixel[1]));
    setBInput(String(pixel[2]));
    setHexInput(nextHex);
    onChange(nextHex);
  };

  const handleChannelChange = (channel: 'r' | 'g' | 'b', raw: string) => {
    const digitsOnly = raw.replace(/[^\d]/g, '').slice(0, 3);
    if (channel === 'r') setRInput(digitsOnly);
    if (channel === 'g') setGInput(digitsOnly);
    if (channel === 'b') setBInput(digitsOnly);

    if (digitsOnly === '') return;
    const parsed = clampRgbChannel(Number(digitsOnly));
    const nextR = channel === 'r' ? parsed : rgb.r;
    const nextG = channel === 'g' ? parsed : rgb.g;
    const nextB = channel === 'b' ? parsed : rgb.b;
    const nextHex = rgbToHex(nextR, nextG, nextB);
    setHexInput(nextHex);
    onChange(nextHex);
  };

  const normalizeInputs = () => {
    setRInput(String(rgb.r));
    setGInput(String(rgb.g));
    setBInput(String(rgb.b));
    setHexInput(hex);
  };

  const handleHexChange = (raw: string) => {
    const clean = raw.startsWith('#') ? raw.slice(0, 7) : `#${raw.slice(0, 6)}`;
    setHexInput(clean);
    if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
      const normalized = clean.toLowerCase();
      const parsed = parseColumnColorToRgb(normalized);
      setRInput(String(parsed.r));
      setGInput(String(parsed.g));
      setBInput(String(parsed.b));
      onChange(normalized);
    }
  };

  return (
    <div className="pt-2.5 mt-2 border-t border-slate-200/80 dark:border-slate-800/80 space-y-2.5">
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
          <span>Click or drag palette to load RGB</span>
          <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
            rgb({rgb.r}, {rgb.g}, {rgb.b})
          </span>
        </div>
        <canvas
          ref={canvasRef}
          width={260}
          height={88}
          aria-label={`Custom RGB color palette for rule ${ruleIndex + 1}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(true);
            pickColorFromPointer(e);
          }}
          onPointerMove={(e) => {
            if (dragging) {
              pickColorFromPointer(e);
            }
          }}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          className="w-full h-22 rounded-md border border-slate-300 dark:border-slate-700 cursor-crosshair touch-none block"
        />
      </div>

      {/* Quick Swatches */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div
          role="group"
          aria-label={`Quick RGB swatches for rule ${ruleIndex + 1}`}
          className="flex items-center gap-1.5 flex-wrap"
        >
          {RGB_PALETTE_QUICK_SWATCHES.map((swatch) => {
            const swatchHex = rgbToHex(swatch.r, swatch.g, swatch.b);
            const active = hex === swatchHex;
            return (
              <button
                key={swatch.label}
                type="button"
                onClick={() => {
                  setRInput(String(swatch.r));
                  setGInput(String(swatch.g));
                  setBInput(String(swatch.b));
                  setHexInput(swatchHex);
                  onChange(swatchHex);
                }}
                aria-label={`Load ${swatch.label} (${swatch.r}, ${swatch.g}, ${swatch.b})`}
                title={`${swatch.label} — rgb(${swatch.r}, ${swatch.g}, ${swatch.b})`}
                className={`w-5 h-5 rounded border transition-transform ${
                  SWATCH_BG_CLASSES[swatch.label] ?? 'bg-slate-400 border-slate-500'
                } ${
                  active
                    ? 'ring-2 ring-offset-1 ring-slate-900 dark:ring-slate-100 dark:ring-offset-slate-900 scale-110'
                    : 'opacity-85 hover:opacity-100 hover:scale-105'
                }`}
              />
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            style={{ '--swatch-hex': hex } as CSSProperties}
            className="w-5 h-5 rounded border border-slate-300 dark:border-slate-600 bg-[color:var(--swatch-hex)] shrink-0"
          />
          <input
            type="text"
            value={hexInput}
            onChange={(e) => handleHexChange(e.target.value)}
            onBlur={normalizeInputs}
            maxLength={7}
            aria-label={`Hex color code for rule ${ruleIndex + 1}`}
            className="w-20 px-2 py-1 text-xs font-mono tabular-nums bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Typed R / G / B Inputs */}
      <div className="grid grid-cols-3 gap-2">
        <label className="flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus-within:ring-2 focus-within:ring-blue-600">
          <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">R</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={255}
            value={rInput}
            onChange={(e) => handleChannelChange('r', e.target.value)}
            onBlur={normalizeInputs}
            aria-label={`Red (0-255) for rule ${ruleIndex + 1}`}
            className="w-full text-xs font-mono tabular-nums bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none"
          />
        </label>

        <label className="flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus-within:ring-2 focus-within:ring-blue-600">
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            G
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={255}
            value={gInput}
            onChange={(e) => handleChannelChange('g', e.target.value)}
            onBlur={normalizeInputs}
            aria-label={`Green (0-255) for rule ${ruleIndex + 1}`}
            className="w-full text-xs font-mono tabular-nums bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none"
          />
        </label>

        <label className="flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus-within:ring-2 focus-within:ring-blue-600">
          <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">B</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={255}
            value={bInput}
            onChange={(e) => handleChannelChange('b', e.target.value)}
            onBlur={normalizeInputs}
            aria-label={`Blue (0-255) for rule ${ruleIndex + 1}`}
            className="w-full text-xs font-mono tabular-nums bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none"
          />
        </label>
      </div>
    </div>
  );
}
