# Excalidraw AI Proxy — Codex workspace instructions

Det här repot är en enkel Node.js-proxy för Excalidraw AI. Browsern skickar AI-förfrågningar till servern så att `OPENAI_API_KEY` hålls på serversidan.

## Repoöversikt

- Huvudentré: `server.js`
- Lokal utveckling: `npm run dev`
- Endpoints:
  - `POST /v1/ai/diagram-to-code/generate`
  - `POST /v1/ai/text-to-diagram/chat-streaming`
- Miljövariabler: se `.env.example`

## Arbetsregler för Codex

1. Håll ändringarna små och fokuserade på proxylogik.
2. Exponera aldrig API-nyckeln i klientkod.
3. Behåll konfigurationen i `.env` och dokumentera nya inställningar.
4. Uppdatera `README.md` vid nya endpoints eller konfigurationsändringar.

## Workspace-skills

Det finns en workspace-skill i `SKILL.md`:

- `create-skill`: guide för att skapa en återanvändbar `SKILL.md` i det här repo.

## Användning

Använd den här filen som kontext för repo-specifika instruktioner i Codex. Svara kort, konkret och repo-fokuserat.

## Exempelpromptar

- "Skapa en Codex-workflow för att lägga till en ny Excalidraw AI-endpoint."
- "Skriv ett `SKILL.md` som guidar genom att dokumentera den här proxyservern."
- "Förklara hur man testar `POST /v1/ai/text-to-diagram/chat-streaming` lokalt."
