
import { UserProfile } from '../types';
import type { Blob } from '@google/genai';

export const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            // remove "data:image/jpeg;base64,"
            resolve(result.split(',')[1]);
        };
        reader.onerror = (error) => reject(error);
    });
};

export const calculateMaintenanceCalories = (user: UserProfile): number => {
    // Using Harris-Benedict Equation with a general age and activity level
    // BMR calculation
    const age = user.age;
    let bmr: number;
    if (user.gender === 'male') {
        // BMR = 10 * weight (kg) + 6.25 * height (cm) - 5 * age + 5
        bmr = 10 * user.weight + 6.25 * user.height - 5 * age + 5;
    } else {
        // BMR = 10 * weight (kg) + 6.25 * height (cm) - 5 * age - 161
        bmr = 10 * user.weight + 6.25 * user.height - 5 * age - 161;
    }
    // Maintenance calories (sedentary activity level)
    return bmr * 1.2;
};

export const getErrorMessage = (error: unknown): string => {
  const errObj = error as any;

  // Priority 1: Explicit check for the JSON structure provided in the issue (Raw API error object)
  // Structure: {"error":{"code":429,"message":"...","status":"RESOURCE_EXHAUSTED"}}
  if (errObj?.error?.code === 429 || errObj?.error?.status === 'RESOURCE_EXHAUSTED') {
      return "You have exceeded your API usage limit. Please check your plan and billing details, or try again later.";
  }
  
  // Check for top-level status code (some client wrappers)
  if (errObj?.status === 429) {
      return "You have exceeded your API usage limit. Please check your plan and billing details, or try again later.";
  }

  // Priority 2: Check for the specific Gemini API quota error structure usually found in SDK errors
  const geminiError = errObj?.error;
  if (typeof geminiError === 'object' && geminiError !== null && geminiError.status === 'RESOURCE_EXHAUSTED') {
      return "You have exceeded your API usage limit. Please check your plan and billing details, or try again later.";
  }

  // Priority 3: General error message parsing from various possible structures.
  let messageString: string | null = null;
  
  if (error instanceof Error) {
    messageString = error.message;
  } else if (typeof error === 'object' && error !== null) {
    if ('message' in error) {
      messageString = String((error as { message: unknown }).message);
    } 
    else if ('error' in error) {
      const innerError = (error as any).error;
      if (typeof innerError === 'object' && innerError !== null && 'message' in innerError) {
        messageString = String(innerError.message);
      } else if (typeof innerError === 'string') {
        messageString = innerError;
      }
    }
  }

  // Attempt to parse the message if it looks like stringified JSON
  if (messageString && messageString.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(messageString);
      // Check for quota error within the parsed JSON
      if (parsed.error && (parsed.error.status === 'RESOURCE_EXHAUSTED' || parsed.error.code === 429)) {
        return "You have exceeded your API usage limit. Please check your plan and billing details, or try again later.";
      }
      if (parsed.error && parsed.error.message) {
        messageString = parsed.error.message;
      } else if (parsed.message) {
        messageString = parsed.message;
      }
    } catch (e) {
      // Ignore if it's not valid JSON, proceed with the original string
    }
  }

  // Fallback checks on the final message string
  if (messageString) {
    const lowerCaseMessage = messageString.toLowerCase();
    
    if (lowerCaseMessage.includes('429') || lowerCaseMessage.includes('quota') || lowerCaseMessage.includes('resource_exhausted')) {
        return "You have exceeded your API usage limit. Please check your plan and billing details, or try again later.";
    }
    if (lowerCaseMessage.includes('500') || lowerCaseMessage.includes('rpc failed')) {
        return "The AI service is currently unavailable or experienced an internal error. Please try again later.";
    }
    if (lowerCaseMessage.includes('api key')) {
        return "The API key is invalid or missing. Please check your configuration.";
    }
    if (lowerCaseMessage.includes('network error') || lowerCaseMessage.includes('failed to fetch')) {
        return "A network error occurred. Please check your internet connection and try again.";
    }
    return messageString;
  }
  
  // For all other errors, or if a message couldn't be extracted, return a generic message.
  return 'An unexpected error occurred. Please try again later.';
};


export function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
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

export function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}
