import { db, BusinessType, Lead, Call } from "../db/client.ts";

/**
 * Saves a qualified lead extracted from the call transcript.
 */
export function save_lead(
  callId: string,
  businessName: string,
  contactName: string,
  businessType: BusinessType,
  leadScore: "hot" | "warm" | "cold" | "not_interested",
  summary: string,
  concernsRaised: string
): Lead {
  console.log(`[Tool: save_lead] Saving lead for ${businessName} (Contact: ${contactName}, Score: ${leadScore})`);
  
  return db.createLead({
    callId,
    businessName,
    contactName,
    leadScore,
    summary,
    concernsRaised
  });
}

/**
 * Schedules a follow-up date and task reason for a lead.
 */
export function schedule_followup(callId: string, followUpDate: string, reason: string): { success: boolean; message: string } {
  console.log(`[Tool: schedule_followup] Scheduling follow-up on ${followUpDate} for Call ID: ${callId}. Reason: ${reason}`);
  
  const leads = db.getLeads();
  const lead = leads.find(l => l.callId === callId);
  
  if (lead) {
    db.updateLead(lead.id, {
      followUpDate,
      summary: `${lead.summary}\n\n[Scheduled Follow-up for ${followUpDate}]: ${reason}`
    });
    return { success: true, message: `Follow-up successfully scheduled on ${followUpDate}.` };
  }
  
  return { success: false, message: `No lead was found matching Call ID: ${callId}. Create a lead first.` };
}

/**
 * Adds a telephone number to the Do Not Call (DNC) list.
 */
export function add_to_do_not_call(phoneNumber: string, reason: string): { success: boolean; phoneNumber: string } {
  console.log(`[Tool: add_to_do_not_call] Adding ${phoneNumber} to Do-Not-Call list. Reason: ${reason}`);
  db.addToDNC(phoneNumber, reason);
  return { success: true, phoneNumber };
}

/**
 * Tags the call's ultimate status (disposition).
 */
export function tag_call_disposition(callId: string, status: "completed" | "no_answer" | "voicemail" | "failed" | "do_not_call"): Call {
  console.log(`[Tool: tag_call_disposition] Tagging Call ID ${callId} with status ${status}`);
  return db.updateCall(callId, { status });
}
