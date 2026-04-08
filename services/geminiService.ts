
import { GoogleGenAI, Type, Modality, Chat, LiveServerMessage } from "@google/genai";
import { UserProfile, FoodItem, IdentifiedFood, CalorieAnalysisResult, ReportAnalysis, DailyLog, ChatMessage, SingleExerciseInfo, DrugAnalysisResult, SkinAnalysisResult, VoiceAIResponse } from '../types';
import { calculateMaintenanceCalories } from '../utils/helpers';
import { executeWithFallback } from './apiKeyManager';

// ---------------------------------------------------------------
//  API key pool is managed by apiKeyManager.ts.
//  All Gemini calls go through executeWithFallback() which
//  transparently rotates to the next key on rate-limit errors.
// ---------------------------------------------------------------

export interface MedicalFinding {
    icon: string;
    condition: string;
    confidence: number;
    explanation: string;
    action: string;
    severity: 'low' | 'moderate' | 'high';
}

export interface MedicalImagingResult {
    findings: MedicalFinding[];
    overallSummary: string;
    urgencyLevel: string;
    followUp: string;
    actionPlan: string[];
}

export const analyzeMedicalImage = async (
    imageBase64: string,
    mimeType: string,
    scanType: string
): Promise<MedicalImagingResult> => {
    const imagePart = { inlineData: { data: imageBase64, mimeType } };

    const prompt = `You are an expert AI radiologist. Analyze this ${scanType} medical image and provide a detailed diagnostic report.

For each observed finding or anomaly, provide:
- A relevant medical emoji icon
- The condition name (medical terminology with plain-language equivalent)
- Your confidence percentage (0-100)
- A clear one-sentence clinical explanation
- A specific recommended action 
- Severity: "low", "moderate", or "high"

Also provide:
- An overall summary of the scan
- The urgency level (e.g., "Routine", "Moderate", "Urgent")
- A recommended follow-up timeframe
- A numbered action plan (3-5 steps)

If the image is not a medical scan, describe what you observe and note it may not be a clinical image.
Always include the disclaimer that this is AI-assisted and not a replacement for professional diagnosis.

IMPORTANT: Return ONLY valid JSON, no markdown, no extra text.`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            findings: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        icon: { type: Type.STRING },
                        condition: { type: Type.STRING },
                        confidence: { type: Type.NUMBER },
                        explanation: { type: Type.STRING },
                        action: { type: Type.STRING },
                        severity: { type: Type.STRING },
                    },
                    required: ['icon', 'condition', 'confidence', 'explanation', 'action', 'severity'],
                },
            },
            overallSummary: { type: Type.STRING },
            urgencyLevel: { type: Type.STRING },
            followUp: { type: Type.STRING },
            actionPlan: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['findings', 'overallSummary', 'urgencyLevel', 'followUp', 'actionPlan'],
    };

    const response = await executeWithFallback((ai) =>
        ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }, imagePart] },
            config: {
                responseMimeType: 'application/json',
                responseSchema: schema,
            },
        })
    );

    return JSON.parse(response.text) as MedicalImagingResult;
};

const USDA_API_KEY = import.meta.env.VITE_USDA_API_KEY;

const getModel = () => {
    // Using gemini-2.0-flash-exp to bypass free tier quota limits on the standard model.
    return 'gemini-2.5-flash';
};

const fileToGenerativePart = (base64: string, mimeType: string) => {
    return {
        inlineData: {
            data: base64,
            mimeType
        },
    };
};

const exerciseSchema = {
    type: Type.OBJECT,
    properties: {
        name: { type: Type.STRING },
        reps: { type: Type.STRING, description: "Recommended repetitions or duration (e.g., '10-12 reps', '30 seconds')." },
        sets: { type: Type.NUMBER, description: "Recommended number of sets." },
        caloriesBurnedPerSet: { type: Type.NUMBER },
        youtubeQuery: { type: Type.STRING, description: "A specific, optimized YouTube search query to find a video tutorial for this exact exercise (e.g., 'How to do Jumping Jacks proper form')." },
        videoScript: { type: Type.STRING, description: "A 30-60 second video script for demonstrating the exercise. It should be encouraging and motivational." },
        steps: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A step-by-step guide on how to perform the exercise." },
        modifications: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Optional list of modifications based on user's profile, like for different fitness levels or health conditions." },
    },
    required: ['name', 'reps', 'sets', 'caloriesBurnedPerSet', 'videoScript', 'youtubeQuery', 'steps']
};

const mealOptionSchema = {
    type: Type.OBJECT,
    properties: {
        name: { type: Type.STRING },
        calories: { type: Type.NUMBER },
        description: { type: Type.STRING, description: "A brief, one-sentence description of the food item's key nutritional benefit (e.g., 'Rich in protein and fiber')." }
    },
    required: ['name', 'calories', 'description']
};

const mealPlanSchema = {
    type: Type.OBJECT,
    properties: {
        breakfast: { type: Type.ARRAY, items: mealOptionSchema },
        lunch: { type: Type.ARRAY, items: mealOptionSchema },
        snacks: { type: Type.ARRAY, items: mealOptionSchema },
        dinner: { type: Type.ARRAY, items: mealOptionSchema },
    },
    required: ['breakfast', 'lunch', 'snacks', 'dinner']
};

const dietPlanSchema = {
    type: Type.OBJECT,
    properties: {
        mealPlan: mealPlanSchema,
        reasoning: { type: Type.STRING, description: "A detailed explanation of why these specific foods and meal structures were recommended, linking them to the user's profile and health goals." },
        healthRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
        foodsToInclude: { type: Type.ARRAY, items: { type: Type.STRING } },
        foodsToAvoid: { type: Type.ARRAY, items: { type: Type.STRING } },
        precautions: { type: Type.ARRAY, items: { type: Type.STRING } },
        exerciseRoutine: { type: Type.ARRAY, items: exerciseSchema },
        lifestyleModifications: { type: Type.ARRAY, items: { type: Type.STRING } },
    }
};

