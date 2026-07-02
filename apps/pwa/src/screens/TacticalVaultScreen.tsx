import { useState } from 'react';
import { TacticalHeader } from '../components/TacticalHeader';

interface Protocol {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  categoryColor: string;
  steps: { num: string; label: string; items: string[]; critical?: boolean }[];
  warning?: string;
}

const PROTOCOLS: Protocol[] = [
  {
    id: 'bleeding',
    title: 'STOP BLEEDING',
    subtitle: 'HEMORRHAGE CONTROL',
    category: 'MEDICAL',
    categoryColor: '#cc0000',
    steps: [
      {
        num: '01', label: 'DIRECT PRESSURE',
        items: [
          'LOCATE SOURCE OF HEMORRHAGE IMMEDIATELY.',
          'APPLY FIRM, STEADY PRESSURE WITH CLEAN GAUZE.',
          'IF GAUZE SOAKS THROUGH, DO NOT REMOVE — ADD MORE LAYERS.',
          'MAINTAIN PRESSURE FOR AT LEAST 5 MINUTES WITHOUT INTERRUPTION.',
        ],
      },
      {
        num: '02', label: 'ELEVATION',
        items: [
          'ELEVATE THE WOUNDED LIMB ABOVE HEART LEVEL.',
          'ENSURE NO SECONDARY FRACTURES PREVENT MOVEMENT.',
          'MONITOR DISTAL PULSE AND SKIN TEMPERATURE.',
        ],
      },
      {
        num: '03', label: 'TOURNIQUET USE', critical: true,
        items: [
          'APPLY ONLY IF DIRECT PRESSURE FAILS TO STOP LIFE-THREATENING BLEEDING.',
          'POSITION 2–3 INCHES ABOVE THE WOUND (NOT ON A JOINT).',
          'TIGHTEN UNTIL BLEEDING COMPLETELY STOPS.',
          'MARK TIME OF APPLICATION ON PATIENT\'S FOREHEAD: [T: HH:MM].',
        ],
      },
    ],
    warning: 'NEURAL SHOCK IMMINENT. ADMINISTER HYDRATION AND MAINTAIN BODY CORE TEMPERATURE. DO NOT REMOVE TOURNIQUET ONCE APPLIED.',
  },
  {
    id: 'hypothermia',
    title: 'HYPOTHERMIA',
    subtitle: 'COLD EXPOSURE MANAGEMENT',
    category: 'MEDICAL',
    categoryColor: '#2196f3',
    steps: [
      {
        num: '01', label: 'REMOVE FROM COLD',
        items: [
          'MOVE PATIENT OUT OF WIND AND WET CONDITIONS IMMEDIATELY.',
          'REMOVE ALL WET CLOTHING — WETNESS ACCELERATES HEAT LOSS.',
          'SHIELD FROM GROUND WITH INSULATING LAYER (BLANKET, LEAVES, PACK).',
        ],
      },
      {
        num: '02', label: 'RE-WARMING',
        items: [
          'WRAP ENTIRE BODY INCLUDING HEAD — 40–50% HEAT LOSS IS VIA HEAD.',
          'APPLY WARM (NOT HOT) OBJECTS TO NECK, ARMPITS, GROIN.',
          'DO NOT RUB LIMBS — THIS DRIVES COLD BLOOD TO CORE.',
          'IF CONSCIOUS: WARM SWEET LIQUIDS IN SMALL SIPS.',
        ],
      },
      {
        num: '03', label: 'MONITORING', critical: true,
        items: [
          'CHECK BREATHING AND PULSE EVERY 5 MINUTES.',
          'HANDLE GENTLY — CARDIAC ARREST CAN BE TRIGGERED BY MOVEMENT.',
          'IF NO PULSE AFTER 60 SECONDS CHECK: BEGIN CPR.',
          'TRANSPORT HORIZONTALLY — NEVER UPRIGHT.',
        ],
      },
    ],
    warning: 'DO NOT DECLARE DEATH UNTIL PATIENT IS WARM AND UNRESPONSIVE. HYPOTHERMIC PATIENTS HAVE SURVIVED WITHOUT PULSE FOR HOURS.',
  },
  {
    id: 'water',
    title: 'WATER SAFETY',
    subtitle: 'PURIFICATION & SOURCING',
    category: 'SURVIVAL',
    categoryColor: '#00ff33',
    steps: [
      {
        num: '01', label: 'SOURCE PRIORITY',
        items: [
          'RAINWATER AND MORNING DEW: SAFEST — DRINK DIRECTLY.',
          'RUNNING WATER UPSTREAM OF HABITATION: SECOND PRIORITY.',
          'STANDING WATER: LAST RESORT — ALWAYS PURIFY.',
          'AVOID WATER WITH OILY FILM, UNUSUAL COLOUR, OR DEAD ANIMALS NEARBY.',
        ],
      },
      {
        num: '02', label: 'PURIFICATION',
        items: [
          'BOILING: ROLLING BOIL FOR 1 MINUTE (3 MIN ABOVE 2000M ALTITUDE).',
          'IODINE TABLETS: 5 DROPS PER LITRE, WAIT 30 MIN (60 MIN IF COLD).',
          'IMPROVISED FILTER: LAYERS OF GRASS, CHARCOAL, SAND, GRAVEL, CLOTH.',
          'CLEAR PLASTIC BAG IN SUNLIGHT: UV KILLS BACTERIA IN 6–8 HOURS.',
        ],
      },
      {
        num: '03', label: 'DEHYDRATION SIGNS',
        items: [
          'DARK URINE (AMBER OR BROWN): DRINK IMMEDIATELY.',
          'HEADACHE + CONFUSION: SEVERE — PRIORITY REHYDRATION.',
          'MINIMUM DAILY NEED: 2–3 LITRES IN TEMPERATE CONDITIONS.',
          'DOUBLE IN HIGH HEAT OR PHYSICAL EXERTION.',
        ],
      },
    ],
  },
  {
    id: 'navigation',
    title: 'NAVIGATION',
    subtitle: 'DEAD RECKONING & NATURAL SIGNS',
    category: 'MOVEMENT',
    categoryColor: '#b8860b',
    steps: [
      {
        num: '01', label: 'SUN NAVIGATION',
        items: [
          'NORTHERN HEMISPHERE: SUN RISES EAST, SETS WEST, PEAKS SOUTH.',
          'STICK METHOD: PLACE STICK UPRIGHT, MARK SHADOW TIP. WAIT 15 MIN. MARK AGAIN. LINE BETWEEN MARKS IS EAST–WEST.',
          'WATCH METHOD: POINT HOUR HAND AT SUN. BISECT ANGLE BETWEEN HOUR HAND AND 12 O\'CLOCK = SOUTH (NH).',
        ],
      },
      {
        num: '02', label: 'STAR NAVIGATION',
        items: [
          'NORTHERN HEMISPHERE: LOCATE POLARIS (NORTH STAR) — END OF LITTLE DIPPER HANDLE.',
          'POLARIS IS ALWAYS WITHIN 1° OF TRUE NORTH.',
          'SOUTHERN HEMISPHERE: SOUTHERN CROSS — EXTEND LONG AXIS 4.5× TO FIND SOUTH.',
        ],
      },
      {
        num: '03', label: 'DEAD RECKONING',
        items: [
          'TRACK DIRECTION OF TRAVEL USING COMPASS OR SUN/STARS.',
          'COUNT PACES: 1KM ≈ 1,200 DOUBLE-PACES ON FLAT GROUND.',
          'LOG: DIRECTION + DISTANCE + TIME ELAPSED AT EACH LEG.',
          'CORRECT FOR DRIFT EVERY 30 MINUTES.',
        ],
      },
    ],
    warning: 'MOVE DURING DAWN AND DUSK — REDUCES THERMAL SIGNATURE AND VISIBILITY TO OBSERVERS.',
  },
  {
    id: 'signaling',
    title: 'SIGNALING',
    subtitle: 'EXTRACTION & RESCUE',
    category: 'COMMS',
    categoryColor: '#888',
    steps: [
      {
        num: '01', label: 'VISUAL SIGNALS',
        items: [
          'GROUND-TO-AIR: LARGE "X" = NEED MEDICAL HELP. "V" = NEED ASSISTANCE.',
          'USE CONTRAST: DARK MATERIALS ON LIGHT GROUND OR VICE VERSA.',
          'SIGNAL MIRROR: AIM REFLECTED SUNLIGHT AT AIRCRAFT. VISIBLE 16KM+.',
          'FIRE: THREE FIRES IN TRIANGLE = INTERNATIONAL DISTRESS.',
        ],
      },
      {
        num: '02', label: 'AUDIBLE SIGNALS',
        items: [
          'WHISTLE: THREE SHORT BLASTS = DISTRESS. PAUSE. REPEAT.',
          'CARRY WHISTLE AT ALL TIMES — AUDIBLE FURTHER THAN VOICE.',
          'AVOID SHOUTING — TIRES QUICKLY AND REVEALS POSITION TO HOSTILES.',
        ],
      },
      {
        num: '03', label: 'RADIO / BLE PROTOCOL', critical: true,
        items: [
          'USE WITNESS APP: ACTIVATE SILENT ALERT FIRST — NO AUDIO EMISSION.',
          'IF BLE DEVICE CONNECTED: SEND HASH RECEIPT VIA LORA MESH.',
          'TRANSMIT IN SHORT BURSTS — REDUCE RF DETECTABILITY.',
          'STANDARD CALL: LOCATION GRID REF + STATUS + EXTRACTION WINDOW.',
        ],
      },
    ],
    warning: 'ALL SIGNALS REVEAL YOUR POSITION. CONFIRM RECEIVING PARTY IS FRIENDLY BEFORE SIGNALING CONTINUOUSLY.',
  },
];

