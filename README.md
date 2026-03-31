# Watchdog

**Know when websites change.**

Watchdog is a website change monitoring tool. Paste a URL, Watchdog takes a snapshot of the page content, and barks when something changes.

## Stack

- **Next.js 15** — App Router, React Server Components
- **TypeScript** — strict mode
- **Tailwind CSS** — utility-first styling + CSS variable theming
- **Jest + React Testing Library** — TDD enforced via `prebuild` hook
- **pnpm** — package manager
- **Vercel** — zero-config deployment

## Getting Started

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server |
| `pnpm build` | Run tests, then production build |
| `pnpm test` | Run tests in watch mode |
| `pnpm test:ci` | Run tests once (CI) |
| `pnpm start` | Start production server |

> `pnpm build` runs `jest --ci` first via `prebuild`. A failing test blocks the build.
>
> **Note for CI/CD:** Both `prebuild` and `test:ci` explicitly set `NODE_ENV=test`. This is required because Vercel (and most CI environments) set `NODE_ENV=production` before the build step, which causes React to load its production bundle — a bundle that doesn't support `act()` and will fail all RTL tests.

## Testing (TDD)

Tests live in `__tests__/` alongside each component. Every component has a corresponding test file. Write tests before (or alongside) new components.

```bash
pnpm test              # watch mode — runs on file change
pnpm test:ci           # single run, exits with code
```

When adding a new component:
1. Create `__tests__/MyComponent.test.tsx` first
2. Write failing tests for the expected behavior
3. Implement the component until tests pass
4. `pnpm build` will verify tests pass before shipping

## Project Structure

```
watchdog/
├── app/
│   ├── layout.tsx        # Root layout, metadata
│   ├── page.tsx          # Home page
│   └── globals.css       # CSS variables + Tailwind base
├── components/
│   ├── DogLogo.tsx       # SVG dog logo
│   ├── Nav.tsx           # Top navigation
│   ├── Hero.tsx          # Hero section + URL input
│   ├── FeatureCards.tsx  # 4-up feature grid
│   ├── HowItWorks.tsx    # 3-step explainer
│   └── Footer.tsx        # Footer
├── __tests__/            # Component tests (Jest + RTL)
├── __mocks__/            # Jest module mocks
├── jest.config.js
├── jest.setup.ts
├── tailwind.config.ts
├── next.config.ts
└── tsconfig.json
```

## Theming

Dark/light mode is handled automatically via `prefers-color-scheme` and CSS custom properties defined in `globals.css`. No JavaScript required.

## Roadmap

See `watchdog-prd-trd.docx` for the full product and technical spec. Short version:

- **V1.1** — Labels, URL validation, error retry, favicons
- **V1.2** — Browser push notifications, service worker polling
- **V2.0** — Backend API, database, automated polling, email/webhook alerts
- **V2.1** — CSS selector targeting, Playwright rendering, screenshot diffs
- **V2.2** — Tags/folders, bulk import, change history, share links
- **V3.0** — Multi-tenant, team workspaces, API access, integrations

## Deployment

Deploy to Vercel with zero config — connect the GitHub repo in the Vercel dashboard or run:

```bash
npx vercel
```

## License

MIT
