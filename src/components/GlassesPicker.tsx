// Bottom carousel for choosing a frame. Selecting one swaps the model inside the
// head group; all models are preloaded (see preloadCatalog) so switching is instant.
import type { GlassesModel } from '../lib/catalog.ts';

interface GlassesPickerProps {
  models: GlassesModel[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export default function GlassesPicker({ models, selectedId, onSelect }: GlassesPickerProps) {
  return (
    <nav className="picker" aria-label="Choose frames">
      <ul>
        {models.map((model) => (
          <li key={model.id}>
            <button
              type="button"
              className={`picker-item ${model.id === selectedId ? 'picker-item-on' : ''}`}
              aria-pressed={model.id === selectedId}
              onClick={() => onSelect(model.id)}
            >
              <span className="picker-thumb">
                {model.thumbnail && <img src={model.thumbnail} alt="" draggable={false} />}
              </span>
              <span>{model.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
