# Cloudflare Pages + Access

## Deployment

1. Push this folder to a private GitHub repository.
2. In Cloudflare, open `Workers & Pages`.
3. Create a Pages project from the GitHub repository.
4. Use these build settings:
   - Framework preset: `None`
   - Build command: empty
   - Build output directory: `/`
   - Production branch: `main`

Cloudflare Pages has a 25 MiB single-file asset limit on the Free plan. The
deployable runtime files under `vendor/` are below that limit.

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
