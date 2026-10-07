# random_work — 奧特曼揭牌抽籤

A fully static children's-artwork lottery website with an Ultraman "tear the paper"
reveal theme. **No backend** — pure HTML / CSS / JS, ready to deploy to **GitHub Pages**.

## How it works
- A reveal panel is aligned over the blackboard inner frame in the Ultraman hero image.
- The artwork set is **built in** (bundled in `artworks/`), not uploaded by users.
- Press **開始撕牌抽籤**: the board holds a stack of artwork sheets (a cream cover sheet on
  top while idle). Each tick Ultraman "grabs" the top sheet at the corner his hand holds and
  tears the whole sheet off toward his body (jagged torn edges, paper scraps, stage shake),
  revealing the next sheet; the rhythm slows down, pauses with a tense jitter, and a heavy
  final rip reveals the **uniformly random** winner. Only then does the gold **🏆 中籤！**
  badge pop and the name fade in (no spoiler while cycling).
- When the winner badge appears, `sound/歡呼聲.mp3` plays once. Starting another draw or resetting stops the previous cheer. Audio is unlocked by the start-button gesture, and an audio failure does not block the draw.
- Each paper pull plays `sound/paper.mp3` in time with the arm. The winner reveal adds three bursts of colorful confetti that fall and disappear after roughly 3.5 seconds. Restart/reset clears all effects; reduced-motion mode skips the flying confetti.
- Press **重置** to put the cover sheet back (disabled — and visibly greyed — while a draw is running).
- All artworks are preloaded on page load; the start button is disabled until they finish.

The random winner is chosen with `crypto.getRandomValues` (rejection sampling to
avoid modulo bias), falling back to `Math.random` if unavailable.

## Files
- `index.html` — markup, with a CSP meta and `X-Content-Type-Options: nosniff`
- `styles.css` — dark sci-fi theme, gold accents, percentage-positioned panel, mobile layout
- `app.js` — artwork list + tear-off animation (Web Animations API) + draw/reveal logic
- `hero-clean-plate.png` — background with the drawing arm removed and torso/background reconstructed using built-in image generation (see `ASSETS.md`).
- `hero-nohand-lower.webp` — original image, reused through SVG clip paths for the upper arm and forearm textures.
- `lower-hand.webp` — original hand texture, attached to the forearm; it no longer rotates on its own.
- The SVG hierarchy in `index.html` rotates the whole arm about the shoulder `(127, 267)`, with a second joint at the elbow `(173, 415)`. Normal pulls sweep from −12° to +27° at the shoulder, with a stronger final pull. All motion returns to the starting pose after the draw.
- Desktop and mobile share the same source coordinates. Mobile uses the original 600×540 crop, with a 7° resting shoulder adjustment so the fingertips meet the card.
- Paper follows the fingertip through the shoulder and elbow transforms until release. A draw takes approximately five seconds. Reduced-motion mode keeps the arm still.
- Click the winning artwork to view it full-screen (click / Esc to close).
- `artworks/` — 11 distinct artworks in the draw: the original three plus eight added works.
  The original three have anonymized labels and masked name strips; the newly supplied images are used unchanged, with artwork titles or a file identifier as labels.
  Duplicate versions remain in the folder but are excluded from `ARTWORKS`:
  `558988_0.jpg` → `art1-traffic.jpg`, `558989_0.jpg` → `art2-star.jpg`,
  `558992_0.jpg` → `art3-sweet.jpg`. These are visually the same works despite different file sizes/encodings.

## Accessibility & privacy
- `aria-live` lives on the status line (`.hud`), not the fast-cycling panel.
- `prefers-reduced-motion`: no tearing or shaking — the cover fades out, the winner fades in.
- Artwork labels use titles, original nicknames, or file identifiers. The original three images have the handwritten name strip masked and metadata removed; newly supplied files retain their original contents.

## Local preview
```bash
cd random_work
python -m http.server 8799 --bind 127.0.0.1
# open http://127.0.0.1:8799/
```

## Deploy to GitHub Pages
Push this folder to a repo and enable Pages (Settings → Pages → deploy from branch).
All asset paths are **relative**, so it works under a project subpath like
`https://<user>.github.io/<repo>/`. GitHub Pages free tier requires a **public** repo.

## Customizing the artworks
Replace the image files in `artworks/` (or add images) and edit the `ARTWORKS`
array at the top of `app.js` — each entry is `{ src, name }`. Keep labels free of
real names / class numbers before publishing.
