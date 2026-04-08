import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { ICONS, LANGUAGES } from '../constants';
import { analyzeVoiceHealthSymptoms } from '../services/geminiService';
import { VoiceAIResponse } from '../types';

const VoiceHealthAI: React.FC = () => {
    const { language, navigateTo } = useAppContext();
    
    // States
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState<VoiceAIResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [speechSupported, setSpeechSupported] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);

    // Refs for safe async state handling inside closures
    const transcriptRef = useRef('');
    const hasErrorRef = useRef(false);

    // Refs for API objects
    const recognitionRef = useRef<any>(null);
    const synthRef = useRef<SpeechSynthesis | null>(window.speechSynthesis);

    useEffect(() => {
        // Initialize Speech Recognition
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
            setSpeechSupported(false);
            return;
        }

        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;

        // Web Speech API allows empty lang string to use the browser's default but also gracefully captures multilingual text in Chrome. 
        // We'll set it to the user's selected language as a hint, but the LLM will ultimately map the detected Hinglish/dialect
        const langCodeMap: { [key: string]: string } = {
            'English': 'en-IN',
            'Hindi': 'hi-IN',
            'Kannada': 'kn-IN',
            'Tamil': 'ta-IN',
            'Telugu': 'te-IN',
            'Malayalam': 'ml-IN',
            'Marathi': 'mr-IN',
            'Bengali': 'bn-IN',
            'Gujarati': 'gu-IN',
            'Punjabi': 'pa-IN'
        };

        recognitionRef.current.lang = langCodeMap[language] || 'en-IN';

        recognitionRef.current.onstart = () => {
            hasErrorRef.current = false;
        };

        recognitionRef.current.onresult = (event: any) => {
            let currentTranscript = '';
            for (let i = 0; i < event.results.length; i++) {
                currentTranscript += event.results[i][0].transcript;
            }
            setTranscript(currentTranscript);
            transcriptRef.current = currentTranscript;
        };

        recognitionRef.current.onerror = (event: any) => {
            hasErrorRef.current = true;
            console.error("Speech recognition error", event.error);
            setError(`Microphone error: ${event.error}. Please try again.`);
            setIsRecording(false);
        };

        recognitionRef.current.onend = () => {
             setIsRecording(false);
             if (hasErrorRef.current) return;
             
             const finalTranscript = transcriptRef.current.trim();
             if (finalTranscript.length > 0) {
                 processVoiceData(finalTranscript);
             } else {
                 setError("Could not hear clearly. Please speak again.");
             }
        };

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            if (synthRef.current) {
                synthRef.current.cancel();
            }
        };
    }, [language]);

    const toggleRecording = () => {
        if (!recognitionRef.current) return;

        if (isRecording) {
            recognitionRef.current.stop(); // triggers onend which handles processing
        } else {
            setTranscript('');
            transcriptRef.current = '';
            hasErrorRef.current = false;
            setResult(null);
            setError(null);
            if (synthRef.current) synthRef.current.cancel(); // Stop playing any old results
            
            try {
                recognitionRef.current.start();
                setIsRecording(true);
            } catch (e) {
                console.error(e);
            }
        }
    };

    const processVoiceData = async (text: string) => {
        setIsProcessing(true);
        setError(null);
        try {
            const aiResponse = await analyzeVoiceHealthSymptoms(text, language);
            setResult(aiResponse);
        } catch (err: any) {
             console.error("LLM Error:", err);
             setError("Unable to analyze. Please try again.");
        } finally {
             setIsProcessing(false);
        }
    };

    const toggleSpeakResponse = () => {
        if (!synthRef.current || !result) return;

        if (isPlaying) {
            synthRef.current.cancel();
            setIsPlaying(false);
            return;
        }

        synthRef.current.cancel();

        let textToSpeak = '';
        if (result.isEmergency) {
            textToSpeak = result.advice.join(". ");
        } else {
            const conds = result.conditions.map(c => c.name).join(' or ');
            const meds = result.medicines.join(', ');
            const adv = result.advice.join('. ');
            textToSpeak = `Based on your symptoms, it could be ${conds}. You may consider safe medicines like ${meds}. ${adv}. ${result.disclaimer}`;
        }

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        
        // Fallback to the user's selected language if the LLM couldn't detect a specific one
        const langCodeMap: { [key: string]: string } = {
            'English': 'en-IN', 'Hindi': 'hi-IN', 'Kannada': 'kn-IN', 'Tamil': 'ta-IN', 'Telugu': 'te-IN',
            'Marathi': 'mr-IN', 'Bengali': 'bn-IN', 'Gujarati': 'gu-IN', 'Punjabi': 'pa-IN', 'Malayalam': 'ml-IN'
        };
        const activeLangCode = result.detectedLanguage || langCodeMap[language] || 'en-IN';
        
        utterance.lang = activeLangCode;
        
        // Try to find native voice
        const voices = synthRef.current.getVoices();
        const bestVoice = voices.find(v => v.lang === activeLangCode) || voices.find(v => v.lang.startsWith(activeLangCode.split('-')[0]));
        if (bestVoice) {
            utterance.voice = bestVoice;
        }

        utterance.onend = () => setIsPlaying(false);
        utterance.onerror = () => setIsPlaying(false);

        synthRef.current.speak(utterance);
        setIsPlaying(true);
    };

    if (!speechSupported) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-white/5 rounded-3xl border border-red-500/30">
                <div className="text-red-400 mb-4">{ICONS.warning}</div>
                <h2 className="text-2xl font-bold text-white mb-2">Browser Not Supported</h2>
                <p className="text-gray-400">Your browser does not support Voice Recognition. Please try using Google Chrome or Edge.</p>
                <button onClick={() => navigateTo('DASHBOARD')} className="mt-6 px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition">Go Back</button>
            </div>
        );
    }

    return (
        <div className="relative min-h-[80vh] flex flex-col items-center justify-center p-4">
            {/* Ambient Background Glow based on State */}
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vh] h-[60vh] rounded-full blur-[100px] transition-all duration-1000 ${
                    result?.isEmergency ? 'bg-red-600/30 animate-pulse' :
                    isRecording ? 'bg-emerald-500/20' : 
                    isProcessing ? 'bg-blue-500/20 animate-pulse' : 
                    'bg-white/5'
                }`}></div>
            </div>

            <div className="relative z-10 w-full max-w-2xl flex flex-col items-center">
                
                <div className="text-center mb-10">
                    <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-200">
                        Voice Health AI
                    </h2>
                    <p className="text-gray-300 font-medium tracking-wide">
                        {language === 'English' ? 'Describe your symptoms naturally, and we will guide you.' : `Speaking in ${language}`}
                    </p>
                </div>

                {/* Main Mic Button */}
                <div className="relative flex items-center justify-center mb-8">
                    {/* Ripple Rings */}
                    {isRecording && (
                        <>
                            <div className="absolute w-40 h-40 bg-emerald-500/30 rounded-full animate-ping" style={{ animationDuration: '2s' }}></div>
                            <div className="absolute w-56 h-56 bg-teal-500/20 rounded-full animate-ping" style={{ animationDuration: '3s', animationDelay: '0.5s' }}></div>
                        </>
                    )}

                    <button 
                        onClick={toggleRecording}
                        disabled={isProcessing}
                        className={`relative z-10 w-28 h-28 flex items-center justify-center rounded-full shadow-2xl transition-all duration-500 transform ${
                            isRecording 
                                ? 'bg-gradient-to-br from-red-500 to-rose-600 scale-110 shadow-[0_0_40px_rgba(225,29,72,0.6)]' 
                                : isProcessing 
                                    ? 'bg-gray-700 cursor-wait'
                                    : 'bg-gradient-to-br from-emerald-400 to-teal-600 hover:scale-105 shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:shadow-[0_0_50px_rgba(16,185,129,0.5)]'
                        }`}
                    >
                        {isProcessing ? (
                            <svg className="animate-spin w-10 h-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : isRecording ? (
                            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" ry="1"></rect><rect x="14" y="4" width="4" height="16" rx="1" ry="1"></rect></svg>
                        ) : (
                            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                        )}
                    </button>
                </div>

                {/* Status / Transcript Box */}
                <div className="w-full h-24 mb-6 flex flex-col items-center justify-center text-center">
                    {isProcessing ? (
                        <p className="text-teal-300 font-medium animate-pulse text-lg">Analyzing symptoms...</p>
                    ) : transcript ? (
                        <p className="text-xl text-white font-serif italic max-w-lg leading-relaxed drop-shadow-sm">"{transcript}"</p>
                    ) : error ? (
                        <p className="text-red-400 font-medium">{error}</p>
                    ) : (
                        <p className="text-gray-500 font-medium">Tap the microphone to start speaking</p>
                    )}
                </div>

                {/* Results Section */}
                {result && (
                    <div className="w-full max-w-3xl animate-fade-in-up mt-4">
                        {result.isEmergency ? (
                            <div className="bg-red-900/40 backdrop-blur-xl border border-red-500/50 rounded-3xl p-8 text-center shadow-[0_0_50px_rgba(220,38,38,0.3)]">
                                <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500 animate-pulse">
                                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                </div>
                                <h3 className="text-3xl font-black text-white mb-4">Immediate Attention Required</h3>
                                <p className="text-xl text-red-100 mb-6">{result.advice.join(' ')}</p>
                                <button className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white rounded-full font-bold uppercase tracking-wider transition-all hover:scale-105 active:scale-95 shadow-lg">Call Emergency Services</button>
                                
                                <button 
                                    onClick={toggleSpeakResponse}
                                    className={`mt-6 mx-auto px-6 py-2 rounded-full flex items-center gap-2 transition-colors border ${isPlaying ? 'bg-red-500/20 border-red-500/50 text-red-200' : 'bg-white/10 border-white/20 text-white hover:bg-white/20'}`}
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5 10v4a2 2 0 002 2h2l4 4V4L9 8H7a2 2 0 00-2 2z"></path></svg>
                                    {isPlaying ? 'Stop Playing' : 'Listen to Advice'}
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
                                
                                {/* Play TTS Button positioned at the top right of the grid */}
                                <div className="md:col-span-2 flex justify-end">
                                    <button 
                                        onClick={toggleSpeakResponse}
                                        className={`px-4 py-2 rounded-full flex items-center gap-2 transition-colors border text-sm font-medium shadow-lg ${isPlaying ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'bg-white/10 border-white/20 text-gray-300 hover:bg-white/20 hover:text-white'}`}
                                    >
                                        <svg className={`${isPlaying ? 'animate-pulse' : ''} w-4 h-4`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5 10v4a2 2 0 002 2h2l4 4V4L9 8H7a2 2 0 00-2 2z"></path></svg>
                                        {isPlaying ? 'Stop Audio' : 'Play Audio'}
                                    </button>
                                </div>

                                {/* Conditions Card */}
                                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 hover:bg-white/10 transition-colors">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">{ICONS.report}</div>
                                        <h4 className="text-lg font-bold text-white">Possible Conditions</h4>
                                    </div>
                                    <ul className="space-y-3">
                                        {result.conditions.map((c, i) => (
                                            <li key={i} className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-white/5">
                                                <span className="text-gray-200 font-medium">{c.name}</span>
                                                <span className={`text-xs px-2 py-1 rounded-full font-bold uppercase tracking-wider ${
                                                    c.likelihood === 'High' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 
                                                    c.likelihood === 'Medium' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 
                                                    'bg-green-500/20 text-green-400 border border-green-500/30'
                                                }`}>{c.likelihood}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {/* OTC Medicines Card */}
                                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 hover:bg-white/10 transition-colors">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">{ICONS.diet}</div>
                                        <h4 className="text-lg font-bold text-white">Suggested Safe Remedies</h4>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {result.medicines.map((med, i) => (
                                            <span key={i} className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-full font-medium text-sm">
                                                {med}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Advice & Disclaimer */}
                                <div className="col-span-1 md:col-span-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
                                    <h4 className="text-lg font-bold text-white mb-3">Advice & Care</h4>
                                    <ul className="list-disc list-inside space-y-2 mb-6 text-gray-300">
                                        {result.advice.map((adv, i) => <li key={i}>{adv}</li>)}
                                    </ul>
                                    
                                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex gap-4 items-start">
                                        <div className="text-yellow-500 mt-0.5">{ICONS.warning}</div>
                                        <p className="text-sm text-yellow-200/80 font-medium">
                                            {result.disclaimer}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
            
            {/* Background audio waves visual flair */}
            {!result && !isProcessing && (
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-end gap-1 opacity-20 pointer-events-none">
                    {[1,2,3,4,5,6,7,8,9,10].map(i => (
                        <div key={i} className="w-1 bg-white rounded-full animate-wave" style={{
                            height: isRecording ? `${20 + Math.random() * 40}px` : '4px',
                            animationDelay: `${i * 0.1}s`,
                            animationDuration: isRecording ? '0.5s' : '1s'
                        }}></div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default VoiceHealthAI;
