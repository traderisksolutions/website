# New South Sea

Public website for **newsouthsea.com**. Next.js 16 (App Router), TypeScript, Tailwind CSS 4.

| | |
| --- | --- |
| Repo | traderisksolutions/newsouthsea (private) |
| Hosting | Cloud Run service `newsouthsea`, asia-southeast1 |
| Deploy | Push to `main` → `.github/workflows/deploy.yml` |
| Checks | Every PR → lint, typecheck, build |

## Run locally

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

## Build the production image

```bash
docker build -t newsouthsea . && docker run --rm -p 8080:8080 newsouthsea
```

## Layout

- `src/site.ts`: name, domain, base URL. Metadata, robots and sitemap read from here.
- `src/app/`: routes.
- `next.config.ts`: standalone output and security headers.

The deploy job stays skipped until the repo variables `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER` and `GCP_DEPLOY_SA` are set.
