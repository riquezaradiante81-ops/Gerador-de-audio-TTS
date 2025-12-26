
export interface AudioBlock {
  id: string;
  text: string;
  audioData?: Uint8Array;
  audioUrl?: string;
  isGenerating: boolean;
  isPlaying: boolean;
  error?: string;
}

export interface GlobalSettings {
  voice: string;
  speed: number;
  temperature: number;
  style: string;
  accent: string;
  seed: number;
}

export const VOICES = [
  'Zephyr', 'Puck', 'Caronte', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 
  'Calirrhoe', 'Autonoe', 'Encélado', 'Jápeto', 'Umbriel', 'Algieba', 
  'Despina', 'Erinome', 'Algenibe', 'Rasalgethi', 'Laomedeia', 'Alchernar', 
  'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 
  'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat'
];

export const TONE_LABELS: Record<number, string> = {
  0: "Tone: Very Flat",
  0.5: "Tone: Flat",
  1: "Tone: Normal",
  1.5: "Tone: Expressive",
  2: "Tone: Highly Expressive",
  2.5: "Tone: Very Emotional",
  3: "Tone: Dramatic"
};
