
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AudioBlock, GlobalSettings, VOICES } from './types';
import { generateTTS } from './services/geminiService';
import { createWavBlob, generateZip, concatenateToSingleWav, decodeAudioToBuffer } from './utils/audioUtils';

export default function App() {
  const [blocks, setBlocks] = useState<AudioBlock[]>([{ id: uuidv4(), text: '', isGenerating: false, isPlaying: false }]);
  const [settings, setSettings] = useState<GlobalSettings>({
    voice: 'Kore',
    speed: 1.0,
    temperature: 1.0,
    style: '',
    accent: '',
    seed: 42
  });
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const currentAudioSource = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  const stopAllPlayback = useCallback(() => {
    if (currentAudioSource.current) {
      currentAudioSource.current.stop();
      currentAudioSource.current = null;
    }
    setIsPlayingAll(false);
    setBlocks(prev => prev.map(b => ({ ...b, isPlaying: false })));
  }, []);

  const playBlock = useCallback(async (id: string) => {
    stopAllPlayback();
    const block = blocks.find(b => b.id === id);
    if (!block?.audioData) return;

    const ctx = getAudioContext();
    const buffer = await decodeAudioToBuffer(block.audioData, ctx);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, isPlaying: true } : b));
    
    source.onended = () => {
      setBlocks(prev => prev.map(b => b.id === id ? { ...b, isPlaying: false } : b));
    };

    source.start();
    currentAudioSource.current = source;
  }, [blocks, stopAllPlayback]);

  const playAllSequentially = useCallback(async () => {
    if (isPlayingAll) {
      stopAllPlayback();
      return;
    }

    const playableBlocks = blocks.filter(b => b.audioData);
    if (playableBlocks.length === 0) return;

    setIsPlayingAll(true);
    const ctx = getAudioContext();

    for (const block of playableBlocks) {
      if (!block.audioData) continue;
      
      const buffer = await decodeAudioToBuffer(block.audioData, ctx);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      
      setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, isPlaying: true } : b));
      
      const playPromise = new Promise(resolve => {
        source.onended = () => {
          setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, isPlaying: false } : b));
          resolve(null);
        };
      });

      source.start();
      currentAudioSource.current = source;
      await playPromise;

      if (!currentAudioSource.current) break;
    }

    setIsPlayingAll(false);
  }, [blocks, isPlayingAll, stopAllPlayback]);

  const generateBlockAudio = useCallback(async (id: string) => {
    const block = blocks.find(b => b.id === id);
    if (!block || !block.text.trim()) return;

    setBlocks(prev => prev.map(b => b.id === id ? { ...b, isGenerating: true, error: undefined } : b));

    try {
      const pcmData = await generateTTS(block.text, settings);
      const blob = createWavBlob(pcmData);
      const url = URL.createObjectURL(blob);
      setBlocks(prev => prev.map(b => b.id === id ? { 
        ...b, 
        audioData: pcmData, 
        audioUrl: url, 
        isGenerating: false 
      } : b));
    } catch (error: any) {
      setBlocks(prev => prev.map(b => b.id === id ? { 
        ...b, 
        isGenerating: false, 
        error: error.message 
      } : b));
    }
  }, [blocks, settings]);

  const generateAll = useCallback(async () => {
    for (const block of blocks) {
      if (block.text.trim() && !block.audioData) {
        await generateBlockAudio(block.id);
      }
    }
  }, [blocks, generateBlockAudio]);

  const addBlock = useCallback((afterId?: string) => {
    const newBlock = { id: uuidv4(), text: '', isGenerating: false, isPlaying: false };
    if (!afterId) {
      setBlocks(prev => [...prev, newBlock]);
    } else {
      setBlocks(prev => {
        const index = prev.findIndex(b => b.id === afterId);
        const next = [...prev];
        next.splice(index + 1, 0, newBlock);
        return next;
      });
    }
  }, []);

  const removeBlock = useCallback((id: string) => {
    setBlocks(prev => prev.length > 1 ? prev.filter(b => b.id !== id) : prev);
  }, []);

  const updateBlockText = useCallback((id: string, text: string) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, text, audioData: undefined, audioUrl: undefined } : b));
  }, []);

  const clearAll = useCallback(() => {
    stopAllPlayback();
    setBlocks([{ id: uuidv4(), text: '', isGenerating: false, isPlaying: false }]);
  }, [stopAllPlayback]);

  const downloadZip = useCallback(async () => {
    const generated = blocks.filter(b => b.audioData);
    if (generated.length === 0) return;
    const blob = await generateZip(generated);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audios_tts.zip';
    a.click();
  }, [blocks]);

  const downloadSingleTrack = useCallback(() => {
    const generated = blocks.filter(b => b.audioData);
    if (generated.length === 0) return;
    const blob = concatenateToSingleWav(generated);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'faixa_completa.wav';
    a.click();
  }, [blocks]);

  const playPreview = useCallback(async () => {
    const previewText = "Olá, esta é uma prévia da minha voz.";
    setBlocks(prev => [...prev, { id: 'preview', text: previewText, isGenerating: true, isPlaying: false }]);
    try {
      const pcmData = await generateTTS(previewText, settings);
      const ctx = getAudioContext();
      const buffer = await decodeAudioToBuffer(pcmData, ctx);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
    } catch (e) {
      console.error(e);
    } finally {
      setBlocks(prev => prev.filter(b => b.id !== 'preview'));
    }
  }, [settings]);

  return (
    <div className="relative h-screen w-full flex flex-col overflow-hidden bg-black">
      {/* Background Elements */}
      <div className="fixed inset-0 bg-[length:400%_400%] animate-gradient-move bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 z-0"></div>
      
      {/* Header Section (Fixed Top) */}
      <header className="relative z-20 w-full glass-card border-b border-white/20 p-4 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col items-center gap-4">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-pink-100 to-white">
            Edson Automação Gerador de Áudio TTS
          </h1>
          <div className="flex flex-wrap justify-center gap-3 w-full max-w-4xl">
            <button onClick={generateAll} className="glass-btn flex-1 min-w-[150px] py-2 px-4 rounded-xl flex items-center justify-center gap-2 text-sm font-medium">
              <i className="fa-solid fa-wand-sparkles"></i>
              Gerar Todos
            </button>
            <button onClick={playAllSequentially} className="glass-btn flex-1 min-w-[150px] py-2 px-4 rounded-xl flex items-center justify-center gap-2 text-sm font-medium">
              <i className={`fa-solid ${isPlayingAll ? 'fa-stop' : 'fa-play'}`}></i>
              {isPlayingAll ? 'Interromper Reprodução' : 'Reproduzir Todos'}
            </button>
            <button onClick={downloadZip} className="glass-btn flex-1 min-w-[150px] py-2 px-4 rounded-xl flex items-center justify-center gap-2 text-sm font-medium">
              <i className="fa-solid fa-file-zipper"></i>
              Baixar Todos (.zip)
            </button>
            <button onClick={downloadSingleTrack} className="glass-btn flex-1 min-w-[150px] py-2 px-4 rounded-xl flex items-center justify-center gap-2 text-sm font-medium">
              <i className="fa-solid fa-file-audio"></i>
              Baixar Faixa Única (.wav)
            </button>
            <button onClick={clearAll} className="glass-btn flex-1 min-w-[150px] py-2 px-4 rounded-xl flex items-center justify-center gap-2 text-sm font-medium text-red-300">
              <i className="fa-solid fa-trash-can"></i>
              Limpar Tudo
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex flex-col md:flex-row flex-1 overflow-hidden h-full">
        
        {/* Left Column: Settings - Overflow auto com scroll visível */}
        <aside className="w-full md:w-[320px] lg:w-[400px] glass-card border-r border-white/20 p-6 overflow-y-auto shrink-0 md:h-full">
          <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 text-pink-300">
            <i className="fa-solid fa-sliders"></i>
            Configurações Globais
          </h2>
          
          <div className="space-y-6 pb-10">
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">Seletor de Voz</label>
              <div className="flex gap-2">
                <select 
                  value={settings.voice}
                  onChange={(e) => setSettings({...settings, voice: e.target.value})}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:border-pink-500/50 transition-colors"
                >
                  {VOICES.map(v => <option key={v} value={v} className="bg-slate-900">{v}</option>)}
                </select>
                <button onClick={playPreview} className="glass-btn p-2 rounded-xl text-pink-400 aspect-square flex items-center justify-center">
                  <i className="fa-solid fa-volume-high"></i>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">Ritmo / Velocidade ({settings.speed.toFixed(2)}x)</label>
              <div className="flex items-center gap-3">
                <button onClick={() => setSettings(s => ({...s, speed: Math.max(0.5, s.speed - 0.25)}))} className="glass-btn w-10 h-10 rounded-xl flex items-center justify-center">-</button>
                <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden relative">
                   <div className="absolute h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-300" style={{ width: `${((settings.speed - 0.5) / 2.5) * 100}%` }}></div>
                </div>
                <button onClick={() => setSettings(s => ({...s, speed: Math.min(3, s.speed + 0.25)}))} className="glass-btn w-10 h-10 rounded-xl flex items-center justify-center">+</button>
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">Expressividade / Temperatura</label>
              <input type="range" min="0" max="3" step="0.5" value={settings.temperature} onChange={(e) => setSettings({...settings, temperature: parseFloat(e.target.value)})} className="w-full accent-pink-500 cursor-pointer h-2 bg-white/10 rounded-full appearance-none" />
              <div className="flex justify-between mt-2">
                <span className="text-[10px] text-gray-500 italic">Mais Neutro</span>
                <span className="text-[10px] text-gray-500 italic">Mais Emocional</span>
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">Estilo / Instrução</label>
              <textarea value={settings.style} onChange={(e) => setSettings({...settings, style: e.target.value})} placeholder="Ex: Alegre, sério, sussurrando..." className="w-full h-20 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:border-pink-500/50 transition-colors resize-none" />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">Sotaque</label>
              <input type="text" value={settings.accent} onChange={(e) => setSettings({...settings, accent: e.target.value})} placeholder="Ex: Nordestino, Carioca, Português PT..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:border-pink-500/50 transition-colors" />
            </div>
          </div>
        </aside>

        {/* Right Column: Audio Blocks - Overflow auto com scroll visível */}
        <section className="flex-1 p-4 md:p-8 overflow-y-auto h-full space-y-6 pb-40">
          {blocks.map((block, index) => (
            <div key={block.id} className={`glass-card p-6 rounded-2xl border-t border-white/20 relative group transition-all duration-300 ${block.isGenerating ? 'animate-pulse' : ''}`}>
              <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex-1 space-y-4">
                   <div className="flex items-center justify-between">
                     <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-gray-400 font-medium">TRECHO #{index + 1}</span>
                     {block.error && <span className="text-[10px] text-red-400 font-medium"><i className="fa-solid fa-circle-exclamation mr-1"></i>{block.error}</span>}
                   </div>
                   <textarea value={block.text} onChange={(e) => updateBlockText(block.id, e.target.value)} placeholder="Digite o texto que será narrado aqui..." className="w-full h-24 bg-transparent border-none outline-none text-white text-base placeholder:text-white/20 resize-none font-light leading-relaxed" />
                  {block.audioUrl && (
                    <div className="flex flex-col sm:flex-row items-center gap-4 bg-white/5 p-3 rounded-xl border border-white/10 animate-fade-in">
                      <div className="flex items-center gap-3 flex-1 w-full">
                        <button onClick={() => playBlock(block.id)} className="w-10 h-10 rounded-full bg-pink-600 flex items-center justify-center text-white shadow-lg shadow-pink-500/20 hover:scale-110 transition-transform">
                          <i className={`fa-solid ${block.isPlaying ? 'fa-stop' : 'fa-play'}`}></i>
                        </button>
                        <div className="flex-1 flex items-center gap-1 h-6">
                              {[0.4, 0.7, 0.2, 0.9, 0.5, 0.3, 0.8, 0.4, 0.6, 0.3, 0.7].map((h, i) => (
                                <div key={i} className={`w-1 bg-pink-400 rounded-full transition-all duration-300 ${block.isPlaying ? 'animate-bounce' : 'h-[30%]'}`} style={{ height: block.isPlaying ? 'auto' : `${h*100}%`, animationDelay: `${i * 0.1}s` }}></div>
                              ))}
                        </div>
                      </div>
                      <a href={block.audioUrl} download={`audio_${index + 1}.wav`} className="glass-btn p-2 rounded-lg text-xs flex items-center gap-2">
                        <i className="fa-solid fa-download"></i> Baixar Faixa
                      </a>
                    </div>
                  )}
                </div>
                <div className="flex lg:flex-col gap-2 shrink-0 justify-center">
                  <button disabled={block.isGenerating || !block.text.trim()} onClick={() => generateBlockAudio(block.id)} className="glass-btn px-4 py-2 rounded-xl text-xs font-medium flex-1 lg:flex-none flex items-center justify-center gap-2 text-pink-300 min-w-[120px]">
                    <i className={block.isGenerating ? "fa-solid fa-spinner animate-spin" : "fa-solid fa-microphone-lines"}></i>
                    {block.isGenerating ? 'Gerando...' : 'Gerar Áudio'}
                  </button>
                  <button onClick={() => addBlock(block.id)} className="glass-btn px-4 py-2 rounded-xl text-xs font-medium flex-1 lg:flex-none flex items-center justify-center gap-2">
                    <i className="fa-solid fa-plus"></i> Inserir Abaixo
                  </button>
                  <button onClick={() => removeBlock(block.id)} className="glass-btn px-4 py-2 rounded-xl text-xs font-medium flex-1 lg:flex-none flex items-center justify-center gap-2 text-red-400/80 hover:text-red-400">
                    <i className="fa-solid fa-xmark"></i> Excluir Bloco
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button onClick={() => addBlock()} className="w-full py-4 rounded-2xl border-2 border-dashed border-white/10 text-white/40 hover:text-white/80 hover:border-pink-500/30 hover:bg-white/5 transition-all flex items-center justify-center gap-3 group">
            <i className="fa-solid fa-plus-circle text-xl group-hover:scale-125 transition-transform"></i>
            <span className="font-medium tracking-wide">Inserir Novo Bloco ao Final</span>
          </button>
        </section>
      </main>

      {/* Footer / Status Bar */}
      <footer className="relative z-20 glass-card p-3 border-t border-white/10 flex justify-center items-center gap-4 text-[10px] text-white/40 uppercase tracking-[2px]">
          <span>Feito Por Edson Automação</span>
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
          <span>API Gemini 2.5 Flash Ativa</span>
      </footer>
    </div>
  );
}
