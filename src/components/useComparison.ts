// Capture & Compare state: the captured photo, the chosen frames (up to
// CONFIG.compare.maxFrames) and the finished photo of each. App owns it. The 3D
// scene renders `renderModelId` onto the photo, one frame at a time, and hands
// the image back through receiveRender. Object URLs are revoked when the photo goes.
import { useCallback, useEffect, useRef, useState } from 'react';
import { canvasToPngUrl, copyMirroredCrop, toggleFrame, type CapturedPhoto } from '../lib/capture.ts';
import { CATALOG } from '../lib/catalog.ts';
import { drawComparisonSheet, downloadCanvasAsPng } from '../lib/comparisonImage.ts';
import { CONFIG } from '../lib/config.ts';

const MIN_FRAMES_TO_SAVE = 2;

export function useComparison() {
  // Bumped on each Capture click; the scene captures the next frame with a face.
  const [captureRequest, setCaptureRequest] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  // The captured photo without glasses: shown while a frame is being rendered.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [activeSlot, setActiveSlot] = useState(0);
  // Model id -> object URL of its rendered photo, for the current photo only.
  const [results, setResults] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // Every object URL made for the current photo, so all are revoked together.
  const ownedUrlsRef = useRef<string[] | null>(null);

  useEffect(() => {
    if (!photo) return;
    const owned: string[] = [];
    ownedUrlsRef.current = owned;
    let cancelled = false;
    const preview = copyMirroredCrop(photo.canvas, photo.crop, CONFIG.compare.photoHeightPx);
    canvasToPngUrl(preview)
      .then((url) => {
        owned.push(url);
        if (!cancelled) setPreviewUrl(url);
      })
      .catch((error: unknown) => console.warn('Preview failed:', error))
      .finally(() => {
        preview.width = 0; // free its pixels
      });
    return () => {
      cancelled = true;
      ownedUrlsRef.current = null;
      setPreviewUrl(null);
      // A render still being encoded is revoked when it arrives (see receiveRender).
      owned.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photo]);

  /** Capture button: freeze the next frame. The live frame becomes the first choice. */
  const capture = useCallback((currentModelId: string) => {
    setCapturing(true);
    setCaptureRequest((n) => n + 1);
    setSlots((current) => (current.length > 0 ? current : [currentModelId]));
  }, []);

  const receivePhoto = useCallback((captured: CapturedPhoto) => {
    setCapturing(false);
    setResults({});
    setPhoto(captured);
  }, []);

  const receiveRender = useCallback((modelId: string, image: HTMLCanvasElement) => {
    const owned = ownedUrlsRef.current;
    canvasToPngUrl(image)
      .then((url) => {
        if (ownedUrlsRef.current !== owned || !owned) {
          URL.revokeObjectURL(url); // the photo changed while this was encoding
          return;
        }
        owned.push(url);
        setResults((current) => ({ ...current, [modelId]: url }));
      })
      .catch((error: unknown) => console.warn('Comparison render failed:', error))
      .finally(() => {
        image.width = 0; // free its pixels
      });
  }, []);

  /** Retake: back to the live camera, keeping the chosen frames for the next capture. */
  const retake = useCallback(() => {
    setPhoto(null);
    setResults({});
    setCapturing(false);
  }, []);

  /** Back to live: leave comparison and forget it. */
  const exit = useCallback(() => {
    setPhoto(null);
    setResults({});
    setSlots([]);
    setActiveSlot(0);
    setCapturing(false);
  }, []);

  const chooseFrame = useCallback(
    (id: string) => {
      const next = toggleFrame(slots, activeSlot, id, CONFIG.compare.maxFrames);
      setSlots(next.slots);
      setActiveSlot(next.activeIndex);
    },
    [slots, activeSlot],
  );

  const removeSlot = useCallback(
    (index: number) => {
      const id = slots[index];
      if (id) chooseFrame(id);
    },
    [slots, chooseFrame],
  );

  const ready = slots.length >= MIN_FRAMES_TO_SAVE && slots.every((id) => results[id]);

  const save = useCallback(async () => {
    if (!ready) return;
    setSaving(true);
    try {
      const photos = slots.flatMap((id) => {
        const model = CATALOG.find((entry) => entry.id === id);
        const url = results[id];
        if (!model || !url) return [];
        const { title, author, license } = model.credit;
        const licence = license.replace('-4.0', ' 4.0').replace('-', ' ');
        return [{ url, name: model.name, credit: `“${title}” by ${author} (${licence})` }];
      });
      const now = new Date();
      const sheet = await drawComparisonSheet(photos, now);
      await downloadCanvasAsPng(sheet, `glasses-comparison-${now.toISOString().slice(0, 10)}.png`);
    } catch (error) {
      console.warn('Saving the comparison failed:', error);
    } finally {
      setSaving(false);
    }
  }, [ready, slots, results]);

  return {
    captureRequest,
    capturing,
    photo,
    previewUrl,
    slots,
    activeSlot,
    results,
    saving,
    canSave: ready,
    // The next chosen frame that has no photo yet: the scene renders this one.
    renderModelId: photo ? (slots.find((id) => !results[id]) ?? null) : null,
    capture,
    receivePhoto,
    receiveRender,
    retake,
    exit,
    chooseFrame,
    removeSlot,
    selectSlot: setActiveSlot,
    save,
  };
}
