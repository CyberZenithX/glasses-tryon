# Adding the try-on to a store's website

The try-on is a static web page, so any website can show it inside an `<iframe>`.
There is no account, API key or server to set up, and nothing to install.

## Copy-paste snippet

Replace `https://YOUR-DEPLOYMENT.vercel.app` with the app's address.

```html
<iframe
  src="https://YOUR-DEPLOYMENT.vercel.app/?embed=1&frame=eder"
  title="Try these glasses on with your camera"
  allow="camera"
  style="width: 100%; aspect-ratio: 4 / 3; max-width: 900px; border: 0; border-radius: 16px;"
></iframe>
```

**Why `allow="camera"` is needed:** browsers block the camera inside an iframe
unless the page that contains it explicitly grants that permission. Without it,
visitors see a "Camera access is blocked" message instead of the try-on.

## Options in the address

| Option | What it does |
|---|---|
| `?embed=1` | Shows only the try-on view and the frame picker. It hides the stats, debug, Capture & Compare and privacy-note overlays, and disables the keyboard shortcuts, so they don't interfere with the store's page. The 3D model credits stay visible, because the models' CC-BY licences require them. |
| `?frame=<id>` | Opens with that frame already selected, for example on the product page of that frame. |

Frame ids are listed in `src/lib/catalog.ts`:

| id | Frame |
|---|---|
| `eder` | Bold Square |
| `tilley` | Crystal Round |
| `victory` | Classic |
| `kinokoda` | Round Wire |
| `cuv` | Half Rim |
| `heart` | Heart |

A plain link works too, without an iframe. For example, a "Try it on" button
on a product page can link to `https://YOUR-DEPLOYMENT.vercel.app/?frame=heart`.
Choosing a frame in the app updates the address, so the link a customer copies
always opens the frame they were looking at.

## Requirements

- **HTTPS.** Browsers only allow the camera on secure pages, so both the store's
  page and the try-on must be served over HTTPS. Vercel provides HTTPS
  automatically.
- **Embedding is allowed.** The app's `vercel.json` sends
  `Content-Security-Policy: frame-ancestors *` (any site may embed it) and
  `Permissions-Policy: camera=*` (the camera may be used when embedded). To
  restrict embedding to your own store, replace `*` with your domain, for
  example `frame-ancestors https://shop.example.com`.
- **Size.** Give the iframe enough room for a face and the picker. At least
  about 360 × 480 px works on phones; 4:3 or wider suits desktops.

## Privacy for the store's customers

All processing happens in the customer's browser. Camera frames are never
uploaded or stored. The app sets no cookies and has no analytics, and it loads
its face-tracking model and 3D files from its own host, not from third parties.
A store adding the iframe therefore doesn't receive or process any camera data.
