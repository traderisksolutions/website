# New South Sea

Public website for **newsouthsea.com**. Next.js 16 (App Router), TypeScript, Tailwind CSS 4.

| | |
| --- | --- |
| Repo | traderisksolutions/website, folder `newsouthsea/` |
| Hosting | Vercel project `newsouthsea` (TRS team), root dir `newsouthsea` |
| Deploy | Push to `main` rebuilds when this folder changes |
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
- `src/content/`: coverage lines, industries, placement stages and nav. Pages render from these files.
- `src/components/`: header, footer, closing band with enquiry form, section patterns.
- `/api/enquiry`: emails form posts through Resend. Dormant until `RESEND_API_KEY`, `ENQUIRY_FROM` and `ENQUIRY_TO` are set.
- Text in [square brackets] is content the client has not supplied yet.

The deploy job stays skipped until the repo variables `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER` and `GCP_DEPLOY_SA` are set.

## Brand (locked 23 Oct 2026)

- Mark: `NSS` in tight serif capitals (Cormorant Garamond 600, letter-spacing −0.03em). `src/components/wordmark.tsx`, `Mark`.
- Full lockup: navy block 4:3 with the mark on its bottom edge, then New South Sea / 新南海（香港）有限公司 / New South Sea (HK) Limited. `Lockup`, used in the footer.
- Favicon: the N alone on navy. `src/app/icon.png`, `src/app/apple-icon.png`.
- Colour: one colour, NSS navy `#1C3358`. Slate `#7A8BA3` for the registered name, secondary numbers and rules. No second colour. Token names in `globals.css` (`ultra`, `bronze`, `umber`, `night`) are kept from the earlier build and now map to navy, slate, navy and deep navy.
- Type: serif for display and headings (Cormorant Garamond at `.h1`/`.h2`, EB Garamond at text sizes via `.display`), Geist for body and interface. Reference: privatebank.jpmorgan.com/apac.
- Retired: the wave, the two-tone grey, ultramarine and bronze, 新南洋 (the company is 新南海).
