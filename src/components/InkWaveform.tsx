import React, { useState, useEffect } from "react";
import { motion } from "motion/react";

interface InkWaveformProps {
  isLive: boolean;
  amplitude: number;
}

export function InkWaveform({ isLive, amplitude }: InkWaveformProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    let animationId: number;
    const tick = () => {
      setPhase((prev) => (prev + 0.05) % (Math.PI * 2));
      animationId = requestAnimationFrame(tick);
    };
    animationId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationId);
  }, []);

  // Width & height details for the smooth ink trace
  const width = 1200;
  const height = 48;
  const centerY = height / 2;
  const pointsCount = 100;
  const dx = width / (pointsCount - 1);

  let pathData = "";
  for (let i = 0; i < pointsCount; i++) {
    const x = i * dx;
    let yOffset = 0;

    if (isLive) {
      // Live waveform reacts to real amplitude
      const ampMultiplier = amplitude > 0 ? amplitude * 22 : 6;
      // Combine low frequency wave with high-frequency jiggles
      yOffset = Math.sin(i * 0.18 - phase * 3.5) * Math.cos(i * 0.07 + phase) * ampMultiplier;
      yOffset += Math.sin(i * 0.45 + phase * 5.2) * (ampMultiplier * 0.25);
    } else {
      // Idle organic wobble (calm, resting pen)
      yOffset = Math.sin(i * 0.1 - phase * 0.7) * Math.cos(i * 0.04 + phase * 0.3) * 1.5;
    }

    const y = centerY + yOffset;
    if (i === 0) {
      pathData += `M ${x} ${y}`;
    } else {
      pathData += ` L ${x} ${y}`;
    }
  }

  return (
    <div className="h-14 bg-paper/65 border-b border-border-custom overflow-hidden relative flex items-center justify-center px-8">
      {/* Editorial Gridlines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#E5DFD5_1px,transparent_1px),linear-gradient(to_bottom,#E5DFD5_1px,transparent_1px)] bg-[size:40px_16px] opacity-15 pointer-events-none" />
      <div className="absolute inset-x-0 h-px bg-border-custom/50 top-1/2 -translate-y-1/2 pointer-events-none" />
      
      <svg 
        className="w-full h-full relative z-10" 
        viewBox={`0 0 ${width} ${height}`} 
        preserveAspectRatio="none"
      >
        {/* Soft feather shadow under ink stroke */}
        <path
          d={pathData}
          fill="none"
          stroke="#5B3A6B"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-25"
          style={{ transform: "translateY(0.75px)" }}
        />
        {/* Main premium Ink line */}
        <path
          d={pathData}
          fill="none"
          stroke="#5B3A6B"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            filter: "drop-shadow(0px 1px 1px rgba(91, 58, 107, 0.15))",
          }}
        />
      </svg>
      
      {!isLive && (
        <span className="absolute text-[9px] font-mono tracking-widest text-taupe uppercase pointer-events-none opacity-80 bg-paper px-3 py-1 border border-border-custom rounded shadow-[0_2px_8px_rgba(43,38,32,0.03)]">
          Trunk Audio Line Signal Still — Waiting for Call initiation
        </span>
      )}
    </div>
  );
}
