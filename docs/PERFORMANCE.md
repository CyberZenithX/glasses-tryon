# Performance and stability

This page explains how speed and stability are measured, the conditions of each
run, the results, and what the tests can and cannot tell you. Every number here
comes from a real run on real hardware. Placeholders mark runs that have not
been done yet.

## Targets (from the brief)

| Metric | Target |
|---|---|
| Frame rate | ≥ 24 FPS (aim for 30+) |
| Latency | < 100 ms end to end |
| Alignment | stable during natural head movement |

## What is measured

All timings use the browser's `performance.now()` clock. They are measured once
per **camera frame** that goes through the whole pipeline, not per screen
refresh. Redrawing the same camera frame at 120 Hz would not count as 120 FPS.

| Number | How it is measured |
|---|---|
| **FPS** | Camera frames processed per second: time between consecutive renders of a *new* camera frame. |
| **Inference** | Time spent inside MediaPipe's `detectForVideo` for one frame (the "AI" cost). |
| **Latency** | From when the camera frame was captured to when its render was submitted to the GPU. The capture time comes from `requestVideoFrameCallback` (`captureTime` where the browser provides it, otherwise the time the frame reached the page). The stats panel says which clock was used ("latency from capture"). |
| **Jitter** | Hold still test: how far the glasses moved between consecutive frames, in mm (position) and degrees (rotation), for both the **raw** MediaPipe pose and the **smoothed** (One Euro) pose. |
| **Lag** | Head turn test: on each frame, the distance between the raw pose and the smoothed pose, in mm and degrees. This is how far the smoothed glasses trail the head. |

Averages are means. p50 and p95 use the nearest-rank method. For FPS, "p95" is
taken from the frame intervals, so it means "95% of frames were processed at
least this fast" (the slow tail, matching latency p95). "min" FPS is the single
slowest frame.

## How to run the tests

1. Open the app and allow the camera. Press **Stats** (or the `s` key).
2. Press **Hold still test** and keep your head still, looking at the camera,
   for 10 seconds.
3. Press **Head turn test** and slowly turn your head left and right for 10 seconds.
4. When a test ends, the panel shows the results. **Download CSV** saves every
   frame: frame number, timestamp, raw pose, smoothed pose, inference time,
   latency and per-frame lag. A summary block at the top lists the conditions
   (browser, video size, tracker delegate, smoothing settings, test switches)
   and every score. Device and lighting are not detectable from the browser,
   so the CSV leaves them as "(fill in)".

### Why raw vs smoothed is a fair comparison

The raw pose and the smoothed pose are computed from **the same camera frame at
the same moment**. The One Euro filter runs on every frame whether or not
smoothing is shown. Both tests therefore compare the two on identical input,
with no recorded clips needed. The recorder writes into a preallocated typed
array, so recording adds no per-frame allocations.

### Test switches

For diagnosing slow devices, these address-bar switches change one thing at a
time. All are off by default, and the stats panel lists any that are on.

| Switch | Effect |
|---|---|
| `?tracker=cpu` | Run face tracking on the CPU instead of the GPU. |
| `?camera=480` | Ask the camera for 640×480 instead of 1280×720. |
| `?dpr=1` | Render the 3D view at 1 pixel per CSS pixel. |
| `?shadows=0` | No shadow map (skips the shadow render pass). |
| `?transmission=0` | Lenses without transmission (skips the extra scene render). |
| `?lite=1` | `dpr=1` + `shadows=0` + `transmission=0`. |

## Results

### Live stats panel

The live panel averages roughly the last 90 frames.

| Device | Browser | Video | Tracker | Lighting | FPS | Inference avg / p95 | Latency avg / p95 |
|---|---|---|---|---|---|---|---|
| Windows desktop PC | Chrome | 1280×720 | GPU | indoor | **58.9** | **14.1 / 17.5 ms** | **40.5 / 60.6 ms** |

