import EvidenceLab from "../EvidenceLab";
import type { View } from "../../components/AppShell";
import type { EvidenceCard } from "../../../../app/supabase/functions/_shared/evidence-practice.ts";

export default function EvidenceLabScreen({ state, onPractice, onResumePractice, onPrepareDebate }: { state: {
  sessionAccountId: string | null;
  sessionEmail: string | null;
  setGuestMode: (value: boolean) => void;
  setView: (view: View) => void;
}; onPractice: (card: EvidenceCard) => void; onResumePractice?: () => void; onPrepareDebate?: (motion: string, outline: string) => void }) {
  return <EvidenceLab key={state.sessionAccountId ?? "guest"} accountId={state.sessionAccountId} sessionEmail={state.sessionEmail}
    onSignIn={() => state.setGuestMode(false)} onNavigate={state.setView} onPractice={onPractice} onResumePractice={onResumePractice} onPrepareDebate={onPrepareDebate} />;
}