const GREETINGS: Record<string, string> = {
    'English': "Hello! I'm your AI Health Assistant. How can I help you today?",
    'Hindi': "नमस्ते! मैं आपका AI स्वास्थ्य सहायक हूं। आज मैं आपकी कैसे मदद कर सकता हूं?",
    'Kannada': "ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ AI ಆರೋಗ್ಯ ಸಹಾಯಕ. ಇಂದು ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?",
    'Tamil': "வணக்கம்! நான் உங்கள் AI சுகாதார உதவியாளர். இன்று நான் உங்களுக்கு எப்படி உதவ முடியும்?",
    'Telugu': "హలో! నేను మీ AI హెల్త్ అసిస్టెంట్‌ని. ఈ రోజు నేను మీకు ఎలా సహాయం చేయగలను?",
    'Bengali': "হ্যালো! আমি আপনার AI স্বাস্থ্য সহকারী। আজ আমি আপনাকে কীভাবে সাহায্য করতে পারি?",
    'Marathi': "नमस्कार! मी तुमचा AI आरोग्य सहाय्यक आहे. आज मी तुम्हाला कशी मदत करू शकतो?",
    'Gujarati': "નમસ્તે! હું તમારો AI સ્વાસ્થ્ય સહાયક છું. આજે હું તમને કેવી રીતે મદદ કરી શકું?"
};

const REPORT_GREETINGS: Record<string, string> = {
    'English': "I've reviewed your report analysis and I'm here to help you understand it better. Please feel free to ask me any questions you have about the findings.",
    'Hindi': "मैंने आपकी रिपोर्ट का विश्लेषण किया है और इसे बेहतर ढंग से समझने में आपकी मदद करने के लिए यहाँ हूँ। कृपया निष्कर्षों के बारे में कोई भी प्रश्न पूछें।",
    'Kannada': "ನಿಮ್ಮ ವರದಿಯನ್ನು ನಾನು ವಿಶ್ಲೇಷಿಸಿದ್ದೇನೆ ಮತ್ತು ಅದನ್ನು ಉತ್ತಮವಾಗಿ ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು ನಿಮಗೆ ಸಹಾಯ ಮಾಡಲು ನಾನಿಲ್ಲಿದ್ದೇನೆ.",
    'Tamil': "உங்கள் அறிக்கையை நான் மதிப்பாய்வு செய்துள்ளேன், அதை நன்கு புரிந்துகொள்ள உங்களுக்கு உதவ நான் இங்கே இருக்கிறேன்.",
    'Telugu': "నేను మీ నివేదిక విశ్లేషణను సమీక్షించాను మరియు దానిని బాగా అర్థం చేసుకోవడంలో మీకు సహాయం చేయడానికి ఇక్కడ ఉన్నాను.",
    'Bengali': "আমি আপনার রিপোর্ট বিশ্লেষণ পর্যালোচনা করেছি এবং আপনাকে এটি আরও ভালভাবে বুঝতে সাহায্য করার জন্য এখানে আছি।",
    'Marathi': "मी तुमच्या अहवालाचे विश्लेषण केले आहे आणि ते अधिक चांगल्या प्रकारे समजून घेण्यासाठी तुम्हाला मदत करण्यासाठी मी येथे आहे.",
    'Gujarati': "મેં તમારા રિપોર્ટનું વિશ્લેષણ કર્યું છે અને તમને તેને વધુ સારી રીતે સમજવામાં મદદ કરવા માટે હું અહીં છું."
};

export const generateDietPlan = async (userProfile: UserProfile, healthData: any, language: string) => {
    const model = getModel();
    const prompt = `
        Based on the following user profile and health information, create a detailed, personalized 7-day diet plan consisting of popular and healthy Indian food options.
        The entire response, including all field names and values, MUST be in ${language}.
        User Profile: ${JSON.stringify(userProfile)}
        Health Data: ${JSON.stringify(healthData)}

        Your response MUST be a single JSON object. Every field is mandatory. You MUST NOT leave any fields empty.
        1.  Create a meal plan with 2-3 Indian food options for each of the following meals: Breakfast, Lunch, Snacks, and Dinner. 
            **CRITICAL MANDATORY REQUIREMENT: You MUST include the 'dinner' array with at least 2 distinct food options. The 'dinner' field CANNOT be empty or null. Double check this before responding.**
        2.  **Crucially, for EACH individual food item in the meal plan, provide a short 'description' highlighting its key nutritional benefit (e.g., "Rich in complex carbs and fiber", "Excellent source of lean protein"). This is mandatory for every single food item.**
        3.  Provide a detailed overall 'reasoning' section explaining why this diet plan as a whole is suitable for the user, considering their BMI, health issues, and goals.
        4.  Fill out ALL other recommendation fields: 'healthRecommendations', 'foodsToInclude', 'foodsToAvoid', 'precautions', 'exerciseRoutine', and 'lifestyleModifications'.
        5.  If there are no specific recommendations (e.g., for a healthy user), you MUST provide general wellness advice with Indian food examples for each section. Do not leave any section blank.
    `;

    const response = await executeWithFallback((ai) =>
        ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    ...dietPlanSchema,
                    required: Object.keys(dietPlanSchema.properties),
                },
            },
        })
    );

    return JSON.parse(response.text);
};

