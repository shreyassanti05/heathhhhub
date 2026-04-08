
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: ".env.local" });

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

async function listModels() {
    try {
        const models = await genAI.listModels();
        console.log("Available Models:");
        models.forEach((m) => {
            console.log(`- ${m.name} (supports: ${m.supportedGenerationMethods.join(", ")})`);
        });
    } catch (error) {
        console.error("Error listing models:", error);
    }
}

listModels();
