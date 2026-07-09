import { Router, Request, Response } from "express";
import { db, BusinessType } from "../../db/client.ts";
import { composeSystemPrompt } from "../../prompts/compose-prompt.ts";
import { plivoProvider } from "../../telephony/plivo.provider.ts";
import { exotelProvider } from "../../telephony/exotel.provider.ts";
import { processCallTranscript } from "../../post-call/transcript-processor.ts";
import { GeminiLiveClient } from "../../gemini/gemini-live.client.ts";

const router = Router();

// Track live call active stream details for dynamic dashboard visualizations
export let activeCallState = {
  isCallActive: false,
  callId: null as string | null,
  phoneNumber: "",
  businessType: "salon" as BusinessType,
  systemPrompt: "",
  userTranscript: [] as string[],
  modelTranscript: [] as string[],
  activeWaveformAmplitude: 0,
  provider: "plivo" as "plivo" | "exotel",
  status: "connecting" as "connecting" | "live" | "completed" | "failed" | "voicemail"
};

/**
 * GET /api/calls
 * Lists all previous call logs.
 */
router.get("/", (req: Request, res: Response) => {
  try {
    const calls = db.getCalls();
    res.json({ success: true, calls });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/calls/active
 * Gets current active call status.
 */
router.get("/active", (req: Request, res: Response) => {
  res.json({ success: true, active: activeCallState });
});

/**
 * GET /api/calls/:id
 * Retrieve specific call detail by ID.
 */
router.get("/:id", (req: Request, res: Response) => {
  try {
    const call = db.getCallById(req.params.id);
    if (!call) {
      return res.status(404).json({ success: false, error: "Call record not found" });
    }
    res.json({ success: true, call });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/calls/start
 * Places an outbound sales call to a prospect.
 */
router.post("/start", async (req: Request, res: Response) => {
  const { phoneNumber, businessType, customPrompt, provider } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ success: false, error: "Phone number is required." });
  }

  const normalizedPhone = phoneNumber.replace(/\s+/g, "");

  // 1. Check Do Not Call (DNC) list immediately
  if (db.isInDNC(normalizedPhone)) {
    console.log(`[CallsAPI] Blocked outbound call to ${phoneNumber} - Listed in Do-Not-Call (DNC) list.`);
    return res.status(400).json({
      success: false,
      error: `Outbound call blocked: The phone number ${phoneNumber} is registered in the Do-Not-Call list.`
    });
  }

  // 2. Reject concurrency - simple single active call restriction
  if (activeCallState.isCallActive) {
    return res.status(400).json({
      success: false,
      error: "An active call is already in progress. Concurrent calling is limited to 1 call at a time."
    });
  }

  try {
    const finalSystemPrompt = composeSystemPrompt(businessType, customPrompt);
    
    // Create database Call record in "failed" by default until connected
    const callRecord = db.createCall({
      phoneNumber,
      businessType: businessType as BusinessType,
      status: "failed", // fallback status
      customPromptUsed: customPrompt || db.getPitchTemplateByBusinessType(businessType)?.pitchText || ""
    });

    // 3. Telephony adapter routing
    const telephony = provider === "exotel" ? exotelProvider : plivoProvider;
    const callResult = await telephony.placeCall(phoneNumber, finalSystemPrompt, callRecord.id);

    if (!callResult.success) {
      db.updateCall(callRecord.id, { status: "failed" });
      return res.status(400).json({
        success: false,
        error: callResult.error || "Telephony provider rejected outbound placement call."
      });
    }

    // Set active call state
    activeCallState = {
      isCallActive: true,
      callId: callRecord.id,
      phoneNumber,
      businessType: businessType as BusinessType,
      systemPrompt: finalSystemPrompt,
      userTranscript: [],
      modelTranscript: [],
      activeWaveformAmplitude: 0,
      provider: provider || "plivo",
      status: "connecting"
    };

    // Update DB with active provider ID and set state to connecting/no answer yet
    db.updateCall(callRecord.id, {
      status: "no_answer",
      recordingUrl: `https://recordings.telephony.provider/api/v1/recording/${callRecord.id}.mp3`
    });

    // Start background Gemini Live connection and audio stream
    console.log(`[CallsAPI] Initiating Voice AI Stream with system instruction prompt length: ${finalSystemPrompt.length}`);
    
    const liveClient = new GeminiLiveClient({
      onAudioOut: (base64Audio) => {
        // Animate wave data on the active state
        activeCallState.activeWaveformAmplitude = 0.5 + Math.random() * 0.4;
        activeCallState.status = "live";
        telephony.sendAudio(callResult.providerCallId || callRecord.id, base64Audio);
      },
      onUserTranscript: (text) => {
        activeCallState.userTranscript.push(text);
        activeCallState.activeWaveformAmplitude = 0.1 + Math.random() * 0.2;
      },
      onModelTranscript: (text) => {
        activeCallState.modelTranscript.push(text);
        activeCallState.status = "live";
      },
      onInterrupted: () => {
        console.log(`[CallsAPI] Audio playback interrupted.`);
        activeCallState.activeWaveformAmplitude = 0;
      },
      onClose: async () => {
        console.log(`[CallsAPI] Voice AI session completed. Running post-call analytics...`);
        await terminateCallFlow(callRecord.id);
      },
      onError: (err) => {
        console.error(`[CallsAPI] Error during Voice AI streaming:`, err);
        terminateCallFlow(callRecord.id, "failed");
      }
    });

    // Actually trigger connect
    await liveClient.connect(finalSystemPrompt);

    // Keep active client attached to state for direct control / manual termination
    (activeCallState as any).client = liveClient;

    // Return the active call status
    res.json({
      success: true,
      message: "Call successfully initiated.",
      call: db.getCallById(callRecord.id)
    });

  } catch (e: any) {
    console.error("[CallsAPI] Failed to start outbound sales call:", e);
    res.status(500).json({ success: false, error: e.message || "Outbound calling system failure" });
  }
});

/**
 * POST /api/calls/hangup
 * Terminate an active call.
 */
router.post("/hangup", async (req: Request, res: Response) => {
  if (!activeCallState.isCallActive || !activeCallState.callId) {
    return res.status(400).json({ success: false, error: "No active call is currently in progress." });
  }

  try {
    const callId = activeCallState.callId;
    console.log(`[CallsAPI] Operator requested manual hang up for Call ID: ${callId}`);
    
    // Shut down Gemini Client
    const client = (activeCallState as any).client;
    if (client) {
      client.close();
    }

    await terminateCallFlow(callId, "completed");

    res.json({ success: true, message: "Call hung up successfully." });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * Background helper to assemble complete transcript, save, and trigger GPT tools analysis.
 */
async function terminateCallFlow(callId: string, finalStatus?: "completed" | "failed" | "voicemail") {
  if (!activeCallState.isCallActive) return;

  const startedTime = db.getCallById(callId)?.startedAt;
  const durationSeconds = startedTime 
    ? Math.floor((Date.now() - new Date(startedTime).getTime()) / 1000)
    : 15;

  // Build sequential dialog transcript
  const transcriptLines: string[] = [];
  const maxLines = Math.max(activeCallState.userTranscript.length, activeCallState.modelTranscript.length);
  
  for (let i = 0; i < maxLines; i++) {
    if (activeCallState.modelTranscript[i]) {
      transcriptLines.push(`Mizuhara: ${activeCallState.modelTranscript[i]}`);
    }
    if (activeCallState.userTranscript[i]) {
      transcriptLines.push(`Prospect: ${activeCallState.userTranscript[i]}`);
    }
  }

  const fullTranscript = transcriptLines.join("\n") || "Mizuhara: Hello! This is Mizuhara representing OM's web design business...\nProspect: No response.";

  // Update Call entry with transcript details
  db.updateCall(callId, {
    endedAt: new Date().toISOString(),
    durationSeconds: durationSeconds || 15,
    status: finalStatus || "completed",
    transcript: fullTranscript
  });

  // Run post-call analysis in the background
  console.log(`[CallsAPI] Running post-call GPT/Gemini function analyzer on transcript (${fullTranscript.length} characters)...`);
  try {
    const result = await processCallTranscript(callId, fullTranscript);
    console.log(`[CallsAPI] Post-call analysis finished. Actions Taken:`, result.actionsTaken);
  } catch (e) {
    console.error(`[CallsAPI] Post-call transcript processor failed:`, e);
  }

  // Clear live call state
  activeCallState.isCallActive = false;
  activeCallState.callId = null;
  activeCallState.activeWaveformAmplitude = 0;
  activeCallState.userTranscript = [];
  activeCallState.modelTranscript = [];
  activeCallState.status = "completed";
}

export { router as callsRouter };
