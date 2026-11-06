# Project Brief: Real-Time Virtual Glasses Try-On (Web)

> This brief was written by me (the candidate) with help from Claude (Anthropic) during planning.
> It is the main instruction file for Claude Code, which I am using as a coding assistant.
> All AI use is credited in `AI_PROMPTS.md` and the README.

---

## 1. Context

I am applying for the **AI Engineer Intern** role at Ascend Tech, a startup that works across several areas. The technical assessment asks for an AI-powered web app where a user tries on eyeglasses live through their webcam.

I have chosen **Option A: build from scratch with open-source tools.** The "AI" in this project is Google's pre-trained **MediaPipe Face Landmarker** model, which runs in the browser. There is no model training and no LLM in the product.

The assessment requires:

- Live webcam try-on
- At least 3 glasses designs
- Accurate alignment as the head moves
- A realistic look
- Smooth performance
- A simple UI

The performance targets are:

- **≥ 24 FPS**
- **< 100 ms end-to-end latency**
- Stable alignment during natural head movement
- A natural look in different lighting

The targets are not strict pass/fail, but the **real measured results must be reported** along with the test conditions.

In a technical interview, I must be able to explain:

- **the overall architecture**
- **what each main function does**
- **how the parts fit together**

I must also be able to debug or change the code on my own. I don't need to explain every line, but nothing should be a black box.

**Time budget:** about one working day. Prioritize strictly using the tiers in section 5.

---

## 2. Objective

The number one goal is a **complete, working, realistic try-on that looks great in a demo video**: glasses that sit naturally on the face, follow the head smoothly, hide behind the ears on turns, and look like real glasses in the light.

After that, I want to show I went beyond the brief:

- Real measurements of stability, not just claims.
- Product and business thinking, because this startup expects people to work across several roles.

The order of priorities is:

1. A realistic, smooth, working demo that hits the targets.
2. The code is easy to read and explain.
3. Proof: real performance and stability numbers.
4. The product layer: privacy, embedding, business memo.
5. Nice-to-have extras.

Never trade away a higher priority for a lower one.

---

## 3. Audience

- **Reviewers at Ascend Tech.** They will read the repo, this brief, the README and the prompts, and they will try the live demo on their own laptop or phone.
- **Me.** I am comfortable with Python and newer to TypeScript and Three.js. I need to understand the architecture and what each main function does, not every line.
- **End users.** These are people trying on glasses, who need zero instructions to use it.
- **A possible business customer**, such as an optical shop or an eyewear e-commerce site. They are the audience for the product memo and the embed feature.

---

## 4. Architecture

Everything runs **in the browser**. There is no backend and no server-side processing of video. Frames never leave the user's device. This keeps latency low, costs zero to run, and protects privacy.

### Stack (use these; ask before adding anything else)

| Layer | Choice | Why |
|---|---|---|
| Build tool | **Vite + React + TypeScript (strict)** | A simple static app with no server-rendering pitfalls around the webcam or WASM |
| 3D rendering | **three**, **@react-three/fiber**, **@react-three/drei** | Declarative 3D scene, PBR materials, environment lighting |
| Face tracking | **@mediapipe/tasks-vision**, using `FaceLandmarker` | 478 landmarks plus a facial transformation matrix (head pose), real-time in the browser |
| Tests | **Vitest** | Unit tests for the pure math (filters, helpers, metrics) |
| Hosting | **Vercel** (static) | Free HTTPS, which the webcam requires |

Host the MediaPipe `.wasm` files and the `face_landmarker.task` model **locally** in `/public`, not from a CDN at runtime. Pin all dependency versions.

### Data flow (one frame)

```
webcam <video>
  → FaceLandmarker.detectForVideo(video, timestamp)
  → landmarks + facialTransformationMatrix   (= RAW pose)
  → One Euro smoothing filter                 (= SMOOTHED pose)
  → glasses group matrix (Three.js)
  → render: video background + head occluder (depth only) + glasses
  → stats (FPS, latency) + stability tests (raw vs smoothed)
```

### Key technical points to get right

- **Camera matching.** The MediaPipe transformation matrix assumes a specific perspective camera. Check MediaPipe's face geometry configuration for the field of view, near plane and far plane. Match the Three.js camera to it, and match the canvas aspect ratio to the video.
- **Mirrored selfie view.** Mirror the video and the 3D scene the same way, so movement feels natural and the alignment stays correct.
- **Real-world scale.** The matrix is in metric units. Normalize every glasses model to a known real frame width (store this in the catalog). Allow a small per-model position and rotation offset.
- **Occlusion.** Add an invisible head occluder that writes to the depth buffer only (`colorWrite: false`) and renders before the glasses. That way the temple arms hide behind the head and ears when the user turns.
- **Smoothing.** Use a **One Euro filter** on the pose. It reduces jitter when still and keeps lag low when moving. The parameters must be easy to tune. Keep the raw pose available too, because the stability tests compare raw against smoothed.
- **No face.** When no face is detected, hide the glasses smoothly and show a friendly hint.

