'use client';

export function WaveBackground() {
  return (
    <div className="absolute inset-x-0 bottom-0 h-32 overflow-hidden pointer-events-none">
      <svg
        className="absolute bottom-0 w-full h-full"
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
      >
        <path
          className="wave-back"
          fill="rgba(20, 184, 166, 0.1)"
          d="M0,60 C360,120 720,0 1080,60 C1260,90 1380,90 1440,60 L1440,120 L0,120 Z"
        >
          <animate
            attributeName="d"
            dur="8s"
            repeatCount="indefinite"
            values="
              M0,60 C360,120 720,0 1080,60 C1260,90 1380,90 1440,60 L1440,120 L0,120 Z;
              M0,80 C360,20 720,100 1080,40 C1260,60 1380,80 1440,80 L1440,120 L0,120 Z;
              M0,60 C360,120 720,0 1080,60 C1260,90 1380,90 1440,60 L1440,120 L0,120 Z
            "
          />
        </path>
        <path
          className="wave-front"
          fill="rgba(20, 184, 166, 0.2)"
          d="M0,80 C360,40 720,100 1080,60 C1260,40 1380,60 1440,80 L1440,120 L0,120 Z"
        >
          <animate
            attributeName="d"
            dur="6s"
            repeatCount="indefinite"
            values="
              M0,80 C360,40 720,100 1080,60 C1260,40 1380,60 1440,80 L1440,120 L0,120 Z;
              M0,60 C360,100 720,40 1080,80 C1260,100 1380,40 1440,60 L1440,120 L0,120 Z;
              M0,80 C360,40 720,100 1080,60 C1260,40 1380,60 1440,80 L1440,120 L0,120 Z
            "
          />
        </path>
      </svg>
    </div>
  );
}