Both targets are met with a wide margin on this PC: 58.9 FPS against 24, and a
p95 latency of 60.6 ms against 100 ms. The frame rate is above 30, so the
webcam delivered about 60 frames per second. The app asks for 30 FPS as an
"ideal" value, which allows the browser to choose a faster camera mode.

### 10-second tests

Run on 2026-11-06 on the same Windows desktop PC: Chrome 156, 1280×720 video, GPU
tracker, smoothing on, no test switches, bright light. Both runs had a face on
every frame. The raw CSVs are in [`results/`](results/).

| Test | Frames | FPS avg / p50 / p95 / min | Latency avg / p50 / p95 / min (ms) | Inference avg / p95 (ms) |
|---|---|---|---|---|
| Hold still | 367 in 9.94 s | 36.8 / 38.8 / 24.9 / 17.7 | 45.9 / 44.4 / 73.6 / 21.1 | 22.0 / 29.6 |
| Head turn | 369 in 9.96 s | 37.0 / 39.7 / 23.9 / 15.3 | 45.1 / 43.1 / 68.6 / 19.3 | 21.9 / 29.6 |

**Jitter (hold still: frame-to-frame movement while the head is still)**

| | Raw avg | Raw p95 | Smoothed avg | Smoothed p95 | Smoothing cuts p95 by |
|---|---|---|---|---|---|
| Position (mm) | 0.089 | 0.319 | 0.057 | 0.209 | 34% |
| Rotation (°) | 0.025 | 0.083 | 0.019 | 0.064 | 23% |

**Lag (head turn: how far the smoothed glasses trail the raw pose)**

| | avg | p50 | p95 | max |
|---|---|---|---|---|
| Position (mm) | 2.99 | 2.73 | 5.93 | 10.86 |
| Rotation (°) | 1.05 | 0.88 | 2.55 | 4.83 |

**What this shows**

- **Both targets are met.** Average FPS is about 37 against a target of 24,
  and p95 latency is 69–74 ms against 100 ms. The FPS p95 of about 24 means 95%
  of frames ran at roughly 24 FPS or faster.
- **Raw tracking is already steady when still.** Its p95 is a third of a
  millimetre, which is invisible on screen. Smoothing removes about a third
  more (p95 0.32 → 0.21 mm).
- **The price is a small trail when moving.** The smoothed glasses sit on
  average 3 mm (p95 6 mm) and 1° behind the raw pose during a slow head turn.
  Raising `beta` in `CONFIG.smoothing` would reduce this lag at the cost of
  more jitter.
- **The two PC readings differ.** These runs averaged about 37 FPS, while the
  live-panel reading above was 58.9 FPS. The live panel only averages the last
  ~90 frames, while each test covers 10 seconds. The runs were also taken at a
  different time, so the PC's background load may have differed.

Not yet measured: dim light, a side-turned head, and phones.

## Limitations of these measurements

- **Latency does not include the webcam hardware's own delay.** The sensor's
  exposure, USB transfer and the camera driver happen before the browser sees
  the frame, and the display's scan-out happens after the render is submitted.
  Browsers expose neither, so the true glass-to-glass delay is longer than the
  number shown. Where the browser gives no capture time, latency starts when
  the frame reached the page, which is slightly optimistic.
- **The tests measure stability, not accuracy.** Low jitter means the glasses
  do not shake. It does not prove they sit in the right place. Accuracy is
  checked visually, with screenshots and the debug view (landmarks, pose axes
  and the canonical face wireframe drawn over the face).
- **Live input differs between runs.** Each test uses the live camera, so runs
  on different days, or by different people, have different motion, light and
  noise. Compare raw vs smoothed *within* a run; across runs, treat numbers as
  indicative.
- **Jitter includes real movement.** Even when holding still, a person moves a
  little (breathing, small sways). The raw jitter is therefore an upper bound
  on tracking noise.
- **Results depend on the device.** Face tracking is the largest per-frame
  cost, and its speed depends heavily on the GPU. Slower phones run well below
  the desktop figures above.
