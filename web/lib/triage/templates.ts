import type { Lang, TriageKind } from "@/lib/engine/types";

export interface TriageFacts {
  days?: number;
  deltaBpm?: number;
  k?: number;
  n?: number;
  zone?: string;
}

// TODO human proofread: Telugu and Hindi strings. English reviewed.
const TEMPLATES: Record<TriageKind, Record<Lang, string>> = {
  drift: {
    en: "Resting heart rate has stayed about {x} bpm above this person's usual level for the last {duration}. Please visit today, check temperature, and ask about fever, body pain, or weakness. This is a screening flag, not a diagnosis.",
    te: "గత {duration} నుండి ఈ వ్యక్తి విశ్రాంతి హృదయ స్పందన రేటు సాధారణం కంటే సుమారు {x} ఎక్కువగా ఉంది. దయచేసి ఈ రోజే కలవండి, ఉష్ణోగ్రత చూడండి, జ్వరం, ఒళ్ళు నొప్పులు లేదా నీరసం ఉన్నాయా అని అడగండి. ఇది స్క్రీనింగ్ సూచన మాత్రమే, రోగ నిర్ధారణ కాదు.",
    hi: "पिछले {duration} से इस व्यक्ति की आराम की हृदय गति सामान्य से लगभग {x} अधिक है। कृपया आज मिलें, तापमान जाँचें और बुखार, बदन दर्द या कमज़ोरी के बारे में पूछें। यह केवल स्क्रीनिंग संकेत है, निदान नहीं।",
  },
  rhythm: {
    en: "Pulse rhythm looked irregular in recent screening windows. Please refer to the primary health centre for an ECG. This is a screening flag, not a diagnosis.",
    te: "ఇటీవలి స్క్రీనింగ్‌లో నాడి లయ క్రమరహితంగా కనిపించింది. దయచేసి ఈసీజీ కోసం ప్రాథమిక ఆరోగ్య కేంద్రానికి పంపండి. ఇది స్క్రీనింగ్ సూచన మాత్రమే, రోగ నిర్ధారణ కాదు.",
    hi: "हाल की स्क्रीनिंग में नाड़ी की लय अनियमित दिखी। कृपया ईसीजी के लिए प्राथमिक स्वास्थ्य केंद्र भेजें। यह केवल स्क्रीनिंग संकेत है, निदान नहीं।",
  },
  cluster: {
    en: "{k} of {n} band wearers in {zone} show raised resting heart rate together. Please visit the listed households first and report fever cases to the health centre. This is a screening alert, not a diagnosis.",
    te: "{zone}లో {n} మందిలో {k} మందికి విశ్రాంతి హృదయ స్పందన రేటు ఒకేసారి పెరిగింది. దయచేసి జాబితాలోని ఇళ్లను ముందుగా సందర్శించి, జ్వరం కేసులను ఆరోగ్య కేంద్రానికి తెలియజేయండి. ఇది స్క్రీనింగ్ హెచ్చరిక మాత్రమే, రోగ నిర్ధారణ కాదు.",
    hi: "{zone} में {n} में से {k} लोगों की आराम की हृदय गति एक साथ बढ़ी है। कृपया सूची के घरों में पहले जाएँ और बुखार के मामलों की सूचना स्वास्थ्य केंद्र को दें। यह केवल स्क्रीनिंग चेतावनी है, निदान नहीं।",
  },
};

const PLACEHOLDERS: Record<TriageKind, Array<keyof TriageFacts>> = {
  drift: ["days", "deltaBpm"],
  rhythm: [],
  cluster: ["k", "n", "zone"],
};

export function fillTemplate(
  kind: TriageKind,
  lang: Lang,
  facts: TriageFacts,
): string {
  let text = TEMPLATES[kind][lang];
  const days = facts.days ?? 2;
  const duration =
    lang === "en"
      ? `${days} ${days === 1 ? "day" : "days"}`
      : lang === "hi"
        ? `${days} दिन`
        : `${days} ${days === 1 ? "రోజు" : "రోజులు"}`;
  const replacements: Record<string, string> = {
    d: String(days),
    duration,
    x: String(Math.abs(facts.deltaBpm ?? 0)),
    k: String(facts.k ?? 0),
    n: String(facts.n ?? 0),
    zone: facts.zone ?? "this area",
  };
  for (const [key, value] of Object.entries(replacements)) {
    text = text.replaceAll(`{${key}}`, value);
  }
  return text;
}

export function templateFor(
  kind: TriageKind,
  lang: Lang,
  facts: TriageFacts,
): { text: string; source: "template" } {
  const safeFacts: TriageFacts = { ...facts };
  for (const key of PLACEHOLDERS[kind]) {
    if (safeFacts[key] === undefined) {
      throw new Error(`missing triage fact: ${key}`);
    }
  }
  return { text: fillTemplate(kind, lang, safeFacts), source: "template" };
}

export const TRIAGE_TEMPLATES = TEMPLATES;

const FORBIDDEN = [
  "diagnos",
  "dengue",
  "covid",
  "malaria",
  "typhoid",
  "tablet",
  "antibiotic",
];

const DISCLAIMER = "screening";

/** Validate an LLM-written note. Invalid output must fall back to a template. */
export function validateTriageText(text: string, lang: Lang): boolean {
  if (!text || text.length > 600) return false;
  const lowered = text.toLowerCase();
  if (!lowered.includes(DISCLAIMER)) return false;
  for (const word of FORBIDDEN) {
    if (lowered.includes(word)) return false;
  }
  // Do not accept an empty shell in the wrong script.
  if (lang === "te" && !/[\u0C00-\u0C7F]/.test(text)) return false;
  if (lang === "hi" && !/[\u0900-\u097F]/.test(text)) return false;
  return true;
}
