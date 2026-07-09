import { BASE_BUSINESS_PERSONALITY } from "./base-business-personality.ts";
import { db, BusinessType } from "../db/client.ts";

/**
 * Composes the final prompt for Gemini Live using the Two-Layer System.
 * 
 * LAYER 1 — BASE_BUSINESS_PERSONALITY (fixed)
 * LAYER 2 — TASK BRIEFING (custom prompt override OR industry template fallback)
 */
export function composeSystemPrompt(businessType: string, customPrompt?: string): string {
  let taskBriefing = "";

  if (customPrompt && customPrompt.trim()) {
    taskBriefing = customPrompt.trim();
  } else {
    const template = db.getPitchTemplateByBusinessType(businessType as BusinessType);
    taskBriefing = template ? template.pitchText : `Pitch our website design services for a ${businessType} business.`;
  }

  return `${BASE_BUSINESS_PERSONALITY.trim()}\n\n---\n\nTASK BRIEFING FOR THIS CALL:\n${taskBriefing}`;
}