export const analyzeMedicalReport = async (userProfile: UserProfile, dietaryPreference: string, imageBase64: string, imageMimeType: string, language: string) => {
    const model = getModel();
    const imagePart = fileToGenerativePart(imageBase64, imageMimeType);

    const prompt = `
        Analyze the attached medical report for a patient with the following profile. Provide a detailed summary and recommendations.
        The entire response, including all field names and values, MUST be in ${language}.
        User Profile: ${JSON.stringify(userProfile)}
        Dietary Preference: ${dietaryPreference}

        Your response MUST be a single JSON object. Every field is mandatory. You MUST NOT leave any fields empty.
        
        1.  **Action Plan (Mandatory):** Create a prioritized "actionPlan" with the top 3-5 most important, actionable steps.
        2.  **Patient Info:** Extract patient information.
        3.  **Report Summary & Problem Explanation:** Provide these in simple language.
        4.  **Recommendations & Diet:** Create a personalized diet plan. For the diet plan:
            a. You MUST provide 2-3 popular and healthy **Indian food options** for each meal: Breakfast, Lunch, Snacks, and Dinner. **Ensure 'dinner' is included and populated with at least 2 items. It is mandatory.**
            b. **Crucially, for EACH individual food item, you MUST provide a short 'description' highlighting its key nutritional benefit in relation to the patient's condition. This is mandatory for every single food item.**
        5.  **Reasoning (Mandatory):** Provide a detailed overall 'reasoning' for why this diet plan is beneficial.
        6.  **Fill out ALL other recommendation fields:** 'treatmentRecommendations', 'keyRecommendations', 'healthRecommendations', 'foodsToInclude', 'foodsToAvoid', 'precautions', 'exerciseRoutine', and 'lifestyleModifications'.
        
        If the report is normal, you MUST provide general health-maintenance advice for all sections. Do not leave any section blank.
    `;

    const reportAnalysisSchema = {
        type: Type.OBJECT,
        properties: {
            actionPlan: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Top 3-5 most important action items for the user." },
            reportSummary: { type: Type.STRING },
            patientInfo: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    age: { type: Type.NUMBER },
                    gender: { type: Type.STRING },
                    reportDate: { type: Type.STRING },
                },
                required: ['name', 'age', 'gender', 'reportDate']
            },
            problemExplanation: { type: Type.STRING },
            treatmentRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
            keyRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
            ...dietPlanSchema.properties
        }
    };

    const response = await executeWithFallback((ai) =>
        ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: prompt }, imagePart] }],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    ...reportAnalysisSchema,
                    required: Object.keys(reportAnalysisSchema.properties),
                },
            },
        })
    );

    return JSON.parse(response.text);
};

// Step 1: Identify food items from an image with enhanced prompt for accuracy
export const identifyFoodInImage = async (imageBase64: string, imageMimeType: string, additionalInfo: string): Promise<Omit<IdentifiedFood, 'id'>[]> => {
    const model = getModel();
    const imagePart = fileToGenerativePart(imageBase64, imageMimeType);

    const identificationPrompt = `
        Analyze the food in the image for accurate calorie tracking.
        Context/Additional Info: "${additionalInfo}"

        Tasks:
        1. Identify each distinct food item.
        2. **Analyze the Cooking Method:** Look for signs of frying (shiny, golden brown), grilling (char marks), boiling/steaming (dull, moist), or raw components.
        3. **Estimate Quantity/Weight:** Assume the food is on a standard 10-inch dinner plate unless context suggests otherwise. Account for depth and density.
        4. **Detect Hidden Calories:** Look for sauces, dressings, oils, or butter that might significantly add to calorie count. Include these in the weight or name if significant.
        
        Return the result as a JSON array of objects.
        Each object MUST have:
        - "name": The specific name (e.g., "Fried Chicken Breast" instead of just "Chicken").
        - "weight": Estimated weight in grams.
        - "cookingMethod": One of 'Fried', 'Grilled', 'Boiled/Steamed', 'Raw', 'Baked', 'Curry/Gravy', 'Roasted', 'Unknown'.

        Example: [{"name": "Butter Chicken", "weight": 200, "cookingMethod": "Curry/Gravy"}, {"name": "Naan with Butter", "weight": 80, "cookingMethod": "Baked"}]
    `;

    const identificationSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                name: { type: Type.STRING },
                weight: { type: Type.NUMBER, description: "Estimated weight in grams" },
                cookingMethod: { type: Type.STRING, description: "Cooking method used (e.g., Fried, Grilled, Raw)" }
            },
            required: ['name', 'weight', 'cookingMethod'],
        }
    };

    const response = await executeWithFallback((ai) =>
        ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: identificationPrompt }, imagePart] }],
            config: {
                responseMimeType: "application/json",
                responseSchema: identificationSchema,
            },
        })
    );

    return JSON.parse(response.text);
};

