/**
 * Duplicate lead detection — phone normalization + Jaro-Winkler fuzzy matching.
 *
 * Two detection layers:
 *  1. Exact phone match (same workspace, same last-10 digits) → confidence: exact_phone
 *  2. Fuzzy name ≥ 0.88 AND same state → confidence: fuzzy_name_location
 *     Fuzzy name ≥ 0.93 (no state required) → confidence: fuzzy_name
 */

// ─── Phone normalization ──────────────────────────────────────────────────────

/** Strip all non-digits and take the last 10 (handles +1 country code). */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null; // too short to be a real phone
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

// ─── Jaro-Winkler similarity ──────────────────────────────────────────────────

function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchDist = Math.max(Math.floor(Math.max(s1.length, s2.length) / 2) - 1, 0);
  const s1m = new Array<boolean>(s1.length).fill(false);
  const s2m = new Array<boolean>(s2.length).fill(false);
  let matches = 0;

  for (let i = 0; i < s1.length; i++) {
    const lo = Math.max(0, i - matchDist);
    const hi = Math.min(i + matchDist + 1, s2.length);
    for (let j = lo; j < hi; j++) {
      if (s2m[j] || s1[i] !== s2[j]) continue;
      s1m[i] = s2m[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1m[i]) continue;
    while (!s2m[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3
  );
}

/** Jaro-Winkler with prefix bonus (p = 0.1 standard). */
export function jaroWinkler(s1: string, s2: string): number {
  const j = jaro(s1, s2);
  let prefix = 0;
  const maxPrefix = Math.min(4, s1.length, s2.length);
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return j + prefix * 0.1 * (1 - j);
}

/** Lowercase + strip punctuation + collapse spaces. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Detection ────────────────────────────────────────────────────────────────

export type DuplicateConfidence = "exact_phone" | "fuzzy_name_location" | "fuzzy_name";

export interface DuplicateMatch {
  leadId:     number;
  fullName:   string;
  confidence: DuplicateConfidence;
  /** Jaro-Winkler score (1.0 for exact phone match) */
  score:      number;
}

export interface LeadCandidate {
  id:              number;
  fullName:        string;
  phoneNormalized: string | null;
  state:           string | null;
  status:          string;
}

/**
 * Find potential duplicates of a new lead against a list of existing leads.
 * The candidate itself must NOT be in existingLeads.
 * Leads with status === "merged" are excluded.
 */
export function detectDuplicates(
  candidate: {
    fullName:        string;
    phoneNormalized: string | null;
    state:           string | null;
  },
  existingLeads: LeadCandidate[],
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  const candidateName = normalizeName(candidate.fullName);

  for (const lead of existingLeads) {
    if (lead.status === "merged") continue;

    // ── 1. Exact phone match ─────────────────────────────────────────────────
    if (
      candidate.phoneNormalized &&
      lead.phoneNormalized &&
      candidate.phoneNormalized.length >= 7 &&
      candidate.phoneNormalized === lead.phoneNormalized
    ) {
      matches.push({
        leadId:     lead.id,
        fullName:   lead.fullName,
        confidence: "exact_phone",
        score:      1.0,
      });
      continue; // exact phone supersedes fuzzy — don't double-count
    }

    // ── 2. Fuzzy name matching ───────────────────────────────────────────────
    const leadName = normalizeName(lead.fullName);
    const nameSim  = jaroWinkler(candidateName, leadName);

    if (nameSim >= 0.88) {
      const sameState =
        candidate.state &&
        lead.state &&
        candidate.state.trim().toUpperCase() === lead.state.trim().toUpperCase();

      if (sameState) {
        matches.push({ leadId: lead.id, fullName: lead.fullName, confidence: "fuzzy_name_location", score: nameSim });
      } else if (nameSim >= 0.93) {
        matches.push({ leadId: lead.id, fullName: lead.fullName, confidence: "fuzzy_name", score: nameSim });
      }
    }
  }

  return matches.sort((a, b) => {
    // exact_phone first, then by score descending
    if (a.confidence === "exact_phone" && b.confidence !== "exact_phone") return -1;
    if (b.confidence === "exact_phone" && a.confidence !== "exact_phone") return 1;
    return b.score - a.score;
  });
}
