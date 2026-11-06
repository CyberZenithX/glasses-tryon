// Comparison mode screen: the captured photo with each chosen frame, side by side,
// plus the frame chooser and the Retake / Back to live / Save buttons. It only shows
// finished still images; the 3D scene renders them one at a time behind this screen.
import type { CSSProperties } from 'react';
import type { GlassesModel } from '../lib/catalog.ts';
import { CONFIG } from '../lib/config.ts';
import { BackIcon, CheckIcon, CloseIcon, DownloadIcon, PlusIcon, RetakeIcon } from './Icons.tsx';

interface ComparisonViewProps {
  catalog: GlassesModel[];
  slots: string[];
  activeSlot: number;
  results: Record<string, string>;
  previewUrl: string | null;
  canSave: boolean;
  saving: boolean;
  onChooseFrame: (id: string) => void;
  onRemoveSlot: (index: number) => void;
  onSelectSlot: (index: number) => void;
  onRetake: () => void;
  onBack: () => void;
  onSave: () => void;
}

export default function ComparisonView(props: ComparisonViewProps) {
  const { catalog, slots, activeSlot, results, previewUrl, canSave, saving } = props;
  const { maxFrames } = CONFIG.compare;
  const full = slots.length >= maxFrames;
  const columns = Math.min(slots.length + (full ? 0 : 1), maxFrames);
  const hint = full
    ? `Picking another frame replaces frame ${activeSlot + 1}. Tap a photo to choose which.`
    : slots.length === 0
      ? 'Choose a frame to see it on your photo.'
      : slots.length === 1
        ? 'Add more frames to compare them side by side, or save this photo.'
        : 'Tap a frame to add it, or tap it again to remove it.';

  return (
    <section className="compare" aria-label="Compare frames">
      <header className="compare-header">
        <div>
          <h1>Compare frames</h1>
          <p className="compare-subtitle">Same photo, same pose. Up to {maxFrames} frames side by side.</p>
        </div>
        <div className="compare-header-actions">
          <button type="button" className="ghost-button" onClick={props.onRetake}>
            <RetakeIcon /> Retake photo
          </button>
          <button type="button" className="ghost-button" onClick={props.onBack}>
            <BackIcon /> Back to live
          </button>
        </div>
      </header>

      <div className="compare-grid" style={{ '--columns': columns } as CSSProperties}>
        {slots.map((id, index) => {
          const model = catalog.find((entry) => entry.id === id);
          if (!model) return null;
          const url = results[id];
          const active = full && index === activeSlot;
          return (
            <figure key={id} className={`compare-card ${active ? 'compare-card-active' : ''}`}>
              <button
                type="button"
                className="compare-photo"
                onClick={() => props.onSelectSlot(index)}
                aria-label={`${model.name}: select to replace`}
              >
                {(url ?? previewUrl) && <img src={url ?? previewUrl ?? undefined} alt={`You wearing ${model.name}`} />}
                {!url && (
                  <span className="compare-rendering">
                    <span className="spinner" aria-hidden="true" /> Fitting {model.name}…
                  </span>
                )}
              </button>
              <figcaption>
                <span className="compare-index">{index + 1}</span>
                <span className="compare-name">{model.name}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ${model.name}`}
                  onClick={() => props.onRemoveSlot(index)}
                >
                  <CloseIcon />
                </button>
              </figcaption>
            </figure>
          );
        })}
        {!full && (
          <div className="compare-card compare-empty">
            <PlusIcon />
            <span>Add a frame</span>
            <span className="muted">Pick one below</span>
          </div>
        )}
      </div>

      <footer className="compare-footer">
        <div className="compare-chooser">
          <p className="compare-hint">{hint}</p>
          <ul>
            {catalog.map((model) => {
              const chosen = slots.includes(model.id);
              return (
                <li key={model.id}>
                  <button
                    type="button"
                    className={`chooser-item ${chosen ? 'chooser-item-on' : ''}`}
                    aria-pressed={chosen}
                    onClick={() => props.onChooseFrame(model.id)}
                  >
                    <span className="picker-thumb">
                      {model.thumbnail && <img src={model.thumbnail} alt="" draggable={false} />}
                      {chosen && (
                        <span className="chooser-check">
                          <CheckIcon />
                        </span>
                      )}
                    </span>
                    <span>{model.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <button type="button" className="primary-button" disabled={!canSave || saving} onClick={props.onSave}>
          <DownloadIcon /> {saving ? 'Saving…' : slots.length === 1 ? 'Save photo' : 'Save comparison'}
        </button>
      </footer>
    </section>
  );
}
