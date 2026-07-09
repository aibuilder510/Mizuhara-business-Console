import { composeSystemPrompt } from "./src/prompts/compose-prompt.ts";
import { processCallTranscript } from "./src/post-call/transcript-processor.ts";
import { db, Call } from "./src/db/client.ts";

async function runTestSuite() {
  console.log("======================================================");
  console.log("🧪 RUNNING MIZUHARA BUSINESS CONSOLE TEST SUITE");
  console.log("======================================================\n");

  // --- TEST 1: Two-Layer System prompt composer ---
  console.log("👉 [TEST 1] Verifying composeSystemPrompt()...");
  
  // Case A: Default Industry Template fallback (Salon)
  const salonPrompt = composeSystemPrompt("salon");
  console.log("\n[1A] Salon (Default template path):");
  console.log("------------------------------------------------------");
  // Check that base personality and salon pitch exist in output
  const containsBase = salonPrompt.includes("Your name is Mizuhara");
  const containsSalonPitch = salonPrompt.includes("online appointment booking");
  console.log(`Contains Base Personality: ${containsBase ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`Contains Salon Specifics: ${containsSalonPitch ? "✅ PASS" : "❌ FAIL"}`);

  // Case B: Operator Custom Prompt Override
  const customOverride = "Focus specifically on our new organic hair dye service!";
  const customPrompt = composeSystemPrompt("salon", customOverride);
  console.log("\n[1B] Salon (Custom prompt override path):");
  console.log("------------------------------------------------------");
  const containsOverride = customPrompt.includes("organic hair dye");
  const containsOldSalon = customPrompt.includes("online appointment booking");
  console.log(`Contains Custom Override: ${containsOverride ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`Correctly Omitted Default Template: ${!containsOldSalon ? "✅ PASS" : "❌ FAIL"}`);


  // --- TEST 2: Post-Call Transcription function calling pipeline ---
  console.log("\n\n👉 [TEST 2] Verifying post-call AI function-calling pipeline...");
  
  // Seed a call record to test against
  const testCall = db.createCall({
    phoneNumber: "+91 99999 88888",
    businessType: "dental",
    status: "no_answer",
    customPromptUsed: "Standard dental clinic pitch."
  });
  console.log(`Seeded mock call. ID: ${testCall.id}`);

  // Create mock transcript representing a highly interested dental owner agreeing to WhatsApp follow-up
  const mockTranscript = `
Mizuhara: Hello! This is Mizuhara, an AI assistant representing OM's web design business. Am I speaking with the manager?
Prospect: Yes, this is Dr. Amit, the clinic owner. What is this?
Mizuhara: Hi Dr. Amit! I know you're busy running the clinic, so I'll be brief. We build high-performance custom dental websites that handle digital intake forms and trust-building patient reviews. How do you currently get new patients?
Prospect: Mostly patient referrals, but we've been wanting to start showing before-and-after dental implants photos to attract higher-paying clients.
Mizuhara: Implants and cosmetic work are perfect for visual portfolios! Having a gallery on your site builds instant trust. Would it be alright if OM sends a couple of our live sample dental designs over WhatsApp so you can see them?
Prospect: Sure, Amit is my name. You can send the designs to this phone number.
Mizuhara: Excellent Dr. Amit! I'll have OM follow up shortly with the designs. Thank you, have a great day!
`;

  console.log("\nProcessing mock transcript through transcript-processor...");
  try {
    const analysis = await processCallTranscript(testCall.id, mockTranscript);
    console.log("------------------------------------------------------");
    console.log(`Processor Success: ${analysis.success ? "✅ YES" : "❌ NO"}`);
    console.log("Actions Taken by LLM:", analysis.actionsTaken);

    // Verify database updates
    const updatedCall = db.getCallById(testCall.id);
    const leadsList = db.getLeads();
    const associatedLead = leadsList.find(l => l.callId === testCall.id);

    console.log("\nChecking database persistence outcomes:");
    console.log(`Call Status updated: ${updatedCall?.status === "completed" ? "✅ YES" : "❌ NO"}`);
    console.log(`Lead record extracted: ${associatedLead ? "✅ YES" : "❌ NO"}`);
    if (associatedLead) {
      console.log(`  - Business Name: ${associatedLead.businessName}`);
      console.log(`  - Contact Name: ${associatedLead.contactName}`);
      console.log(`  - Lead Score: ${associatedLead.leadScore}`);
      console.log(`  - Summary: ${associatedLead.summary}`);
    }
  } catch (e: any) {
    console.error("❌ Test suite encountered an error running transcript processor:", e);
  }

  console.log("\n======================================================");
  console.log("🏁 MIZUHARA BUSINESS CONSOLE TEST COMPLETE");
  console.log("======================================================");
}

runTestSuite();
