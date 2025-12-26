
import { GoogleGenAI, Modality } from "@google/genai";
import { decode } from "../utils/audioUtils";
import { GlobalSettings, TONE_LABELS } from "../types";

export async function generateTTS(text: string, settings: GlobalSettings): Promise<Uint8Array> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const toneLabel = TONE_LABELS[settings.temperature] || "Normal";
  const prompt = `[Direction: Style: ${settings.style || 'Natural'}, Accent: ${settings.accent || 'Default'}, Speed: ${settings.speed}, ${toneLabel}] ${text}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      seed: settings.seed,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: settings.voice },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  
  if (!base64Audio) {
    throw new Error("Não foi possível gerar o áudio. O modelo não retornou dados de voz.");
  }

  return decode(base64Audio);
}
