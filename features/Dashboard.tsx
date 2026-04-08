import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useAppContext } from '../context/AppContext';
import { ICONS, LANGUAGES } from '../constants';
import { TRANSLATIONS } from '../constants/translations';
import { Page } from '../types';
import { generateHealthTip } from '../services/geminiService';
import { getErrorMessage, calculateMaintenanceCalories } from '../utils/helpers';
import { sendDailyReport } from '../services/emailService';

interface FeatureCardProps {
    title: string;
    description: string;
    icon: React.ReactNode;
    page: Page;
    colorClass: string;
    gradient: string;
    imageUrl?: string;
}

// Memoized FeatureCard Component with Premium Glassmorphism and 3D Hover
const FeatureCard = React.memo(({ title, description, icon, onClick, colorClass, gradient, imageUrl }: FeatureCardProps & { onClick: () => void }) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [isHovered, setIsHovered] = useState(false);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        setMousePos({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        });
    };

    const handleMouseEnter = () => setIsHovered(true);
    const handleMouseLeave = () => {
        setIsHovered(false);
        setMousePos({ x: 0, y: 0 });
    };

    // Calculate rotation for 3D tilt
    const centerX = cardRef.current ? cardRef.current.offsetWidth / 2 : 0;
    const centerY = cardRef.current ? cardRef.current.offsetHeight / 2 : 0;
    
    // Smooth constraint on rotation
    const rotateX = isHovered ? ((mousePos.y - centerY) / centerY) * -10 : 0;
    const rotateY = isHovered ? ((mousePos.x - centerX) / centerX) * 10 : 0;

    return (
        <div 
            className="w-full h-full cursor-pointer group"
            style={{ perspective: '1000px' }}
            onClick={onClick}
        >
            <div
                ref={cardRef}
                onMouseMove={handleMouseMove}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                style={{
                    transform: isHovered 
                        ? `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)` 
                        : 'rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
                    transition: isHovered ? 'transform 0.1s ease-out' : 'transform 0.5s ease-out',
                    transformStyle: 'preserve-3d'
                }}
                className="relative overflow-hidden rounded-3xl p-6 h-full flex flex-col border border-white/20 dark:border-white/5 bg-white/10 dark:bg-black/20 backdrop-blur-md shadow-lg will-change-transform"
            >
                {/* Background Image (Inner Zoom) */}
                {imageUrl && (
                    <div className="absolute inset-0 z-0 overflow-hidden rounded-3xl opacity-0 group-hover:opacity-20 transition-opacity duration-700 ease-in-out mix-blend-overlay pointer-events-none">
                        <img 
                            src={imageUrl} 
                            alt={title} 
                            className="w-full h-full object-cover transform scale-100 group-hover:scale-125 transition-transform duration-[2000ms] ease-out"
                        />
                    </div>
                )}

                {/* Mouse Tracking Soft Glow */}
                <div 
                    className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-500 will-change-transform"
                    style={{
                        opacity: isHovered ? 1 : 0,
                        background: `radial-gradient(circle 150px at ${mousePos.x}px ${mousePos.y}px, rgba(255,255,255,0.15), transparent 80%)`
                    }}
                />

                {/* Existing Hover Gradient Overlay */}
                <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-500 pointer-events-none z-0`}></div>
                
                {/* Existing Corner Glow */}
                <div className={`absolute -right-10 -top-10 w-40 h-40 rounded-full bg-gradient-to-br ${gradient} opacity-20 blur-3xl group-hover:opacity-30 transition-all duration-500 group-hover:scale-125 pointer-events-none z-0`}></div>

                {/* Content Container (translateZ for 3D pop) */}
                <div 
                    className="relative z-10 flex flex-col h-full"
                    style={{
                        transform: isHovered ? 'translateZ(30px)' : 'translateZ(0)',
                        transition: 'transform 0.3s ease-out'
                    }}
                >
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 shadow-lg ${colorClass} text-white transform group-hover:scale-110 transition-transform duration-300 ring-4 ring-white/10 dark:ring-black/10`}>
                        {React.cloneElement(icon as React.ReactElement<any>, {
                            className: "w-7 h-7",
                            strokeWidth: 2
                        })}
                    </div>

                    <h3 className="text-xl font-bold text-white mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-gray-300 transition-all drop-shadow-sm">
                        {title}
                    </h3>
                    <p className="text-sm text-blue-100/70 leading-relaxed mb-4 flex-grow font-medium drop-shadow-sm">
                        {description}
                    </p>

                    <div className="flex items-center text-xs font-bold text-white uppercase tracking-wider opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 mt-auto drop-shadow-md">
                        <span>Explore</span>
                        <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                    </div>
                </div>
            </div>
        </div>
    );
});