// Step 2: Get nutritional info for a verified list of foods and an accuracy score
export const getNutritionalInfoAndAccuracy = async (verifiedFoods: IdentifiedFood[], imageBase64: string, imageMimeType: string): Promise<CalorieAnalysisResult> => {
    const model = getModel();
    const foodItems: FoodItem[] = [];

    // Get nutritional data for each food
    for (const food of verifiedFoods) {
        let foodData: FoodItem | null = null;
        try {
            // Enhanced Query: Include cooking method to find accurate USDA match
            const query = `${food.cookingMethod !== 'Unknown' ? food.cookingMethod + ' ' : ''}${food.name}`;
            const usdaResponse = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(query)}&pageSize=1`);
            const usdaData = await usdaResponse.json();

            if (usdaData.foods && usdaData.foods.length > 0) {
                const bestMatch = usdaData.foods[0];
                const nutrients = bestMatch.foodNutrients;
                const getNutrientValue = (id: number) => nutrients.find((n: any) => n.nutrientId === id)?.value || 0;

                const scale = food.weight / 100;
                foodData = {
                    name: food.name,
                    calories: (getNutrientValue(1008)) * scale,
                    protein: (getNutrientValue(1003)) * scale,
                    carbs: (getNutrientValue(1005)) * scale,
                    fat: (getNutrientValue(1004)) * scale,
                    fiber: (getNutrientValue(1079)) * scale,
                    source: 'USDA',
                };
            }
        } catch (e) {
            console.error(`USDA API call failed for ${food.name}:`, e);
        }

        if (!foodData) {
            const estimationPrompt = `
                Estimate the nutritional information for:
                - Item: "${food.name}"
                - Cooking Method: ${food.cookingMethod}
                - Weight: ${food.weight} grams
                
                Account for the specific cooking method (e.g., frying adds fat calories) and density.
                Also provide a confidence score (0-100) for how accurate you think this specific estimation is. 
                Return a single JSON object with "nutrients" and "confidence" keys.
            `;
            try {
                const estimationResponse = await executeWithFallback((ai) =>
                    ai.models.generateContent({
                        model,
                        contents: [{ role: 'user', parts: [{ text: estimationPrompt }] }],
                        config: {
                            responseMimeType: "application/json",
                            responseSchema: {
                                type: Type.OBJECT,
                                properties: {
                                    nutrients: {
                                        type: Type.OBJECT,
                                        properties: {
                                            calories: { type: Type.NUMBER }, protein: { type: Type.NUMBER },
                                            carbs: { type: Type.NUMBER }, fat: { type: Type.NUMBER }, fiber: { type: Type.NUMBER }
                                        },
                                        required: ['calories', 'protein', 'carbs', 'fat', 'fiber']
                                    },
                                    confidence: { type: Type.NUMBER, description: "Confidence score (0-100) for this specific item's nutritional estimation." }
                                },
                                required: ['nutrients', 'confidence']
                            },
                        },
                    })
                );
                const estimationResult = JSON.parse(estimationResponse.text);
                foodData = {
                    name: food.name,
                    ...estimationResult.nutrients,
                    source: 'AI',
                    confidence: estimationResult.confidence,
                };
            } catch (fallbackError) {
                console.error(`Gemini fallback failed for ${food.name}:`, fallbackError);
                foodData = { name: food.name, calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, source: 'AI', confidence: 0 };
            }
        }
        foodItems.push(foodData);
    }

    // Step 2.5: Generate Health Verdicts for all items in a single batch call to save time/quota
    if (foodItems.length > 0) {
        try {
            const verdictPrompt = `
                Analyze the following food items based on their nutritional value and cooking method:
                ${JSON.stringify(foodItems.map(f => ({ name: f.name, cookingMethod: f.source === 'USDA' ? 'Verified' : 'Estimated', calories: f.calories })))}

                For EACH item in the list, provide a "healthVerdict".
                - If the item is generally healthy, state a KEY ADVANTAGE (e.g., "High in protein, great for muscle repair").
                - If the item is unhealthy, state a KEY DISADVANTAGE (e.g., "High in saturated fat due to deep frying").
                - Keep the verdict concise (under 15 words).

                Return a JSON Array of strings. The order MUST match the input list order exactly.
            `;

            const verdictResponse = await executeWithFallback((ai) =>
                ai.models.generateContent({
                    model,
                    contents: [{ role: 'user', parts: [{ text: verdictPrompt }] }],
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                        },
                    },
                })
            );

            const verdicts = JSON.parse(verdictResponse.text) as string[];

            // Merge verdicts back into food items
            verdicts.forEach((verdict, index) => {
                if (foodItems[index]) {
                    foodItems[index].healthVerdict = verdict;
                }
            });
        } catch (e) {
            console.error("Failed to generate health verdicts", e);
        }
    }

    // Step 1: Get image clarity score from the model
    let imageClarityScore = 75; // Default accuracy
    try {
        const accuracyPrompt = `Based on the attached image clarity, lighting, and food visibility, estimate the confidence score (0-100) for an accurate food identification. Just return a single number.`;
        const imagePart = fileToGenerativePart(imageBase64, imageMimeType);

        const response = await executeWithFallback((ai) =>
            ai.models.generateContent({
                model,
                contents: [{ role: 'user', parts: [{ text: accuracyPrompt }, imagePart] }],
            })
        );

        const parsedAccuracy = parseInt(response.text.trim(), 10);
        if (!isNaN(parsedAccuracy)) {
            imageClarityScore = Math.max(0, Math.min(100, parsedAccuracy));
        }
    } catch (e) {
        console.error("Failed to get image clarity score", e);
    }

    // Step 2: Calculate nutritional accuracy based on data sources of the identified items
    if (foodItems.length === 0) {
        // If no food is identified, accuracy is just based on the image (or lack thereof)
        return { foodItems, accuracy: imageClarityScore };
    }

    let totalConfidence = 0;
    for (const item of foodItems) {
        if (item.source === 'USDA') {
            totalConfidence += 95; // USDA data is highly reliable, but not 100% perfect match always
        } else if (item.source === 'AI' && typeof item.confidence === 'number') {
            totalConfidence += item.confidence;
        } else {
            totalConfidence += 50; // Default for AI estimation without a confidence score
        }
    }
    const nutritionalAccuracy = totalConfidence / foodItems.length;

    // Step 3: Combine scores into a final, weighted accuracy score.
    // We give more weight to the nutritional data quality since that's what the user ultimately cares about.
    const finalAccuracy = Math.round((imageClarityScore * 0.4) + (nutritionalAccuracy * 0.6));

    return { foodItems, accuracy: finalAccuracy };
};


export const generateExerciseRoutine = async (userProfile: UserProfile, exerciseData: any) => {
    const model = getModel();

    const userDetails = `
- Age: ${userProfile.age}
- Gender: ${userProfile.gender}
- Weight: ${userProfile.weight} kg
- Height: ${userProfile.height} cm
- Fitness Level: ${exerciseData.preference}
- Activity Level: ${exerciseData.preference} (assumed from fitness level)
- Health Conditions: ${exerciseData.healthIssues.length > 0 ? exerciseData.healthIssues.join(', ') : 'None specified'}
- Exercise Goals: General fitness and well-being
- BMI: ${userProfile.bmi}
- Pregnancy Status: ${exerciseData.healthIssues.includes('Pregnant') ? `Pregnant, ${exerciseData.trimester || 'not specified'} trimester` : 'Not pregnant'}`;

    const prompt = `
        You are a fitness technology expert with extensive experience in developing personalized exercise content for mobile applications. Your expertise lies in creating engaging and informative exercise demonstrations tailored to a user's unique profile.

        Your task is to develop a comprehensive exercise demonstration package for a personalized fitness app. Here are the user details that you should consider when creating this package:
        ${userDetails}

        The final output should be a single JSON object with three keys: "warmUp", "mainWorkout", and "coolDown". Each key should contain an array of exercise objects.
        For each exercise object, you MUST provide:
        1.  **name**: The name of the exercise (e.g., Bodyweight Squats).
        2.  **reps** and **sets**: Recommended repetitions and sets.
        3.  **caloriesBurnedPerSet**: Estimated calories burned per set.
        4.  **videoScript**: A 30-60 second video script for the exercise. The tone should be encouraging and motivational.
        5.  **youtubeQuery**: A highly specific YouTube search query string to find the best video tutorial for this exercise (e.g., "How to do pushups correct form").
        6.  **steps**: A step-by-step visual guide for the exercise.
        7.  **modifications**: (Optional but highly recommended) A list of modifications based on the user's profile (fitness level, health conditions).
        
        Keep in mind that the exercise demonstrations should be safe, effective, and inclusive for all users. Ensure that modifications are clearly outlined. Be cautious to avoid any language that may be discouraging or overwhelming.
    `;


    const workoutRoutineSchema = {
        type: Type.OBJECT,
        properties: {
            warmUp: { type: Type.ARRAY, items: exerciseSchema },
            mainWorkout: { type: Type.ARRAY, items: exerciseSchema },
            coolDown: { type: Type.ARRAY, items: exerciseSchema },
        },
        required: ['warmUp', 'mainWorkout', 'coolDown'],
    };


    const response = await executeWithFallback((ai) =>
        ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
                responseSchema: workoutRoutineSchema,
            },
        })
    );

    return JSON.parse(response.text);
};

export const generateSingleExerciseInfo = async (exerciseName: string): Promise<SingleExerciseInfo> => {
    const model = getModel();

    // 1. Get text info and a prompt for the image
    const textPrompt = `
        For the exercise "${exerciseName}", provide the following in a single JSON object:
        1.  A specific "youtubeQuery" string to search for a high-quality video tutorial of this exercise.
        2.  A "steps" array with a step-by-step guide on how to perform the exercise.
        3.  A "tips" array with helpful tips for correct form and safety.
    `;

    const textGenerationSchema = {
        type: Type.OBJECT,
        properties: {
            youtubeQuery: { type: Type.STRING },
            steps: { type: Type.ARRAY, items: { type: Type.STRING } },
            tips: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['youtubeQuery', 'steps', 'tips'],
    };

    const textResponse = await executeWithFallback((ai) =>
        ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: textPrompt }] }],
            config: {
                responseMimeType: "application/json",
                responseSchema: textGenerationSchema,
            },
        })
    );

    return JSON.parse(textResponse.text);
};

export const generateHealthTip = async (language: string): Promise<string> => {
    const model = getModel();
    const prompt = `Generate a short, inspiring, and actionable daily health or fitness tip in ${language}. Make it unique and interesting. Return only the text of the tip, no preamble or quotation marks.`;

    try {
        const response = await executeWithFallback((ai) =>
            ai.models.generateContent({
                model,
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
            })
        );
        return response.text.trim();
    } catch (error) {
        console.error("Failed to generate health tip:", error);
        throw error;
    }
};

export const analyzeVoiceHealthSymptoms = async (transcript: string, fallbackLanguage: string): Promise<VoiceAIResponse> => {
    const model = getModel();
    const prompt = `
        You are an AI health assistant processing a voice transcript from a user in rural areas. The transcript may contain a description of their health symptoms. 
        The transcript is: "${transcript}"

        Your tasks:
        1. **Language Detection**: Automatically detect the language/dialect the user is speaking (it may be a mix like Hinglish, or different from their app setting). If unclear, default to ${fallbackLanguage}.
        2. Identify the symptoms described.
        3. Determine if the situation is an EMERGENCY (e.g., chest pain, severe difficulty breathing, unconsciousness, severe bleeding, stroke symptoms). If it IS an emergency, set "isEmergency" to true.
        4. Determine 1 to 3 possible conditions based on the symptoms.
        5. Give simple, easy-to-understand advice (e.g., home remedies, hydration, rest).
        6. **STRICT MEDICINE RULES**: 
           - Suggest ONLY extremely safe, common over-the-counter (OTC) medicines (e.g., Paracetamol, ORS, Antacids, basic antihistamines, cough syrups).
           - Do NOT suggest antibiotics.
           - Do NOT suggest prescription drugs.
           - Do NOT suggest complex dosages.
           - If it is an emergency, suggest NO medicines and ask them to go to a hospital immediately.
        7. Always include a medical disclaimer.

        Your response MUST be exclusively a JSON object mapped exactly to the required schema.
        CRITICAL: All generated text values (condition names, advice, medicine names, disclaimer) MUST be written in the **detected language**.
        Also return the standard BCP-47 locale tag of the detected language in the "detectedLanguage" field (e.g., 'hi-IN', 'ta-IN', 'en-IN', 'mr-IN', etc.).
    `;

    const voiceAISchema = {
        type: Type.OBJECT,
        properties: {
            conditions: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        likelihood: { type: Type.STRING } // 'High' | 'Medium' | 'Low'
                    },
                    required: ['name', 'likelihood']
                }
            },
            medicines: { type: Type.ARRAY, items: { type: Type.STRING } },
            advice: { type: Type.ARRAY, items: { type: Type.STRING } },
            isEmergency: { type: Type.BOOLEAN },
            disclaimer: { type: Type.STRING },
            detectedLanguage: { type: Type.STRING, description: "Standard BCP-47 locale tag for the language used in the response." }
        },
        required: ['conditions', 'medicines', 'advice', 'isEmergency', 'disclaimer', 'detectedLanguage']
    };

    const response = await executeWithFallback((ai) =>
        ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
                responseSchema: voiceAISchema,
            },
        })
    );

    return JSON.parse(response.text) as VoiceAIResponse;
};


export const getReportChatConfig = (analysis: ReportAnalysis, userProfile: UserProfile, language: string): { systemInstruction: string, initialHistory: ChatMessage[] } => {
    const analysisContext = `
        The user's profile is: ${JSON.stringify(userProfile)}.
        You have provided the following analysis of their medical report:
        - Report Summary: ${analysis.reportSummary}
        - Problem Explanation: ${analysis.problemExplanation}
        - Key Recommendations: ${(analysis.keyRecommendations || []).join(', ')}
        - Action Plan: ${(analysis.actionPlan || []).join(', ')}
    `;

    const systemInstruction = `You are an AI assistant designed to help users understand their medical report. 
    The user is interacting with you in ${language}.
    **MANDATORY: You must respond ONLY in ${language}. Do not use any other language.**
    Your knowledge is strictly limited to the information provided in the analysis context below. 
    Remember the user's previous questions in this session to provide coherent, follow-up answers.
    Explain concepts clearly and simply. 
    You MUST NOT provide any new medical advice, diagnoses, or information beyond what is in the report summary. 
    If asked for new medical advice, gently decline and suggest they consult a doctor. 
    Always be supportive and encouraging. 
    Ignore any previous conversation context if it was in a different language. Start fresh in ${language}.
    Here is the context for the current conversation: ${analysisContext}`;

    const langKey = Object.keys(REPORT_GREETINGS).includes(language) ? language : 'English';
    const initialMessageText = REPORT_GREETINGS[langKey] || REPORT_GREETINGS['English'];

    const initialHistory: ChatMessage[] = [
        {
            role: 'model',
            parts: [{ text: initialMessageText }],
        }
    ];

    return { systemInstruction, initialHistory };
};

export const getDashboardChatConfig = (userProfile: UserProfile, dailyLog: DailyLog, language: string): { systemInstruction: string, initialHistory: ChatMessage[] } => {
    const maintenanceCalories = calculateMaintenanceCalories(userProfile);
    const totalCaloriesEaten = dailyLog.loggedFoods.reduce((sum, food) => sum + food.calories, 0);

    let statusSummary = '';
    let proactiveSuggestion = '';

    if (totalCaloriesEaten > maintenanceCalories) {
        statusSummary = `The user's logged calorie intake (${totalCaloriesEaten} kcal) has exceeded their daily goal of ${maintenanceCalories.toFixed(0)} kcal. Suggesting a workout from the 'Exercise Corner' would be a good idea.`;
        proactiveSuggestion = `\n\nLooks like a high-energy day! A workout from the 'Exercise Corner' could be a great way to balance things out. [NAVIGATE_TO:EXERCISE_CORNER]`;
    } else if (totalCaloriesEaten > maintenanceCalories * 0.75) {
        statusSummary = `The user's logged calorie intake (${totalCaloriesEaten} kcal) is getting close to their daily goal of ${maintenanceCalories.toFixed(0)} kcal. This is a good time to suggest they check their 'Today's Goal' page.`;
        proactiveSuggestion = `\n\nYou're getting close to your daily calorie goal! You can check your detailed progress on the 'Today's Goal' page. [NAVIGATE_TO:TODAYS_GOAL]`;
    } else if (dailyLog.caloriesOut < 100 && totalCaloriesEaten > 0) {
        statusSummary = `The user has burned very few calories (${dailyLog.caloriesOut} kcal) today. This is a good opportunity to suggest a workout from the 'Exercise Corner'.`;
        proactiveSuggestion = `\n\nHow about adding a workout to your day? The 'Exercise Corner' can create a personalized routine for you. [NAVIGATE_TO:EXERCISE_CORNER]`;
    } else if (totalCaloriesEaten === 0 && dailyLog.caloriesOut === 0) {
        statusSummary = `The user has not logged any food or activity yet today. You could encourage them to use the 'AI Calorie Counter'.`;
        proactiveSuggestion = `\n\nReady to get started? Try logging your first meal with the 'AI Calorie Counter'. [NAVIGATE_TO:CALORIE_COUNTER]`;
    }

    const UNDERWEIGHT_THRESHOLD = 18.5;
    const OVERWEIGHT_THRESHOLD = 25;

    let bmiCategory = 'Normal weight';
    if (userProfile.bmi < UNDERWEIGHT_THRESHOLD) {
        bmiCategory = 'Underweight';
    } else if (userProfile.bmi >= OVERWEIGHT_THRESHOLD) {
        bmiCategory = 'Overweight';
    }

    const loggedFoodsSummary = dailyLog.loggedFoods.length > 0
        ? dailyLog.loggedFoods.map(food => `${food.name} (${food.calories.toFixed(0)} kcal)`).join(', ')
        : 'No food logged yet.';

    const userContext = `
        **User Profile:**
        - Name: ${userProfile.name}
        - Age: ${userProfile.age}
        - Gender: ${userProfile.gender}
        - Weight: ${userProfile.weight} kg
        - Height: ${userProfile.height} cm
        - BMI: ${userProfile.bmi} (${bmiCategory})

        **Today's Live Health Data:**
        - Logged Meals & Items: ${loggedFoodsSummary}
        - Total Calories Eaten: ${totalCaloriesEaten.toFixed(0)} kcal
        - Calories Burned (from exercise): ${dailyLog.caloriesOut.toFixed(0)} kcal
        - Daily Maintenance Goal: ${maintenanceCalories.toFixed(0)} kcal

        **Analysis & Proactive Suggestion Trigger:** ${statusSummary || 'The user is on track. You can offer a general greeting or a fun fact.'}
    `;

    const featuresContext = `
        - Personalized Diet Plan: Generates a tailored diet based on health issues and preferences.
        - Medical Report Analyzer: Summarizes medical reports and provides recommendations.
        - AI Calorie Counter: Tracks calories by analyzing photos of meals.
        - Exercise Corner: Creates personalized workout routines.
        - Today's Goal: Shows daily progress towards calorie and fitness goals.
        - Nearby Health Services: Finds local hospitals, clinics, and medical stores.

        **Gym Management & Workout Builder:**
        - **Workout Builder**: Users can create custom plans by selecting equipment (e.g., dumbbells, barbell) and target muscles.
        - **Active Workout Mode**: A dedicated view to log sets, reps, and weight in real-time.
        - **Smart Rest Timer**: Automatically starts a countdown when a set is marked as 'Done'. Beeps 3 seconds before ending.
        - **1RM Estimator**: Instantly calculates 'One Rep Max' using the Epley formula (Weight * (1 + Reps/30)).
        - **Plate Calculator**: A helper tool (calculator icon) to determine the exact plates needed for a target weight.
        - **Sound Effects**: Audio cues for timer completion and workout celebration.
        - **Summary & Stats**: Shows total volume lifted, sets completed, and calories burned upon finishing a workout.

        **Activity Tracker (GPS & Outdoor):**
        - **GPS Tracking**: Tracks walking/running routes on an interactive map.
        - **Live Weather Integration**: Displays real-time temperature and wind conditions for the user's location.
        - **Smart Voice Coach**: Provides audio feedback on milestones (e.g., "You have reached 1 km").
        - **Step Goal & History**: Users can set daily step targets and view past workout logs with detailed stats.
    `;

    const langKey = Object.keys(GREETINGS).includes(language) ? language : 'English';
    let initialMessageText = GREETINGS[langKey] || GREETINGS['English'];

    // Only append English proactive suggestions if the language is English to avoid confusion
    if (language === 'English' && proactiveSuggestion) {
        initialMessageText += proactiveSuggestion;
    }

    const initialHistory: ChatMessage[] = [{ role: 'model', parts: [{ text: initialMessageText }] }];

    const systemInstruction = `You are a friendly and helpful "AI Health Assistant" for the Health Hub AI application.
         The user is interacting with you in ${language}.
         **MANDATORY: You must respond ONLY in ${language}. Do not use any other language.**
         If ${language} is not English, translate all your internal reasoning and final responses to ${language} completely.
         Your primary role is to answer user questions about the app's features and their personal health data.
         You MUST NOT provide medical advice. If asked for medical advice, gently decline and suggest they consult a doctor.
         Ignore any previous conversation context if it was in a different language. Start fresh in ${language}.

         **Deeply Personalized & Context-Aware:**
         You have access to the user's live health data. Use this information to make your responses highly personalized. For example, comment on their logged meals, reference their BMI status, and relate their calorie intake to their goals. The user's entire chat history is available to you, so remember previous questions and answers to maintain a natural, continuous conversation.

         **Proactive & Data-Driven:**
         Analyze the user's current data below and offer relevant suggestions when appropriate.

         **Interactive Navigation (MANDATORY):**
         A key part of your role is to help users navigate the app.
         If the user asks to go to a specific feature or page (e.g., "Go to calorie counter", "Open diet plan", "Check my goal"), you **MUST** append the corresponding navigation tag [NAVIGATE_TO:PAGE_NAME] at the very end of your response.
         This is the ONLY way the user can navigate. Do not just say "You can go there", you must provide the tag.
         Valid PAGE_NAMEs are: 
         - DIET_PLANNER (for "Diet Plan", "Diet")
         - REPORT_ANALYZER (for "Report Analyzer", "Medical Report")
         - CALORIE_COUNTER (for "Calorie Counter", "Log Food")
         - EXERCISE_CORNER (for "Exercise Corner", "Workout")
         - TODAYS_GOAL (for "Today's Goal", "Progress")
         - LOCATION_TRACKER (for "Location Tracker", "Health Services", "Nearby Clinics")

         **Feature List:**
         ${featuresContext}

         **User Data & Context:**
         ${userContext}

         Keep your answers concise, helpful, and encouraging.
         `;

    return { systemInstruction, initialHistory };
};

