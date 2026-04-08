import { GoogleGenAI, Type } from "@google/genai";
import * as dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const getModel = () => 'gemini-2.5-flash';

export const analyzeDrugImpactTest = async (drugName: string, dosage?: string, age?: number) => {
    const model = getModel();
    const prompt = `
        You are an expert AI clinical pharmacologist. Analyze the drug "${drugName}"${dosage ? ` with dosage "${dosage}"` : ''}${age ? ` for a person aged ${age}` : ''} and provide a detailed impact analysis on the human body.
        
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

    try {
        const response = await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
            }
        });

        const responseText = response.text;
        console.log("Raw Response:");
        console.log(responseText);
        const parsed = JSON.parse(responseText || '');
        console.log("Parsed JSON:", parsed);
    } catch (e) {
        console.error("Error calling Gemini API:");
        console.error(e);
    }
};

analyzeDrugImpactTest("Aspirin").then(() => console.log("Done"));
