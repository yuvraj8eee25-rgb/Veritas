type ScreenState = Record<string, any>;

export default function LiveSearchScreen({ state }: { state: ScreenState }) {
  const { LoaderCircle, leaveQueue, matchError, matchSeconds } = state;

  return (
    <section className="quiz-panel live-search-panel">
      <span className="eyebrow">LIVE MATCHMAKING</span>
      <h1>Finding your opponent…</h1>
      <p className="quiz-lead">Looking for a debater with matching practice settings.</p>
      <div className="match-search-status">
        <LoaderCircle className="spinner" size={16} aria-hidden="true" />
        <strong>{matchSeconds}s</strong>
      </div>
      {matchError && <p className="workspace-error" role="alert">{matchError}</p>}
      <button className="button button-secondary" onClick={() => void leaveQueue()}>Cancel search</button>
    </section>
  );
}
