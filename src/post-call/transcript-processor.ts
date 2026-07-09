import OpenAI from "openai";
import { GoogleGenAI, Type } from "@google/genai";
import { ENV } from "../config/env.ts";
import { db, BusinessType } from "../db/client.ts";
import * as tools from "./tools.ts";

/**
 * Runs the post-call analysis flow using OpenAI (or Gemini fallback) 
 * to parse a transcript and execute lead management tools.
 */
export async function processCallTranscript(callId: string, transcript: string): Promise<{ success: boolean; actionsTaken: string[] }> {
  console.log(`[TranscriptProcessor] Beginning analysis for Call ID: ${callId}...`);
  
  const call = db.getCallById(callId);
  if (!call) {
    throw new Error(`Call with ID ${callId} not found`);
  }

  const actionsTaken: string[] = [];
  const systemInstruction = `
You are a post-call sales audit AI analyzing the voice transcript of an outbound call from Mizuhara (AI sales agent) to a business owner.
Your task is to analyze the conversation and execute the relevant lead management functions.

RULES:
1. Always tag the call disposition using "tag_call_disposition". If the call reached the client and ended with a pitch, mark "completed". If they asked not to be called, mark "do_not_call".
2. If the client showed interest, or agreed to let us send mockups/details via WhatsApp, call "save_lead" with appropriate leadScore (hot, warm, cold).
3. If they gave a specific follow-up time, or if a follow-up WhatsApp message was agreed, call "schedule_followup" with a valid followUpDate and reason.
4. If they explicitly asked to be taken off the calling list, or expressed anger/rejection, call "add_to_do_not_call" and "tag_call_disposition" (with status "do_not_call").
`;

  // Try to use OpenAI if API Key is available
  if (ENV.OPENAI_API_KEY && !ENV.OPENAI_API_KEY.includes("MY_OPENAI_API_KEY")) {
    try {
      console.log("[TranscriptProcessor] Initializing OpenAI client...");
      const openai = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: `Call Details:\nPhone: ${call.phoneNumber}\nBusiness Type: ${call.businessType}\nTranscript:\n${transcript}` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "save_lead",
              description: "Saves a qualified lead extracted from the call transcript.",
              parameters: {
                type: "object",
                properties: {
                  businessName: { type: "string", description: "The name of the business" },
                  contactName: { type: "string", description: "Name of the owner or contact person" },
                  businessType: { type: "string", enum: ["salon", "dental", "gym", "restaurant", "cafe", "real_estate", "coaching", "other"] },
                  leadScore: { type: "string", enum: ["hot", "warm", "cold", "not_interested"] },
                  summary: { type: "string", description: "Brief summary of the conversation and pitch details" },
                  concernsRaised: { type: "string", description: "Specific objections or concerns mentioned by the client (e.g. price, time)" }
                },
                required: ["businessName", "contactName", "businessType", "leadScore", "summary", "concernsRaised"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "schedule_followup",
              description: "Schedules a follow-up date and task reason for a lead.",
              parameters: {
                type: "object",
                properties: {
                  followUpDate: { type: "string", description: "ISO date format (YYYY-MM-DD)" },
                  reason: { type: "string", description: "Why we are following up (e.g. 'Send WhatsApp mockups')" }
                },
                required: ["followUpDate", "reason"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "add_to_do_not_call",
              description: "Adds a telephone number to the Do Not Call (DNC) list.",
              parameters: {
                type: "object",
                properties: {
                  reason: { type: "string", description: "Why they want to be added" }
                },
                required: ["reason"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "tag_call_disposition",
              description: "Tags the call's ultimate status (disposition).",
              parameters: {
                type: "object",
                properties: {
                  status: { type: "string", enum: ["completed", "no_answer", "voicemail", "failed", "do_not_call"] }
                },
                required: ["status"]
              }
            }
          }
        ],
        tool_choice: "auto"
      });

      const toolCalls = response.choices[0]?.message?.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        for (const tc of toolCalls) {
          const tcAny = tc as any;
          const name = tcAny.function.name;
          const args = JSON.parse(tcAny.function.arguments);
          console.log(`[TranscriptProcessor] Executing OpenAI tool call: ${name}`, args);

          if (name === "save_lead") {
            tools.save_lead(callId, args.businessName, args.contactName, args.businessType as BusinessType, args.leadScore, args.summary, args.concernsRaised);
            actionsTaken.push(`Saved Lead: ${args.businessName} (Score: ${args.leadScore})`);
          } else if (name === "schedule_followup") {
            tools.schedule_followup(callId, args.followUpDate, args.reason);
            actionsTaken.push(`Scheduled follow-up for ${args.followUpDate}`);
          } else if (name === "add_to_do_not_call") {
            tools.add_to_do_not_call(call.phoneNumber, args.reason);
            actionsTaken.push(`Added ${call.phoneNumber} to DNC list`);
          } else if (name === "tag_call_disposition") {
            tools.tag_call_disposition(callId, args.status);
            actionsTaken.push(`Tagged Call status as ${args.status}`);
          }
        }
      }

      return { success: true, actionsTaken };
    } catch (e) {
      console.error("[TranscriptProcessor] OpenAI API failed. Falling back to Gemini API...", e);
    }
  }

  // Fallback: Use Gemini API (No external key required since it uses default workspace secret)
  try {
    console.log("[TranscriptProcessor] Initializing Gemini client for analysis...");
    const ai = new GoogleGenAI({
      apiKey: ENV.GEMINI_API_KEY,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } }
    });

    const prompt = `
Call Details:
Phone: ${call.phoneNumber}
Business Type: ${call.businessType}
Transcript:
${transcript}

Analyze and call functions. Choose tools correctly based on content.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        tools: [
          {
            functionDeclarations: [
              {
                name: "save_lead",
                description: "Saves a qualified lead extracted from the call transcript.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    businessName: { type: Type.STRING, description: "The name of the business" },
                    contactName: { type: Type.STRING, description: "Name of the owner or contact person" },
                    businessType: { type: Type.STRING, description: "Salon, dental, gym, restaurant, etc." },
                    leadScore: { type: Type.STRING, description: "hot, warm, cold, or not_interested" },
                    summary: { type: Type.STRING, description: "Brief summary of the conversation" },
                    concernsRaised: { type: Type.STRING, description: "Specific concerns/objections raised" }
                  },
                  required: ["businessName", "contactName", "businessType", "leadScore", "summary", "concernsRaised"]
                }
              },
              {
                name: "schedule_followup",
                description: "Schedules a follow-up date and task reason for a lead.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    followUpDate: { type: Type.STRING, description: "ISO date format (YYYY-MM-DD)" },
                    reason: { type: Type.STRING, description: "Why we are following up" }
                  },
                  required: ["followUpDate", "reason"]
                }
              },
              {
                name: "add_to_do_not_call",
                description: "Adds a telephone number to the Do Not Call (DNC) list.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    reason: { type: Type.STRING, description: "Why they want to be added" }
                  },
                  required: ["reason"]
                }
              },
              {
                name: "tag_call_disposition",
                description: "Tags the call's ultimate status (disposition).",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    status: { type: Type.STRING, description: "completed, no_answer, voicemail, failed, do_not_call" }
                  },
                  required: ["status"]
                }
              }
            ]
          }
        ]
      }
    });

    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      for (const fc of functionCalls) {
        const name = fc.name;
        const args: any = fc.args;
        console.log(`[TranscriptProcessor] Executing Gemini fallback tool call: ${name}`, args);

        if (name === "save_lead") {
          tools.save_lead(callId, args.businessName, args.contactName, (args.businessType || call.businessType) as BusinessType, args.leadScore, args.summary, args.concernsRaised);
          actionsTaken.push(`Saved Lead: ${args.businessName} (Score: ${args.leadScore})`);
        } else if (name === "schedule_followup") {
          tools.schedule_followup(callId, args.followUpDate, args.reason);
          actionsTaken.push(`Scheduled follow-up for ${args.followUpDate}`);
        } else if (name === "add_to_do_not_call") {
          tools.add_to_do_not_call(call.phoneNumber, args.reason);
          actionsTaken.push(`Added ${call.phoneNumber} to DNC list`);
        } else if (name === "tag_call_disposition") {
          tools.tag_call_disposition(callId, args.status);
          actionsTaken.push(`Tagged Call status as ${args.status}`);
        }
      }
    } else {
      // Manual fallback parser if no tool calling returned but text suggests disposition
      console.log("[TranscriptProcessor] No structured tool calling returned. Applying fallback heuristics...");
      const text = (response.text || "").toLowerCase();
      
      let score: "hot" | "warm" | "cold" | "not_interested" = "cold";
      if (text.includes("hot") || text.includes("interested") || text.includes("whatsapp")) score = "hot";
      else if (text.includes("warm") || text.includes("followup")) score = "warm";
      else if (text.includes("not interested") || text.includes("reject")) score = "not_interested";

      // Save a default lead from the transcript
      tools.save_lead(
        callId,
        "Unknown Business",
        "Business Owner",
        call.businessType,
        score,
        response.text || "Summary of call transcript processed.",
        "Objections or timing mentioned in transcript."
      );
      
      tools.tag_call_disposition(callId, score === "not_interested" ? "do_not_call" : "completed");
      actionsTaken.push("Processed lead with fallback text analysis heuristics.");
    }

    return { success: true, actionsTaken };
  } catch (e) {
    console.error("[TranscriptProcessor] Critical failure in fallback transcript processor:", e);
    // Absolute fallback: mock-tag call disposition to ensure call record isn't orphaned
    tools.tag_call_disposition(callId, "completed");
    return { success: false, actionsTaken: ["Fallback tagging complete"] };
  }
}