### Glasses models

**Only I add glasses models.** I will place `.glb` files in `public/models/` and give you the author, licence and source link for each.

- **Do not build placeholder or procedural glasses**, and do not download models yourself.
- If no models are there when you reach Phase 3, stop and ask me to add them before continuing.
- Write the loading code so that adding a new model only means:
  - dropping the `.glb` file into `public/models/`
  - adding one entry to `catalog.ts`

### Suggested file structure (keep files small and single-purpose)

```
src/
  main.tsx
  App.tsx                 # layout, UI state, URL params
  components/
    TryOnCanvas.tsx       # R3F canvas, camera, lights
    VideoBackground.tsx   # mirrored webcam feed
    Glasses.tsx           # loads and positions one glasses model
    HeadOccluder.tsx      # depth-only head shape
    GlassesPicker.tsx     # bottom carousel
    StatsOverlay.tsx      # FPS / latency panel + test buttons
    PrivacyNote.tsx       # small "runs on your device" note
  lib/
    webcam.ts             # start/stop camera, error handling
    faceTracker.ts        # MediaPipe setup + detect loop
    oneEuroFilter.ts      # smoothing (unit tested)
    poseMath.ts           # matrix helpers (unit tested)
    performance.ts        # timing + rolling stats
    stabilityTest.ts      # jitter + lag metrics (unit tested)
    lighting.ts           # video brightness → light intensity
    catalog.ts            # glasses list: id, file, name, width, offsets, credits
    config.ts             # every tunable value in one place
public/
  models/                 # .glb glasses files
  mediapipe/              # wasm + face_landmarker.task
docs/
  ARCHITECTURE.md
  PERFORMANCE.md
  PRODUCT_MEMO.md
  EMBED.md
```

---

## 5. Features, in priority tiers

Finish each tier before starting the next. If time runs out, cut from the bottom up (see the cut order at the end of this section).

### Tier 1: Core try-on (must be perfect)

1. Live mirrored webcam feed with clear permission, loading and error states (denied camera, no camera, unsupported browser).
2. Real-time face tracking with MediaPipe Face Landmarker.
3. 3D glasses anchored to the head, following rotation, tilt and distance.
4. **At least 5 glasses designs** (the minimum is 3) in a bottom picker, switching instantly.
5. Head occlusion so the arms hide behind the head.
6. Smoothing with no visible jitter.
7. A toggleable stats overlay showing live FPS, inference time and frame latency.
8. A toggleable debug view that draws the landmarks and pose axes.
9. Works on desktop Chrome, Edge and Safari, and on mobile Chrome and Safari. The layout must be responsive and clean.

### Tier 2: Realism (this is what makes the demo video)

- PBR materials (metal, acetate and plastic look) and transparent lenses with a subtle reflection, using a **locally bundled** HDR environment map.
- **Adaptive lighting.** Sample the average video brightness a few times per second and adjust the scene's light intensity, so the glasses match bright and dim rooms.
- A soft contact shadow on the nose bridge area.
- Correct scale and fit on different face sizes.
- A polished, minimal UI that looks good on camera.

**Demo-ready checkpoint.** After Tier 2, the app must be deployed to Vercel and good enough for me to record the demo video. Stop and tell me when we reach this point.

### Tier 3: Proof (simple stability and performance tests)

Add two buttons to the stats overlay. Each runs a 10-second test on the live webcam.

- **"Hold still test"** (I keep my head still). On every frame, measure how far the glasses moved since the previous frame, in millimetres (position) and degrees (rotation). Do this for **both the raw pose and the smoothed pose**. Report the average and the p95 for each. This is the **jitter** score.
- **"Head turn test"** (I turn my head slowly). On every frame, measure the distance between the raw position and the smoothed position. Report the average and the p95. This is the **lag** score: how far the smoothed glasses trail behind.

Both tests also record FPS and latency (average, p50, p95, min) for the same 10 seconds.

When a test ends, show the results on screen and offer a **CSV download**. Each row is one frame: frame number, timestamp, raw pose, smoothed pose, and frame timings. Add a short summary at the top.

Why this is a fair comparison: the raw and smoothed poses come from the **same frames at the same moment**, so no recorded clips are needed. Note in `PERFORMANCE.md` that runs on different days use different live input, and that these tests measure **stability, not accuracy**. Accuracy is checked visually, using screenshots and the debug view.