export function TacticalVaultScreen() {
  const [activeId, setActiveId] = useState<string | null>(null);

  const active = PROTOCOLS.find(p => p.id === activeId) ?? null;

  if (active) {
    return <ProtocolDetail protocol={active} onBack={() => setActiveId(null)} />;
  }

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] overflow-y-auto">
      <TacticalHeader title="TACTICAL_NET_SECURE" />

      {/* Title */}
      <div className="px-4 pt-4 pb-3 border-b border-[#1a1a1a] shrink-0">
        <h2 className="text-3xl font-bold text-white tracking-widest">KNOWLEDGE<br/>LIBRARY</h2>
        <p className="text-[10px] text-gray-500 tracking-widest mt-1">
          {PROTOCOLS.length} PROTOCOLS // OFFLINE // SIGNED
        </p>
      </div>

      {/* Protocol list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {PROTOCOLS.map(p => (
          <button
            key={p.id}
            onClick={() => setActiveId(p.id)}
            className="flex items-center gap-4 bg-[#111] border border-[#1e1e1e] p-4 hover:bg-[#141414] hover:border-[#00ff33]/20 transition-all text-left active:scale-[0.99]"
          >
            <div
              className="w-10 h-10 flex items-center justify-center shrink-0 border"
              style={{ borderColor: `${p.categoryColor}44`, background: `${p.categoryColor}11` }}
            >
              <CategoryIcon category={p.category} color={p.categoryColor} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white font-bold tracking-widest text-[13px]">{p.title}</div>
              <div className="text-[10px] text-gray-500 tracking-widest mt-0.5">{p.subtitle}</div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span
                className="text-[8px] font-bold tracking-widest px-1.5 py-0.5 border"
                style={{ color: p.categoryColor, borderColor: `${p.categoryColor}44`, background: `${p.categoryColor}11` }}
              >
                {p.category}
              </span>
              <svg className="w-3.5 h-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
              </svg>
            </div>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="mx-4 mb-4 shrink-0 flex items-center justify-between border-t border-[#1a1a1a] pt-3">
        <span className="text-[9px] text-gray-600 tracking-widest">PUBLISHER: NGO_TRUST_ALPHA</span>
        <span className="text-[9px] text-[#00ff33]/60 tracking-widest">SIG_VERIFIED</span>
      </div>
    </div>
  );
}

function ProtocolDetail({ protocol, onBack }: { protocol: Protocol; onBack: () => void }) {
  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] overflow-y-auto">
      {/* Back header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-[#0d0d0d] border-b border-[#1a1a1a] shrink-0">
        <button onClick={onBack} className="text-[#00ff33] p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div>
          <div
            className="text-[9px] font-bold tracking-widest"
            style={{ color: protocol.categoryColor }}
          >
            {protocol.category}
          </div>
          <div className="text-white font-bold tracking-widest text-[13px]">{protocol.title}</div>
        </div>
      </header>

      {/* Protocol info */}
      <div className="mx-4 mt-4 mb-4 bg-[#111] border border-[#1e1e1e] p-4 shrink-0">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-[9px] text-gray-500 tracking-widest">PROTOCOL</div>
            <div className="font-bold tracking-widest text-[14px]" style={{ color: protocol.categoryColor }}>
              {protocol.title}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] text-gray-500 tracking-widest">STATUS</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-2 h-2 bg-[#00ff33]"/>
              <span className="text-[#00ff33] font-bold tracking-widest text-[11px]">ACTIVE</span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-1">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className={`flex-1 h-1.5 ${i < 9 ? 'bg-[#00ff33]' : 'bg-[#1e1e1e]'}`}/>
          ))}
        </div>
        <div className="mt-1 text-[9px] text-gray-500 tracking-widest">ENCRYPTION: 256-BIT_AES_LOCKED</div>
      </div>

      {/* Steps */}
      <div className="px-4 flex flex-col gap-3 mb-4">
        {protocol.steps.map(step => (
          <Step
            key={step.num}
            num={step.num}
            label={step.label}
            items={step.items}
            critical={step.critical}
            categoryColor={protocol.categoryColor}
          />
        ))}

        {protocol.warning && (
          <div className="bg-[#1a0505] border border-[#cc0000]/40 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <svg className="w-3.5 h-3.5 text-[#cc4444]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
              </svg>
              <span className="text-[9px] text-[#cc4444] font-bold tracking-[0.2em]">CRITICAL_WARNING</span>
            </div>
            <p className="text-[10px] text-gray-400 leading-relaxed tracking-wide">{protocol.warning}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mx-4 mb-4 flex justify-between items-center border-t border-[#1e1e1e] pt-3 shrink-0">
        <div>
          <div className="text-[9px] text-gray-600 tracking-widest">PUBLISHER</div>
          <div className="text-[9px] text-gray-400 tracking-widest">NGO_TRUST_ALPHA</div>
        </div>
        <div className="text-right">
          <div className="text-[9px] text-gray-600 tracking-widest">SIGNATURE</div>
          <div className="text-[9px] text-[#00ff33] tracking-widest">SIG_DELTA_VERIFIED</div>
        </div>
      </div>
    </div>
  );
}

function Step({ num, label, items, critical, categoryColor }: {
  num: string;
  label: string;
  items: string[];
  critical?: boolean;
  categoryColor: string;
}) {
  const numColor = critical ? '#cc4444' : categoryColor;

  return (
    <div className={`bg-[#111] border ${critical ? 'border-[#cc0000]/40' : 'border-[#1e1e1e]'} p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-[10px] font-bold tracking-widest border px-1.5 py-0.5"
          style={{ color: numColor, borderColor: `${numColor}44` }}
        >
          {num}
        </span>
        <span className={`font-bold tracking-widest text-[12px] ${critical ? 'text-[#cc4444]' : 'text-white'}`}>
          {label}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((line, i) => (
          <p key={i} className="text-[10px] text-gray-400 tracking-wide leading-relaxed">
            &gt; {line}
          </p>
        ))}
      </div>
    </div>
  );
}

function CategoryIcon({ category, color }: { category: string; color: string }) {
  if (category === 'MEDICAL') return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
    </svg>
  );
  if (category === 'SURVIVAL') return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2c0 0-6 7.5-6 12a6 6 0 0012 0c0-4.5-6-12-6-12z"/>
    </svg>
  );
  if (category === 'MOVEMENT') return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
    </svg>
  );
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"/>
    </svg>
  );
}

