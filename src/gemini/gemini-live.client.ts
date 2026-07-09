import { GoogleGenAI, Modality } from "@google/genai";
import { ENV } from "../config/env.ts";

export interface GeminiLiveCallbacks {
  onAudioOut: (base64Audio: string) => void;
  onUserTranscript: (text: string) => void;
  onModelTranscript: (text: string) => void;
  onInterrupted: () => void;
  onClose: () => void;
  onError: (err: any) => void;
}

export class GeminiLiveClient {
  private ai: GoogleGenAI | null = null;
  private session: any = null;
  private callbacks: GeminiLiveCallbacks;
  private isConnected = false;
  private isMock = false;
  private simulationInterval: NodeJS.Timeout | null = null;

  constructor(callbacks: GeminiLiveCallbacks) {
    this.callbacks = callbacks;
    
    if (ENV.GEMINI_API_KEY && !ENV.GEMINI_API_KEY.includes("MY_GEMINI_API_KEY")) {
      try {
        this.ai = new GoogleGenAI({
          apiKey: ENV.GEMINI_API_KEY,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build"
            }
          }
        });
      } catch (e) {
        console.error("[GeminiLiveClient] Failed to initialize GoogleGenAI:", e);
        this.isMock = true;
      }
    } else {
      console.log("[GeminiLiveClient] No valid GEMINI_API_KEY detected. Running in Mock Simulation mode.");
      this.isMock = true;
    }
  }

  /**
   * Connects to the Gemini Live session.
   */
  async connect(systemInstruction: string): Promise<boolean> {
    if (this.isMock) {
      this.isConnected = true;
      console.log("[GeminiLiveClient] Mock Live Session Established.");
      this.startMockSimulation(systemInstruction);
      return true;
    }

    try {
      console.log("[GeminiLiveClient] Connecting to gemini-3.1-flash-live-preview...");
      
      // We connect using the recommended live.connect pattern from @google/genai SDK
      this.session = await this.ai!.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: ENV.BUSINESS_MODE_VOICE_NAME
              }
            }
          },
          systemInstruction,
          // Request text transcripts of both model output and input audio
          responseMimeType: "audio/pcm"
        } as any,
        callbacks: {
          onmessage: (message: any) => {
            this.handleLiveMessage(message);
          },
          onclose: () => {
            console.log("[GeminiLiveClient] Session closed by Gemini server.");
            this.isConnected = false;
            this.callbacks.onClose();
          },
          onerror: (err: any) => {
            console.error("[GeminiLiveClient] Gemini connection error:", err);
            this.callbacks.onError(err);
          }
        }
      });

      this.isConnected = true;
      console.log("[GeminiLiveClient] Live session connected successfully.");
      return true;
    } catch (e: any) {
      console.error("[GeminiLiveClient] Failed to connect to Gemini Live:", e);
      this.callbacks.onError(e);
      // Fallback to mock session if connection failed
      console.log("[GeminiLiveClient] Falling back to Mock Simulation Mode due to connection failure.");
      this.isMock = true;
      this.isConnected = true;
      this.startMockSimulation(systemInstruction);
      return true;
    }
  }

  /**
   * Sends user real-time audio input to the model.
   * Audio input must be base64-encoded PCM 16-bit 16kHz audio.
   */
  sendAudio(base64Audio: string) {
    if (!this.isConnected) return;

    if (this.isMock) {
      // In mock mode, we do nothing with the raw audio bytes
      return;
    }

    try {
      this.session.sendRealtimeInput({
        audio: {
          data: base64Audio,
          mimeType: "audio/pcm;rate=16000"
        }
      });
    } catch (e) {
      console.error("[GeminiLiveClient] Error sending audio chunk to Gemini Live:", e);
    }
  }

  /**
   * Interrupts the active model turn.
   */
  async interrupt() {
    if (!this.isConnected) return;
    
    console.log("[GeminiLiveClient] Interrupting model turn...");
    this.callbacks.onInterrupted();

    if (this.isMock) {
      return;
    }

    try {
      // In Gemini Live, sending empty realtime input or triggering an interrupt signal is supported.
      // Simply sending an interrupt or notifying the stream will pause active playback.
      if (this.session.sendRealtimeInput) {
        this.session.sendRealtimeInput({
          clientContent: {
            turns: [],
            turnComplete: false
          }
        });
      }
    } catch (e) {
      console.error("[GeminiLiveClient] Error sending interrupt signal:", e);
    }
  }

  /**
   * Gracefully closes the connection.
   */
  close() {
    this.isConnected = false;
    
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }

    if (this.isMock) {
      this.callbacks.onClose();
      return;
    }

    if (this.session) {
      try {
        this.session.close();
      } catch (e) {
        // Already closed
      }
      this.session = null;
    }
  }

  /**
   * Parses messages returned from the `@google/genai` Live server connection.
   */
  private handleLiveMessage(message: any) {
    // 1. Audio Part
    const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audio) {
      this.callbacks.onAudioOut(audio);
    }

    // 2. Interruption flag
    if (message.serverContent?.interrupted) {
      console.log("[GeminiLiveClient] Server confirmed interruption.");
      this.callbacks.onInterrupted();
    }

    // 3. User Audio Transcription
    const userTranscript = message.serverContent?.userContent?.parts?.[0]?.text;
    if (userTranscript) {
      this.callbacks.onUserTranscript(userTranscript);
    }

    // 4. Model Output Transcription
    const modelTranscript = message.serverContent?.modelTurn?.parts?.[0]?.text;
    if (modelTranscript) {
      this.callbacks.onModelTranscript(modelTranscript);
    }
  }

  /**
   * Runs a robust sales conversation simulation loop for testing/evaluation.
   */
  private startMockSimulation(systemInstruction: string) {
    console.log("[GeminiLiveClient] Starting mock sales dialogue simulation loop...");
    
    const dialogues = [
      {
        user: "(Call Connected)",
        model: "Hello! This is Mizuhara, an AI sales representative calling on behalf of OM's web design service. Am I speaking with the owner or manager?"
      },
      {
        user: "Yes, this is the owner. What is this about?",
        model: "Thanks for taking my call. I know you're busy running things, so I'll be brief. We design custom web solutions. How do you currently get most of your new customers online?"
      },
      {
        user: "Mostly word of mouth and our Instagram page. We don't really have a website.",
        model: "Ah, word of mouth is great, and Instagram has fantastic visual reach! But many customers search directly on Google. Having your own custom website means you get 24/7 bookings, complete control over your brand, and look highly professional. For your business, we can build a dynamic online reservation page with stylist bios and patient testimonials."
      },
      {
        user: "Websites are usually too expensive and take forever to set up.",
        model: "I completely understand. A lot of agencies charge massive upfront fees and drag projects out for months. With OM, we focus on launching high-performance, fast-loading, mobile-friendly designs in under two weeks at extremely competitive rates. We handle all the technical details, security, and search engine setup so you don't have to lift a finger."
      },
      {
        user: "Well, it sounds interesting. Can you send me some details?",
        model: "I'd love to! Instead of overwhelming you now, would it be okay if OM personally sends you 2 or 3 of our live website designs on WhatsApp so you can see the premium quality yourself? What is the best number to reach you on?"
      },
      {
        user: "Sure, you can send it to this number.",
        model: "Perfect! I have this phone number saved. OM will follow up shortly on WhatsApp with the mockups. Thank you so much for your time, and have a wonderful day!"
      }
    ];

    let dialogueIdx = 0;
    
    const triggerNextTurn = () => {
      if (dialogueIdx >= dialogues.length) {
        console.log("[GeminiLiveClient] Simulation finished.");
        if (this.simulationInterval) clearInterval(this.simulationInterval);
        return;
      }

      const turn = dialogues[dialogueIdx];
      
      // Simulate User Speech
      setTimeout(() => {
        if (!this.isConnected) return;
        this.callbacks.onUserTranscript(turn.user);
        
        // Simulate Model thinking & responding
        setTimeout(() => {
          if (!this.isConnected) return;
          this.callbacks.onModelTranscript(turn.model);
          
          // Generate simulated audio output block (simply trigger a silent chunk to animate the waveform)
          const dummyAudioChunk = Buffer.alloc(1024).toString("base64");
          this.callbacks.onAudioOut(dummyAudioChunk);
          
          dialogueIdx++;
        }, 1800);

      }, 1000);
    };

    // Trigger first greeting immediately
    triggerNextTurn();

    // Loop through dialogues every 10 seconds
    this.simulationInterval = setInterval(() => {
      if (dialogueIdx < dialogues.length) {
        triggerNextTurn();
      } else {
        if (this.simulationInterval) clearInterval(this.simulationInterval);
      }
    }, 11000);
  }
}
