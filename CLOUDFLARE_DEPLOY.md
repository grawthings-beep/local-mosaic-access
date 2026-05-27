# Cloudflare Pages + Access

## Deployment

1. Push this folder to a private GitHub repository.
2. In Cloudflare, open `Workers & Pages`.
3. Create an application from the GitHub repository.
4. If the setup screen shows `Build command` and `Deploy command`, use:
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Production branch: `main`

The deploy command reads `wrangler.jsonc`, which publishes only the generated
`dist/` folder as static assets. It also deploys `src/worker.js`, which proxies
`/api/mosaic` to the RunPod auto mosaic API.

If Cloudflare shows the older Pages setup with `Build output directory`, use:
   - Framework preset: `None`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Production branch: `main`

Cloudflare Pages has a 25 MiB single-file asset limit on the Free plan. The
deployable runtime files under `vendor/` are below that limit.

## RunPod API variables

After the RunPod API is running, set these in Cloudflare:

`Workers & Pages` > `local-mosaic-access` > `Settings` > `Variables and Secrets`

- `MOSAIC_API_URL`: RunPod public URL, such as `https://xxxx-8000.proxy.runpod.net`
- `MOSAIC_API_TOKEN`: a long random token. Set the same value on RunPod.

The browser posts to `/api/mosaic`. The Worker adds the private token server-side
before forwarding to RunPod.

## Access

For full authentication, prefer a custom domain such as:

```text
mosaic.example.com
```

Then create a Cloudflare Zero Trust Access application:

1. Go to `Zero Trust` > `Access` > `Applications`.
2. Add a `Self-hosted` application.
3. Set the application domain to your custom domain.
4. Add an `Allow` policy for your email address.
5. Test from iPhone Safari on mobile data.

If you use only the default `*.pages.dev` domain, protect production and preview
deployments carefully. Pages preview protection does not automatically protect
the production `*.pages.dev` URL.
