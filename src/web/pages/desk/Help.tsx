export default function Help() {
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="mb-2 text-xl font-bold">{title}</h2>
      <div className="space-y-2 text-slate-700">{children}</div>
    </section>
  );
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-3xl font-black">Help</h1>
      <Section title="Quick start">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Home → Open game board. Drag it to the TV or pick the TV screen first.</li>
          <li>On the iPad, scan the host QR code (Home) and enter the 6-digit host code.</li>
          <li>On the iPad: pick a board, choose Individuals or Teams, and create the game.</li>
          <li>Players scan the QR code on the TV, choose or create their profile with a 4-digit PIN, and tap Join game.</li>
          <li>Assign Joy-Cons or keys under Buzzers (optional — phones work as buzzers automatically).</li>
          <li>Start the game. Tap a clue on the iPad; it appears on the TV. You see the answer privately.</li>
          <li>Unlock buzzers, then mark Correct or Incorrect. Use Undo for mistakes.</li>
        </ol>
      </Section>
      <Section title="Scoring">
        <p>Correct answers add the clue value; incorrect answers subtract it (unless the Classroom preset is used). Scores can go negative. Tap a score on the iPad to award or deduct points by hand.</p>
        <p>In team games, points always go to the team. When a team member answers, they get personal credit as a statistic — the team never gets extra points for it. For shared buzzers, the host picks who answered or chooses "Team only / unknown".</p>
      </Section>
      <Section title="Daily Wagers and the Final">
        <p>Daily Wager clues are marked 🎲 on the iPad. The TV hides the clue until the wager is locked. The wager can be anything from the minimum up to the player's score or the round's highest value, whichever is larger.</p>
        <p>In the Final, players with a positive score wager privately from their phones (or the host types it in), then answer. The host reveals and judges each answer.</p>
      </Section>
      <Section title="Saving and resuming">
        <p>Every action is saved immediately. If the computer restarts, open OfflineJeopardy and the game is restored where it was (timers paused, buzzers locked for safety). The iPad can disconnect and reconnect at any time.</p>
      </Section>
      <Section title="Joy-Cons">
        <p>Pair each Joy-Con with Windows Bluetooth separately (hold the sync button on the rail). Each Joy-Con is an independent buzzer. Any button except Home, Capture, + and − buzzes by default.</p>
        <p>Joy-Con support uses Windows HID directly — no extra software is needed. It has been tested with simulated input; real-hardware behaviour can vary between Joy-Con models (see Known issues).</p>
      </Section>
      <Section title="Profiles and PINs">
        <p>A 4-digit PIN is a convenience lock for a trusted home network, not bank-level security. After 5 wrong PINs a profile is locked briefly. The host can reset a PIN under Players.</p>
      </Section>
      <Section title="Keyboard">
        <p>On the TV window, any key (except F11/Esc/Tab) can be assigned as a buzzer under Buzzers. F11 toggles full screen.</p>
      </Section>
    </div>
  );
}