export const initializeLiveChat = (
    callbacks: {
        onopen: () => void;
        onmessage: (message: LiveServerMessage) => Promise<void>;
        onerror: (e: ErrorEvent) => void;
        onclose: (e: CloseEvent) => void;
    },
    systemInstruction: string,
): Promise<any> => {
    const model = 'gemini-2.0-flash-exp';

    // Live sessions use execut eWithFallback to pick a key, then connect directly
    const sessionPromise = executeWithFallback((ai) =>
        ai.live.connect({
            model,
            callbacks,
            config: {
                responseModalities: [Modality.AUDIO],
                outputAudioTranscription: {},
                inputAudioTranscription: {},
                systemInstruction,
            },
        })
    );

    return sessionPromise;
};

export const findNearbyHealthServices = async (location: string | { lat: number, lng: number }) => {
    const model = getModel();
    let prompt = '';
    let toolConfig = {};

    if (typeof location === 'string') {
        prompt = `
        Find up to 20 hospitals, 20 clinics, and 20 medical stores near "${location}".
        For each place, you MUST provide its name, address, latitude, longitude, rating (if available), and a Google Maps URL (mapsUri).
        **IMPORTANT:** Include places even if they don't have a high rating. Do not filter out places with low ratings.
        Your response MUST be a single, valid JSON object with three keys: "hospitals", "clinics", and "medicalStores".
        Each key MUST contain an array of objects, where each object has "name", "address", "latitude", "longitude", "rating", and "mapsUri" properties.
        Do not include any introductory text, markdown formatting (like \`\`\`json), or any other text outside of the JSON object itself.
    `;
        toolConfig = {
            tools: [{ googleMaps: {} }],
        };
    } else {
        prompt = `
        Find up to 20 hospitals, 20 clinics, and 20 medical stores.
        **CRITICAL:** Sort the results by distance from the user's location. The closest results MUST be first.
        For each place, you MUST provide its name, address, latitude, longitude, rating (if available), and a Google Maps URL (mapsUri).
        **IMPORTANT:** Include places even if they don't have a high rating. Do not filter out places with low ratings.
        Your response MUST be a single, valid JSON object with three keys: "hospitals", "clinics", and "medicalStores".
        Each key MUST contain an array of objects, where each object has "name", "address", "latitude", "longitude", "rating", and "mapsUri" properties.
        Do not include any introductory text, markdown formatting (like \`\`\`json), or any other text outside of the JSON object itself.
    `;
        toolConfig = {
            tools: [{ googleMaps: {} }],
            toolConfig: {
                retrievalConfig: {
                    latLng: {
                        latitude: location.lat,
                        longitude: location.lng,
                    },
                },
            },
        };
    }

    const response = await executeWithFallback((ai) =>
        ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: toolConfig,
        })
    );

    const responseText = response.text;
    try {
        // The model is prompted to return clean JSON, so we try parsing directly.
        return JSON.parse(responseText);
    } catch (e) {
        // As a fallback, try to extract JSON from a markdown code block.
        const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) {
            try {
                return JSON.parse(jsonMatch[1]);
            } catch (parseError) {
                console.error("Failed to parse extracted JSON from location data:", jsonMatch[1]);
            }
        }
        // If parsing fails, throw a more informative error.
        console.error("Failed to parse location data. Raw response:", responseText);
        throw new Error("The AI returned an unexpected format for location data.");
    }
};

