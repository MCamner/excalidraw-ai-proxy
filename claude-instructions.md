# Excalidraw AI Proxy — Claude workspace instructions

Den här koden är en enkel Node.js-proxy för Excalidraw AI. Browsern skickar AI-förfrågningar till den här servern så att `OPENAI_API_KEY` hålls på servern.

## Repoöversikt

- Huvudentré: `server.js`
- Lokal utveckling: `npm run dev`
- Endpoints:
  - `POST /v1/ai/diagram-to-code/generate`
  - `POST /v1/ai/text-to-diagram/chat-streaming`
- Miljövariabler: se `.env.example`

## Arbetsflöde för denna workspace

1. Håll ändringarna små och målade mot proxylogik.
2. Undvik att exponera API-nyckeln i klientkod.
3. Behåll enklare konfiguration i `.env`.
4. Dokumentera ändringar i `README.md` när du lägger till nya endpoints eller `.env`-inställningar.

## Workspace-specifik skill

Det finns en workspace-skillsbeskrivning i `SKILL.md`:

- `create-skill`: en guide för att skapa en återanvändbar `SKILL.md` i det här repo.

## Användning

När du jobbar i Claude, använd den här filen som kontext för repo-specifika instruktioner. Försök hålla svaren konkreta och repo-fokuserade.

## Förslag på prompt

- "Skriv en Claude-workflow för att lägga till en ny Excalidraw AI-endpoint."
- "Skapa en `SKILL.md` som guidar mig genom att dokumentera den här proxyservern."
- "Förklara hur man testar `POST /v1/ai/text-to-diagram/chat-streaming` lokalt."
