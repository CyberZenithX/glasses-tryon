// Options read from the page address, for sharing and embedding:
//   ?frame=<id>  open with that frame selected (catalog ids, e.g. ?frame=heart)
//   ?embed=1     show only the try-on view and the frame picker (for an iframe)
// Choosing a frame writes ?frame= back into the address, so the link can be shared.
import type { GlassesModel } from './catalog.ts';

const params = new URLSearchParams(window.location.search);

export const IS_EMBED = params.get('embed') === '1';

/** The ?frame= id if it names a frame in the catalog, otherwise the first frame. */
export function initialFrameId(catalog: readonly GlassesModel[]): string {
  const requested = params.get('frame');
  const match = catalog.find((model) => model.id === requested);
  return match?.id ?? catalog[0]?.id ?? '';
}

/** Puts the chosen frame in the address bar without reloading or adding history entries. */
export function writeFrameToUrl(id: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('frame', id);
  window.history.replaceState(null, '', url);
}