export const analyzeDrugImpact = async (drugName: string, dosage?: string, age?: number, route?: string, weight?: number): Promise<DrugAnalysisResult> => {
    const model = getModel();
    const prompt = `
        You are an expert AI clinical pharmacologist. Analyze the drug "${drugName}"${dosage ? ` with dosage "${dosage}"` : ''}${route ? ` administered via ${route}` : ''}${age ? ` for a person aged ${age}` : ''}${weight ? ` weighing ${weight}kg` : ''} and provide a detailed impact analysis on the human body.
        
        Provide the following details in a structured JSON format:
        1. "drug_name": The official name of the drug.
        2. "category": The therapeutic category (e.g., NSAID, Antibiotic).
        3. "primary_organs": A list of primary organs significantly affected (choose from: Brain, Heart, Liver, Kidney, Lungs, Stomach, Nervous System).
        4. "secondary_organs": A list of other organs affected.
        5. "mechanism": A clear, concise explanation of the mechanism of action.
        6. "short_term_effects": A list of immediate or short-term effects.
        7. "long_term_effects": A list of potential effects from prolonged use.
        8. "side_effects": Common and serious side effects.
        9. "risk_level": "Low", "Moderate", or "High" based on toxicity and side effect profile.
        10. "contraindications": Who should avoid this drug.
        11. "detailed_explanation": A detailed medical explanation for a health-conscious user.

        IMPORTANT: For organ highlighting, ensure you use the exact names: "Brain", "Heart", "Liver", "Kidney", "Lungs", "Stomach", "Nervous System".
        Return ONLY valid JSON.
    `;

    const schema = {
        type: Type.OBJECT,
        properties: {
            drug_name: { type: Type.STRING },
            category: { type: Type.STRING },
            primary_organs: { type: Type.ARRAY, items: { type: Type.STRING } },
            secondary_organs: { type: Type.ARRAY, items: { type: Type.STRING } },
            mechanism: { type: Type.STRING },
            short_term_effects: { type: Type.ARRAY, items: { type: Type.STRING } },
            long_term_effects: { type: Type.ARRAY, items: { type: Type.STRING } },
            side_effects: { type: Type.ARRAY, items: { type: Type.STRING } },
            risk_level: { type: Type.STRING, enum: ['Low', 'Moderate', 'High'] },
            contraindications: { type: Type.ARRAY, items: { type: Type.STRING } },
            detailed_explanation: { type: Type.STRING },
        },
        required: [
            'drug_name', 'category', 'primary_organs', 'secondary_organs', 'mechanism',
            'short_term_effects', 'long_term_effects', 'side_effects', 'risk_level',
            'contraindications', 'detailed_explanation'
        ],
    };

    const response = await executeWithFallback((ai) =>
        ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
            },
        })
    );

    const responseText = response.text;
    try {
        return JSON.parse(responseText) as DrugAnalysisResult;
    } catch (e) {
        // Fallback: Try to extract JSON from markdown if necessary
        const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) {
            return JSON.parse(jsonMatch[1]) as DrugAnalysisResult;
        }
        console.error("Failed to parse drug analysis result:", responseText);
        throw new Error("Invalid response format from AI.");
    }
};

