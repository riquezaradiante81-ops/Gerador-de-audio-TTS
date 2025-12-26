
import { AudioBlock } from '../types';

/**
 * Encodes Uint8Array (PCM) to base64
 */
export function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decodes base64 string to Uint8Array
 */
export function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts raw PCM data to a WAV Blob
 */
export function createWavBlob(pcmData: Uint8Array, sampleRate: number = 24000): Blob {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // RIFF chunk length
  view.setUint32(4, 36 + pcmData.length, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true); // PCM
  // channel count
  view.setUint16(22, 1, true); // Mono
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, pcmData.length, true);

  return new Blob([header, pcmData], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Decodes PCM bytes into an AudioBuffer for playback
 */
export async function decodeAudioToBuffer(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Generates a ZIP file of all generated audios
 */
export async function generateZip(blocks: AudioBlock[]): Promise<Blob> {
  // @ts-ignore - JSZip is loaded via CDN
  const zip = new window.JSZip();
  
  blocks.forEach((block, index) => {
    if (block.audioData) {
      const wavBlob = createWavBlob(block.audioData);
      zip.file(`audio_${index + 1}.wav`, wavBlob);
    }
  });

  return await zip.generateAsync({ type: 'blob' });
}

/**
 * Concatenates multiple PCM buffers into one WAV Blob
 */
export function concatenateToSingleWav(blocks: AudioBlock[]): Blob {
  const totalLength = blocks.reduce((acc, b) => acc + (b.audioData?.length || 0), 0);
  const result = new Uint8Array(totalLength);
  
  let offset = 0;
  blocks.forEach(block => {
    if (block.audioData) {
      result.set(block.audioData, offset);
      offset += block.audioData.length;
    }
  });

  return createWavBlob(result);
}
