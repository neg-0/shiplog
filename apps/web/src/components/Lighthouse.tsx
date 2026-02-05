'use client';

import { motion } from 'framer-motion';

interface LighthouseProps {
  isActive?: boolean;
}

export function Lighthouse({ isActive = false }: LighthouseProps) {
  return (
    <div className="relative">
      <svg width="100" height="160" viewBox="0 0 100 160">
        {/* Base/rocks */}
        <ellipse cx="50" cy="155" rx="45" ry="8" fill="#1e293b" />
        <path d="M20,150 Q30,140 50,145 Q70,140 80,150 L75,158 L25,158 Z" fill="#334155" />
        
        {/* Tower */}
        <path d="M35,150 L40,60 L60,60 L65,150 Z" fill="#f1f5f9" />
        
        {/* Stripes */}
        <path d="M38,130 L40,90 L60,90 L62,130 Z" fill="#ef4444" />
        <path d="M40,90 L42,70 L58,70 L60,90 Z" fill="#f1f5f9" />
        
        {/* Lantern room */}
        <rect x="38" y="50" width="24" height="15" fill="#0f172a" rx="2" />
        <rect x="40" y="52" width="20" height="11" fill="#fbbf24" opacity={isActive ? 1 : 0.3} />
        
        {/* Roof */}
        <path d="M35,50 L50,30 L65,50 Z" fill="#dc2626" />
        <circle cx="50" cy="28" r="4" fill="#fbbf24" />
        
        {/* Light beam */}
        {isActive && (
          <motion.path
            d="M60,55 L160,20 L160,90 L60,55 Z"
            fill="url(#beamGradient)"
            initial={{ opacity: 0, rotate: -20 }}
            animate={{ opacity: [0.4, 0.8, 0.4], rotate: [-20, 20, -20] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformOrigin: '60px 55px' }}
          />
        )}
        
        {/* Gradient definitions */}
        <defs>
          <linearGradient id="beamGradient" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      
      {/* ShipLog label */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-center">
        <span className="text-teal-400 font-bold text-sm">ShipLog</span>
      </div>
    </div>
  );
}