export const analyzeSkinCondition = async (
    imageBase64: string,
    mimeType: string
): Promise<SkinAnalysisResult> => {
    const model = getModel();
    const imagePart = fileToGenerativePart(imageBase64, mimeType);

    const prompt = `You are an expert AI dermatologist. Analyze this image of a skin condition.
    Provide a detailed diagnostic report in valid JSON format.

    Include the following fields:
    - "diseaseName": Common name of the condition.
    - "causes": A list of common causes or triggers.
    - "homeRemedies": 3-5 safe, non-prescription home care tips.
    - "medicalTreatments": Common clinical treatments a doctor might suggest.
    - "severity": Must be one of "Mild", "Moderate", or "Serious".
    - "explanation": A clear 2-3 sentence explanation of the condition.
    - "disclaimer": Use: "This is AI-generated information and is NOT a medical diagnosis. Please consult a dermatologist."

    IMPORTANT: Return ONLY valid JSON, no markdown blocks.`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            diseaseName: { type: Type.STRING },
            causes: { type: Type.ARRAY, items: { type: Type.STRING } },
            homeRemedies: { type: Type.ARRAY, items: { type: Type.STRING } },
            medicalTreatments: { type: Type.ARRAY, items: { type: Type.STRING } },
            severity: { type: Type.STRING, enum: ['Mild', 'Moderate', 'Serious'] },
            explanation: { type: Type.STRING },
            disclaimer: { type: Type.STRING },
        },
        required: ['diseaseName', 'causes', 'homeRemedies', 'medicalTreatments', 'severity', 'explanation', 'disclaimer'],
    };

    const response = await executeWithFallback((ai) =>
        ai.models.generateContent({
            model,
            contents: { parts: [{ text: prompt }, imagePart] },
            config: {
                responseMimeType: 'application/json',
                responseSchema: schema,
            },
        })
    );

    return JSON.parse(response.text) as SkinAnalysisResult;
};