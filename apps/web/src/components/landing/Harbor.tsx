import styles from './landing.module.css';

/** A self-contained vector scene: no canvas, timers, or animation dependencies. */
export default function Harbor({ paused }: { paused: boolean }) {
  return (
    <div className={`${styles.harbor} ${paused ? styles.paused : ''}`}>
      <svg viewBox="0 0 720 590" role="img" aria-labelledby="harbor-title harbor-desc">
        <title id="harbor-title">The ShipLog release harbor</title>
        <desc id="harbor-desc">Code is built at the dock, loaded as release notes, reviewed, and shipped to Slack, Discord, and a hosted changelog.</desc>
        <defs>
          <pattern id="sea-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#c4d3ce" strokeWidth=".6" /></pattern>
          <pattern id="dock-lines" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 0V12" stroke="#bdbba9" strokeWidth="1" /></pattern>
          <g id="cargo-ship">
            <ellipse cy="25" rx="46" ry="7" fill="#6b9994" opacity=".15" />
            <path d="M-48 12H47L32 29H-32Z" fill="#203b42" /><path d="M-48 12H47L42 18H-41Z" fill="#ed764e" />
            <path d="M-30-4H-15V12H-30Z" fill="#faf6e9" stroke="#203b42" strokeWidth="1.5" />
            <path d="M-27-10H-22V-4H-27Z" fill="#203b42" /><path d="M-26 1H-19V5H-26Z" fill="#88aca4" />
            <path d="M-9-3H9V12H-9Z" fill="#dd8c63" stroke="#f8efdc" /><path d="M11-3H29V12H11Z" fill="#70a6a0" stroke="#f8efdc" />
            <path d="M-5-1V9M1-1V9M17-1V9M23-1V9" stroke="#203b42" opacity=".25" />
          </g>
        </defs>
        <rect x="0" y="0" width="720" height="590" fill="#e5ece3" />
        <rect x="0" y="0" width="720" height="590" fill="url(#sea-grid)" />
        <path d="M0 0H203L235 35V140L270 172V341L224 382H0Z" fill="#eeebdc" stroke="#c4c4b1" />
        <path d="M0 379H222L273 335V178L239 145V37L210 0" fill="none" stroke="#bcc2b1" strokeWidth="8" />
        <path d="M0 341H176V367H0M206 241H325V267H206" fill="#d5d0b9" stroke="#a8ac98" strokeWidth="2" />
        <path d="M0 341H176V367H0M206 241H325V267H206" fill="url(#dock-lines)" />
        <path d="M40 0V42L90 93V325M0 301H206" fill="none" stroke="#dad7c5" strokeWidth="18" />
        <path d="M40 0V42L90 93V325M0 301H206" fill="none" stroke="#faf7eb" strokeWidth="1.5" strokeDasharray="8 7" />
        {/* Working buildings and a terminal at the quay. */}
        <path d="M19 103L63 80L111 104L68 129Z" fill="#788c83" /><path d="M19 103V158L68 185V129Z" fill="#b9c1ae" /><path d="M68 129L111 104V158L68 185Z" fill="#829990" />
        <path d="M80 145L101 134V159L80 171Z" fill="#385955" /><path d="M30 128L53 141M30 141L53 154" stroke="#f4f0dc" strokeWidth="4" />
        <path d="M32 224L66 205L99 222L66 242Z" fill="#d99a6e" /><path d="M32 224V259L66 278V242Z" fill="#edc29a" /><path d="M66 242L99 222V258L66 278Z" fill="#bd825e" />
        <rect x="126" y="61" width="115" height="92" rx="4" fill="#254047" /><rect x="134" y="70" width="99" height="13" rx="2" fill="#35575a" />
        <circle cx="141" cy="76" r="2" fill="#ed885f" /><circle cx="149" cy="76" r="2" fill="#c5c89f" />
        <text x="139" y="100" fill="#96c8b7" fontSize="9" fontFamily="monospace">$ git merge feature</text>
        <g className={styles.codeLines}><path d="M139 112H216M139 123H189M139 134H208" stroke="#afc4b4" strokeWidth="3" /><path d="M139 112H153M139 134H159" stroke="#ed885f" strokeWidth="3" /></g>
        <path d="M178 153V169M160 170H199" stroke="#254047" strokeWidth="5" />
        <text x="128" y="48" className={styles.mapLabel}>01 / BUILD</text>
        {/* Crane and suspended release-note cargo. */}
        <path d="M208 245V174L265 133H337M206 178L265 133L316 174H208M221 174V245M208 201H221M208 222H221" fill="none" stroke="#d77644" strokeWidth="5" strokeLinejoin="round" />
        <path d="M214 244H232M196 249H240" stroke="#254047" strokeWidth="5" />
        <g className={styles.crane}><path d="M306 137V187" stroke="#254047" strokeWidth="2" /><rect x="292" y="186" width="28" height="22" rx="2" fill="#f0ac74" stroke="#254047" strokeWidth="1.5" /><path d="M298 192H314M298 198H310" stroke="#fff8e8" strokeWidth="2" /></g>
        <rect x="139" y="211" width="38" height="24" fill="#6d9b90" stroke="#f7f3e7" /><path d="M146 215V231M153 215V231M160 215V231M168 215V231" stroke="#416f69" />
        <rect x="149" y="185" width="35" height="24" fill="#de8e60" stroke="#f7f3e7" /><path d="M157 188V206M165 188V206M173 188V206" stroke="#bb704b" />
        <text x="108" y="322" className={styles.mapLabel}>RELEASE DOCK</text>
        {/* Dashed routes have a deliberate stop at the review buoy. */}
        <path d="M290 288C355 286 355 184 456 150S570 131 596 124M289 291C394 285 434 301 596 300M290 298C338 299 375 442 486 464S565 466 596 462" fill="none" stroke="#749c91" strokeWidth="1.6" strokeDasharray="5 7" />
        <circle cx="358" cy="282" r="21" fill="#e5ece3" stroke="#6e8f80" /><path d="M350 282L356 288L367 275" fill="none" stroke="#315b4e" strokeWidth="2.5" />
        <text x="337" y="324" className={styles.mapLabel}>REVIEW</text>
        <g className={styles.shipSlack}><use href="#cargo-ship" /></g>
        <g className={styles.shipDiscord}><use href="#cargo-ship" /></g>
        <g className={styles.shipWeb}><use href="#cargo-ship" /></g>
        {/* The destination piers. */}
        {[{ y: 119, label: 'SLACK', number: '01' }, { y: 295, label: 'DISCORD', number: '02' }, { y: 460, label: 'CHANGELOG', number: '03' }].map(({ y, label, number }) => (
          <g key={label}>
            <path d={`M591 ${y + 15}H720V${y + 39}H591Z`} fill="#d1d0b8" stroke="#a8ac98" />
            <path d={`M591 ${y + 15}H720V${y + 39}H591Z`} fill="url(#dock-lines)" />
            <rect x="602" y={y - 43} width="102" height="49" rx="3" fill="#f8f4e7" stroke="#b9c4b1" />
            <text x="613" y={y - 26} fill="#8a998b" fontSize="8" fontFamily="monospace">DESTINATION {number}</text>
            <text x="613" y={y - 7} fill="#29433f" fontSize="11" fontWeight="700" letterSpacing="1">{label}</text>
            <circle className={styles.beacon} cx="598" cy={y + 25} r="3" fill="#e27950" />
          </g>
        ))}
        {/* Maritime chart details. */}
        <g stroke="#819c90" fill="none" opacity=".6"><path d="M474 54V94M454 74H494" /><circle cx="474" cy="74" r="14" /><path d="M474 57L478 74L474 70L470 74Z" fill="#819c90" /></g>
        <text x="471" y="45" fontFamily="monospace" fontSize="9" fill="#819c90">N</text>
        <path d="M48 426Q54 420 60 426Q66 432 72 426M113 477Q119 471 125 477Q131 483 137 477M391 493Q397 487 403 493Q409 499 415 493M471 357Q477 351 483 357Q489 363 495 357" stroke="#8ca99b" fill="none" strokeWidth="1.5" />
        <text x="29" y="552" className={styles.mapLabel}>SHIPLOG HARBOR</text><text x="29" y="568" fontFamily="monospace" fontSize="8" fill="#829889">ONE RELEASE. EVERYONE ON BOARD.</text>
        <path d="M602 542H691M602 538V546M647 538V546M691 538V546" stroke="#8ca193" /><text x="603" y="560" fontSize="8" fontFamily="monospace" fill="#8ca193">BUILD → REVIEW → SHIP</text>
      </svg>
    </div>
  );
}
