# web

Build and publish the Vite React app to GitHub Pages.

Commands
- Install dependencies:
```bash
npm install
```
- Run dev server:
```bash
npm run dev -- --host
```
- Build for production:
```bash
npm run build
```
- Preview production build:
```bash
npm run preview
```

Notes
- The Vite `base` is set to `./` in `vite.config.js` so assets are resolved relatively when deployed to GitHub Pages.
- The repository includes a GitHub Actions workflow at `.github/workflows/pages.yml` which builds `web/` and deploys `web/dist` on pushes to `main`.
# Web UI for Retirement Calculator

Run locally:

```bash
cd /home/nathannelson/.config/fin/web
npm install
npm run dev
```

Open the displayed local URL in your browser. The UI mirrors the CLI inputs and shows target corpus and required annual savings.
