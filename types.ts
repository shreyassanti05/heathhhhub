
export type Gender = 'male' | 'female' | 'other';

export interface UserProfile {
    name: string;
    email: string;
    age: number;
    gender: Gender;
    height: number; // in cm
    weight: number; // in kg
    bmi: number;
    password?: string;
    emergencyContact?: string;
}

export type Page = 'DASHBOARD' | 'DIET_PLANNER' | 'REPORT_ANALYZER' | 'CALORIE_COUNTER' | 'EXERCISE_CORNER' | 'TODAYS_GOAL' | 'LOCATION_TRACKER' | 'EDIT_PROFILE' | 'ACTIVITY_TRACKER' | 'GYM_MANAGEMENT' | 'MEDICAL_IMAGING' | 'DRUG_VISUALIZER' | 'SKIN_DETECTION' | 'DIABETES_PREDICTION' | 'HEART_DISEASE_ANALYZER' | 'KIDNEY_DISEASE_ANALYZER' | 'CANCER_DETECTION' | 'VOICE_HEALTH_AI' | 'QUANTUM_PULSE';

export interface CatalogExercise {
    id: string;
    name: string;
    muscles: string[]; // Primary muscles targeted
    equipment: string[];
    difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
    imageUrl?: string;
    videoUrl?: string;
    description?: string;
}

export interface LoggedFood {
    name: string;
    calories: number;
    source: 'plan' | 'counter';
}

export interface DailyLog {
    date: string;
    caloriesIn: number; // For graph - only from 'counter' source
    caloriesOut: number;
    loggedFoods: LoggedFood[];
}

export interface MealOption {
    name: string;
    calories: number;
    description: string;
}

export interface Meal {
    breakfast: MealOption[];
    lunch: MealOption[];
    snacks: MealOption[];
    dinner: MealOption[];
}

export interface DietPlan {
    mealPlan: Meal;
    reasoning: string;
    healthRecommendations: string[];
    foodsToInclude: string[];
    foodsToAvoid: string[];
    precautions: string[];
    exerciseRoutine: Exercise[];
    lifestyleModifications: string[];
}

export interface ReportAnalysis extends DietPlan {
    reportSummary: string;
    patientInfo: {
        name: string;
        age: number;
        gender: string;
        reportDate: string;
    };
    actionPlan: string[];
    treatmentRecommendations: string[];
    problemExplanation: string;
    keyRecommendations: string[];
}

export interface IdentifiedFood {
    id: string;
    name: string;
    weight: number;
    cookingMethod: string; // Added for accuracy
}

export interface FoodItem {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    source: 'USDA' | 'AI' | 'USER';
    confidence?: number; // AI's confidence in its own estimation
    healthVerdict?: string; // New field for health pros/cons
}

export interface CalorieAnalysisResult {
    foodItems: FoodItem[];
    accuracy: number;
}

export interface Exercise {
    name: string;
    reps: string;
    sets: number;
    caloriesBurnedPerSet: number;
    youtubeQuery: string;
    videoScript: string;
    steps: string[];
    modifications?: string[];
}


export interface WorkoutRoutine {
    warmUp: Exercise[];
    mainWorkout: Exercise[];
    coolDown: Exercise[];
}

export interface SingleExerciseInfo {
    name: string;
    youtubeQuery: string;
    steps: string[];
    tips: string[];
}

export interface ChatMessage {
    role: 'user' | 'model';
    parts: { text: string }[];
}

export interface HealthServiceLocation {
    name: string;
    address: string;
    mapsUri: string;
    latitude: number;
    longitude: number;
    rating?: number;
}

export interface NearbyHealthServices {
    hospitals: HealthServiceLocation[];
    clinics: HealthServiceLocation[];
    medicalStores: HealthServiceLocation[];
}

export interface DrugAnalysisResult {
    drug_name: string;
    category: string;
    primary_organs: string[];
    secondary_organs: string[];
    mechanism: string;
    short_term_effects: string[];
    long_term_effects: string[];
    side_effects: string[];
    risk_level: 'Low' | 'Moderate' | 'High';
    contraindications: string[];
    detailed_explanation: string;
}

export type DrugEffectType = 'stimulation' | 'suppression' | 'toxicity' | 'side-effect' | 'relief';

export interface DrugOrganEffect {
    organ: string;
    /** 0–1 numeric intensity (used by heatmap and panel) */
    intensity: number;
    /** Short label for the effect on this organ, e.g. "Inhibits COX enzymes" */
    effect: string;
    /** Effect type for colour coding */
    type: DrugEffectType;
    /** Optional onset time, e.g. "20–30 min" */
    onset?: string;
    /** Optional duration, e.g. "4–6 hours" */
    duration?: string;
}

export interface SkinAnalysisResult {
    diseaseName: string;
    causes: string[];
    homeRemedies: string[];
    medicalTreatments: string[];
    severity: 'Mild' | 'Moderate' | 'Serious';
    explanation: string;
    disclaimer: string;
}

export interface VoiceAICondition {
    name: string;
    likelihood: 'High' | 'Medium' | 'Low';
}

export interface VoiceAIResponse {
    conditions: VoiceAICondition[]; // Top 1-3 possible conditions
    medicines: string[]; // STRICTLY Safe OTC ONLY (e.g. Paracetamol, ORS)
    advice: string[]; // Home remedies, hydration, rest
    isEmergency: boolean; // True if chest pain, severe breathing issue, etc.
    disclaimer: string;
    detectedLanguage: string; // Add this field
}