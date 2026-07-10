# Installation

## Prerequisites

- Node.js 20 or later
- npm
- Yarn 1.x for Excalidraw OSS
- an OpenAI API key
- a local Excalidraw OSS checkout

This project provides the AI backend only. The editor UI comes from
[Excalidraw OSS](https://github.com/excalidraw/excalidraw), which must be
installed separately.

## Install Excalidraw OSS

Choose a directory outside this proxy repository, then clone and install
Excalidraw:

```bash
git clone https://github.com/excalidraw/excalidraw.git
cd excalidraw
yarn
```

Keep this checkout available; you will configure and start it after the proxy
is running.

## Install the proxy

Clone this repository and install its dependencies:

```bash
git clone https://github.com/MCamner/excalidraw-ai-proxy.git
cd excalidraw-ai-proxy
npm install
```

Create your local configuration:

```bash
cp .env.example .env
```

Replace the placeholder value in `.env` with your own OpenAI API key:

```env
OPENAI_API_KEY=your-openai-api-key
```

Keep `.env` on the proxy server. Do not commit it or copy the key into
Excalidraw's browser-side configuration.

Start the proxy:

```bash
npm run dev
```

The default address is `http://127.0.0.1:3016`.

## Configure Excalidraw OSS

In the root of your Excalidraw OSS checkout, create or update `.env.local`:

```env
VITE_APP_AI_BACKEND=http://localhost:3016
VITE_APP_PORT=3003
```

Start Excalidraw from that checkout:

```bash
yarn start
```

The proxy allows `http://localhost:3003` and `http://127.0.0.1:3003` by
default. If Excalidraw uses another origin, update `ALLOWED_ORIGINS` in the
proxy's `.env`.

## Verify the installation

With the proxy running, request its health endpoint:

```bash
curl http://127.0.0.1:3016/health
```

Then run the test suite:

```bash
npm test
```

See `.env.example` for all supported runtime settings.
