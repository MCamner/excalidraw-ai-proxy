# Quick start

## 1. Start the proxy

```bash
git clone https://github.com/MCamner/excalidraw-ai-proxy.git
cd excalidraw-ai-proxy
cp .env.example .env
npm install
```

Set your own key in `.env`:

```env
OPENAI_API_KEY=your-openai-api-key
```

Then start the proxy:

```bash
npm run dev
```

## 2. Connect Excalidraw OSS

Add these values to `.env.local` in your Excalidraw checkout:

```env
VITE_APP_AI_BACKEND=http://localhost:3016
VITE_APP_PORT=3003
```

Start Excalidraw from that checkout. The default local addresses are:

- proxy: `http://localhost:3016`
- Excalidraw: `http://localhost:3003`

For prerequisites, verification, and custom origins, see [INSTALL.md](INSTALL.md).
