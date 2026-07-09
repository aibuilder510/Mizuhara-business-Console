import fs from "fs";
import path from "path";

export type BusinessType = "salon" | "dental" | "gym" | "restaurant" | "cafe" | "real_estate" | "coaching" | "other";

export interface Call {
  id: string;
  phoneNumber: string;
  businessType: BusinessType;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  status: "completed" | "no_answer" | "voicemail" | "failed" | "do_not_call";
  recordingUrl?: string;
  transcript?: string;
  customPromptUsed?: string;
}

export interface PitchTemplate {
  id: string;
  businessType: BusinessType;
  pitchText: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  callId: string;
  businessName: string;
  contactName: string;
  leadScore: "hot" | "warm" | "cold" | "not_interested";
  summary: string;
  concernsRaised: string;
  followUpDate?: string;
  createdAt: string;
}

export interface DoNotCall {
  id: string;
  phoneNumber: string;
  reason: string;
  addedAt: string;
}

interface DatabaseSchema {
  calls: Call[];
  pitchTemplates: PitchTemplate[];
  leads: Lead[];
  doNotCallList: DoNotCall[];
}

const DB_FILE_PATH = path.join(process.cwd(), "database.json");

const DEFAULT_PITCHES: Record<BusinessType, string> = {
  salon: `Pitch online appointment booking, visual service menus with real-time slot availability, and clean stylist portfolios. Emphasize that 45% of beauty clients book after-hours, so a 24/7 self-service booking system immediately stops them from losing business to competitors.`,
  dental: `Pitch trust-building before-and-after galleries, dynamic patient review integrations, dental insurance coverage FAQs, and interactive digital intake forms. Explain how reducing friction for new patients booking initial exams directly increases high-value crown and implant cases.`,
  gym: `Pitch responsive class calendars, online membership registration, and personal trainer bios with testimonial carousels. Highlight how an interactive digital schedule makes it friction-free for walk-ins to sign up for trial classes, raising conversion rates.`,
  restaurant: `Pitch a stunning, easily-readable mobile menu, integrated direct-table booking, reviews section, and commission-free online ordering links. Emphasize saving 15-30% on third-party food portal fees by steering regular diners to order direct from their own beautiful site.`,
  cafe: `Pitch a gorgeous photo-rich menu, click-and-collect ordering capabilities, a digital loyalty card promo, and clear Google Maps integration. Highlight how a professional, quick-loading mobile web page captures local foot traffic searching for 'good coffee near me' in real-time.`,
  real_estate: `Pitch high-definition property listings with filter-based searching, agent bio cards, and a direct 'Schedule a Viewing' CTA. Emphasize that buyers expect smooth mobile walkthroughs, and having your own beautiful property hub builds premium developer/broker authority.`,
  coaching: `Pitch a neat course catalog, interactive introductory video sections, free webinar signup leads capture forms, and clean client testimonial sliders. Explain how a structured landing page converts social media followers into paid consultation clients far more reliably than cold DMs.`,
  other: `Pitch a sleek, high-conversion modern landing page with a direct contact/lead form, an interactive services slider, a clear 'About Us' section, and customer FAQs. Highlight that a fast, mobile-friendly landing page establishes business authority and turns cold traffic into warm leads.`
};

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = {
      calls: [],
      pitchTemplates: [],
      leads: [],
      doNotCallList: []
    };
    this.load();
    this.seed();
  }

  private load() {
    try {
      if (fs.existsSync(DB_FILE_PATH)) {
        const raw = fs.readFileSync(DB_FILE_PATH, "utf8");
        this.data = JSON.parse(raw);
      } else {
        this.save();
      }
    } catch (e) {
      console.error("Failed to load database. Initializing empty:", e);
    }
  }

  private save() {
    try {
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(this.data, null, 2), "utf8");
    } catch (e) {
      console.error("Failed to write database file:", e);
    }
  }

  private seed() {
    let changed = false;
    if (this.data.pitchTemplates.length === 0) {
      const types: BusinessType[] = ["salon", "dental", "gym", "restaurant", "cafe", "real_estate", "coaching", "other"];
      this.data.pitchTemplates = types.map((type, index) => ({
        id: `pitch_${type}`,
        businessType: type,
        pitchText: DEFAULT_PITCHES[type],
        updatedAt: new Date().toISOString()
      }));
      changed = true;
    }
    if (changed) {
      this.save();
    }
  }

  // --- Calls API ---
  getCalls(): Call[] {
    return [...this.data.calls].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  getCallById(id: string): Call | undefined {
    return this.data.calls.find(c => c.id === id);
  }

  createCall(call: Omit<Call, "id" | "startedAt">): Call {
    const newCall: Call = {
      ...call,
      id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      startedAt: new Date().toISOString()
    };
    this.data.calls.push(newCall);
    this.save();
    return newCall;
  }

  updateCall(id: string, updates: Partial<Call>): Call {
    const idx = this.data.calls.findIndex(c => c.id === id);
    if (idx === -1) throw new Error(`Call with ID ${id} not found`);
    this.data.calls[idx] = { ...this.data.calls[idx], ...updates };
    this.save();
    return this.data.calls[idx];
  }

  // --- Pitch Templates API ---
  getPitchTemplates(): PitchTemplate[] {
    return this.data.pitchTemplates;
  }

  getPitchTemplateByBusinessType(type: BusinessType): PitchTemplate | undefined {
    return this.data.pitchTemplates.find(p => p.businessType === type);
  }

  upsertPitchTemplate(type: BusinessType, text: string): PitchTemplate {
    const idx = this.data.pitchTemplates.findIndex(p => p.businessType === type);
    const now = new Date().toISOString();
    if (idx !== -1) {
      this.data.pitchTemplates[idx].pitchText = text;
      this.data.pitchTemplates[idx].updatedAt = now;
      this.save();
      return this.data.pitchTemplates[idx];
    } else {
      const newTemplate: PitchTemplate = {
        id: `pitch_${type}`,
        businessType: type,
        pitchText: text,
        updatedAt: now
      };
      this.data.pitchTemplates.push(newTemplate);
      this.save();
      return newTemplate;
    }
  }

  // --- Leads API ---
  getLeads(): Lead[] {
    return [...this.data.leads].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  createLead(lead: Omit<Lead, "id" | "createdAt">): Lead {
    const newLead: Lead = {
      ...lead,
      id: `lead_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      createdAt: new Date().toISOString()
    };
    this.data.leads.push(newLead);
    this.save();
    return newLead;
  }

  updateLead(id: string, updates: Partial<Lead>): Lead {
    const idx = this.data.leads.findIndex(l => l.id === id);
    if (idx === -1) throw new Error(`Lead with ID ${id} not found`);
    this.data.leads[idx] = { ...this.data.leads[idx], ...updates };
    this.save();
    return this.data.leads[idx];
  }

  // --- Do Not Call API ---
  getDNCList(): DoNotCall[] {
    return this.data.doNotCallList;
  }

  addToDNC(phoneNumber: string, reason: string): DoNotCall {
    const cleanPhone = phoneNumber.replace(/\s+/g, "");
    const existing = this.data.doNotCallList.find(d => d.phoneNumber.replace(/\s+/g, "") === cleanPhone);
    if (existing) return existing;

    const newDNC: DoNotCall = {
      id: `dnc_${Date.now()}`,
      phoneNumber,
      reason,
      addedAt: new Date().toISOString()
    };
    this.data.doNotCallList.push(newDNC);
    this.save();
    return newDNC;
  }

  removeFromDNC(phoneNumber: string) {
    const cleanPhone = phoneNumber.replace(/\s+/g, "");
    this.data.doNotCallList = this.data.doNotCallList.filter(d => d.phoneNumber.replace(/\s+/g, "") !== cleanPhone);
    this.save();
  }

  isInDNC(phoneNumber: string): boolean {
    const cleanPhone = phoneNumber.replace(/\s+/g, "");
    return this.data.doNotCallList.some(d => d.phoneNumber.replace(/\s+/g, "") === cleanPhone);
  }
}

export const db = new Database();
