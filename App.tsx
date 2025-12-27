
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
  const [isKeyConfigured, setIsKeyConfigured] = useState<boolean | null>(null);
  
  const currentAudioSource = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const checkKey = async () => {
      // @ts-ignore
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setIsKeyConfigured(hasKey);
      } else {
        setIsKeyConfigured(!!process.env.API_KEY);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    try {
      // @ts-ignore
      if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
        await window.aistudio.openSelectKey();
        // Após abrir o seletor, assumimos que o usuário procederá.
        // O SDK injetará a chave no process.env.API_KEY automaticamente.
        setIsKeyConfigured(true);
      }
    } catch (err) {
      console.error("Erro ao selecionar chave:", err);
    }
  };

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
      const errorMessage = error.message || "";
      console.error("Erro na geração:", error);

      if (errorMessage.includes("API Key") || errorMessage.includes("not found") || errorMessage.includes("403")) {
        setIsKeyConfigured(false);
        setBlocks(prev => prev.map(b => b.id === id ? { 
          ...b, 
          isGenerating: false, 
          error: "Erro de Autenticação: Clique em 'TROCAR CHAVE' no topo." 
        } : b));
      } else {
        setBlocks(prev => prev.map(b => b.id === id ? { 
          ...b, 
          isGenerating: false, 
          error: "Ocorreu um erro. Verifique sua chave e saldo no Google Cloud." 
        } : b));
      }
    }
  }, [blocks, settings]);

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
    source.onended = () => setBlocks(prev => prev.map(b => b.id === id ? { ...b, isPlaying: false } : b));
    source.start();
    currentAudioSource.current = source;
  }, [blocks, stopAllPlayback]);

  const generateAll = useCallback(async () => {
    for (const block of blocks) {
      if (block.text.trim() && !block.audioData) {
        await generateBlockAudio(block.id);
      }
    }
  }, [blocks, generateBlockAudio]);

  const addBlock = useCallback((afterId?: string) => {
    const newBlock = { id: uuidv4(), text: '', isGenerating: false, isPlaying: false };
    if (!afterId) setBlocks(prev => [...prev, newBlock]);
    else setBlocks(prev => {
      const index = prev.findIndex(b => b.id === afterId);
      const next = [...prev];
      next.splice(index + 1, 0, newBlock);
      return next;
    });
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
    a.download = 'audios_edson_automacao.zip';
    a.click();
  }, [blocks]);

  const downloadSingleTrack = useCallback(() => {
    const generated = blocks.filter(b => b.audioData);
    if (generated.length === 0) return;
    const blob = concatenateToSingleWav(generated);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'faixa_completa_edson.wav';
    a.click();
  }, [blocks]);

  const playPreview = useCallback(async () => {
    const previewText = "Olá, esta é uma prévia da voz selecionada.";
    try {
      const pcmData = await generateTTS(previewText, settings);
      const ctx = getAudioContext();
      const buffer = await decodeAudioToBuffer(pcmData, ctx);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
    } catch (e) {
      setIsKeyConfigured(false);
    }
  }, [settings]);

  if (isKeyConfigured === false) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black overflow-y-auto py-10">
        <div className="absolute inset-0 bg-[length:400%_400%] animate-gradient-move bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 opacity-50"></div>
        <div className="relative glass-card max-w-2xl w-full p-8 md:p-12 rounded-[2.5rem] border-2 border-pink-500/40 shadow-2xl animate-fade-in mx-4">
          <div className="flex flex-col md:flex-row gap-8 items-center">
            <div className="w-full md:w-1/3 text-center">
              <div className="w-24 h-24 bg-gradient-to-tr from-pink-600 to-purple-600 rounded-3xl flex items-center justify-center mx-auto mb-6 rotate-12 shadow-2xl">
                <i className="fa-solid fa-key text-4xl text-white -rotate-12"></i>
              </div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Acesso<br/><span className="text-pink-400">Premium</span></h2>
            </div>
            
            <div className="flex-1 space-y-6">
              <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                <h3 className="text-pink-400 font-bold text-sm uppercase tracking-widest mb-4">Como Ativar:</h3>
                <ul className="space-y-4 text-xs text-gray-300">
                  <li className="flex gap-3"><span className="w-5 h-5 bg-pink-500 rounded-full flex shrink-0 items-center justify-center text-white font-bold">1</span> <span>Tenha uma chave no <b>Google AI Studio</b> com faturamento ativo.</span></li>
                  <li className="flex gap-3"><span className="w-5 h-5 bg-pink-500 rounded-full flex shrink-0 items-center justify-center text-white font-bold">2</span> <span>Clique no botão abaixo para abrir o seletor oficial do Google.</span></li>
                  <li className="flex gap-3"><span className="w-5 h-5 bg-pink-500 rounded-full flex shrink-0 items-center justify-center text-white font-bold">3</span> <span>Escolha sua chave na lista e o app será liberado na hora.</span></li>
                </ul>
              </div>

              <button 
                onClick={handleSelectKey}
                className="w-full bg-white text-black hover:bg-pink-100 py-5 rounded-2xl font-black text-lg transition-all active:scale-95 shadow-xl uppercase tracking-tighter"
              >
                Configurar Chave API Agora
              </button>

              <div className="flex justify-between items-center text-[10px] text-white/30 uppercase tracking-widest">
                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="hover:text-pink-400 underline decoration-pink-500/50">Tutorial de Faturamento</a>
                <span>Edson Automação © 2024</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full flex flex-col overflow-hidden bg-black">
      <div className="fixed inset-0 bg-[length:400%_400%] animate-gradient-move bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 z-0"></div>
      
      <header className="relative z-20 w-full glass-card border-b border-white/20 p-4 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col items-center gap-4">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2 md:w-48">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-[10px] text-green-400 font-bold tracking-tighter uppercase">Motor TTS Ativo</span>
            </div>
            <h1 className="text-xl md:text-2xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white via-pink-200 to-white uppercase">
              Edson Automação <span className="font-light text-pink-400">TTS</span>
            </h1>
            <div className="md:w-48 flex justify-end">
              <button 
                onClick={handleSelectKey}
                className="text-[9px] px-4 py-2 rounded-full bg-pink-500/10 border border-pink-500/30 hover:bg-pink-500/20 text-pink-300 font-bold transition-all flex items-center gap-2 uppercase tracking-tighter"
              >
                <i className="fa-solid fa-key"></i> Trocar Chave API
              </button>
            </div>
          </div>
          
          <div className="flex flex-wrap justify-center gap-2 w-full max-w-5xl">
            <button onClick={generateAll} className="glass-btn flex-1 min-w-[120px] py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider">
              <i className="fa-solid fa-wand-sparkles text-pink-400"></i> Gerar Tudo
            </button>
            <button onClick={downloadZip} className="glass-btn flex-1 min-w-[120px] py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-pink-300">
              <i className="fa-solid fa-file-zipper"></i> ZIP
            </button>
            <button onClick={downloadSingleTrack} className="glass-btn flex-1 min-w-[120px] py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-pink-300">
              <i className="fa-solid fa-music"></i> Faixa Única
            </button>
            <button onClick={clearAll} className="glass-btn flex-1 min-w-[120px] py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-red-400/80">
              <i className="fa-solid fa-trash-can"></i> Limpar
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex flex-col md:flex-row flex-1 overflow-hidden h-full">
        <aside className="w-full md:w-[320px] lg:w-[380px] glass-card border-r border-white/20 p-6 overflow-y-auto shrink-0 md:h-full">
          <h2 className="text-sm font-black mb-6 flex items-center gap-2 text-white/60 uppercase tracking-widest">
            <i className="fa-solid fa-sliders text-pink-500"></i> Parâmetros de Voz
          </h2>
          
          <div className="space-y-6 pb-20">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Voz Premium</label>
              <div className="flex gap-2">
                <select value={settings.voice} onChange={(e) => setSettings({...settings, voice: e.target.value})} className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-pink-500/50 appearance-none text-white">
                  {VOICES.map(v => <option key={v} value={v} className="bg-slate-950">{v}</option>)}
                </select>
                <button onClick={playPreview} className="glass-btn w-12 rounded-xl text-pink-400 flex items-center justify-center shadow-lg"><i className="fa-solid fa-play text-xs"></i></button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Ritmo</label>
                <span className="text-xs font-mono text-pink-400">{settings.speed.toFixed(2)}x</span>
              </div>
              <input type="range" min="0.5" max="2.5" step="0.1" value={settings.speed} onChange={(e) => setSettings({...settings, speed: parseFloat(e.target.value)})} className="w-full accent-pink-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer" />
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Emoção</label>
                <span className="text-[9px] text-white/40">{(settings.temperature * 100).toFixed(0)}%</span>
              </div>
              <input type="range" min="0" max="3" step="0.5" value={settings.temperature} onChange={(e) => setSettings({...settings, temperature: parseFloat(e.target.value)})} className="w-full accent-purple-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer" />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Estilo do Locutor</label>
              <textarea value={settings.style} onChange={(e) => setSettings({...settings, style: e.target.value})} placeholder="Ex: Entusiasmado, calmo, misterioso..." className="w-full h-24 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-pink-500/50 resize-none placeholder:text-white/10 text-white" />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Sotaque</label>
              <input type="text" value={settings.accent} onChange={(e) => setSettings({...settings, accent: e.target.value})} placeholder="Ex: Brasil, Portugal, Angola..." className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-pink-500/50 placeholder:text-white/10 text-white" />
            </div>
          </div>
        </aside>

        <section className="flex-1 p-4 md:p-8 overflow-y-auto h-full space-y-6 pb-40">
          {blocks.map((block, index) => (
            <div key={block.id} className={`glass-card p-6 rounded-[2.5rem] border-t border-white/20 transition-all duration-500 ${block.isGenerating ? 'ring-2 ring-pink-500/50' : ''}`}>
              <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex-1 space-y-4">
                   <div className="flex items-center justify-between">
                     <span className="text-[9px] bg-white/5 border border-white/10 px-3 py-1 rounded-full text-white/40 font-black tracking-widest uppercase">Trecho #{String(index + 1).padStart(2, '0')}</span>
                     {block.error && <span className="text-[9px] text-red-400 font-bold bg-red-500/10 px-3 py-1 rounded-full uppercase"><i className="fa-solid fa-triangle-exclamation mr-1"></i>{block.error}</span>}
                   </div>
                   <textarea value={block.text} onChange={(e) => updateBlockText(block.id, e.target.value)} placeholder="Digite o texto aqui..." className="w-full h-28 bg-transparent border-none outline-none text-white text-lg placeholder:text-white/5 resize-none font-medium leading-relaxed" />
                  
                  {block.audioUrl && (
                    <div className="flex flex-col sm:flex-row items-center gap-4 bg-black/40 p-4 rounded-2xl border border-white/5">
                      <button onClick={() => playBlock(block.id)} className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-600 to-purple-700 flex items-center justify-center text-white shadow-xl hover:scale-105 active:scale-95 transition-all">
                        <i className={`fa-solid ${block.isPlaying ? 'fa-square' : 'fa-play'} text-sm`}></i>
                      </button>
                      <div className="flex-1 h-8 flex items-end gap-1 px-2">
                        {[0.3, 0.6, 0.2, 0.8, 0.4, 0.9, 0.5, 0.7, 0.3, 0.6, 0.4].map((h, i) => (
                          <div key={i} className={`flex-1 bg-gradient-to-t from-pink-500 to-purple-400 rounded-full transition-all duration-300 ${block.isPlaying ? 'animate-pulse' : 'h-[20%]'}`} style={{ height: block.isPlaying ? `${h * 100}%` : '20%', animationDelay: `${i * 0.05}s` }}></div>
                        ))}
                      </div>
                      <a href={block.audioUrl} download={`audio_edson_${index + 1}.wav`} className="text-[10px] font-black uppercase tracking-widest text-pink-400 hover:text-white transition-colors">
                        <i className="fa-solid fa-download mr-1"></i> Download WAV
                      </a>
                    </div>
                  )}
                </div>
                
                <div className="flex lg:flex-col gap-2 shrink-0 justify-center">
                  <button disabled={block.isGenerating || !block.text.trim()} onClick={() => generateBlockAudio(block.id)} className="glass-btn px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-pink-400 hover:text-white disabled:opacity-30 transition-all flex items-center justify-center gap-2 min-w-[120px]">
                    {block.isGenerating ? <i className="fa-solid fa-circle-notch animate-spin"></i> : <i className="fa-solid fa-microphone-lines"></i>}
                    {block.isGenerating ? 'Processando' : 'Gerar Áudio'}
                  </button>
                  <button onClick={() => addBlock(block.id)} className="glass-btn px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all flex items-center justify-center gap-2">
                    <i className="fa-solid fa-plus"></i> Inserir Abaixo
                  </button>
                  <button onClick={() => removeBlock(block.id)} className="glass-btn px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-red-500/40 hover:text-red-500 hover:bg-red-500/10 transition-all flex items-center justify-center gap-2">
                    <i className="fa-solid fa-trash-can"></i>
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button onClick={() => addBlock()} className="w-full py-10 rounded-[3rem] border-2 border-dashed border-white/5 text-white/10 hover:text-pink-500/40 hover:border-pink-500/20 hover:bg-pink-500/5 transition-all flex flex-col items-center justify-center gap-3 group">
            <i className="fa-solid fa-plus-circle text-5xl group-hover:scale-110 transition-transform"></i>
            <span className="text-[10px] font-black uppercase tracking-[0.4em]">Adicionar Novo Bloco de Áudio</span>
          </button>
        </section>
      </main>

      <footer className="relative z-20 glass-card p-3 border-t border-white/5 flex justify-center items-center gap-6 text-[9px] text-white/20 uppercase font-black tracking-[0.5em]">
          <span>EDSON AUTOMAÇÃO PREMIUM</span>
          <div className="w-1 h-1 rounded-full bg-pink-500/50"></div>
          <span>GEMINI 2.5 FLASH ENGINE</span>
      </footer>
    </div>
  );
}
