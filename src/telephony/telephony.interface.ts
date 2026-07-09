export interface TelephonyProvider {
  name: "exotel" | "plivo";
  
  /**
   * Triggers an outbound call.
   * Checks calling hours and DNC lists before dialing.
   */
  placeCall(phoneNumber: string, systemPrompt: string, callId: string): Promise<{ success: boolean; providerCallId?: string; error?: string }>;

  /**
   * Sends audio data to the connected trunk channel.
   * Audio is formatted as raw PCM 16-bit 16kHz (telephony standard).
   */
  sendAudio(providerCallId: string, audioBase64: string): void;

  /**
   * Gracefully terminates an active call.
   */
  hangUp(providerCallId: string): Promise<boolean>;
}
