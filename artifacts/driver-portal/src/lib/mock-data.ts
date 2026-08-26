// DEV/DEMO ONLY — local mock data. No network calls, no Twenty Cloud access.

export const STEP_NAMES = [
  'Application',
  'Clearinghouse',
  'Drug Test',
  'Contract',
  'Medical Card',
  'Title',
  'Annual Inspection',
  'Shipment — Need to Send',
  'Shipment Sent',
  '2290',
  'Plate Number',
  'Telegram / Group',
] as const;

export const TOTAL_STEPS = STEP_NAMES.length;

const STEP_NEXT_ACTION: Record<number, string> = {
  1: "Finish filling out your application.",
  2: "Give consent for your FMCSA Clearinghouse check.",
  3: "Complete your DOT drug test at the clinic we sent you.",
  4: "Review and sign your contract.",
  5: "Upload your current DOT medical card.",
  6: "We're processing your truck title — no action needed right now.",
  7: "Get your truck's annual DOT inspection done.",
  8: "Your equipment is being prepared to ship — no action needed right now.",
  9: "Your equipment is on the way — let us know once it arrives.",
  10: "We're filing your Heavy Vehicle Use Tax (2290) — no action needed right now.",
  11: "We're finalizing your plate number — no action needed right now.",
  12: "Join the dispatch Telegram group using the link we sent you.",
};

export function nextActionForStep(step: number): string {
  return STEP_NEXT_ACTION[step] ?? "We'll let you know what's next.";
}

export interface Instruction {
  id: string;
  title: string;
  body: string;
  postedAt: string;
  read: boolean;
}

export type DocumentStatus = 'not_submitted' | 'under_review' | 'approved' | 'rejected';

export interface DocumentItem {
  id: string;
  name: string;
  status: DocumentStatus;
  rejectionReason?: string;
}

export interface DriverRecord {
  token: string;
  fullName: string;
  currentStep: number;
  documents: DocumentItem[];
  instructions: Instruction[];
}

// A document is "missing" (needs a first-time upload) only when it hasn't
// been submitted at all — "under review" and "rejected" are handled on the
// Documents page, not surfaced as a generic Upload prompt on Home.
export function missingDocuments(driver: DriverRecord): DocumentItem[] {
  return driver.documents.filter((doc) => doc.status === 'not_submitted');
}

export const MOCK_DRIVERS: Record<string, DriverRecord> = {
  'demo-driver-001': {
    token: 'demo-driver-001',
    fullName: 'Marcus Webb',
    currentStep: 3,
    documents: [
      { id: 'd1', name: 'Medical Card', status: 'not_submitted' },
    ],
    instructions: [
      {
        id: 'i1',
        title: 'Drug test scheduled',
        body: "Hi Marcus — your drug test is scheduled. Bring a photo ID to the clinic.",
        postedAt: '2026-08-24',
        read: false,
      },
    ],
  },
  'demo-driver-002': {
    token: 'demo-driver-002',
    fullName: 'Renee Castillo',
    currentStep: 7,
    documents: [
      { id: 'd2', name: 'Insurance', status: 'not_submitted' },
      { id: 'd3', name: 'Drug Test Result', status: 'under_review' },
      {
        id: 'd4',
        name: 'CDL Back',
        status: 'rejected',
        rejectionReason: 'Photo is too blurry to read — please retake in good lighting.',
      },
      { id: 'd5', name: 'CDL Front', status: 'approved' },
    ],
    instructions: [
      {
        id: 'i2',
        title: 'Insurance still needed',
        body: "Renee — we still need your current insurance certificate before we can book your inspection.",
        postedAt: '2026-08-22',
        read: false,
      },
      {
        id: 'i3',
        title: 'Title paperwork received',
        body: 'Thanks for sending your title paperwork — that step is done.',
        postedAt: '2026-08-18',
        read: true,
      },
    ],
  },
  'demo-driver-003': {
    token: 'demo-driver-003',
    fullName: 'Devon Price',
    currentStep: 12,
    documents: [
      { id: 'd6', name: 'CDL Front', status: 'approved' },
      { id: 'd7', name: 'CDL Back', status: 'approved' },
      { id: 'd8', name: 'Medical Card', status: 'approved' },
    ],
    instructions: [
      {
        id: 'i4',
        title: 'Almost dispatch-ready',
        body: "You're almost dispatch-ready, Devon! Just join the Telegram group and you're set.",
        postedAt: '2026-08-25',
        read: false,
      },
    ],
  },
};
