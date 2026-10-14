# Mightora REST Studio

**A free, open-source REST API request builder and embedded developer panel for GitHub Pages.** MIT licensed; no hosted relay, telemetry or account.

## What you get

- Full-page REST builder for GET, POST, PUT, PATCH, DELETE, HEAD and OPTIONS.
- URL query parameters, headers, bearer / basic / API-key authentication and JSON/raw request bodies.
- Request sending from **your browser directly to your chosen API**, with formatted/raw/header response views, timeout, cancel and 2 MiB response display cap.
- cURL copy, JSON formatting, local collections and portable import/export.
- Runnable local mock example, plus GitHub, JSONPlaceholder, Dataverse and Microsoft Graph examples.
- Floating panel, launched from an isolated iframe (`widget.js`).
- Downloads: standalone offline HTML and ZIP, generated from the same `src/app.js` and `src/styles.css` as online.
- Transparent on-screen network domain summary and F12 inspection instructions.

## Deployment to GitHub Pages

1. Public repository: `mightora/rest.mightora.io`.
2. Add these source files to the default `main` branch.
3. In Settings → Pages, set **Source: GitHub Actions**.
4. The workflow `.github/workflows/deploy.yml` runs tests, builds portable downloads, and deploys `dist` to GitHub Pages.
5. Go to Settings → Pages, select GitHub Actions as source, set `rest.mightora.io` as the custom domain, and point DNS to `mightora.github.io`.
6. Inspect the Actions jobs and badges. They represent check outcomes and do **not** certify that the application is secure.

The code does not need an Azure account, Node runtime on the visitor's machine, server-side proxy or build-time npm dependencies. CI uses Node 22 and Python 3.

## Embed the panel

On a site you control, add immediately before `</body>`:

```html
<script src="https://rest.mightora.io/widget.js" defer></script>
```

The launcher opens an iframe whose REST Studio request origin remains that of the hosted tool. It **does not** inherit the host page's cookies, DOM, local storage or authentication. Sites with restrictive `script-src` and `frame-src` CSP directives may not allow it. The script can be edited to use your Pages/custom-domain URL. It creates a responsive, draggable and resizable panel with a full-page link.

## Downloaded offline edition

1. Use the download link on the hosted site or obtain the Pages build artifact.
2. Extract the ZIP and double-click `index.html`, or download `rest-studio-offline.html` and double-click it.
3. No installation, local web server, CDN, library or internet connection is required.
4. Compose, format, save/import/export collections, copy cURL and run the local simulated response.
5. **Live HTTP requests are disabled in the offline edition**, enforced by CSP `connect-src 'none'`. Open the hosted edition to send real API requests. This is intentional to satisfy network isolation requirements; the downloaded HTML is an offline *builder*, not an offline network client.
6. Offline HTML embeds all styles and JavaScript; images and favicon are embedded as data URLs. The official Mightora PNG is baked into the **CI release**. Local development without the PNG uses a visibly simpler vector wordmark, so never publish a local fallback build as the release.

## Network transparency & privacy

- Online: externally hosted *shared UI*, js-yaml, official Mightora logo, and TechTweedie author assets load; images for GitHub workflow status also load. API requests are sent directly to the URL the user chooses. No app telemetry or analytics.
- Offline: all required assets are embedded. No automatic app network requests and sending is disabled. External links remain available but are not visited automatically.
- The browser's Performance Resource Timing API only displays resources the browser exposes to scripts; it **cannot prove** that the app transmitted nothing. For independent inspection, press **F12 → Developer Tools → Network → Preserve log → Reload**.
- Requests omit cookies (`credentials: 'omit'`). Auth fields are held in volatile memory, not saved. Secret-looking headers and query parameters are filtered from saved and exported collections; this is best-effort only and can miss unexpected field names or secrets in bodies/URLs.
- `localStorage` contains explicitly saved requests only, not captured traffic. Be careful with secrets embedded in request bodies; avoid saving confidential payloads.
- Browser CORS and CSP restrictions apply; errors can occur for reasons invisible to a static client. No public CORS-bypass proxy is provided.
- Use HTTPS endpoints when feasible. HTTP from an HTTPS-hosted page is generally blocked as mixed content. The requested endpoint receives the traffic you explicitly initiate.

## Development

```bash
npm test
python3 scripts/build.py
npm run test:build
```

`REQUIRE_OFFICIAL_LOGO=1` causes build to fail unless `assets/mightora-logo.png` is present (the CI downloads it from the exact design-system URL). To test online locally, run `python3 -m http.server 8000` and open `http://localhost:8000`. No npm dependencies are installed.

## Open-source evidence

- Build and Pages deployment workflow: `.github/workflows/deploy.yml`.
- CodeQL analysis workflow: `.github/workflows/codeql.yml`.
- Dependabot automation: `.github/dependabot.yml`.
- MIT licence: `LICENSE`.

Evidence links and badges become verifiable **after you publish this repository and GitHub executes the workflows**. Until then, do not imply a successful build, security scan or deployment.

## Limitations

- Browser networking only; it cannot bypass CORS, CSP or target service authorisation.
- Hosted iframe cannot act as the host website's signed-in user.
- Browser `file://` origins have unusual storage and networking behaviour; tests must include actual browser execution.
- API response display is text-only and capped at 2 MiB; streaming/binary payloads are not supported in this release.
- Default cloud branding relies on Mightora `shared-ui@main`. The offline edition embeds static styles and component fallback structure because the external web components fetch dynamic resources.
- Network transparency is advisory rather than an audit or capture of all traffic.
- Static GitHub Pages cannot run a request proxy, host mock endpoints or privately store account credentials.

PRs and improvements are welcome; please avoid submitting tokens or personal data in issues/tests.