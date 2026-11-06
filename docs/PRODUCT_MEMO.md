# Product memo: in-browser glasses try-on for eyewear retailers

## Who would buy this

- **Independent optical shops** with a website or an online shop, who want to
  let customers "try" frames before visiting or buying.
- **Eyewear e-commerce brands** (direct-to-consumer and multi-brand stores),
  who sell many frames online and lose sales to uncertainty.

## The problem

Glasses sit on your face, so buying them online is a guess. Customers hesitate
because they can't tell whether a frame suits them or fits. Some don't buy,
and some buy several pairs and return the rest. Every return costs the store
shipping, handling and restocking time, and a hesitant visitor often becomes a
lost sale.

## How this helps

The customer opens the product page, allows the camera, and sees the frame on
their own face, live. The frame follows their head as they turn, hides behind
their ears, and picks up the room's lighting. They can switch frames instantly,
**capture one photo and compare up to three frames side by side** on the same
pose, then save the comparison as an image to decide later or share with a
friend. That builds confidence before the purchase, which is where hesitation
and returns start.

## How a store adds it

No account, server or API key is needed. There are two options (details in
[EMBED.md](EMBED.md)):

1. **A link**, such as a "Try it on" button pointing to `…/?frame=<id>`, which
   opens the try-on with that frame selected.
2. **An iframe** on the product page, using `?embed=1&frame=<id>` and
   `allow="camera"`. This shows only the try-on and the frame picker.

Adding a new frame means one 3D model file plus one catalog entry.

## Privacy

Privacy is a selling point, not just compliance:

- **Frames are processed locally.** Face tracking (Google MediaPipe) and 3D
  rendering run inside the customer's browser.
- **Nothing is stored or sent.** No image, video or face data leaves the device.
- **No cookies, no analytics, no tracking.**
- **The model files are served from the app's own host**, not from a
  third-party CDN.

A store therefore never receives or processes camera data. That makes the tool
easier to approve and to explain to customers.

## Running cost

Everything runs on the customer's device, so there is no per-try-on server
cost. The only cost is static hosting.

- **Vercel hosting:** the Hobby plan is "$0/mo." but "for personal,
  non-commercial use", so a store would use **Pro: "$20/mo."**, which includes
  "1TB / month" of data transfer, "then starting at $0.15 per GB"
  ([vercel.com/pricing](https://vercel.com/pricing), checked 2026-11-06).
- **Per visit:** a first visit downloads about **21 MB** (measured: the
  production build with gzip compression, all six frames preloaded). Files are
  cached for a day, so repeat visits download little.
- **What that means:** this is arithmetic on the two figures above, not a
  vendor quote. 1 TB covers roughly **50,000 first-time visits per month**
  within the $20 plan. Each first visit beyond that costs about 21 MB ×
  $0.15/GB ≈ **$0.003**.
- **Not included:** the work of making or buying 3D models of a store's own
  frames. Paid vendors also charge separately for 3D digitization.

### Paid try-on tools compared

Prices are copied from each vendor's official pricing page or official app
listing, all checked on **2026-11-06**. A **Shopify app** works only on
Shopify stores. A **web plan or SDK** works on any website. The two are
different products, so compare like with like.

| Vendor | Product (type) | Plan: price | What it includes | Source |
|---|---|---|---|---|
| **Banuba** | Glasses virtual try-on (web) | Basic: $99/mo | 1,000 virtual try-ons/mo | [banuba.com/glasses-virtual-try-on](https://www.banuba.com/glasses-virtual-try-on) |
| | | Pro: $299/mo | 3,500 virtual try-ons/mo | same |
| | | Smart: $799/mo | 15,000 virtual try-ons/mo | same |
| | | Enterprise: "Custom" | custom try-on volume | same |
| **Banuba** | TINT Virtual Try-On (Shopify app; makeup, skincare, glasses, hair dye) | Basic: $249/month | up to 2,000 try-ons/month, unlimited products | [apps.shopify.com/tint-virtual-try-on-by-banuba](https://apps.shopify.com/tint-virtual-try-on-by-banuba) |
| | | Pro: $799/month | up to 10,000 try-ons/month | same |
| | | Smart: $1,299/month | up to 40,000 try-ons/month, priority support | same |
| **Fittingbox** | Glasses Virtual Try-On (Shopify app) | Bronze: $59/month ($590/year) | up to 10 active products, up to 500 unique users/month | [apps.shopify.com/glasses-virtual-try-on-by-fittingbox](https://apps.shopify.com/glasses-virtual-try-on-by-fittingbox) |
| | | Silver: $99/month ($990/year) | up to 50 active products, up to 1,500 unique users/month | same |
| | | Gold: $199/month ($1,990/year) | up to 200 active products, up to 3,500 unique users/month | same |
| **Fittingbox** | Web integration / advanced (non-Shopify) | Custom: "On demand" | unlimited products and try-on sessions, customizable integration | [fittingbox.com Shopify app page](https://www.fittingbox.com/en/glasses-virtual-try-on/shopify-app): **Not publicly listed** |
| **Perfect Corp** | YouCam Virtual Try-On (Shopify app; makeup and eyewear) | Essential: $379/month ($3,948/year) | 100 SKUs, unlimited eyewear lens tint and frame | [apps.shopify.com/youcam-makeup-official](https://apps.shopify.com/youcam-makeup-official) |
| | | Premium: $569/month ($5,868/year) | 300 SKUs, photo sharing, zoom | same |
| **Perfect Corp** | Online Service for Eyewear (web) | (unnamed, "NEW"): ¥8,000/month | 10 eyewear SKUs, 500 unique users/month | [perfectcorp.com eyewear plan](https://www.perfectcorp.com/business/solutions/online-service/eye-wear/plan) |
| | | Online Service: ¥27,999/month | 200 eyewear SKUs, 3,500 unique users/month | same |
| | | ("Most Popular"): ¥50,500/month | 400 eyewear SKUs, 7,000 unique users/month | same |
| | | Enterprise: "Contact Sales" | unlimited SKUs and users: **Not publicly listed** | same |

**Notes on the table:**
- Perfect Corp's own page displayed prices in Japanese yen (its currency
  selector showed "Japanese Yen") and says "Pricing can change based on Global
  Exchange Rate". The first and third plan names were not shown on the page.
- Banuba's product page also showed a 3-month promotional rate (half price),
  and its FAQ describes the Shopify app as "$249 to $1,299 per month",
  consistent with the Shopify listing.
- None of these prices were estimated. Plans marked "Not publicly listed" only
  say "On demand" or "Contact Sales".

**Bottom line:** paid tools start at about $59–$379 per month and cap products,
users or try-ons. This app costs the store $20 per month on Vercel Pro with no
per-try-on charge, because the customer's device does the work. In exchange,
the store maintains it itself: no vendor support, no 3D digitization service,
and no store analytics, since it deliberately has none. That's a good fit for a
small shop or a brand that wants privacy and control. Larger retailers that need
a catalogue digitization service and support may still prefer a vendor.