const Dashboard: React.FC = () => {
    const { user, dailyLog, logHistory, navigateTo, isDarkMode, healthTipData, setHealthTipData, language, setLanguage } = useAppContext();
    const [tipError, setTipError] = useState('');
    const [isTipLoading, setIsTipLoading] = useState(false);
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [emailStatus, setEmailStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const t = TRANSLATIONS[language] || TRANSLATIONS['English'];

    // Health Tip Speech Synthesis State
    const [isTipSpeaking, setIsTipSpeaking] = useState(false);
    const tipUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

    // Effect for speech synthesis setup
    useEffect(() => {
        const handleVoicesChanged = () => {
            setVoices(speechSynthesis.getVoices());
        };
        speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
        handleVoicesChanged(); // Initial load

        const utterance = new SpeechSynthesisUtterance();
        utterance.onstart = () => setIsTipSpeaking(true);
        utterance.onend = () => setIsTipSpeaking(false);
        utterance.onerror = (e) => {
            if (e.error !== 'interrupted') {
                console.error("Speech synthesis error:", e.error);
            }
            setIsTipSpeaking(false);
        };
        tipUtteranceRef.current = utterance;

        return () => {
            speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
            speechSynthesis.cancel();
        };
    }, []);

    // Effect for fetching health tip - NOW USES CACHING
    useEffect(() => {
        // If we already have a tip in the selected language, don't refetch
        if (healthTipData && healthTipData.language === language) {
            setIsTipLoading(false);
            setTipError('');
            return;
        }

        setIsTipLoading(true);
        setTipError('');
        speechSynthesis.cancel();

        generateHealthTip(language)
            .then(tip => {
                setHealthTipData({ text: tip, language: language });
            })
            .catch(err => {
                console.error("Failed to generate health tip:", err);
                setTipError(getErrorMessage(err));
            })
            .finally(() => setIsTipLoading(false));
    }, [language, healthTipData, setHealthTipData]);

    const healthTip = healthTipData?.text || '';

    const handleToggleTipSpeech = () => {
        if (!tipUtteranceRef.current || !healthTip) return;

        if (isTipSpeaking) {
            speechSynthesis.cancel();
        } else {
            tipUtteranceRef.current.text = healthTip;
            const langCodeMap: { [key: string]: string } = {
                'English': 'en-US', 'Hindi': 'hi-IN', 'Kannada': 'kn-IN', 'Tamil': 'ta-IN',
                'Telugu': 'te-IN', 'Bengali': 'bn-IN', 'Marathi': 'mr-IN', 'Gujarati': 'gu-IN'
            };
            const langCode = langCodeMap[language] || 'en-US';
            tipUtteranceRef.current.lang = langCode;
            const bestVoice = voices.find(v => v.lang === langCode) || voices.find(v => v.lang.startsWith(langCode.split('-')[0]));
            tipUtteranceRef.current.voice = bestVoice || null;
            speechSynthesis.speak(tipUtteranceRef.current);
        }
    };

    const mainFeatures: FeatureCardProps[] = [
        { title: "Drug Impact Visualizer", description: "Analyze how a drug affects the human body.", icon: ICONS.diet, page: 'DRUG_VISUALIZER', colorClass: 'bg-rose-500', gradient: 'from-rose-400 to-red-600', imageUrl: 'https://images.unsplash.com/photo-1584036561566-baf8f5f1b144?auto=format&fit=crop&q=80&w=600' },
        { title: "Medical Imaging AI", description: "Upload X-Ray, MRI or CT scans for AI-powered diagnostic analysis.", icon: ICONS.report, page: 'MEDICAL_IMAGING', colorClass: 'bg-sky-500', gradient: 'from-sky-400 to-indigo-600', imageUrl: 'https://images.unsplash.com/photo-1576091160550-2173ff9e5ee5?auto=format&fit=crop&q=80&w=600' },
        { title: "Skin AI Lab", description: "AI-powered dermatological analysis and specialist finder.", icon: ICONS.diet, page: 'SKIN_DETECTION', colorClass: 'bg-emerald-500', gradient: 'from-emerald-400 to-cyan-600', imageUrl: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&q=80&w=600' },
        { title: "Heart Disease AI", description: "AI-driven analysis for heart health.", icon: ICONS.report, page: 'HEART_DISEASE_ANALYZER', colorClass: 'bg-red-500', gradient: 'from-red-400 to-rose-600', imageUrl: 'https://images.unsplash.com/photo-1628348068343-c6a848d2b6dd?auto=format&fit=crop&q=80&w=600' },
        { title: "Kidney Disease AI", description: "Assess kidney health risks via AI.", icon: ICONS.report, page: 'KIDNEY_DISEASE_ANALYZER', colorClass: 'bg-blue-500', gradient: 'from-blue-400 to-indigo-600', imageUrl: 'https://images.unsplash.com/photo-1532187863486-abf9db090b2b?auto=format&fit=crop&q=80&w=600' },
        { title: "Oncology AI Lab", description: "Advanced cancer detection and specialist finder.", icon: ICONS.report, page: 'CANCER_DETECTION', colorClass: 'bg-fuchsia-500', gradient: 'from-fuchsia-400 to-purple-600', imageUrl: 'https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&q=80&w=600' },
        { title: "Voice Health AI", description: "Talk to our AI in your native language for instant health guidance.", icon: ICONS.warning, page: 'VOICE_HEALTH_AI', colorClass: 'bg-emerald-500', gradient: 'from-emerald-400 to-teal-600', imageUrl: 'https://images.unsplash.com/photo-1589254065878-42c9da997008?auto=format&fit=crop&q=80&w=600' },
        { title: t.features.exercise_corner.title, description: t.features.exercise_corner.desc, icon: ICONS.exercise, page: 'EXERCISE_CORNER', colorClass: 'bg-purple-500', gradient: 'from-purple-400 to-pink-600', imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=600' },
        { title: "Gym Management", description: "Build your perfect workout routine.", icon: ICONS.dumbbell, page: 'GYM_MANAGEMENT', colorClass: 'bg-cyan-500', gradient: 'from-cyan-400 to-blue-600', imageUrl: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&q=80&w=600' },
        { title: "Diabetes Risk Predictor", description: "AI-driven assessment for early diabetes detection.", icon: ICONS.report, page: 'DIABETES_PREDICTION', colorClass: 'bg-cyan-500', gradient: 'from-cyan-400 to-blue-600', imageUrl: 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&q=80&w=600' },
        { title: "QuantumPulse Hybrid", description: "AI-powered Optical rPPG & WiFi inference.", icon: ICONS.image, page: 'QUANTUM_PULSE', colorClass: 'bg-indigo-500', gradient: 'from-indigo-400 to-purple-600', imageUrl: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&q=80&w=600' },
    ];

    const secondaryFeatures: FeatureCardProps[] = [
        { title: t.features.report_analyzer.title, description: t.features.report_analyzer.desc, icon: ICONS.report, page: 'REPORT_ANALYZER', colorClass: 'bg-blue-500', gradient: 'from-blue-400 to-indigo-600', imageUrl: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&q=80&w=600' },
        { title: t.features.todays_goal.title, description: t.features.todays_goal.desc, icon: ICONS.goal, page: 'TODAYS_GOAL', colorClass: 'bg-indigo-500', gradient: 'from-indigo-400 to-violet-600', imageUrl: 'https://images.unsplash.com/photo-1434494878577-86c23bcb06b9?auto=format&fit=crop&q=80&w=600' },
        { title: t.features.calorie_counter.title, description: t.features.calorie_counter.desc, icon: ICONS.flame, page: 'CALORIE_COUNTER', colorClass: 'bg-orange-500', gradient: 'from-orange-400 to-red-600', imageUrl: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&q=80&w=600' },
        { title: t.features.diet_plan.title, description: t.features.diet_plan.desc, icon: ICONS.diet, page: 'DIET_PLANNER', colorClass: 'bg-emerald-500', gradient: 'from-emerald-400 to-teal-600', imageUrl: 'https://images.unsplash.com/photo-1498837167922-41c53bbfdf14?auto=format&fit=crop&q=80&w=600' },
        { title: "Activity Tracker", description: "Track your steps and calories in real-time.", icon: ICONS.exercise, page: 'ACTIVITY_TRACKER', colorClass: 'bg-cyan-500', gradient: 'from-cyan-400 to-blue-600', imageUrl: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&q=80&w=600' },
        { title: t.features.health_services.title, description: t.features.health_services.desc, icon: ICONS.mapPin, page: 'LOCATION_TRACKER', colorClass: 'bg-rose-500', gradient: 'from-rose-400 to-red-600', imageUrl: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&q=80&w=600' },
    ];

    // Memoized Calculations
    const chartData = React.useMemo(() => logHistory.map(log => ({
        ...log,
        name: new Date(log.date).toLocaleString('en-US', { weekday: 'short' }),
    })), [logHistory]);

    const maintenanceCalories = React.useMemo(() => user ? calculateMaintenanceCalories(user) : 2000, [user]);

    // Filter foods by source
    const intakeFoods = React.useMemo(() => dailyLog.loggedFoods.filter(f => f.source === 'counter'), [dailyLog.loggedFoods]);
    const targetFoods = React.useMemo(() => dailyLog.loggedFoods.filter(f => f.source === 'plan'), [dailyLog.loggedFoods]);

    // Calculate totals based on source
    const consumedCalories = React.useMemo(() => intakeFoods.reduce((sum, food) => sum + food.calories, 0), [intakeFoods]);
    const plannedCalories = React.useMemo(() => targetFoods.reduce((sum, food) => sum + food.calories, 0), [targetFoods]);

    const progress = React.useMemo(() => Math.min((consumedCalories / maintenanceCalories) * 100, 100), [consumedCalories, maintenanceCalories]);
    const netCalories = React.useMemo(() => consumedCalories - dailyLog.caloriesOut, [consumedCalories, dailyLog.caloriesOut]);

    const weightStatus = React.useMemo(() => {
        if (!user) return null;
        const bmi = user.bmi;
        if (bmi < 18.5) return { status: t.bmi_status_underweight, color: 'text-blue-500', bg: 'bg-blue-500', gradient: 'from-blue-400 to-blue-600' };
        if (bmi < 25) return { status: t.bmi_status_normal, color: 'text-green-500', bg: 'bg-green-500', gradient: 'from-green-400 to-emerald-600' };
        if (bmi < 30) return { status: t.bmi_status_overweight, color: 'text-orange-500', bg: 'bg-orange-500', gradient: 'from-orange-400 to-orange-600' };
        return { status: t.bmi_status_obese, color: 'text-red-500', bg: 'bg-red-500', gradient: 'from-red-400 to-red-600' };
    }, [user, t]);

    const handleSendReport = async () => {
        if (!user || !user.email) {
            alert("No email address found for user.");
            return;
        }
        setIsSendingEmail(true);
        setEmailStatus('idle');
        try {
            await sendDailyReport(user.email, {
                intake: consumedCalories,
                burned: dailyLog.caloriesOut,
                net: netCalories,
                date: dailyLog.date,
                foods: intakeFoods
            });
            setEmailStatus('success');
            setTimeout(() => setEmailStatus('idle'), 3000);
        } catch (error: any) {
            console.error("Email failed", error);
            setEmailStatus('error');

            // Check for connection error (Server not running)
            if (error.message && (error.message.includes("Failed to fetch") || error.message.includes("NetworkError"))) {
                alert("❌ Connection Failed!\n\nPlease ensure the BACKEND SERVER is running.\nRun 'node server.js' in a new terminal.");
            } else {
                alert(`❌ Email Failed: ${error.message || "Unknown error"}`);
            }
        } finally {
            setIsSendingEmail(false);
        }
    };

    return (
        <div className="relative min-h-screen text-white pb-20 overflow-hidden font-sans selection:bg-rose-500 selection:text-white">

            {/* Dynamic Background (Matches Login) */}
            <div className="fixed inset-0 z-0">
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/40 via-gray-900 to-black"></div>
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] animate-pulse"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>
            </div>

            <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 pt-8 space-y-10 animate-fade-in">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                    <div>
                        <h2 className="text-4xl md:text-5xl font-black tracking-tighter mb-2">
                            {t.hello}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">{user?.name}</span>
                        </h2>
                        <p className="text-lg text-blue-100/70 font-medium">{t.subtitle}</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleSendReport}
                            disabled={isSendingEmail || emailStatus === 'success'}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 shadow-lg border border-white/10 backdrop-blur-md ${emailStatus === 'success'
                                ? 'bg-green-500/20 text-green-200 border-green-500/30'
                                : emailStatus === 'error'
                                    ? 'bg-red-500/20 text-red-200 border-red-500/30 hover:bg-red-500/30'
                                    : 'bg-white/10 text-white hover:bg-white/20'
                                }`}
                        >
                            {isSendingEmail ? (
                                <>
                                    <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <span>Sending...</span>
                                </>
                            ) : emailStatus === 'success' ? (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                    <span>Sent!</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                                    <span>Report</span>
                                </>
                            )}
                        </button>

                        <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 shadow-lg">
                            <div className="px-4 py-2 rounded-xl bg-white/10 text-xs font-bold text-white uppercase tracking-wider">
                                {t.language}
                            </div>
                            <select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                className="bg-transparent text-sm font-semibold text-white focus:outline-none cursor-pointer py-2 pr-4 pl-2 hover:text-blue-300 transition-colors [&>option]:text-gray-900"
                            >
                                {LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Health Tip Banner */}
                <div className="relative overflow-hidden rounded-3xl shadow-2xl group border border-white/10">
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-600/90 via-teal-700/90 to-blue-800/90 backdrop-blur-xl"></div>
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl transform translate-x-1/3 -translate-y-1/3 group-hover:scale-110 transition-transform duration-1000"></div>

                    <div className="relative p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center gap-6">
                        <div className="flex-shrink-0 p-4 bg-white/20 backdrop-blur-md rounded-2xl shadow-inner border border-white/20">
                            {React.cloneElement(ICONS.lightbulb as React.ReactElement<any>, { className: "w-8 h-8 text-yellow-300" })}
                        </div>

                        <div className="flex-grow space-y-2">
                            <div className="flex items-center gap-3">
                                <span className="px-3 py-1 rounded-full bg-white/20 text-white text-[10px] font-bold uppercase tracking-wider border border-white/20 backdrop-blur-sm shadow-sm">
                                    {t.daily_insight}
                                </span>
                                {isTipLoading && <span className="text-blue-200 text-xs animate-pulse font-mono">{t.generating}</span>}
                            </div>

                            {tipError ? (
                                <p className="text-red-200 bg-red-900/30 p-3 rounded-xl border border-red-500/30 text-sm font-medium">{tipError}</p>
                            ) : (
                                <p className="text-xl md:text-2xl font-serif italic text-white leading-relaxed drop-shadow-sm">
                                    "{healthTip || t.generating}"
                                </p>
                            )}
                        </div>

                        {!isTipLoading && healthTip && (
                            <button
                                onClick={handleToggleTipSpeech}
                                className="flex-shrink-0 p-4 bg-white/10 hover:bg-white/20 rounded-full transition-all duration-300 backdrop-blur-md border border-white/20 group-hover:scale-110 active:scale-95 shadow-lg"
                                title={isTipSpeaking ? t.stop : t.listen}
                            >
                                {isTipSpeaking ?
                                    <span className="animate-pulse text-white">{ICONS.speakerOff}</span> :
                                    <span className="text-white">{ICONS.speaker}</span>
                                }
                            </button>
                        )}
                    </div>
                </div>

                {/* Feature Grid */}
                <div>
                    <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                        <span className="w-1 h-8 bg-blue-500 rounded-full"></span>
                        Quick Actions
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {mainFeatures.map(feature => <FeatureCard key={feature.page} {...feature} onClick={() => navigateTo(feature.page)} />)}
                    </div>
                </div>

                {/* Floating Action Button for Sidebar */}
                <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="fixed right-6 top-1/2 transform -translate-y-1/2 z-30 group p-4 rounded-full bg-emerald-500/20 backdrop-blur-md border border-emerald-400/30 shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:shadow-[0_0_50px_rgba(16,185,129,0.5)] transition-all duration-300 hover:scale-110 active:scale-95 flex items-center justify-center animate-bounce-slow"
                    aria-label="Open Secondary Tools"
                >
                    <div className="absolute inset-0 rounded-full bg-emerald-400 opacity-20 blur-xl group-hover:opacity-40 transition-opacity"></div>
                    <svg className="w-6 h-6 text-emerald-300 group-hover:text-emerald-100 transition-colors relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" transform="rotate(180 12 12)"></path></svg>
                </button>

                {/* Sidebar Overlay Modal */}
                <div 
                    className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-500 ${isSidebarOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
                    onClick={() => setIsSidebarOpen(false)}
                />

                {/* Right Sidebar - Secondary Tools */}
                <div 
                    className={`fixed right-0 top-0 h-full w-full sm:w-[400px] z-50 bg-[#0a0a0d]/90 backdrop-blur-3xl border-l border-white/10 shadow-2xl transform transition-transform duration-500 ease-out custom-scrollbar overflow-y-auto ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}
                >
                    <div className="p-6 h-full flex flex-col pt-10">
                        <div className="flex items-center justify-between mb-8 sticky top-0 bg-[#0a0a0d]/5 backdrop-blur-md pb-4 z-10">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <span className="w-1 h-6 bg-emerald-500 rounded-full"></span>
                                Lifestyle & Tracking
                            </h3>
                            <button 
                                onClick={() => setIsSidebarOpen(false)}
                                className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        
                        <div className="flex-grow flex flex-col gap-5 pb-8">
                            {secondaryFeatures.map((feature, index) => (
                                <div 
                                    key={feature.page}
                                    style={{
                                        opacity: isSidebarOpen ? 1 : 0,
                                        transform: isSidebarOpen ? 'translateX(0)' : 'translateX(50px)',
                                        transition: `all 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.1}s`
                                    }}
                                    className="h-48 flex-shrink-0"
                                >
                                    <FeatureCard {...feature} onClick={() => { setIsSidebarOpen(false); navigateTo(feature.page); }} />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Analytics Section */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

                    {/* Today's Intake (Calorie Counter) */}
                    <div className="lg:col-span-1 flex flex-col gap-6">
                        <div className="bg-white/5 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/10 relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-400 to-emerald-600"></div>
                            <div className="flex justify-between items-center mb-8">
                                <h3 className="text-xl font-bold text-white">{t.todays_intake}</h3>
                                <div className="px-3 py-1 rounded-full bg-white/10 text-xs font-bold text-gray-300 border border-white/10">
                                    {t.goal}: {maintenanceCalories.toFixed(0)}
                                </div>
                            </div>

                            <div className="relative mb-8">
                                <div className="flex items-baseline justify-center mb-4">
                                    <span className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 drop-shadow-sm">
                                        {consumedCalories.toFixed(0)}
                                    </span>
                                    <span className="text-lg text-gray-400 font-medium ml-2">kcal</span>
                                </div>

                                <div className="h-4 w-full bg-gray-700/50 rounded-full overflow-hidden p-0.5 shadow-inner border border-white/5">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-500 shadow-[0_0_20px_rgba(52,211,153,0.5)] transition-all duration-1000 ease-out relative"
                                        style={{ width: `${progress}%` }}
                                    >
                                        <div className="absolute inset-0 bg-white/30 animate-pulse"></div>
                                    </div>
                                </div>
                                <p className="text-center text-sm text-gray-400 mt-3 font-medium">{progress.toFixed(0)}% {t.of_daily_goal}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex flex-col items-center justify-center">
                                    <p className="text-[10px] font-bold text-orange-400 uppercase tracking-wider mb-1">{t.burned}</p>
                                    <p className="text-xl font-black text-white">{dailyLog.caloriesOut.toFixed(0)}</p>
                                </div>
                                <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex flex-col items-center justify-center">
                                    <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">{t.net}</p>
                                    <p className="text-xl font-black text-white">{netCalories.toFixed(0)}</p>
                                </div>
                            </div>

                            {weightStatus && (
                                <div className={`mt-6 p-5 rounded-2xl border bg-gradient-to-br ${weightStatus.gradient} text-white shadow-lg relative overflow-hidden`}>
                                    <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/20 rounded-full blur-xl"></div>
                                    <div className="flex justify-between items-center relative z-10">
                                        <div>
                                            <p className="text-xs font-bold opacity-80 uppercase tracking-wider mb-1">{t.bmi_status}</p>
                                            <p className="text-lg font-bold">{weightStatus.status}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-3xl font-black">{user?.bmi.toFixed(1)}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Intake List */}
                        <div className="bg-white/5 backdrop-blur-xl p-6 rounded-3xl shadow-xl border border-white/10 flex-grow flex flex-col h-[400px]">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                {t.consumed}
                            </h3>
                            {intakeFoods.length > 0 ? (
                                <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-grow">
                                    {intakeFoods.map((food, index) => (
                                        <div key={index} className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-gray-200 group-hover:text-white transition-colors text-sm">{food.name}</span>
                                            </div>
                                            <span className="font-bold text-emerald-400 text-sm">
                                                {food.calories.toFixed(0)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 border border-dashed border-white/10 rounded-2xl bg-white/5">
                                    <p className="text-sm font-medium">{t.no_intake}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Middle Section - Graphs & Trends */}
                    <div className="lg:col-span-2 flex flex-col gap-8">
                        {/* Graph */}
                        <div className="bg-white/5 backdrop-blur-xl p-8 rounded-3xl shadow-xl border border-white/10 flex flex-col h-full min-h-[500px]">
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    <span className="w-1 h-6 bg-purple-500 rounded-full"></span>
                                    {t.activity_trends}
                                </h3>
                                <div className="flex items-center space-x-4 bg-black/20 p-1.5 rounded-xl border border-white/5">
                                    <div className="flex items-center space-x-2 px-3 py-1 bg-white/10 rounded-lg shadow-sm">
                                        <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_#10B981]"></span>
                                        <span className="text-xs font-bold text-gray-300">{t.intake}</span>
                                    </div>
                                    <div className="flex items-center space-x-2 px-3 py-1">
                                        <span className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_10px_#F97316]"></span>
                                        <span className="text-xs font-bold text-gray-400">{t.burned}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex-grow">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: -20, bottom: 0 }} barGap={6}>
                                        <defs>
                                            <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#10B981" stopOpacity={0.8} />
                                                <stop offset="100%" stopColor="#10B981" stopOpacity={0.1} />
                                            </linearGradient>
                                            <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#F97316" stopOpacity={0.8} />
                                                <stop offset="100%" stopColor="#F97316" stopOpacity={0.1} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                        <XAxis
                                            dataKey="name"
                                            tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 600 }}
                                            axisLine={false}
                                            tickLine={false}
                                            dy={15}
                                        />
                                        <YAxis
                                            tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 600 }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                            contentStyle={{
                                                backgroundColor: 'rgba(17, 24, 39, 0.9)',
                                                borderColor: 'rgba(255,255,255,0.1)',
                                                borderRadius: '16px',
                                                boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.5)',
                                                color: '#F3F4F6',
                                                padding: '12px',
                                                backdropFilter: 'blur(12px)',
                                            }}
                                            itemStyle={{ fontWeight: 600 }}
                                        />
                                        <Bar dataKey="caloriesIn" fill="url(#colorIn)" radius={[4, 4, 4, 4]} barSize={12} animationDuration={1500} />
                                        <Bar dataKey="caloriesOut" fill="url(#colorOut)" radius={[4, 4, 4, 4]} barSize={12} animationDuration={1500} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Today's Target (Diet Plan) */}
                    <div className="lg:col-span-1 flex flex-col gap-6">
                        <div className="bg-white/5 backdrop-blur-xl p-8 rounded-3xl shadow-xl border border-white/10 relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-600 to-teal-400"></div>
                            <div className="flex justify-between items-center mb-8">
                                <h3 className="text-xl font-bold text-white">{t.todays_target}</h3>
                                <div className="px-3 py-1 rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400 border border-emerald-500/30">
                                    {t.planned}
                                </div>
                            </div>

                            <div className="relative mb-4 text-center">
                                <div className="flex items-baseline justify-center">
                                    <span className="text-5xl font-black text-white drop-shadow-md">
                                        {plannedCalories.toFixed(0)}
                                    </span>
                                    <span className="text-lg text-gray-400 font-medium ml-2">kcal</span>
                                </div>
                                <p className="text-sm text-gray-500 mt-2 font-medium uppercase tracking-wide">{t.total_planned}</p>
                            </div>
                            <div className="h-2 w-full bg-gray-700/50 rounded-full overflow-hidden mt-4">
                                <div className="h-full bg-emerald-500 w-3/4 animate-pulse rounded-full"></div>
                            </div>
                        </div>

                        {/* Target List */}
                        <div className="bg-white/5 backdrop-blur-xl p-6 rounded-3xl shadow-xl border border-white/10 flex-grow flex flex-col h-[400px]">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                {t.planned_meals}
                            </h3>
                            {targetFoods.length > 0 ? (
                                <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-grow">
                                    {targetFoods.map((food, index) => (
                                        <div key={index} className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group border-l-2 border-l-emerald-500">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-gray-200 group-hover:text-emerald-300 transition-colors text-sm">{food.name}</span>
                                            </div>
                                            <span className="font-bold text-emerald-400 text-sm">
                                                {food.calories.toFixed(0)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 border border-dashed border-white/10 rounded-2xl bg-white/5">
                                    <p className="text-sm font-medium">{t.no_meals}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
