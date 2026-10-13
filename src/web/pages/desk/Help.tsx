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
          <li>On the game computer, press <b>Create lobby</b>. The game board opens on the TV (or open /board on the TV computer).</li>
          <li>Scan the host QR code on the computer screen with the iPad camera — it pairs in one step. Or open the address shown and type the 6-digit host code. You can also host on the computer itself.</li>
          <li>On the iPad Home page: pick a board, choose Individuals or Teams and the rules, then press <b>Open lobby</b>.</li>
          <li>Players scan the QR code on the TV, choose or create their profile with a 4-digit PIN, and tap Join game.</li>
          <li>Assign Joy-Cons or keys under Buzzers (optional — phones work as buzzers automatically).</li>
          <li>Press <b>Start game</b>. Tap a clue on the iPad; it appears on the TV. You see the answer privately.</li>
          <li>Unlock buzzers, then mark Correct or Incorrect. Use Undo for mistakes.</li>
        </ol>
      </Section>
      <Section title="The TV while you set up">
        <p>While a lobby is open and <b>Present on TV</b> is on, the TV follows what you open on the iPad: the lobby, the leaderboard, a player's public statistics, teams, boards (categories only), the rules or the buzzer overview. Switch to <b>Private view</b> to browse without changing the TV. Answers, PINs, settings and device details are never shown on the TV.</p>
      </Section>
      <Section title="Before you start: buzzer check">
        <p>On the Buzzers page (or the lobby's Buzzers tab) press <b>Start check</b> and ask everyone to press their buzzer once. You see who registered, in which order, and how quick each phone's connection is. These presses never count in the game.</p>
        <p>Joy-Cons give a short vibration when their player buzzes in first, and two taps when someone buzzes too early. You can turn this off on the Buzzers page; <b>Identify</b> and <b>Vibrate</b> help find which Joy-Con is which.</p>
      </Section>
      <Section title="Teams and tournaments">
        <p>In a team game, <b>Make balanced teams</b> splits the players who joined into evenly matched teams based on their past games (new players count as average). Press Shuffle for another fair split.</p>
        <p>A <b>tournament</b> is a series of games with running standings. Create one under Tournaments, then choose it when you set up each game. Players see the standings on their phones, and you can show them on the TV.</p>
      </Section>
      <Section title="Scoring">
        <p>Correct answers add the clue value; incorrect answers subtract it (unless the Classroom preset is used). Scores can go negative. Tap a score on the iPad to award or deduct points by hand.</p>
        <p>In team games, points always go to the team. When a team member answers, they get personal credit as a statistic — the team never gets extra points for it. For shared buzzers, the host picks who answered or chooses "Team only / unknown".</p>
      </Section>
      <Section title="Daily Wagers and the Final">
        <p>Daily Wager clues are marked with a dice icon on the iPad. The TV hides the clue until the wager is locked. The wager can be anything from the minimum up to the player's score or the round's highest value, whichever is larger.</p>
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
