import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { analyzeDrugImpact } from '../services/geminiService';
import { DrugAnalysisResult, DrugOrganEffect } from '../types';
import { ICONS } from '../constants';
import DrugHeatmap3D from '../components/DrugHeatmap3D';
import DrugOrganPanel from '../components/DrugOrganPanel';

// ─── Heatmap color legend ──────────────────────────────────────────────────────
const HeatmapLegend: React.FC = () => (
    <div className="flex items-center gap-3 px-4 py-2 bg-black/30 rounded-xl border border-white/10 backdrop-blur-md">
        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Intensity</span>
        <div className="flex items-center h-3 flex-1 rounded-full overflow-hidden">
            <div className="h-full w-full" style={{
                background: 'linear-gradient(to right, #3b82f6, #06b6d4, #22c55e, #eab308, #f97316, #ef4444)'
            }} />
        </div>
        <div className="flex gap-3 text-[10px] font-semibold">
            <span className="text-blue-400">Low</span>
            <span className="text-yellow-400">Mod</span>
            <span className="text-red-400">High</span>
        </div>
    </div>
);

// ─── Quick drug presets ─────────────────────────────────────────────────────────
const DRUG_PRESETS = [
    { name: 'Ibuprofen', icon: '💊' },
    { name: 'Metformin', icon: '🩸' },
    { name: 'Aspirin', icon: '❤️' },
    { name: 'Paracetamol', icon: '🌡️' },
    { name: 'Alcohol', icon: '🍺' },
    { name: 'Caffeine', icon: '☕' },
];

const ROUTES = ['Oral', 'Intravenous (IV)', 'Intramuscular (IM)', 'Topical', 'Inhalation', 'Sublingual'];

