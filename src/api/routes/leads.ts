import { Router, Request, Response } from "express";
import { db } from "../../db/client.ts";

const router = Router();

/**
 * GET /api/leads
 * Lists all sales leads generated from AI voice call transcripts.
 */
router.get("/", (req: Request, res: Response) => {
  try {
    const leads = db.getLeads();
    res.json({ success: true, leads });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/leads/:id
 * Updates lead details (status, follow-up date, summary, etc.)
 */
router.post("/:id", (req: Request, res: Response) => {
  try {
    const lead = db.updateLead(req.params.id, req.body);
    res.json({ success: true, lead });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/dnc
 * List Do-Not-Call (DNC) numbers.
 */
router.get("/dnc", (req: Request, res: Response) => {
  try {
    const dncList = db.getDNCList();
    res.json({ success: true, dncList });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/dnc
 * Adds a phone number to DNC list.
 */
router.post("/dnc", (req: Request, res: Response) => {
  const { phoneNumber, reason } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ success: false, error: "Phone number is required." });
  }

  try {
    const dncItem = db.addToDNC(phoneNumber, reason || "Manual blacklist request from operator console");
    res.json({ success: true, dncItem });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * DELETE /api/dnc/:phoneNumber
 * Removes a phone number from DNC list.
 */
router.delete("/dnc/:phoneNumber", (req: Request, res: Response) => {
  try {
    db.removeFromDNC(req.params.phoneNumber);
    res.json({ success: true, message: "Successfully removed phone number from DNC list." });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export { router as leadsRouter };
