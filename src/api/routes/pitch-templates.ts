import { Router, Request, Response } from "express";
import { db, BusinessType } from "../../db/client.ts";

const router = Router();

/**
 * GET /api/pitch-templates
 * Returns all default per-industry B2B sales pitches.
 */
router.get("/", (req: Request, res: Response) => {
  try {
    const templates = db.getPitchTemplates();
    res.json({ success: true, templates });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/pitch-templates
 * Updates the default B2B sales pitch template for a specified industry category.
 */
router.post("/", (req: Request, res: Response) => {
  const { businessType, pitchText } = req.body;

  if (!businessType || !pitchText) {
    return res.status(400).json({ success: false, error: "businessType and pitchText are required." });
  }

  try {
    const template = db.upsertPitchTemplate(businessType as BusinessType, pitchText);
    res.json({ success: true, template });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export { router as pitchTemplatesRouter };
