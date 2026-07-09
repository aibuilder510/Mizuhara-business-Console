import { TelephonyProvider } from "./telephony.interface.ts";

export class PlivoProvider implements TelephonyProvider {
  name = "plivo" as const;

  private authId: string;
  private authToken: string;
  private fromNumber: string;

  constructor() {
    this.authId = process.env.PLIVO_AUTH_ID || "";
    this.authToken = process.env.PLIVO_AUTH_TOKEN || "";
    this.fromNumber = process.env.PLIVO_FROM_NUMBER || "+1234567890";
  }

  async placeCall(phoneNumber: string, systemPrompt: string, callId: string): Promise<{ success: boolean; providerCallId?: string; error?: string }> {
    console.log(`[PlivoProvider] Placing outbound call to ${phoneNumber} (Call ID: ${callId})...`);
    
    // Validate Calling Hours (10 AM to 7 PM IST)
    const istTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const istHours = new Date(istTime).getHours();
    
    // Unless overridden by env variable for testing, reject calls outside calling hours
    if ((istHours < 10 || istHours >= 19) && process.env.BYPASS_CALL_HOURS !== "true") {
      console.log(`[PlivoProvider] Call blocked: Outside calling hours (10 AM - 7 PM IST). Current IST Hour: ${istHours}`);
      return { success: false, error: "Calling hours violation. Allowed between 10 AM and 7 PM IST." };
    }

    // Check if real API credentials exist
    if (!this.authId || !this.authToken) {
      console.log("[PlivoProvider] Missing PLIVO_AUTH_ID/TOKEN. Operating in Simulation Sandbox Mode.");
      return {
        success: true,
        providerCallId: `plivo_sim_${Date.now()}`
      };
    }

    try {
      const url = `https://api.plivo.com/v1/Account/${this.authId}/Call/`;
      const appUrl = process.env.APP_URL || "http://localhost:3000";
      
      // Plivo will fetch this XML instruction to stream audio over WS to our server
      const answerUrl = `${appUrl}/api/telephony/plivo-answer?callId=${callId}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${Buffer.from(`${this.authId}:${this.authToken}`).toString("base64")}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: this.fromNumber,
          to: phoneNumber,
          answer_url: answerUrl,
          answer_method: "GET"
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Plivo API returned status ${response.status}: ${errorText}`);
      }

      const data = await response.json() as { request_uuid: string; message: string };
      console.log(`[PlivoProvider] Plivo call initiated successfully. Request UUID: ${data.request_uuid}`);
      
      return {
        success: true,
        providerCallId: data.request_uuid
      };
    } catch (e: any) {
      console.error(`[PlivoProvider] Failed to place call via Plivo API:`, e);
      return { success: false, error: e.message || "Unknown Plivo REST error" };
    }
  }

  sendAudio(providerCallId: string, audioBase64: string): void {
    // In a real Plivo stream, audio is bridged via the WebSocket connection 
    // initiated by Plivo XML's <Stream> element.
    // The server-side WebSocket listener catches it and routes it here.
    console.log(`[PlivoProvider] Sending ${audioBase64.length} bytes of audio to Plivo call ${providerCallId}`);
  }

  async hangUp(providerCallId: string): Promise<boolean> {
    console.log(`[PlivoProvider] Hanging up call ${providerCallId}...`);
    if (providerCallId.startsWith("plivo_sim_")) {
      return true;
    }

    try {
      const url = `https://api.plivo.com/v1/Account/${this.authId}/Call/${providerCallId}/`;
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          "Authorization": `Basic ${Buffer.from(`${this.authId}:${this.authToken}`).toString("base64")}`
        }
      });
      return response.ok;
    } catch (e) {
      console.error(`[PlivoProvider] Hangup failed for Plivo call ${providerCallId}:`, e);
      return false;
    }
  }
}
export const plivoProvider = new PlivoProvider();
