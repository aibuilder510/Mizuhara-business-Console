import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { ENV } from "./src/config/env.ts";
import { callsRouter, activeCallState } from "./src/api/routes/calls.ts";
import { leadsRouter } from "./src/api/routes/leads.ts";
import { pitchTemplatesRouter } from "./src/api/routes/pitch-templates.ts";
import { AudioBridge } from "./src/gemini/audio-bridge.ts";

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  
  // Parse body
  app.use(express.json());

  // Attach API Routes first
  app.use("/api/calls", callsRouter);
  app.use("/api/leads", leadsRouter);
  app.use("/api/pitch-templates", pitchTemplatesRouter);

  // Plivo Answer XML Endpoint (for real-time telephony streaming integration)
  app.get("/api/telephony/plivo-answer", (req, res) => {
    const callId = req.query.callId;
    const protocol = req.secure ? "wss" : "ws";
    const host = req.get("host");
    const streamUrl = `${protocol}://${host}/stream/telephony?callId=${callId}`;

    res.set("Content-Type", "text/xml");
    res.send(`
      <Response>
        <Speak>Please wait while we connect you to Mizuhara, our AI Outreach representative.</Speak>
        <Stream url="${streamUrl}" bidirection="true" />
      </Response>
    `.trim());
  });

  // Exotel Passthrough callback
  app.get("/api/telephony/exotel-passthru", (req, res) => {
    res.set("Content-Type", "text/xml");
    res.send(`
      <Response>
        <Play>https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg</Play>
      </Response>
    `.trim());
  });

  // WebSocket Server setup on same server/port
  const wss = new WebSocketServer({ noServer: true });

  // Handle HTTP Upgrade to WebSocket
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/stream/")) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  // Connection listener
  wss.on("connection", (ws: WebSocket, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    console.log(`[WebSocket] Client connected: ${url.pathname}`);

    // If dashboard is subscribing to active call state telemetry
    if (url.pathname === "/stream/telemetry") {
      const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "telemetry",
            activeCall: {
              isCallActive: activeCallState.isCallActive,
              callId: activeCallState.callId,
              phoneNumber: activeCallState.phoneNumber,
              businessType: activeCallState.businessType,
              userTranscript: activeCallState.userTranscript,
              modelTranscript: activeCallState.modelTranscript,
              activeWaveformAmplitude: activeCallState.activeWaveformAmplitude,
              provider: activeCallState.provider,
              status: activeCallState.status
            }
          }));
        }
      }, 250);

      ws.on("close", () => {
        clearInterval(interval);
      });
    }

    // If telephony SIP provider is initiating a media bi-directional stream
    if (url.pathname === "/stream/telephony") {
      const callId = url.searchParams.get("callId");
      console.log(`[WebSocket] Telephony media stream initiated for Call ID: ${callId}`);

      let audioBridge: AudioBridge | null = null;
      
      // Instantiate our audio bridge for this SIP call
      audioBridge = new AudioBridge({
        onVoicemail: () => {
          console.log(`[WebSocket] Voicemail signal triggered for call: ${callId}`);
          if (activeCallState.isCallActive && (activeCallState as any).client) {
            (activeCallState as any).client.close();
          }
        },
        onBargeIn: () => {
          console.log(`[WebSocket] User barge-in signal triggered. Interrupting Mizuhara...`);
          if (activeCallState.isCallActive && (activeCallState as any).client) {
            (activeCallState as any).client.interrupt();
          }
        }
      });

      ws.on("message", (message) => {
        try {
          const packet = JSON.parse(message.toString());
          
          // Plivo sends audio blocks as raw base64 PCM 16kHz
          if (packet.event === "media" && packet.media?.payload) {
            const rawPcm = Buffer.from(packet.media.payload, "base64");
            
            // Check speech activity and trigger barge-in if needed
            audioBridge?.handleUserAudio(rawPcm, activeCallState.status === "live");

            // Forward to Gemini Live (convert 16kHz to 24kHz if required, or Gemini Live connects at 16kHz)
            if (activeCallState.isCallActive && (activeCallState as any).client) {
              (activeCallState as any).client.sendAudio(packet.media.payload);
            }
          }
        } catch (e) {
          console.error(`[WebSocket] Failed to parse telephony packet:`, e);
        }
      });

      ws.on("close", () => {
        console.log(`[WebSocket] Telephony trunk closed for Call ID: ${callId}`);
        audioBridge?.cleanup();
      });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Listen
  server.listen(ENV.PORT, "0.0.0.0", () => {
    console.log(`🚀 Mizuhara Business Console server active at http://0.0.0.0:${ENV.PORT}`);
  });
}

startServer();
