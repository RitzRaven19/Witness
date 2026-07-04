/**
 * Plane D knowledge loading for the vault screen.
 *
 * Bridges the UI to @witness/knowledge-library. Every protocol shown has
 * passed hybrid-signature verification, and each article body is re-verified
 * against the signed manifest hash on every read.
 *
 * DEMO SEED: until an NGO publishes real signed knowledge bundles, an empty
 * store is seeded with a locally-signed bundle carrying the field protocols
 * below — run through the real sign → verify → install pipeline, exactly like
 * the map's demo resources. Replace with NGO bundles via IMPORT (QR).
 */

import {
  generateHybridKeyPair,
  hybridSign,
  exportHybridPublicKey,
  hashFile,
  type TrustBundle,
} from '@witness/crypto-core';
import {
  KnowledgeStore,
  canonicalKnowledgePayload,
  type ArticleManifestEntry,
  type KnowledgeBundle,
} from '@witness/knowledge-library';

export const SHARE_KNOWLEDGE_STORAGE = 'witness_share_kbundle';
const HOUR = 60 * 60 * 1000;

export interface Protocol {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  categoryColor: string;
  steps: { num: string; label: string; items: string[]; critical?: boolean }[];
  warning?: string;
}

const DEMO_PROTOCOLS: Protocol[] = [
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

/** A protocol ready to render, with its provenance. */
export interface LoadedProtocol {
  protocol: Protocol;
  articleId: string;
  publisherName: string;
  bundleTitle: string;
}

function saveShareable(payload: {
  kbundle: KnowledgeBundle;
  articles: Record<string, string>;
  trust: TrustBundle;
}): void {
  try {
    localStorage.setItem(SHARE_KNOWLEDGE_STORAGE, JSON.stringify(payload));
  } catch { /* storage full — sharing is best-effort */ }
}

/** Last verified { kbundle, articles, trust } for device-to-device QR sharing. */
export function getShareableKnowledgeJson(): string | null {
  return localStorage.getItem(SHARE_KNOWLEDGE_STORAGE);
}

async function buildDemoBundle(): Promise<{
  kbundle: KnowledgeBundle;
  articles: Record<string, string>;
  trust: TrustBundle;
}> {
  const kp = await generateHybridKeyPair();
  const pub = await exportHybridPublicKey(kp);
  const now = Date.now();

  const articles: Record<string, string> = {};
  const entries: ArticleManifestEntry[] = [];
  for (const p of DEMO_PROTOCOLS) {
    const content = JSON.stringify(p);
    const bytes = new TextEncoder().encode(content);
    articles[p.id] = content;
    entries.push({
      article_id: p.id,
      title: p.title,
      content_hash: await hashFile(bytes.buffer as ArrayBuffer),
      byte_length: bytes.byteLength,
      tags: [p.category.toLowerCase()],
      offline_priority: p.category === 'MEDICAL' ? 'critical' : 'high',
    });
  }

  const unsigned: Omit<KnowledgeBundle, 'signature'> = {
    bundle_id: crypto.randomUUID(),
    publisher_id: pub.key_id,
    title: 'Field Survival Protocols',
    language: 'en',
    version: 1,
    valid_from: now - HOUR,
    // evergreen: no valid_to
    articles: entries,
  };
  const signature = await hybridSign(
    kp,
    canonicalKnowledgePayload(unsigned).buffer as ArrayBuffer,
  );
  const trust: TrustBundle = {
    publishers: [
      {
        publisher_id: pub.key_id,
        display_name: 'Demo NGO (local dev seed)',
        ecdsa_public_key: pub.ecdsa_p256,
        ml_dsa_public_key: pub.ml_dsa_65,
        valid_from: now - HOUR,
        valid_to: now + 24 * 365 * HOUR,
      },
    ],
    revoked_publisher_ids: [],
  };
  return { kbundle: { ...unsigned, signature }, articles, trust };
}

/**
 * Load every installed protocol, hash-verifying each article body against its
 * signed manifest entry. Seeds the demo bundle when the store is empty.
 */
export async function loadProtocols(): Promise<LoadedProtocol[]> {
  const store = await KnowledgeStore.open();
  try {
    let listings = await store.listArticles();
    if (listings.length === 0) {
      const demo = await buildDemoBundle();
      await store.installBundle(demo.kbundle, demo.articles, demo.trust);
      saveShareable(demo);
      listings = await store.listArticles();
    }
    const out: LoadedProtocol[] = [];
    for (const l of listings) {
      // readArticle re-verifies the content hash — tampered rows throw and are skipped
      try {
        const content = await store.readArticle(l.entry.article_id);
        out.push({
          protocol: JSON.parse(content) as Protocol,
          articleId: l.entry.article_id,
          publisherName: l.publisherName,
          bundleTitle: l.bundleTitle,
        });
      } catch { /* tampered or unparsable — never render unverified content */ }
    }
    return out;
  } finally {
    store.close();
  }
}

export interface KnowledgeImportResult {
  ok: boolean;
  count: number;
  error?: string;
}

/**
 * Ingest a signed knowledge bundle scanned from QR: JSON of
 * { kbundle, articles, trust }. Verified (signature + per-article hashes)
 * before anything is stored.
 */
export async function importKnowledgeJson(json: string): Promise<KnowledgeImportResult> {
  let parsed: {
    kbundle?: KnowledgeBundle;
    articles?: Record<string, string>;
    trust?: TrustBundle;
  };
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, count: 0, error: 'Not valid bundle data' };
  }
  if (!parsed.kbundle || !parsed.articles || !parsed.trust) {
    return { ok: false, count: 0, error: 'Missing bundle, articles or trust info' };
  }
  const store = await KnowledgeStore.open();
  try {
    await store.installBundle(parsed.kbundle, parsed.articles, parsed.trust);
    saveShareable({ kbundle: parsed.kbundle, articles: parsed.articles, trust: parsed.trust });
    const listings = await store.listArticles();
    return { ok: true, count: listings.length };
  } catch {
    // Never surface verification detail to the user.
    return { ok: false, count: 0, error: 'Bundle rejected — signature or content hash invalid' };
  } finally {
    store.close();
  }
}