Keep `stabilityTest.ts` as pure functions (arrays in, numbers out) with unit tests, so the math is easy to explain.

### Tier 4: Product layer (shows business thinking)

1. **Privacy as a feature.**
   - In the app, show a small, unobtrusive note: "Runs on your device. Your video is never uploaded or stored."
   - In the README and the memo, add a short privacy section. It must say:
     - frames are processed locally
     - nothing is stored or sent
     - there are no cookies or analytics
     - the model files are served from the app's own host
   - Every claim must be literally true of the code.
2. **Shareable and embeddable.**
   - `?frame=<id>` opens the app with that frame already selected. Use the catalog ids.
   - `?embed=1` hides everything except the try-on view and the picker, for use inside another site.
   - Write `docs/EMBED.md` with a copy-paste iframe snippet. It must include `allow="camera"`, because browsers block the camera inside iframes without it. Add one sentence explaining why it's needed.
   - Make sure the Vercel config doesn't block embedding.
3. **Product memo** (`docs/PRODUCT_MEMO.md`, one page, plain language) covering:
   - who would buy this (optical shops, eyewear e-commerce)
   - the problem (people hesitate to buy glasses online; returns cost money)
   - how this helps
   - how a store would add it (link or iframe)
   - privacy
   - **running cost**, compared with paid try-on tools

   **Research the vendor prices yourself on the web.**
   - Cover at least Banuba, Fittingbox and Perfect Corp, which are the main eyewear try-on vendors.
   - Use web search to find each vendor's **official pricing page or official app listing**, then fetch that page and read the price from it directly.
   - **Only use prices confirmed on the vendor's own page or official app-store listing.** Blogs, comparison sites, other vendors' articles and search snippets don't count as confirmation, even if they quote a number.
   - For every price, record:
     - the plan name and what it includes (try-ons, users or products per month)
     - the source URL
     - the date you checked it

     Show all of this in a small table in the memo.
   - If a vendor doesn't publish prices (for example, "contact sales" only), write "Not publicly listed" with the URL. **Never estimate or guess a number.**
   - Note which prices are for a Shopify app versus a web SDK, since they aren't the same product.

### Tier 5: Nice-to-have (only if time is left)

- Snapshot: save a PNG of the user wearing the glasses.
- Frame colour variants and lens tint options (clear, sunglasses, blue-light).
- A fine-tune slider for size and vertical position.

### Cut order if time runs short

Cut from the top of this list first:

1. Tier 5 extras: the slider, then tints, then the snapshot.
2. The embed feature (keep `?frame=` if possible).
3. The product memo (keep at least the privacy section in the README).

**Never cut:**

- Tier 1
- Tier 2
- the two stability test buttons
- an honest README with real numbers

---

## 6. Constraints

### Hard rules

- No backend, no paid APIs, no LLM calls, no analytics, no tracking. Video never leaves the device.
- Use only the libraries listed above. **Ask me before adding any other dependency**, and explain why it is needed.
- TypeScript strict mode. No `any` unless there is a comment explaining why.
- Every 3D model must have a clear licence (CC0 or CC-BY). Record the author, source link and licence in `catalog.ts` and in the README.
- **Never invent numbers.** Performance and test results must come from real runs that I perform, so leave placeholders for those. Vendor prices must come from the vendors' own pages, with the source and the date checked.
- Respect my limits: don't install large tooling, don't rewrite working code without a reason, and don't create files that aren't needed.
- Never start a lower tier while a higher tier has known bugs.

### Code readability (very important; I will be interviewed on this code)

- Clear names over clever code. No deep abstractions, no premature generic helpers, no unnecessary state libraries. React state and refs are enough.
- Each file starts with a 2 to 4 line comment saying what it does and how it fits into the data flow.
- Comment the **why**, not the what, especially for:
  - matrix math
  - the camera setup
  - mirroring
  - the occluder
  - the filter
  - the timing code
  - the test metrics
- Keep the per-frame loop in one readable place.
- Put every tunable value in `config.ts` with a comment on what changing it does. This covers smoothing strength, glasses offsets, light sensitivity, test duration and similar values.
- Avoid magic numbers. Name them.

### Performance

- Target ≥ 24 FPS (aim for 30+) and < 100 ms processing latency on a mid-range laptop.
- Do not allocate new objects inside the per-frame loop. Reuse matrices and vectors.
- Only run detection when the video has a new frame.
- If performance is below target, first try lowering the video resolution. Moving detection into a Web Worker is a later option, and needs me to agree to it.
- Be honest that the measured latency does not include the webcam hardware's own delay. State this in `PERFORMANCE.md`.

---

## 7. How to work with me (process)

I want to understand the **architecture and how it works** before the build. I don't need to follow every line as it's written. Keep me informed, but keep moving fast.

