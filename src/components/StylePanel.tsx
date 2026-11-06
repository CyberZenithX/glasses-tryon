// The "Style" panel: lens tint (clear / sun / blue-light), frame colour, and a
// small personal fit (size, height on the nose). It only edits a GlassesStyle in
// App; Glasses applies it. Frames whose lenses and frame share one textured
// material can't be recoloured, so those options are disabled for them.
import type { GlassesModel } from '../lib/catalog.ts';
import { CONFIG } from '../lib/config.ts';
import { DEFAULT_STYLE, type GlassesStyle } from '../lib/glassesStyle.ts';

interface StylePanelProps {
  model: GlassesModel | null;
  style: GlassesStyle;
  onChange: (style: GlassesStyle) => void;
}

const LENS_OPTIONS: { id: GlassesStyle['lensTint']; label: string }[] = [
  { id: 'clear', label: 'Clear' },
  { id: 'sun', label: 'Sun' },
  { id: 'blue', label: 'Blue-light' },
];

export default function StylePanel({ model, style, onChange }: StylePanelProps) {
  const recolourable = model ? !model.keepAuthoredMaterials : false;
  const [minSize, maxSize] = CONFIG.style.sizePercentRange;
  const [minHeight, maxHeight] = CONFIG.style.heightMmRange;
  const update = (change: Partial<GlassesStyle>) => onChange({ ...style, ...change });

  return (
    <section className="style-panel" aria-label="Style and fit">
      <fieldset disabled={!recolourable}>
        <legend>Lenses</legend>
        <div className="segmented">
          {LENS_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={style.lensTint === option.id}
              className={style.lensTint === option.id ? 'segmented-on' : ''}
              onClick={() => update({ lensTint: option.id })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={!recolourable}>
        <legend>Frame colour</legend>
        <div className="swatches">
          {CONFIG.style.frameColours.map((colour) => (
            <button
              key={colour.id}
              type="button"
              className={`swatch ${style.frameColourId === colour.id ? 'swatch-on' : ''} ${colour.hex ? '' : 'swatch-original'}`}
              style={colour.hex ? { background: colour.hex } : undefined}
              aria-pressed={style.frameColourId === colour.id}
              aria-label={colour.label}
              title={colour.label}
              onClick={() => update({ frameColourId: colour.id })}
            />
          ))}
        </div>
      </fieldset>
      {!recolourable && <p className="style-note">This frame keeps its original colours and lenses.</p>}

      <label className="slider">
        <span>
          Size <output>{style.sizePercent}%</output>
        </span>
        <input
          type="range"
          min={minSize}
          max={maxSize}
          step={1}
          value={style.sizePercent}
          onChange={(event) => update({ sizePercent: Number(event.target.value) })}
        />
      </label>
      <label className="slider">
        <span>
          Height{' '}
          <output>
            {style.heightMm > 0 ? '+' : ''}
            {style.heightMm} mm
          </output>
        </span>
        <input
          type="range"
          min={minHeight}
          max={maxHeight}
          step={0.5}
          value={style.heightMm}
          onChange={(event) => update({ heightMm: Number(event.target.value) })}
        />
      </label>

      <button type="button" className="test-button" onClick={() => onChange(DEFAULT_STYLE)}>
        Reset
      </button>
    </section>
  );
}
