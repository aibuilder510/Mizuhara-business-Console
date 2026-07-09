# Mizuhara Business Console

The **Mizuhara Business Console** is a high-performance, real-time AI sales development dispatch system. It dials outbound lines to small businesses to pitch website development and booking services, driven by the low-latency, real-time **Gemini Live API** and bridged through SIP telephony trunks (Plivo/Exotel).

---

## 🛠️ Tech Stack & Architecture

- **Backend**: Node.js + TypeScript, Express, and `ws` (WebSockets) for real-time audio and telemetry.
- **Frontend**: React + TypeScript + Tailwind CSS (v4) + `motion` (framing micro-animations).
- **Core AI Voice**: `@google/genai` SDK on `gemini-3.1-flash-live-preview`.
- **Post-Call Analysis**: `openai` SDK (Responses API) with a secure, graceful fallback to `@google/genai` SDK (Gemini 3.5 Flash) if OpenAI credentials are not provided.
- **Data Persistence**: File-backed JSON-DB engine in `src/db/client.ts` with typed relations, schema synchronization, and self-seeding defaults.

---

## 📂 Project Structure

```bash
/src
  /prompts
    base-business-personality.ts   # Layer 1 constant (Core Mizuhara identity)
    compose-prompt.ts              # System prompt builder (Layer 1 + Layer 2 merger)
  /telephony
    telephony.interface.ts         # Adapter contract for telecom carriers
    exotel.provider.ts             # Exotel REST + Call flow implementation
    plivo.provider.ts              # Plivo Stream XML + REST implementation
  /gemini
    gemini-live.client.ts          # Google GenAI Live API wrapper & Simulator
    audio-bridge.ts                # PCM resampling (24kHz <-> 16kHz) + Barge-In DSP
  /post-call
    tools.ts                       # Save lead, Schedule follow-up, DNC, Disposition
    transcript-processor.ts        # OpenAI and Gemini dual-engine extractor
  /db
    client.ts                      # File-backed portable database and ORM
  /api
    routes/calls.ts                # Outbound call handlers, active telemetry
    routes/leads.ts                # Leads manager & DNC registry routes
    routes/pitch-templates.ts      # CRUD for industry pitch templates
  /config
    env.ts                         # Environmental variables & configuration mapping
  App.tsx                          # React Console dashboard UI
  index.css                        # Styling imports & custom design tokens
  main.tsx                         # Front-end React mounter
/server.ts                         # Server entry point (Express + WS + Vite)
test-scaffold.ts                   # Standalone prompt & function-calling test script
```

---

## ⚙️ Environmental Variables Setup

Create a `.env` file in the root directory (based on `.env.example`):

```env
# REQUIRED: Gemini API Key (Automatically injected in Google AI Studio)
GEMINI_API_KEY="AIzaSy..."

# OPTIONAL: OpenAI API Key (For post-call analysis tools. Falls back to Gemini if missing)
OPENAI_API_KEY="sk-proj-..."

# OPTIONAL: Telephony Credentials (Falls back to high-fidelity Simulator if missing)
PLIVO_AUTH_ID=""
PLIVO_AUTH_TOKEN=""
PLIVO_FROM_NUMBER=""

EXOTEL_API_KEY=""
EXOTEL_API_TOKEN=""
EXOTEL_ACCOUNT_SID=""
EXOTEL_CALLER_ID=""

# Self-referential URL of your host (Required for webhooks)
APP_URL="http://localhost:3000"

# Chosen voice name for Business Mode (Fenrir, Aoede, Kore, Puck, Zephyr)
BUSINESS_MODE_VOICE_NAME="Fenrir"
```

---

## 🚀 Running Locally

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Development Server
```bash
npm run dev
```
The console will boot on http://localhost:3000.

### 3. Build for Production
```bash
npm run build
npm start
```

---

## 🧪 Testing the Pipelines

We have created an automated test script (`test-scaffold.ts`) that runs outside the UI to verify prompt composition and transcription analytics:

```bash
npx tsx test-scaffold.ts
```
This tests:
1. **The Prompt Composer**: Proves that default industry-specific pitches and custom prompt overrides produce correct, distinct results.
2. **Post-Call Function Calling**: Feeds a live sales transcript to the GPT/Gemini parser, triggers tool executions, and verifies database persistence (saving the lead and updating disposition state).

---

## 💡 Assumptions Made

1. **Simulation Sandbox Mode**: If telecom or Gemini API keys are omitted in `.env`, the adapter automatically initiates a high-fidelity mock sales conversation loop. The console remains 100% testable, animating waves, listing transcript lines in real-time, writing logs, and performing post-call analysis.
2. **Calling Hours (10 AM - 7 PM IST)**: The adapter enforces calling hours out of compliance. We've added `BYPASS_CALL_HOURS=true` to allow you to test outbound dialer triggers during off-hours.
3. **No-Dependency Database**: We implemented a typed database layer using Node.js filesystem synchronizations rather than heavier external databases or SQL configurations. This provides 100% reliable execution and prevents compilation failures of native C++ database drivers in sandboxed containers.
4. **Resampling Rate**: Since Plivo streams 16kHz PCM Little-Endian audio and Gemini Live outputs 24kHz, our resampler mathematically performs linear downsampling, bypassing heavy dependencies.
