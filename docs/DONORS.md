# Supporters page (/donors)

Ko-fi tells the site about every payment through a webhook. The Worker saves it in the
`donations` table of the DOWNLOADS_DB D1 database (created on first use), and
`/donors` lists the supporters from `/api/donors`.

## What shows publicly

- One entry per named supporter, newest first, with their latest message and the month they first gave.
- Ko-fi memberships get a badge with the tier name.
- Amounts are never shown. E-mail and shipping details are never stored.
- Anyone who ticked "make private" on Ko-fi is only counted ("…and 2 more private contributions").
- Anything you hide in /admin > Supporters is treated the same as private.

## Setup (once)

1. Ko-fi: **Settings > More > API** (https://ko-fi.com/manage/webhooks).
2. Set **Webhook URL** to `https://azraelsmods.com/api/kofi` and save.
3. Copy the **Verification Token** shown under Advanced on that page.
4. Add it as a Worker secret, from this repo: `npx wrangler secret put KOFI_VERIFICATION_TOKEN`
   (or Cloudflare dashboard > Workers > azraels-mods-website > Settings > Variables and Secrets).
5. Back on Ko-fi, press **Send Single Donation Test**. It shows up in /admin > Supporters.
   Hide or ignore it there (Ko-fi test rows can't be deleted, only hidden).

Until the secret is set, `/api/kofi` answers 401 and the Supporters tab in /admin says so.

Ko-fi has no API for past payments, so anyone who gave before the webhook was set up can be
added by hand from /admin > Supporters.

## Adding another service later

Each row has a `provider` (`kofi`, `manual`). A new service gets its own route next to
`handleKofi` in `src/worker.ts` and a parser in `src/donors/donors.mjs` that returns the same
donation shape with its own provider and id prefix, plus an entry in `PROVIDERS`.
