# Local GGUF Chat

An installable, static PWA for running a user-selected GGUF model in the browser. It uses wllama/llama.cpp locally: no server, account, analytics, model download, or retained weight file.

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

`npm.cmd run build` produces the deployable `dist/` directory. The service worker precaches the application shell and local WASM runtime, so after one installed/online load it can start without an internet connection. A selected GGUF is intentionally not cached and must be chosen again in each browser session.

The Vite development and preview servers already send the isolation headers needed for multi-threaded WASM. After starting or restarting either server, confirm the UI says `multi-thread capable` before benchmarking CPU performance.

## Deployment requirement

Deploy `dist/` as static files over HTTPS. To enable wllama's multi-threaded mode, the host must return these headers for all app assets:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

`public/_headers` supplies that configuration for Netlify/Cloudflare-style static deployments. Without these headers, the app stays functional using a single-thread runtime. Safari's wllama compatibility worker and WASM are bundled with the app and precached, not loaded from a CDN. Firefox intentionally remains on the native CPU/WASM path: wllama documents its WebGPU compatibility mode there as extremely slow.

## GitHub Pages

The included workflow, `.github/workflows/deploy-pages.yml`, tests and deploys every push to `main`. It needs no access token or server: GitHub provides the deployment credential automatically.

1. Create an empty GitHub repository (do not initialize it with a README, license, or `.gitignore`).
2. In this directory, run the following commands, substituting your GitHub account and repository name:

```powershell
git init
git add .
git commit -m "Initial offline GGUF PWA"
git branch -M main
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
git push -u origin main
```

3. On GitHub, open **Settings → Pages**, choose **GitHub Actions** as the build and deployment source, then wait for the **Deploy to GitHub Pages** workflow to finish. The deployment URL is shown in that workflow and will normally be `https://YOUR-ACCOUNT.github.io/YOUR-REPOSITORY/`.

The Vite configuration uses relative paths, so the PWA assets and service worker work under a repository subpath. GitHub Pages does **not** allow custom response headers, so it cannot enable `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`; WebGPU remains available where the browser supports it, but CPU/WASM fallback is single-threaded. Use a host that supports the headers above if strong CPU-only performance matters.

## Verification

```powershell
npm.cmd run build
npm.cmd test
```

For a real-device check, load the deployed app once, install it, go offline, reopen it, choose a compatible Gemma 4 or Qwen 3.5 GGUF, send a prompt, reload, and export/import the chat JSON.
