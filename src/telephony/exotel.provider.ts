import { TelephonyProvider } from "./telephony.interface.ts";

export class ExotelProvider implements TelephonyProvider {
  name = "exotel" as const;

  private apiKey: string;
  private apiToken: string;
  private accountSid: string;
  private callerId: string;

  constructor() {
    this.apiKey = process.env.EXOTEL_API_KEY || "";
    this.apiToken = process.env.EXOTEL_API_TOKEN || "";
    this.accountSid = process.env.EXOTEL_ACCOUNT_SID || "";
    this.callerId = process.env.EXOTEL_CALLER_ID || "";
  }

  async placeCall(phoneNumber: string, systemPrompt: string, callId: string): Promise<{ success: boolean; providerCallId?: string; error?: string }> {
    console.log(`[ExotelProvider] Placing outbound call to ${phoneNumber} (Call ID: ${callId})...`);

    // Validate Calling Hours (10 AM to 7 PM IST)
    const istTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const istHours = new Date(istTime).getHours();
    
    if ((istHours < 10 || istHours >= 19) && process.env.BYPASS_CALL_HOURS !== "true") {
      console.log(`[ExotelProvider] Call blocked: Outside calling hours (10 AM - 7 PM IST). Current IST Hour: ${istHours}`);
      return { success: false, error: "Calling hours violation. Allowed between 10 AM and 7 PM IST." };
    }

    if (!this.apiKey || !this.apiToken || !this.accountSid) {
      console.log("[ExotelProvider] Missing EXOTEL_API_KEY/TOKEN/SID. Operating in Simulation Sandbox Mode.");
      return {
        success: true,
        providerCallId: `exotel_sim_${Date.now()}`
      };
    }

    try {
      const url = `https://api.exotel.com/v1/Accounts/${this.accountSid}/Calls/connect.json`;
      const appUrl = process.env.APP_URL || "http://localhost:3000";
      const statusCallback = `${appUrl}/api/telephony/exotel-callback?callId=${callId}`;

      const params = new URLSearchParams();
      params.append("From", this.callerId);
      params.append("To", phoneNumber);
      params.append("CallerId", this.callerId);
      params.append("Url", `${appUrl}/api/telephony/exotel-passthru?callId=${callId}`);
      params.append("StatusCallback", statusCallback);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${Buffer.from(`${this.apiKey}:${this.apiToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Exotel API returned status ${response.status}: ${errorText}`);
      }

      const data = await response.json() as { Call: { Sid: string } };
      console.log(`[ExotelProvider] Exotel call initiated. Sid: ${data.Call.Sid}`);

      return {
        success: true,
        providerCallId: data.Call.Sid
      };
    } catch (e: any) {
      console.error(`[ExotelProvider] Exotel API call failed:`, e);
      return { success: false, error: e.message || "Unknown Exotel error" };
    }
  }

  sendAudio(providerCallId: string, audioBase64: string): void {
    console.log(`[ExotelProvider] Streaming audio block to Exotel call ${providerCallId}`);
  }

  async hangUp(providerCallId: string): Promise<boolean> {
    console.log(`[ExotelProvider] Terminating call ${providerCallId}...`);
    if (providerCallId.startsWith("exotel_sim_")) {
      return true;
    }

    try {
      const url = `https://api.exotel.com/v1/Accounts/${this.accountSid}/Calls/${providerCallId}.json`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${Buffer.from(`${this.apiKey}:${this.apiToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ Status: "completed" })
      });
      return response.ok;
    } catch (e) {
      console.error(`[ExotelProvider] Exotel termination failed:`, e);
      return false;
    }
  }
}
export const exotelProvider = new ExotelProvider();
