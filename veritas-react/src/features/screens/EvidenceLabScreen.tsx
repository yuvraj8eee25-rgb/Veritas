import EvidenceLab from "../EvidenceLab";
import type { View } from "../../components/AppShell";

export default function EvidenceLabScreen({ state }: { state: {
  sessionEmail: string | null;
  setGuestMode: (value: boolean) => void;
  setView: (view: View) => void;
} }) {
  return <EvidenceLab key={state.sessionEmail ?? "guest"} sessionEmail={state.sessionEmail} onSignIn={() => state.setGuestMode(false)} onNavigate={state.setView} />;
}
