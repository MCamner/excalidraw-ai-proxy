import OpenAI from "openai";

export function createOpenAIClient({
  apiKey,
  timeout,
  maxRetries,
  Client = OpenAI,
} = {}) {
  return new Client({
    apiKey,
    timeout,
    maxRetries,
  });
}