### Step 1: Plan (plan mode)

Before writing any code, give me:

1. The full build plan.
2. A plain-English explanation of the architecture:
   - the main modules
   - what each main function does
   - how one frame flows from the webcam to the screen

Use short sentences, and explain any jargon. Wait for my approval before you start building.

### Step 2: Build fast, stop only at checkpoints

Work through the phases below without stopping between them. Each phase must:

- leave the app runnable
- pass `npm run build`, type-checking, lint and the tests
- end with a commit that has a clear message

If something breaks, fix it before moving on. Only stop early if you need a decision from me, or a file only I can provide (like the glasses models).

| Phase | Goal | Tier |
|---|---|---|
| 0 | Scaffold: Vite + React + TS, folders, `config.ts`, README skeleton, `AI_PROMPTS.md` skeleton | — |
| 1 | Webcam feed (mirrored) with all error states | 1 |
| 2 | MediaPipe tracking + debug landmark view | 1 |
| 3 | One glasses model anchored to the head (camera matching, mirroring, scale) | 1 |
| | **⏸ Checkpoint A:** I check that the glasses sit right on my face | |
| 4 | Stats overlay + performance timing | 1 |
| 5 | One Euro smoothing (with unit tests) | 1 |
| 6 | Head occluder | 1 |
| 7 | Catalog of 5 designs + picker | 1 |
| 8 | Realism: materials, environment map, adaptive lighting, shadow, UI polish | 2 |
| 9 | Deploy to Vercel | 2 |
| | **⏸ Checkpoint B: demo-ready.** I test on desktop and mobile and record the demo video | |
| 10 | Stability + performance test buttons, CSV export, `PERFORMANCE.md` | 3 |
| | **⏸ Checkpoint C:** I run the tests in different lighting and give you the results | |
| 11 | Privacy note, `?frame=` / `?embed=1`, `EMBED.md`, `PRODUCT_MEMO.md` | 4 |
| 12 | Nice-to-haves, in the order listed | 5 |
| 13 | Final README, `ARCHITECTURE.md`, redeploy | — |
| | **⏸ Checkpoint D: final review** | |

### At each checkpoint, keep the report short

1. What now works, in 2 to 4 plain sentences.
2. Exactly what I should test, and what "working" looks like.
3. Any decision you need from me.
4. A one-line reminder to log my prompts in `AI_PROMPTS.md`.

Then wait for my go-ahead.

You cannot see my webcam. At checkpoints, tell me exactly what to look for and wait for my report.

### At the end (Phase 13)

In `docs/ARCHITECTURE.md`, explain the following so I can prepare for the interview:

- the architecture and data flow
- what each main function does
- the key design choices and why they were made:
  - camera matching
  - the occluder
  - the One Euro filter
  - running everything in the browser
  - how the tests work

Finish with a short list of likely interview questions and plain-English answers.

---

## 8. Deliverables

- **GitHub repo** with clean, frequent commits. Use clear messages, one per meaningful change.
- **README.md** containing:
  - what the app does
  - a GIF at the top
  - a live demo link
  - a demo video link
  - how to run it locally
  - the approach (Option A) and why
  - an architecture overview with the data-flow diagram
  - the models, frameworks and APIs used, with versions
  - 3D model credits
  - the AI tools used (Claude and Claude Code), with a link to `AI_PROMPTS.md`
  - a **results table** (device, browser, resolution, lighting, FPS avg/p95, latency avg/p95, jitter raw vs smoothed, lag)
  - a privacy section
  - known limitations
  - an "If this went to production" section
  - links to `PRODUCT_MEMO.md` and `EMBED.md`
- **docs/ARCHITECTURE.md**: the architecture, the main functions, the key design choices, and interview questions with answers. Write it so a junior developer can follow it.
- **docs/PERFORMANCE.md**: the test method, conditions, raw results and limitations of the tests.
- **docs/PRODUCT_MEMO.md**: the one-page business view, with sourced and dated vendor prices.
- **docs/EMBED.md**: how a store adds the try-on to its site.
- **AI_PROMPTS.md**: the prompts I used. I maintain this file.

---

## 9. Definition of done

- [ ] All Tier 1 and Tier 2 features work on desktop and mobile, and the demo video is recorded.
- [ ] At least 5 designs, all aligned well and licensed properly.
- [ ] Real measured FPS, latency, jitter (raw vs smoothed) and lag reported, with conditions.
- [ ] Tested in bright light, dim light and side-turned head positions; results recorded.
- [ ] Privacy claims are all true of the code.
- [ ] Build, type-check, lint and tests all pass.
- [ ] Deployed on Vercel over HTTPS.
- [ ] I can explain the architecture and what each main function does. If any part is too complex for that, simplify it.
