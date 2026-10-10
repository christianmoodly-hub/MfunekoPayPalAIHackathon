import { GoogleGenAI } from "@google/genai";

export type GeminiRequest = {
  model: string;
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
};

export type GeminiGenerate = (request: GeminiRequest) => Promise<string>;

export function createGeminiGenerate(apiKey: string): GeminiGenerate {
  const ai = new GoogleGenAI({ apiKey });

  return async (request) => {
    const interaction = await ai.interactions.create({
      model: request.model,
      input: request.prompt,
      system_instruction: request.systemInstruction,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: request.responseSchema,
      },
      store: false,
    });

    if (!interaction.output_text) {
      throw new Error("Gemini returned no text.");
    }

    return interaction.output_text;
  };
}
