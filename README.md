# TCM-Ancient-Books

中医药古籍文本，近 700 项。现在包含一个静态网页浏览器，可直接发布到 Cloudflare Pages。

## Local Preview

```bash
node scripts/build-manifest.mjs
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://localhost:4173`.

## Cloudflare Pages

This is a static site. Use these settings in Cloudflare Pages:

- Build command: `node scripts/build-site.mjs`
- Build output directory: `dist`
- Root directory: repository root

If Cloudflare asks for a deploy command, you are using Workers Builds. Use:

- Deploy command: `npx wrangler deploy --assets ./dist`

The generated `data/books.json` manifest lists every `.txt` book. The reader fetches each book on demand and decodes GB18030/GBK text in the browser, with a UTF-8 fallback.
