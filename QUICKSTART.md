# Quick start

The proxy is only the AI backend. You also need a local checkout of
[Excalidraw OSS](https://github.com/excalidraw/excalidraw) to provide the
editor UI.

## 1. Install Excalidraw OSS

Clone Excalidraw into a separate directory:

```bash
git clone https://github.com/excalidraw/excalidraw.git
cd excalidraw
yarn
```

## 2. Start the proxy

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

## 3. Connect and start Excalidraw OSS

Add these values to `.env.local` in your Excalidraw checkout:

```env
VITE_APP_AI_BACKEND=http://localhost:3016
VITE_APP_PORT=3003
```

Start Excalidraw from that checkout:

```bash
yarn start
```

The default local addresses are:

- proxy: `http://localhost:3016`
- Excalidraw: `http://localhost:3003`

For prerequisites, verification, and custom origins, see [INSTALL.md](INSTALL.md).
