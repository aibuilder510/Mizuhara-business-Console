import dotenv from "dotenv";
dotenv.config();

export const ENV = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  APP_URL: process.env.APP_URL || "http://localhost:3000",
  PORT: 3000,
  
  // Voice Configuration
  BUSINESS_MODE_VOICE_NAME: process.env.BUSINESS_MODE_VOICE_NAME || "Fenrir", // Professional, mature sounding male/genderless prebuilt voice
  
  // Plivo Settings
  PLIVO_AUTH_ID: process.env.PLIVO_AUTH_ID || "",
  PLIVO_AUTH_TOKEN: process.env.PLIVO_AUTH_TOKEN || "",
  PLIVO_FROM_NUMBER: process.env.PLIVO_FROM_NUMBER || "+1234567890",
  
  // Exotel Settings
  EXOTEL_API_KEY: process.env.EXOTEL_API_KEY || "",
  EXOTEL_API_TOKEN: process.env.EXOTEL_API_TOKEN || "",
  EXOTEL_ACCOUNT_SID: process.env.EXOTEL_ACCOUNT_SID || "",
  EXOTEL_CALLER_ID: process.env.EXOTEL_CALLER_ID || "",

  // OpenAI Settings for Post-Call Analysis (Uses responses API or standard text completion)
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  
  // Bypass call hours constraint in local development or preview
  BYPASS_CALL_HOURS: process.env.BYPASS_CALL_HOURS === "true" || true,
};

// Validate Gemini API Key availability
if (!ENV.GEMINI_API_KEY) {
  console.warn("⚠️ Warning: GEMINI_API_KEY is not defined in the environment. AI Voice features will fall back to simulation mode.");
}
