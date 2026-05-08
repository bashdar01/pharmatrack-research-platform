# Fix npm ETIMEDOUT / internal OpenAI registry issue

If you see an error containing:

`packages.applied-caas-gateway1.internal.api.openai.org`

it means npm is trying to download packages from an internal registry that your computer cannot access.

Run these commands inside this project folder:

```bash
rm -rf node_modules package-lock.json
npm config set registry https://registry.npmjs.org/
npm cache clean --force
npm install --registry=https://registry.npmjs.org/
npm run dev
```

Then open the localhost link shown by Vite, usually:

`http://localhost:5173`

Do not open `index.html` directly.
