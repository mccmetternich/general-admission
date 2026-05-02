# General Admission — Landing Page

A static, single-page landing site for **General Admission** (generaladmission.la). Hero is a custom dot-matrix wordmark rendered to canvas; the cursor displaces dots as it sweeps through them and they spring back home. Includes a CONTACT form that emails Matthias in the background.

## Structure

```
index.html        # Entry point. Loads React/Babel via CDN, then the JSX files.
app.jsx           # App shell — corners, contact panel, reveal overlay.
dotfield.jsx      # The dot-matrix canvas + cursor-displacement physics.
tweaks-panel.jsx  # In-page tweak controls (only the "settle speed" slider).
styles.css        # All styling.
```

The page is fully static. No build step. Open `index.html` directly, drop the folder on any static host (Netlify, Vercel static, S3+CloudFront, GitHub Pages, etc.), or `python3 -m http.server` from the project root.

## Contact form / email backend

The CONTACT form posts to **FormSubmit** (https://formsubmit.co), which forwards inquiries to `matthias@generaladmission.la`. No signup, no API key required — but on the very first submission FormSubmit emails Matthias asking him to confirm the address. Once he clicks the confirmation link, every subsequent submission lands in his inbox automatically.

The endpoint is set in `app.jsx`:

```js
const CONTACT_ENDPOINT = "https://formsubmit.co/ajax/matthias@generaladmission.la";
```

To swap to a different provider (your own backend, Formspree, Resend via a Cloudflare Worker, etc.), change that URL and adjust the `submit()` payload in `ContactBody`. The fetch is plain `application/json` POST; any endpoint that accepts JSON and returns a 2xx works.

### Going to production

1. **Confirm the FormSubmit address.** First time the form is submitted in production, Matthias gets a confirmation email from FormSubmit. He must click the link before anything is delivered. (You can pre-confirm by submitting a test inquiry yourself.)
2. **Optional anti-spam.** FormSubmit supports a hidden `_captcha` field (default on) and `_honey` honeypot. If you start getting spam, add `<input type="text" name="_honey" style="display:none">` to the form and FormSubmit will silently drop bots.
3. **Custom domain redirect after send.** Currently the submit happens via AJAX and a "Received." panel renders client-side, so no redirect is needed. If you switch off AJAX, set `_next` in the payload to a thank-you page URL.

## Deployment recipes

**Netlify (recommended):**
```
netlify deploy --dir=. --prod
```

**Vercel:**
```
vercel --prod
```

**Static S3:** sync the folder to your bucket, set index document to `index.html`. The CDN edge cache should be fine to set to a short TTL (1h) since the file references CDN-hosted React/Babel.

**GitHub Pages:** push to a `gh-pages` branch (or a docs/ folder on main with Pages set to `docs/`). Site goes live at `<user>.github.io/<repo>`.

## Local development

No build, no install. Just serve the folder:

```
python3 -m http.server 8000
# or
npx serve .
```

Then open http://localhost:8000.

## Tweaks panel

The page exposes a "Tweaks" panel (only visible inside the design tool — the toolbar toggle and protocol comes from there). For production deploys it stays hidden because the parent never sends the activate message. You can leave the file in or strip out `tweaks-panel.jsx` and the `<window.TweaksPanel>` JSX in `app.jsx` if you want a leaner bundle.

## Notes

- **Locked palette.** White background, black dots. Color pickers were removed; if you need brand variants again, restore the `PALETTES` map and `PalettePicker` from git history.
- **CDN dependencies.** React 18.3.1, ReactDOM 18.3.1, and Babel 7.29.0 are loaded from `unpkg.com` with subresource-integrity hashes. If you want a fully self-hosted bundle (no third-party CDN at runtime), use the standalone-HTML export skill or vendor those three files into the repo and update the `<script>` `src` paths.
- **Fonts.** Geist and Archivo Black come from Google Fonts. Same vendoring note applies if you want zero third-party requests.
