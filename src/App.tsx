import React, { useState, useEffect, useRef } from "react";
import { 
  Phone, 
  PhoneOff, 
  Clock, 
  Activity, 
  Layers, 
  Sparkles, 
  ListTodo, 
  Settings, 
  Volume2, 
  User, 
  Tag, 
  UserCheck, 
  X, 
  Edit3, 
  Trash2, 
  Plus, 
  TrendingUp, 
  AlertOctagon, 
  FileText,
  Save,
  CheckCircle,
  Calendar
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { InkWaveform } from "./components/InkWaveform";

type BusinessType = "salon" | "dental" | "gym" | "restaurant" | "cafe" | "real_estate" | "coaching" | "other";

interface Call {
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

interface PitchTemplate {
  id: string;
  businessType: BusinessType;
  pitchText: string;
  updatedAt: string;
}

interface Lead {
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

interface DoNotCall {
  id: string;
  phoneNumber: string;
  reason: string;
  addedAt: string;
}

export default function App() {
  // Navigation tabs for the single screen layout
  const [activeTab, setActiveTab] = useState<"calls" | "leads" | "templates" | "dnc">("calls");
  
  // Lists
  const [calls, setCalls] = useState<Call[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [templates, setTemplates] = useState<PitchTemplate[]>([]);
  const [dncList, setDncList] = useState<DoNotCall[]>([]);

  // Call input form state
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState<BusinessType>("salon");
  const [customPromptEnabled, setCustomPromptEnabled] = useState(false);
  const [customPromptText, setCustomPromptText] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<"plivo" | "exotel">("plivo");

  // Active call state (synced with server telemetry)
  const [activeCall, setActiveCall] = useState<any>({
    isCallActive: false,
    callId: null,
    phoneNumber: "",
    businessType: "salon",
    userTranscript: [],
    modelTranscript: [],
    activeWaveformAmplitude: 0,
    provider: "plivo",
    status: "completed"
  });

  // UI state
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState("");
  
  // Follow up state
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpReason, setFollowUpReason] = useState("");
  
  // Editing template
  const [editingTemplate, setEditingTemplate] = useState<BusinessType | null>(null);
  const [templateEditText, setTemplateEditText] = useState("");

  // DNC Form
  const [newDncPhone, setNewDncPhone] = useState("");
  const [newDncReason, setNewDncReason] = useState("");
  const [reconnectTrigger, setReconnectTrigger] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);

  // Poll clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("en-US", { hour12: false }));
    };
    updateTime();
    const t = setInterval(updateTime, 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch all DB items
  const fetchAllData = async () => {
    try {
      const [resCalls, resLeads, resPitches, resDnc] = await Promise.all([
        fetch("/api/calls"),
        fetch("/api/leads"),
        fetch("/api/pitch-templates"),
        fetch("/api/leads/dnc")
      ]);
      
      const callsData = await resCalls.json();
      const leadsData = await resLeads.json();
      const pitchesData = await resPitches.json();
      const dncData = await resDnc.json();

      if (callsData.success) setCalls(callsData.calls);
      if (leadsData.success) setLeads(leadsData.leads);
      if (pitchesData.success) setTemplates(pitchesData.templates);
      if (dncData.success) setDncList(dncData.dncList);
    } catch (e) {
      console.error("Failed to load console data:", e);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // WebSocket connection for live telemetry stream
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}/stream/telemetry`;
    console.log(`[Telemetry] Connecting to ws: ${wsUrl}`);
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "telemetry" && data.activeCall) {
          setActiveCall(data.activeCall);
          
          // If a call was active and just transitioned to inactive, reload our lists
          if (!data.activeCall.isCallActive && activeCall.isCallActive) {
            fetchAllData();
          }
        }
      } catch (e) {
        console.error("Failed to parse telemetry:", e);
      }
    };

    ws.onerror = (error) => {
      console.warn("[Telemetry] WebSocket error/connection failure:", error);
    };

    ws.onclose = () => {
      console.log("[Telemetry] Socket closed. Reconnecting in 3s...");
      setTimeout(() => {
        setReconnectTrigger(prev => prev + 1);
      }, 3000);
    };

    return () => {
      if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
        try {
          ws.close();
        } catch (e) {
          // Silent catch
        }
      }
    };
  }, [activeCall.isCallActive, reconnectTrigger]);

  // Set the prompt preview box
  const selectedTemplate = templates.find(t => t.businessType === selectedIndustry);
  
  // Dynamic custom text initialization
  useEffect(() => {
    if (selectedTemplate && !customPromptEnabled) {
      setCustomPromptText(selectedTemplate.pitchText);
    }
  }, [selectedIndustry, templates, customPromptEnabled]);

  // Trigger outbound call
  const handleStartCall = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!phoneNumber) {
      setErrorMessage("Please supply a valid telephone number.");
      return;
    }

    try {
      const response = await fetch("/api/calls/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          businessType: selectedIndustry,
          customPrompt: customPromptEnabled ? customPromptText : undefined,
          provider: selectedProvider
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        setErrorMessage(data.error || "Failed to launch outbound agent.");
      } else {
        setSuccessMessage("AI Outreach Agent connected to telephony trunk.");
        fetchAllData();
      }
    } catch (e: any) {
      setErrorMessage("Outbound trunk timeout. Please check your network connection.");
    }
  };

  // Trigger hang up
  const handleHangUp = async () => {
    try {
      const response = await fetch("/api/calls/hangup", { method: "POST" });
      const data = await response.json();
      if (data.success) {
        setSuccessMessage("Call successfully disconnected.");
        fetchAllData();
      }
    } catch (e) {
      setErrorMessage("Failed to disconnect call.");
    }
  };

  // Save follow-up action
  const handleScheduleFollowUp = async (callId: string) => {
    if (!followUpDate || !followUpReason) {
      setErrorMessage("Please provide both follow-up date and task details.");
      return;
    }

    try {
      // Find the lead associated with this call
      const lead = leads.find(l => l.callId === callId);
      if (!lead) {
        setErrorMessage("Please wait for post-call analysis to generate a Lead first.");
        return;
      }

      const response = await fetch(`/api/leads/${lead.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          followUpDate,
          summary: `${lead.summary}\n\n[Scheduled Follow-up for ${followUpDate}]: ${followUpReason}`
        })
      });

      if (response.ok) {
        setSuccessMessage(`Follow-up scheduled successfully on ${followUpDate}`);
        setFollowUpDate("");
        setFollowUpReason("");
        fetchAllData();
        // Refresh detail view
        const updatedCall = calls.find(c => c.id === callId);
        if (updatedCall) setSelectedCall(updatedCall);
      }
    } catch (e) {
      setErrorMessage("Failed to schedule follow-up.");
    }
  };

  // Add to DNC list
  const handleAddToDnc = async (phone: string, reason: string) => {
    try {
      const response = await fetch("/api/leads/dnc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone, reason })
      });
      if (response.ok) {
        setSuccessMessage(`Added ${phone} to Do Not Call list.`);
        setNewDncPhone("");
        setNewDncReason("");
        fetchAllData();
      }
    } catch (e) {
      setErrorMessage("Failed to add to DNC.");
    }
  };

  // Remove from DNC list
  const handleRemoveFromDnc = async (phone: string) => {
    try {
      const response = await fetch(`/api/leads/dnc/${encodeURIComponent(phone)}`, {
        method: "DELETE"
      });
      if (response.ok) {
        setSuccessMessage("Removed number from DNC list.");
        fetchAllData();
      }
    } catch (e) {
      setErrorMessage("Failed to remove from DNC.");
    }
  };

  // Update pitch template
  const handleUpdateTemplate = async (type: BusinessType) => {
    try {
      const response = await fetch("/api/pitch-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessType: type, pitchText: templateEditText })
      });
      if (response.ok) {
        setSuccessMessage(`Updated pitch template for ${type}`);
        setEditingTemplate(null);
        fetchAllData();
      }
    } catch (e) {
      setErrorMessage("Failed to save template.");
    }
  };

  return (
    <div className="min-h-screen bg-linen text-charcoal font-sans overflow-x-hidden flex flex-col selection:bg-plum/20 selection:text-plum">
      
      {/* Top Console Strip */}
      <header className="h-16 flex items-center justify-between px-6 md:px-8 border-b border-border-custom shrink-0 bg-paper/60 backdrop-blur-md relative z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-plum text-paper shadow-sm">
            <span className="font-serif font-bold text-lg italic">M</span>
          </div>
          <h1 className="font-serif font-bold tracking-tight text-base md:text-xl text-charcoal flex items-baseline">
            Mizuhara 
            <span className="font-sans font-medium text-taupe text-[10px] tracking-widest uppercase ml-2.5 border-l border-border-custom/85 pl-2.5 hidden sm:inline">
              Outbound Dispatch Console
            </span>
          </h1>
        </div>
        
        {/* Status indicator and system clock */}
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2 bg-linen px-3 py-1.5 rounded-full border border-border-custom/80 shadow-sm">
            <div className={`w-2 h-2 rounded-full ${activeCall.isCallActive ? "bg-verdant animate-pulse" : "bg-warmgrey"}`} />
            <span className={`font-mono text-[10px] tracking-wider uppercase font-semibold ${activeCall.isCallActive ? "text-verdant" : "text-taupe"}`}>
              {activeCall.isCallActive ? `Line Live: ${activeCall.status}` : "Dispatch Idle"}
            </span>
          </div>
          <div className="hidden md:block w-px h-5 bg-border-custom"></div>
          <div className="hidden md:flex items-center gap-2 text-taupe text-xs font-mono">
            <span>{new Date().toISOString().split('T')[0]}</span>
            <span className="opacity-40">•</span>
            <span className="text-charcoal font-semibold">{currentTime || "00:00:00"}</span>
          </div>
        </div>
      </header>

      {/* Signature Element: Thin horizontal animated waveform strip */}
      <InkWaveform isLive={activeCall.isCallActive} amplitude={activeCall.activeWaveformAmplitude} />

      {/* Main Console Workspace */}
      <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side: Outbound Operations Control Panel */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="lg:col-span-5 space-y-8"
        >
          <div className="bg-paper border border-border-custom rounded-2xl p-6 shadow-[0_4px_24px_rgba(43,38,32,0.04)] relative overflow-hidden">
            {/* Ambient background accent */}
            <div className="absolute top-0 right-0 w-36 h-36 bg-plum/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex items-center gap-2.5 mb-6 border-b border-border-custom/60 pb-4">
              <Phone className="w-4 h-4 text-plum" />
              <h2 className="font-serif text-[11px] uppercase tracking-widest font-bold text-charcoal">
                Outbound Dispatch Control
              </h2>
            </div>

            {/* Error and Success Banners */}
            <AnimatePresence>
              {errorMessage && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-red-50 border border-red-200 text-red-800 text-xs p-3.5 rounded-xl flex items-start gap-2.5 mb-5 font-sans"
                >
                  <AlertOctagon className="w-4 h-4 flex-shrink-0 text-red-600 mt-0.5" />
                  <span>{errorMessage}</span>
                </motion.div>
              )}
              {successMessage && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-green-50 border border-green-200 text-green-800 text-xs p-3.5 rounded-xl flex items-start gap-2.5 mb-5 font-sans"
                >
                  <CheckCircle className="w-4 h-4 flex-shrink-0 text-green-600 mt-0.5" />
                  <span>{successMessage}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Form Inputs */}
            <div className="space-y-5">
              <div>
                <label className="block font-serif text-[10px] uppercase tracking-widest text-taupe mb-2 font-semibold">
                  Prospect Phone Number
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-taupe font-mono text-sm border-r border-border-custom/70 pr-3">+91</span>
                  <input
                    type="tel"
                    placeholder="98765 43210"
                    disabled={activeCall.isCallActive}
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full bg-linen/35 border border-border-custom rounded-xl pl-16 pr-4 py-3 font-mono text-sm text-charcoal focus:outline-none focus:border-plum focus:bg-paper focus:ring-1 focus:ring-plum/10 transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="block font-serif text-[10px] uppercase tracking-widest text-taupe mb-2 font-semibold">
                  Provider Adapter
                </label>
                <div className="grid grid-cols-2 gap-1 bg-linen/50 p-1 rounded-xl border border-border-custom relative overflow-hidden">
                  {[
                    { id: "plivo", label: "Plivo XML" },
                    { id: "exotel", label: "Exotel REST" }
                  ].map((prov) => {
                    const isActive = selectedProvider === prov.id;
                    return (
                      <button
                        key={prov.id}
                        type="button"
                        onClick={() => setSelectedProvider(prov.id as any)}
                        disabled={activeCall.isCallActive}
                        className="py-2.5 px-3 rounded-lg font-mono text-xs transition-all relative z-10 disabled:opacity-50 cursor-pointer text-center flex items-center justify-center font-medium"
                        style={{ color: isActive ? "#FFFDF8" : "#7A7267" }}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="active_provider_indicator"
                            className="absolute inset-0 bg-plum rounded-lg shadow-sm"
                            style={{ zIndex: -1 }}
                            transition={{ type: "spring", stiffness: 380, damping: 28 }}
                          />
                        )}
                        <span className="relative">{prov.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block font-serif text-[10px] uppercase tracking-widest text-taupe mb-2 font-semibold">
                  Prospect Industry Segment
                </label>
                <div className="grid grid-cols-3 gap-1 bg-linen/50 p-1.5 rounded-xl border border-border-custom relative overflow-hidden">
                  {(["salon", "dental", "gym", "restaurant", "cafe", "real_estate", "coaching", "other"] as BusinessType[]).map((type) => {
                    const isActive = selectedIndustry === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        disabled={activeCall.isCallActive}
                        onClick={() => setSelectedIndustry(type)}
                        className="py-2 px-1.5 rounded-lg text-center capitalize font-mono text-[10px] tracking-wider transition-all cursor-pointer relative z-10 disabled:opacity-50 text-center flex items-center justify-center font-semibold"
                        style={{ color: isActive ? "#FFFDF8" : "#7A7267" }}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="active_industry_indicator"
                            className="absolute inset-0 bg-plum rounded-lg shadow-sm"
                            style={{ zIndex: -1 }}
                            transition={{ type: "spring", stiffness: 350, damping: 28 }}
                          />
                        )}
                        <span className="relative">{type.replace("_", " ")}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border border-border-custom/80 rounded-xl p-4.5 bg-linen/20">
                <div className="flex justify-between items-center mb-3">
                  <label className="font-serif text-[10px] uppercase tracking-widest text-taupe font-semibold">
                    Task Briefing For Call (Layer 2)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-taupe">Override Prompt</span>
                    <button
                      type="button"
                      disabled={activeCall.isCallActive}
                      onClick={() => setCustomPromptEnabled(!customPromptEnabled)}
                      className={`w-8 h-4.5 rounded-full relative transition-colors ${customPromptEnabled ? "bg-plum" : "bg-warmgrey/30"}`}
                    >
                      <motion.div 
                        layout 
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        className={`w-3 h-3 bg-paper rounded-full absolute top-[3px] ${customPromptEnabled ? "right-[3px]" : "left-[3px]"}`} 
                      />
                    </button>
                  </div>
                </div>

                {customPromptEnabled ? (
                  <textarea
                    rows={4}
                    disabled={activeCall.isCallActive}
                    value={customPromptText}
                    onChange={(e) => setCustomPromptText(e.target.value)}
                    className="w-full bg-paper border border-border-custom text-xs text-charcoal p-3 rounded-lg focus:outline-none focus:border-plum focus:ring-1 focus:ring-plum/10 transition-all font-sans"
                  />
                ) : (
                  <p className="text-xs text-taupe leading-relaxed italic bg-paper border border-border-custom/40 p-3 rounded-lg font-sans">
                    {selectedTemplate?.pitchText || "No default briefing available."}
                  </p>
                )}
              </div>

              {/* Call Controls */}
              <div className="pt-2">
                {activeCall.isCallActive ? (
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={handleHangUp}
                    className="w-full py-4 px-6 rounded-xl bg-red-600 text-paper font-serif text-xs uppercase tracking-widest hover:bg-red-500 shadow-[0_4px_12px_rgba(220,38,38,0.15)] flex items-center justify-center gap-2.5 cursor-pointer transition-all font-semibold"
                  >
                    <PhoneOff className="w-4 h-4 animate-pulse" />
                    Terminate Call Session
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleStartCall}
                    className="w-full py-4 px-6 rounded-xl bg-plum text-paper font-semibold font-serif text-xs uppercase tracking-widest hover:bg-plum/95 shadow-[0_4px_14px_rgba(91,58,107,0.2)] flex items-center justify-center gap-2.5 cursor-pointer transition-all"
                  >
                    <Phone className="w-4 h-4" />
                    Place Outbound Call
                  </motion.button>
                )}
              </div>
            </div>
          </div>

          {/* Mini Live Dashboard Feed */}
          {activeCall.isCallActive && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-paper border border-border-custom rounded-2xl p-6 shadow-[0_4px_24px_rgba(43,38,32,0.04)] space-y-4"
            >
              <div className="flex justify-between items-center border-b border-border-custom/60 pb-3">
                <span className="font-serif text-xs uppercase tracking-widest text-plum flex items-center gap-2 font-bold">
                  <Activity className="w-3.5 h-3.5 animate-pulse text-plum" />
                  Live Audio Log
                </span>
                <span className="font-mono text-xs text-taupe">{activeCall.phoneNumber}</span>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-3.5 pr-2 scrollbar-thin">
                {activeCall.modelTranscript.map((t: string, i: number) => (
                  <div key={`m-${i}`} className="space-y-2">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-plum font-semibold">Mizuhara</span>
                    <p className="text-xs text-charcoal leading-relaxed bg-linen/35 p-3 rounded-lg border-l-2 border-plum font-sans">{t}</p>
                    {activeCall.userTranscript[i] && (
                      <div className="space-y-1 mt-2 text-right">
                        <span className="font-mono text-[9px] uppercase tracking-wider text-verdant font-semibold">Prospect</span>
                        <p className="text-xs text-charcoal leading-relaxed bg-verdant/5 p-3 rounded-lg border-r-2 border-verdant inline-block text-left max-w-[90%] font-sans">{activeCall.userTranscript[i]}</p>
                      </div>
                    )}
                  </div>
                ))}
                {activeCall.modelTranscript.length === 0 && (
                  <p className="text-xs text-taupe italic text-center py-6 font-serif">Connecting audio session pipeline...</p>
                )}
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Right Side: Log Console / Leads Ledger / Templates and DNC Tabs */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease: "easeOut" }}
          className="lg:col-span-7 flex flex-col space-y-5"
        >
          
          {/* Navigation Controls */}
          <div className="bg-linen p-1.5 rounded-xl border border-border-custom flex gap-1 relative overflow-hidden z-10">
            {([
              { id: "calls", label: "Call History" },
              { id: "leads", label: "Leads Ledger" },
              { id: "templates", label: "Industry Pitches" },
              { id: "dnc", label: "DNC Registry" }
            ] as const).map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className="flex-1 py-2.5 px-3 rounded-lg text-center font-serif text-xs font-semibold tracking-wide transition-colors duration-200 z-10 cursor-pointer relative"
                  style={{ color: isActive ? "#FFFDF8" : "#7A7267" }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active_tab_indicator"
                      className="absolute inset-0 bg-plum rounded-lg shadow-sm"
                      style={{ zIndex: -1 }}
                      transition={{ type: "spring", stiffness: 380, damping: 28 }}
                    />
                  )}
                  <span className="relative">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Contents */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex-1 min-h-[500px]"
            >
              
              {/* CALL HISTORY TAB */}
              {activeTab === "calls" && (
                <div className="bg-paper border border-border-custom rounded-2xl p-6 shadow-[0_4px_24px_rgba(43,38,32,0.04)] h-full flex flex-col justify-between">
                  <div className="space-y-4 w-full">
                    <div className="flex justify-between items-center border-b border-border-custom/60 pb-4">
                      <h3 className="font-serif text-xs uppercase tracking-widest font-bold text-charcoal">
                        Telephony Call Dispatch Logs
                      </h3>
                      <span className="font-mono text-[10px] text-taupe font-medium">{calls.length} entries</span>
                    </div>

                    <div className="space-y-3.5 max-h-[480px] overflow-y-auto pr-2 scrollbar-thin">
                      {calls.map((call) => {
                        const lead = leads.find(l => l.callId === call.id);
                        return (
                          <motion.div
                            layout
                            key={call.id}
                            onClick={() => setSelectedCall(call)}
                            className="bg-linen/25 border border-border-custom/60 hover:border-plum/40 p-4.5 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all cursor-pointer hover:bg-paper hover:shadow-[0_4px_16px_rgba(43,38,32,0.03)]"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-plum font-bold">{call.id.slice(0, 11)}</span>
                                <span className="font-mono text-[9px] text-taupe capitalize bg-linen border border-border-custom/60 px-2.5 py-0.5 rounded font-semibold">
                                  {call.businessType}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-charcoal">
                                <Phone className="w-3 h-3 text-taupe" />
                                <span className="font-mono text-sm font-semibold">{call.phoneNumber}</span>
                              </div>
                              <div className="text-[10px] text-taupe font-mono">
                                {new Date(call.startedAt).toLocaleString()}
                              </div>
                            </div>

                            <div className="flex md:flex-col items-end gap-2 w-full md:w-auto justify-between md:justify-start">
                              {/* Disposition badge - opacity fill with border */}
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono tracking-wider font-bold ${
                                call.status === "completed" ? "bg-verdant/15 text-verdant border border-verdant/30" :
                                call.status === "no_answer" ? "bg-gold/15 text-gold border border-gold/30" :
                                call.status === "voicemail" ? "bg-gold/10 text-gold/90 border border-gold/25" :
                                "bg-warmgrey/15 text-taupe border border-warmgrey/30"
                              }`}>
                                {call.status}
                              </span>

                              {/* Lead Score Badge */}
                              {lead && (
                                <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase font-mono tracking-widest font-bold ${
                                  lead.leadScore === "hot" ? "bg-verdant/15 text-verdant border border-verdant/30" :
                                  lead.leadScore === "warm" ? "bg-gold/15 text-gold border border-gold/30" :
                                  "bg-linen text-taupe border border-border-custom"
                                }`}>
                                  {lead.leadScore} Lead
                                </span>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}

                      {calls.length === 0 && (
                        <div className="text-center py-20 space-y-3">
                          <Phone className="w-8 h-8 text-warmgrey/30 mx-auto animate-pulse" />
                          <p className="font-serif text-xs text-taupe italic">
                            No calls yet — start one above to see it here.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* LEADS LEDGER TAB */}
              {activeTab === "leads" && (
                <div className="bg-paper border border-border-custom rounded-2xl p-6 shadow-[0_4px_24px_rgba(43,38,32,0.04)] h-full">
                  <div className="flex justify-between items-center border-b border-border-custom/60 pb-4 mb-4">
                    <h3 className="font-serif text-xs uppercase tracking-widest font-bold text-charcoal">
                      Extracted Lead Ledger
                    </h3>
                    <span className="font-mono text-[10px] text-taupe font-medium">{leads.length} leads total</span>
                  </div>

                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin">
                    {leads.map((lead) => (
                      <div key={lead.id} className="bg-linen/25 border border-border-custom/60 p-5 rounded-xl space-y-3 hover:border-plum/30 transition-all">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-serif text-sm font-semibold text-charcoal">{lead.businessName}</h4>
                            <span className="text-xs text-taupe font-sans">Contact: {lead.contactName}</span>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-[9px] uppercase font-mono tracking-widest font-bold ${
                            lead.leadScore === "hot" ? "bg-verdant/15 text-verdant border border-verdant/30" :
                            lead.leadScore === "warm" ? "bg-gold/15 text-gold border border-gold/30" :
                            "bg-warmgrey/15 text-taupe border border-warmgrey/30"
                          }`}>
                            {lead.leadScore}
                          </span>
                        </div>

                        <p className="text-xs text-taupe leading-relaxed font-sans">{lead.summary}</p>
                        
                        {lead.concernsRaised && (
                          <div className="text-[11px] bg-red-500/5 text-red-700 p-2.5 rounded-lg border border-red-500/20 font-sans">
                            <span className="font-serif font-bold block mb-1">Objections / Obstacles:</span>
                            {lead.concernsRaised}
                          </div>
                        )}

                        <div className="flex justify-between items-center text-[10px] font-mono text-taupe pt-2 border-t border-border-custom/40">
                          <span>Lead Date: {new Date(lead.createdAt).toLocaleDateString()}</span>
                          {lead.followUpDate ? (
                            <span className="flex items-center gap-1 text-gold font-bold">
                              <Calendar className="w-3.5 h-3.5" />
                              Follow up: {lead.followUpDate}
                            </span>
                          ) : (
                            <span className="text-warmgrey italic">No follow up scheduled</span>
                          )}
                        </div>
                      </div>
                    ))}

                    {leads.length === 0 && (
                      <div className="text-center py-20">
                        <TrendingUp className="w-8 h-8 text-warmgrey/30 mx-auto mb-2" />
                        <p className="text-xs text-taupe font-serif italic">No qualified leads saved in registry yet.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* INDUSTRY PITCHES TAB */}
              {activeTab === "templates" && (
                <div className="bg-paper border border-border-custom rounded-2xl p-6 shadow-[0_4px_24px_rgba(43,38,32,0.04)] h-full">
                  <div className="border-b border-border-custom/60 pb-4 mb-4">
                    <h3 className="font-serif text-xs uppercase tracking-widest font-bold text-charcoal">
                      B2B Industry Pitch Templates (Layer 2)
                    </h3>
                    <p className="text-[11px] text-taupe mt-1 leading-relaxed font-sans">
                      Mizuhara uses these customized briefs to highlight industry-specific features like appointment booking systems, portfolios, or menu solutions.
                    </p>
                  </div>

                  <div className="space-y-4 max-h-[480px] overflow-y-auto pr-2 scrollbar-thin">
                    {templates.map((tpl) => (
                      <div key={tpl.id} className="bg-linen/25 border border-border-custom/60 p-4.5 rounded-xl space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="font-mono text-[10px] font-semibold text-plum capitalize bg-paper border border-border-custom px-3 py-1 rounded-md">
                            {tpl.businessType.replace("_", " ")}
                          </span>
                          {editingTemplate === tpl.businessType ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleUpdateTemplate(tpl.businessType)}
                                className="p-1 px-2.5 rounded bg-verdant text-paper font-serif text-[10px] font-semibold cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTemplate(null)}
                                className="p-1 px-2.5 rounded bg-paper border border-border-custom text-charcoal font-serif text-[10px] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTemplate(tpl.businessType);
                                setTemplateEditText(tpl.pitchText);
                              }}
                              className="p-1 text-taupe hover:text-plum transition-colors flex items-center gap-1 font-serif text-[10px] cursor-pointer font-medium"
                            >
                              <Edit3 className="w-3 h-3" />
                              Edit Brief
                            </button>
                          )}
                        </div>

                        {editingTemplate === tpl.businessType ? (
                          <textarea
                            rows={4}
                            value={templateEditText}
                            onChange={(e) => setTemplateEditText(e.target.value)}
                            className="w-full bg-paper text-xs text-charcoal p-3 rounded-lg focus:outline-none focus:border-plum border border-border-custom font-sans"
                          />
                        ) : (
                          <p className="text-xs text-charcoal leading-relaxed font-sans">{tpl.pitchText}</p>
                        )}
                        
                        <div className="text-[9px] text-taupe font-mono text-right">
                          Last edited: {new Date(tpl.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* DNC REGISTRY TAB */}
              {activeTab === "dnc" && (
                <div className="bg-paper border border-border-custom rounded-2xl p-6 shadow-[0_4px_24px_rgba(43,38,32,0.04)] h-full flex flex-col justify-between">
                  <div className="space-y-4 w-full">
                    <div className="border-b border-border-custom/60 pb-4">
                      <h3 className="font-serif text-xs uppercase tracking-widest font-bold text-charcoal">
                        Do-Not-Call (DNC) Blacklist Registry
                      </h3>
                      <p className="text-[11px] text-taupe mt-1 leading-relaxed font-sans">
                        Numbers added here are hard-blocked by our telephony provider. No sales representative calls can bypass this registry.
                      </p>
                    </div>

                    {/* Add DNC Form */}
                    <div className="bg-linen/25 p-4 border border-border-custom/60 rounded-xl space-y-3.5">
                      <span className="font-serif text-[10px] uppercase tracking-widest text-plum block font-bold">Add Blacklist Entry</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="Phone Number"
                          value={newDncPhone}
                          onChange={(e) => setNewDncPhone(e.target.value)}
                          className="bg-paper border border-border-custom text-xs p-2.5 rounded focus:outline-none focus:border-plum font-mono text-charcoal"
                        />
                        <input
                          type="text"
                          placeholder="Reason (e.g. Requested removal)"
                          value={newDncReason}
                          onChange={(e) => setNewDncReason(e.target.value)}
                          className="bg-paper border border-border-custom text-xs p-2.5 rounded focus:outline-none focus:border-plum font-sans text-charcoal"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddToDnc(newDncPhone, newDncReason)}
                        className="py-2.5 px-4 rounded bg-plum text-paper font-semibold font-serif text-[10px] uppercase tracking-wider hover:bg-plum/90 cursor-pointer shadow-sm transition-all"
                      >
                        Add to Blacklist
                      </button>
                    </div>

                    {/* List DNC */}
                    <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2 scrollbar-thin">
                      {dncList.map((dnc) => (
                        <div key={dnc.id} className="flex justify-between items-center p-3 border border-border-custom bg-linen/10 rounded-lg">
                          <div>
                            <span className="font-mono text-xs font-bold text-charcoal block">{dnc.phoneNumber}</span>
                            <span className="text-[10px] text-taupe italic font-sans">Reason: {dnc.reason}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveFromDnc(dnc.phoneNumber)}
                            className="text-red-500 hover:text-red-600 p-1 cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}

                      {dncList.length === 0 && (
                        <p className="text-xs text-taupe text-center italic py-6 font-serif">DNC Registry is currently empty.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </motion.div>

      </main>

      {/* DETAIL VIEW DRAWER */}
      <AnimatePresence>
        {selectedCall && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.35 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedCall(null)}
              className="fixed inset-0 bg-charcoal/30 backdrop-blur-[2px] z-40"
            />

            {/* Sliding Drawer */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 210 }}
              className="fixed top-0 right-0 h-full w-full max-w-xl bg-paper border-l border-border-custom z-50 p-6 flex flex-col justify-between shadow-[0_0_50px_rgba(43,38,32,0.1)] overflow-y-auto"
            >
              <div className="space-y-6 flex-1 overflow-y-auto pr-2 scrollbar-thin">
                {/* Header */}
                <div className="flex justify-between items-start border-b border-border-custom/60 pb-4">
                  <div>
                    <span className="font-serif text-[10px] tracking-widest text-plum block font-semibold">CALL LOG DISPATCH REPORT</span>
                    <h2 className="font-mono text-sm font-bold text-charcoal mt-1">{selectedCall.id}</h2>
                    <span className="text-xs text-taupe">Initiated at: {new Date(selectedCall.startedAt).toLocaleString()}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCall(null)}
                    className="p-1.5 bg-linen/50 border border-border-custom hover:text-plum rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Call Metadata Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-linen/25 p-3.5 rounded-xl border border-border-custom/50">
                    <span className="text-[10px] font-serif text-taupe uppercase tracking-widest font-semibold">Phone Number</span>
                    <p className="font-mono text-sm font-bold text-charcoal mt-1">{selectedCall.phoneNumber}</p>
                  </div>
                  <div className="bg-linen/25 p-3.5 rounded-xl border border-border-custom/50">
                    <span className="text-[10px] font-serif text-taupe uppercase tracking-widest font-semibold">Industry Segment</span>
                    <p className="font-mono text-sm font-bold text-charcoal capitalize mt-1">{selectedCall.businessType}</p>
                  </div>
                  <div className="bg-linen/25 p-3.5 rounded-xl border border-border-custom/50">
                    <span className="text-[10px] font-serif text-taupe uppercase tracking-widest font-semibold">Trunk Duration</span>
                    <p className="font-mono text-sm font-bold text-charcoal mt-1">
                      {selectedCall.durationSeconds ? `${selectedCall.durationSeconds}s` : "0s"}
                    </p>
                  </div>
                  <div className="bg-linen/25 p-3.5 rounded-xl border border-border-custom/50">
                    <span className="text-[10px] font-serif text-taupe uppercase tracking-widest font-semibold">Disposition status</span>
                    <p className="font-mono text-sm font-bold text-charcoal capitalize mt-1">{selectedCall.status}</p>
                  </div>
                </div>

                {/* Associated Lead Summary */}
                {leads.find(l => l.callId === selectedCall.id) ? (
                  <div className="bg-verdant/5 border border-verdant/20 p-5 rounded-xl space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-serif text-[10px] tracking-widest text-verdant font-bold">EXTRACTED QUALIFIED LEAD</span>
                      <span className="font-mono text-[9px] bg-verdant/20 text-verdant font-bold px-2.5 py-0.5 rounded-full border border-verdant/35">
                        {leads.find(l => l.callId === selectedCall.id)?.leadScore}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-serif text-sm font-bold text-charcoal">{leads.find(l => l.callId === selectedCall.id)?.businessName}</h4>
                      <p className="text-xs text-taupe mt-1 font-sans">Contact: {leads.find(l => l.callId === selectedCall.id)?.contactName}</p>
                    </div>

                    <p className="text-xs text-charcoal leading-relaxed bg-paper p-3.5 rounded-lg border border-border-custom/50 font-sans">
                      {leads.find(l => l.callId === selectedCall.id)?.summary}
                    </p>
                  </div>
                ) : (
                  <div className="bg-linen/20 p-4.5 rounded-xl border border-border-custom/50 text-center italic text-xs text-taupe font-serif">
                    Post-call lead analysis wasn't generated for this record (possibly because the line was not answered).
                  </div>
                )}

                {/* Full Transcript scroll */}
                <div className="space-y-3">
                  <span className="font-serif text-[10px] tracking-widest text-taupe block font-semibold">CONVERSATION RECORDING TRANSCRIPT</span>
                  <div className="bg-linen/15 border border-border-custom/60 p-4.5 rounded-xl max-h-60 overflow-y-auto space-y-3.5 text-xs">
                    {selectedCall.transcript ? (
                      selectedCall.transcript.split("\n").map((line, idx) => {
                        const isMizuhara = line.startsWith("Mizuhara:");
                        const text = line.replace(/^(Mizuhara:|Prospect:)/, "").trim();
                        return (
                          <div key={idx} className="space-y-1">
                            <span className={`font-mono text-[9px] uppercase tracking-wider font-semibold ${isMizuhara ? "text-plum" : "text-verdant"}`}>
                              {isMizuhara ? "Mizuhara (AI Rep)" : "Prospect"}
                            </span>
                            <p className="leading-relaxed text-charcoal font-sans">{text}</p>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-taupe italic text-center py-6 font-serif">No transcript lines captured for this session.</p>
                    )}
                  </div>
                </div>

                {/* Schedule follow up block (Only if lead exists) */}
                {leads.find(l => l.callId === selectedCall.id) && (
                  <div className="bg-paper border border-border-custom p-4.5 rounded-xl space-y-4">
                    <span className="font-serif text-[10px] tracking-widest text-gold font-bold block uppercase">
                      Action Required: Schedule Lead follow-up
                    </span>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-serif font-semibold text-taupe mb-1">Follow up Target Date</label>
                        <input
                          type="date"
                          value={followUpDate}
                          onChange={(e) => setFollowUpDate(e.target.value)}
                          className="w-full bg-linen/20 border border-border-custom text-xs p-2.5 rounded text-charcoal font-mono focus:outline-none focus:border-plum"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-serif font-semibold text-taupe mb-1">Task Reason / Message Details</label>
                        <input
                          type="text"
                          placeholder="Send WhatsApp custom pricing details"
                          value={followUpReason}
                          onChange={(e) => setFollowUpReason(e.target.value)}
                          className="w-full bg-linen/20 border border-border-custom text-xs p-2.5 rounded text-charcoal focus:outline-none focus:border-plum"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleScheduleFollowUp(selectedCall.id)}
                        className="py-2.5 px-4 rounded bg-plum text-paper font-semibold font-serif text-[10px] uppercase tracking-wider hover:bg-plum/90 w-full cursor-pointer shadow-sm transition-all"
                      >
                        Schedule follow-up WhatsApp
                      </button>
                    </div>
                  </div>
                )}

                {/* DNC manual add option */}
                <div className="bg-red-50 border border-red-200/65 p-4 rounded-xl flex justify-between items-center">
                  <div>
                    <span className="font-serif text-xs font-bold text-red-800 block">DNC Blacklist Registry</span>
                    <span className="text-[10px] text-taupe italic font-sans">Request blacklisting for this number</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddToDnc(selectedCall.phoneNumber, "Explicitly asked to stop calling during conversation")}
                    className="py-1.5 px-3 rounded bg-red-600 text-paper hover:bg-red-500 text-[10px] font-serif font-semibold uppercase tracking-wider cursor-pointer shadow-sm"
                  >
                    Add to DNC
                  </button>
                </div>

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Professional Polish Theme Footer */}
      <footer className="h-14 bg-paper/60 border-t border-border-custom px-6 md:px-8 flex items-center justify-between text-[10px] font-mono shrink-0 text-taupe mt-auto w-full z-20">
        <div className="flex gap-4 md:gap-6">
          <span>VOICE: GEMINI_LIVE_HD_FMT</span>
          <span>SIP: {selectedProvider.toUpperCase()}_ADAPTER_ACTIVE</span>
          <span className="hidden sm:inline">REG: MUMBAI_WEST_02</span>
        </div>
        <div className="flex gap-4 items-center">
          <span className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-verdant" /> DB CONNECTED
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-verdant animate-pulse" /> LATENCY: {activeCall.isCallActive ? "18ms" : "24ms"}
          </span>
        </div>
      </footer>

    </div>
  );
}
