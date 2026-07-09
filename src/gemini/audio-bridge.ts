/**
 * Audio processing and signal analysis utilities for the Mizuhara Voice AI system.
 * Handles PCM 16-bit Little-Endian resampling, real-time amplitude calculation,
 * voicemail silence detection, and barge-in triggers.
 */

export class AudioBridge {
  private userSilenceTimer: NodeJS.Timeout | null = null;
  private isVoicemailDetected = false;
  private onVoicemail: () => void;
  private onBargeIn: () => void;

  constructor(callbacks: { onVoicemail: () => void; onBargeIn: () => void }) {
    this.onVoicemail = callbacks.onVoicemail;
    this.onBargeIn = callbacks.onBargeIn;
    this.resetSilenceTimer();
  }

  /**
   * Resamples 16-bit PCM Little-Endian audio from 24kHz (Gemini Output) to 16kHz (Telephony standard).
   * Downsampling factor: 1.5 (3 samples to 2 samples).
   */
  public static resample24To16(buffer24: Buffer): Buffer {
    const numSamples = buffer24.length / 2;
    const numOutputSamples = Math.floor(numSamples / 1.5);
    const outputBuffer = Buffer.alloc(numOutputSamples * 2);

    for (let i = 0; i < numOutputSamples; i++) {
      const inputIdx = Math.floor(i * 1.5);
      if (inputIdx * 2 + 1 < buffer24.length) {
        const sample = buffer24.readInt16LE(inputIdx * 2);
        outputBuffer.writeInt16LE(sample, i * 2);
      }
    }
    return outputBuffer;
  }

  /**
   * Resamples 16-bit PCM Little-Endian audio from 16kHz (Telephony/Mic) to 24kHz (Gemini Input expectation if needed).
   * Upsampling factor: 1.5 (2 samples to 3 samples).
   */
  public static resample16To24(buffer16: Buffer): Buffer {
    const numSamples = buffer16.length / 2;
    const numOutputSamples = Math.floor(numSamples * 1.5);
    const outputBuffer = Buffer.alloc(numOutputSamples * 2);

    for (let i = 0; i < numOutputSamples; i++) {
      const inputIdx = Math.floor(i / 1.5);
      if (inputIdx * 2 + 1 < buffer16.length) {
        const sample = buffer16.readInt16LE(inputIdx * 2);
        outputBuffer.writeInt16LE(sample, i * 2);
      }
    }
    return outputBuffer;
  }

  /**
   * Calculates the Root Mean Square (RMS) amplitude of a 16-bit PCM buffer.
   * Returns a normalized value between 0.0 and 1.0.
   */
  public static calculateAmplitude(buffer: Buffer): number {
    if (buffer.length === 0) return 0;
    
    let sumSquares = 0;
    const numSamples = buffer.length / 2;

    for (let i = 0; i < numSamples; i++) {
      if (i * 2 + 1 < buffer.length) {
        const sample = buffer.readInt16LE(i * 2);
        sumSquares += (sample / 32768) * (sample / 32768);
      }
    }

    const rms = Math.sqrt(sumSquares / numSamples);
    // Amplify slightly for visualization mapping
    return Math.min(rms * 2.5, 1.0);
  }

  /**
   * Processes incoming user audio chunks to detect voice activity,
   * handle barge-ins, and trigger voicemail detection.
   */
  public handleUserAudio(buffer: Buffer, isAssistantSpeaking: boolean) {
    const amplitude = AudioBridge.calculateAmplitude(buffer);
    const hasVoiceActivity = amplitude > 0.08; // Voice activity threshold

    if (hasVoiceActivity) {
      // User is speaking! Reset silence timer
      this.resetSilenceTimer();

      // BARGE-IN: If user speaks while assistant is speaking, trigger barge-in event immediately
      if (isAssistantSpeaking) {
        console.log(`[AudioBridge] Barge-In Detected! User amplitude: ${amplitude.toFixed(3)}`);
        this.onBargeIn();
      }
    }
  }

  /**
   * Resets the 8-second silence timer for voicemail detection.
   */
  public resetSilenceTimer() {
    if (this.userSilenceTimer) {
      clearTimeout(this.userSilenceTimer);
    }

    if (this.isVoicemailDetected) return;

    // If no voice activity is detected for 12 seconds, we classify the call as voicemail/gracefully end.
    this.userSilenceTimer = setTimeout(() => {
      if (!this.isVoicemailDetected) {
        this.isVoicemailDetected = true;
        console.log("[AudioBridge] No voice activity detected in 12 seconds. Classifying as Voicemail/Silence.");
        this.onVoicemail();
      }
    }, 12000);
  }

  public cleanup() {
    if (this.userSilenceTimer) {
      clearTimeout(this.userSilenceTimer);
      this.userSilenceTimer = null;
    }
  }
}