// ─── Main component ─────────────────────────────────────────────────────────────
const DrugImpactVisualizer: React.FC = () => {
    const { navigateTo } = useAppContext();

    // Inputs
    const [drugName, setDrugName] = useState('');
    const [dosage, setDosage] = useState(400);      // mg
    const [route, setRoute] = useState('Oral');
    const [age, setAge] = useState<number | ''>('');
    const [weight, setWeight] = useState<number | ''>('');

    // State
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<DrugAnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedOrgan, setSelectedOrgan] = useState<string | null>(null);

    // Comparison mode
    const [compareMode, setCompareMode] = useState(false);
    const [drugName2, setDrugName2] = useState('');
    const [result2, setResult2] = useState<DrugAnalysisResult | null>(null);
    const [isLoading2, setIsLoading2] = useState(false);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ─── Derive DrugOrganEffect[] from primary/secondary organs ─────────────
    // DrugAnalysisResult has no 'effects' array — build it from primary/secondary_organs
    const uniqueEffects = useMemo((): DrugOrganEffect[] => {
        if (!result) return [];
        const seen = new Set<string>();
        const all: DrugOrganEffect[] = [
            ...(result.primary_organs ?? []).map(organ => ({
                organ,
                intensity: 0.85,
                effect: result.mechanism ?? 'Primary target organ',
                type: 'stimulation' as const,
            })),
            ...(result.secondary_organs ?? []).map(organ => ({
                organ,
                intensity: 0.35,
                effect: 'Secondary involvement',
                type: 'side-effect' as const,
            })),
        ];
        return all.filter(e => { if (seen.has(e.organ)) return false; seen.add(e.organ); return true; });
    }, [result]);

    const uniqueEffects2 = useMemo((): DrugOrganEffect[] => {
        if (!result2) return [];
        const seen = new Set<string>();
        const all: DrugOrganEffect[] = [
            ...(result2.primary_organs ?? []).map(organ => ({
                organ,
                intensity: 0.85,
                effect: result2.mechanism ?? 'Primary target organ',
                type: 'stimulation' as const,
            })),
            ...(result2.secondary_organs ?? []).map(organ => ({
                organ,
                intensity: 0.35,
                effect: 'Secondary involvement',
                type: 'side-effect' as const,
            })),
        ];
        return all.filter(e => { if (seen.has(e.organ)) return false; seen.add(e.organ); return true; });
    }, [result2]);

    // ─── Analysis ─────────────────────────────────────────────────────────────
    const handleAnalyze = useCallback(async (nameOverride?: string, isSecond = false) => {
        const name = nameOverride ?? (isSecond ? drugName2 : drugName);
        if (!name.trim()) return;

        if (isSecond) { setIsLoading2(true); setResult2(null); }
        else { setIsLoading(true); setResult(null); setError(null); setSelectedOrgan(null); }

        try {
            const data = await analyzeDrugImpact(
                name,
                `${dosage}mg`,
                age || undefined,
                route,
                weight || undefined
            );
            if (isSecond) setResult2(data);
            else setResult(data);
        } catch (err) {
            console.error('Drug analysis failed:', err);
            if (!isSecond) setError('Analysis failed. Please check your network and try again.');
        } finally {
            if (isSecond) setIsLoading2(false);
            else setIsLoading(false);
        }
    }, [drugName, drugName2, dosage, age, route, weight]);

    // Dosage slider re-triggers analysis with debounce
    const handleDosageChange = (v: number) => {
        setDosage(v);
        if (!result) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => handleAnalyze(), 800);
    };

    return (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black text-white font-sans overflow-hidden">
            {/* Background */}
            <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))]
                from-slate-900 via-gray-950 to-black">
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
                <div className="absolute top-0 left-0 w-96 h-96 bg-rose-600/10 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2" />
                <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px] translate-x-1/2 -translate-y-1/2" />
            </div>

            <div className="relative z-10 flex flex-col h-full">
                {/* ── Top Bar ──────────────────────────────────────────────── */}
                <div className="flex-shrink-0 flex items-center justify-between px-6 py-4
                    border-b border-white/10 bg-black/20 backdrop-blur-xl">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigateTo('DASHBOARD')}
                            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10
                                transition-all group">
                            <span className="group-hover:-translate-x-1 block transition-transform text-white">
                                {ICONS.arrowLeft}
                            </span>
                        </button>
                        <div>
                            <h1 className="text-2xl font-black tracking-tight">
                                Drug{' '}
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-purple-400">
                                    Impact Visualizer
                                </span>
                            </h1>
                            <p className="text-xs text-blue-100/50">AI-powered 3D pharmacological heatmap</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <HeatmapLegend />
                        <button
                            onClick={() => { setCompareMode(v => !v); setResult2(null); setDrugName2(''); }}
                            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all
                                ${compareMode
                                    ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                                    : 'bg-white/5 border-white/10 text-white/60 hover:text-white'}`}>
                            {compareMode ? '✕ Exit Compare' : '⚖ Compare Drugs'}
                        </button>
                    </div>
                </div>

                {/* ── Main 3-Column Layout ─────────────────────────────────── */}
                <div className="flex flex-1 overflow-hidden">

                    {/* LEFT PANEL — Inputs */}
                    <div className="w-72 flex-shrink-0 flex flex-col border-r border-white/10
                        bg-black/20 backdrop-blur-sm overflow-y-auto">
                        <div className="p-5 space-y-5">

                            {/* Drug name */}
                            <div>
                                <label className="block text-[10px] font-bold text-blue-200/50 uppercase tracking-widest mb-2">
                                    Drug Name
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={drugName}
                                        onChange={e => setDrugName(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                                        placeholder="e.g. Ibuprofen"
                                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3
                                            text-white focus:outline-none focus:ring-2 focus:ring-rose-500/50
                                            placeholder:text-white/20 transition-all text-sm"
                                    />
                                </div>
                            </div>

                            {/* Quick presets */}
                            <div>
                                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">Quick Select</p>
                                <div className="grid grid-cols-3 gap-1.5">
                                    {DRUG_PRESETS.map(p => (
                                        <button
                                            key={p.name}
                                            onClick={() => { setDrugName(p.name); }}
                                            className={`flex flex-col items-center py-2 px-1 rounded-xl text-[10px] font-bold
                                                border transition-all hover:scale-105 active:scale-95
                                                ${drugName === p.name
                                                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                                                    : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white'}`}>
                                            <span className="text-base mb-0.5">{p.icon}</span>
                                            {p.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Dosage slider */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-[10px] font-bold text-blue-200/50 uppercase tracking-widest">
                                        Dosage
                                    </label>
                                    <span className="text-sm font-black text-white">{dosage} mg</span>
                                </div>
                                <input
                                    type="range" min={1} max={2000} step={1}
                                    value={dosage}
                                    onChange={e => handleDosageChange(Number(e.target.value))}
                                    className="w-full accent-rose-500 cursor-pointer"
                                />
                                <div className="flex justify-between text-[10px] text-white/30 mt-1">
                                    <span>1 mg</span><span>2000 mg</span>
                                </div>
                            </div>

                            {/* Route */}
                            <div>
                                <label className="block text-[10px] font-bold text-blue-200/50 uppercase tracking-widest mb-2">
                                    Route of Administration
                                </label>
                                <select
                                    value={route}
                                    onChange={e => setRoute(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-2.5
                                        text-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50
                                        [&>option]:text-gray-900 transition-all">
                                    {ROUTES.map(r => <option key={r}>{r}</option>)}
                                </select>
                            </div>

                            {/* Patient factors */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-blue-200/50 uppercase tracking-widest mb-1.5">
                                        Age
                                    </label>
                                    <input
                                        type="number" min={0} max={120}
                                        value={age}
                                        onChange={e => setAge(e.target.value ? parseInt(e.target.value) : '')}
                                        placeholder="yrs"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5
                                            text-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50
                                            placeholder:text-white/20"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-blue-200/50 uppercase tracking-widest mb-1.5">
                                        Weight
                                    </label>
                                    <input
                                        type="number" min={0} max={300}
                                        value={weight}
                                        onChange={e => setWeight(e.target.value ? parseInt(e.target.value) : '')}
                                        placeholder="kg"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5
                                            text-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50
                                            placeholder:text-white/20"
                                    />
                                </div>
                            </div>

                            {/* Analyze button */}
                            <button
                                onClick={() => handleAnalyze()}
                                disabled={isLoading || !drugName.trim()}
                                className="w-full py-4 bg-gradient-to-r from-rose-600 to-purple-600
                                    hover:from-rose-500 hover:to-purple-500
                                    disabled:opacity-40 disabled:cursor-not-allowed
                                    rounded-2xl font-black text-white shadow-lg shadow-rose-900/20
                                    transition-all active:scale-95 relative overflow-hidden group text-sm">
                                <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                                <span className="relative z-10 flex items-center justify-center gap-2">
                                    {isLoading ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Analyzing...
                                        </>
                                    ) : '🔬 Run Analysis'}
                                </span>
                            </button>

                            {error && (
                                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                                    {error}
                                </div>
                            )}

                            {/* Compare drug 2 input */}
                            {compareMode && (
                                <div className="pt-3 border-t border-white/10 space-y-3">
                                    <p className="text-[10px] font-bold text-purple-300/60 uppercase tracking-widest">Compare Drug 2</p>
                                    <input
                                        type="text"
                                        value={drugName2}
                                        onChange={e => setDrugName2(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAnalyze(undefined, true)}
                                        placeholder="e.g. Aspirin"
                                        className="w-full bg-black/40 border border-purple-500/30 rounded-2xl px-4 py-3
                                            text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50
                                            placeholder:text-white/20 text-sm"
                                    />
                                    <button
                                        onClick={() => handleAnalyze(undefined, true)}
                                        disabled={isLoading2 || !drugName2.trim()}
                                        className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600
                                            hover:from-purple-500 hover:to-blue-500
                                            disabled:opacity-40 disabled:cursor-not-allowed
                                            rounded-2xl font-black text-white shadow-lg
                                            transition-all active:scale-95 text-sm">
                                        {isLoading2 ? '⏳ Analyzing...' : '⚖ Compare'}
                                    </button>
                                </div>
                            )}

                            {/* Disclaimer */}
                            <p className="text-[10px] text-white/20 leading-relaxed text-center">
                                <span className="text-blue-300/40 font-bold">⚕ EDUCATIONAL ONLY</span><br />
                                Not a substitute for medical advice.
                            </p>
                        </div>
                    </div>

                    {/* CENTER — 3D Viewer(s) */}
                    <div className={`flex-1 flex ${compareMode ? 'divide-x divide-white/10' : ''} overflow-hidden relative`}>

                        {/* Primary drug view */}
                        <div className={`${compareMode ? 'flex-1' : 'flex-1'} relative`}>
                            {compareMode && result && (
                                <div className="absolute top-3 left-3 z-20 px-3 py-1 bg-rose-500/20 border border-rose-500/30
                                    rounded-xl text-xs font-bold text-rose-300">
                                    {result.drug_name}
                                </div>
                            )}
                            <DrugHeatmap3D
                                effects={uniqueEffects}
                                selectedOrgan={selectedOrgan}
                                onOrganSelect={setSelectedOrgan}
                                isAnalyzing={isLoading}
                            />
                        </div>

                        {/* Compare view */}
                        {compareMode && (
                            <div className="flex-1 relative">
                                {result2 && (
                                    <div className="absolute top-3 left-3 z-20 px-3 py-1 bg-purple-500/20 border border-purple-500/30
                                        rounded-xl text-xs font-bold text-purple-300">
                                        {result2.drug_name}
                                    </div>
                                )}
                                <DrugHeatmap3D
                                    effects={uniqueEffects2}
                                    selectedOrgan={selectedOrgan}
                                    onOrganSelect={setSelectedOrgan}
                                    isAnalyzing={isLoading2}
                                />
                            </div>
                        )}
                    </div>

                    {/* RIGHT PANEL — Effect Details */}
                    <div className="w-80 flex-shrink-0 border-l border-white/10 bg-black/20 backdrop-blur-sm overflow-hidden flex flex-col">
                        {result ? (
                            <DrugOrganPanel
                                effects={uniqueEffects}
                                mechanism={result.mechanism}
                                sideEffects={result.side_effects}
                                contraindications={result.contraindications}
                                longTermEffects={result.long_term_effects}
                                riskLevel={result.risk_level}
                                drugName={result.drug_name}
                                category={result.category}
                                selectedOrgan={selectedOrgan}
                                onOrganSelect={setSelectedOrgan}
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                                <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10
                                    flex items-center justify-center mb-5 text-4xl">
                                    💊
                                </div>
                                <h3 className="text-lg font-bold text-white/50 mb-2">Ready for Analysis</h3>
                                <p className="text-sm text-white/25 leading-relaxed">
                                    Enter a drug name and click <span className="text-rose-400 font-bold">Run Analysis</span> to see a 3D heatmap of drug effects on the human body.
                                </p>

                                <div className="mt-6 w-full space-y-2">
                                    {['Highlights affected organs', 'Color-coded by intensity', 'Click organ for details'].map((tip, i) => (
                                        <div key={i} className="flex items-center gap-2 text-xs text-white/30 bg-white/5
                                            rounded-xl px-3 py-2 border border-white/5">
                                            <span className="text-green-400">✓</span> {tip}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            </div>

            {/* Global scan animation */}
            <style>{`
                @keyframes scan {
                    0% { transform: translateY(0); }
                    100% { transform: translateY(600px); }
                }
                .animate-scan { animation: scan 2.5s linear infinite; }
                ::-webkit-scrollbar { width: 4px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
            `}</style>
        </div>
    );
};

export default DrugImpactVisualizer;
