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
        <p>While a lobby is open and <b>Present on TV</b> is on, the TV follows what you open on the iPad: the lobby, the leaderboard, a player's public statistics, teams, boards (categories only), the game settings or the buzzer overview. Switch to <b>Private view</b> to browse without changing the TV. Answers, PINs and device details are never shown on the TV.</p>
        <p>Before you press <b>Open lobby</b>, the TV previews the boards (following the one you are looking at) and the game settings — the players' join code appears only once the lobby is open.</p>
        <p><b>Show Leaderboards on TV</b> (Leaderboards page, game menu, results) and <b>Show on TV</b> (Settings and game setup) work even in Private view. While the leaderboard is on the TV, changing the ranking updates it straight away; tap a player or team to show their statistics, then <b>Previous page</b> or <b>Lobby</b> to go back.</p>
      </Section>
      <Section title="After a game">
        <p><b>Return to Lobby</b> keeps everyone in: players, teams, Joy-Cons, phones, the board and the settings. Scores, used clues and buzzes start over; the finished game is already saved in History. <b>New Lobby</b> starts fresh — players join again.</p>
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
      <Section title="Daily Doubles and Final Jeopardy!">
        <p>Daily Double! clues are marked with a dice icon on the iPad. The TV hides the clue until the wager is locked. The wager can be anything from the minimum up to the player's score or the round's highest value, whichever is larger.</p>
        <p>In Final Jeopardy!, players with a positive score wager and answer on their own phones (teams: any member). Nobody sees the wagers or answers — not even the host — until the reveal. The 30-second think music plays while they write. Then the host reveals one contestant at a time, lowest score first: who it is, their wager, their answer, then Correct or Incorrect. A player without a working phone can tell the host privately (Final screen → “A player can't use their device?”).</p>
      </Section>
      <Section title="Sounds and TV look">
        <p>Settings → Sounds: <b>Jeopardy!/Buzzinga</b> (default) plays your own game-show sound files; <b>Classic</b>, <b>Arcade</b> and <b>Soft</b> are built in. Press <b>Add sound files</b> and pick files named like <code>board_fill.mp3</code>, <code>buzzed_in.mp3</code>, <code>correct_answer.mp3</code>, <code>wrong_answer.mp3</code>, <code>daily_double.mp3</code>, <code>times_up.mp3</code>, <code>catagory_swipe.mp3</code>, <code>final_category_reveal.mp3</code> and <code>final_jeopardy_think.mp3</code>. Sounds without a file use the Classic tone. Sounds play only on the TV.</p>
        <p>The TV uses free look-alike fonts. If you own ITC Korinna or Swiss 911 Compressed, install them in Windows — or put <code>clue.woff2</code>, <code>category.woff2</code> and <code>value.woff2</code> in the <code>fonts</code> folder next to the game data — and the TV uses them.</p>
      </Section>
      <Section title="AI helpers (optional)">
        <p>Everything works without AI. If you like, Settings → AI answers connects a model: a <b>local AI</b> such as Ollama or LM Studio on this computer or your network (free, no internet) or Anthropic (needs an API key and internet; may cost money). Computer opponents set to <b>AI answers</b> then answer more naturally, and Boards → <b>Create with AI</b> writes a first draft of a board from a topic. AI drafts are marked “AI-generated” — check every clue before playing.</p>
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
      <Section title="Computer opponents">
        <p>Computer opponents (solo games) pick a clue when it is their turn, buzz in and give an answer. Their answer appears on your screen and on the TV, the answer timer stops, and <b>you decide</b> Correct or Incorrect — nothing is scored automatically. Easy bots guess more and are slower; Expert bots rarely miss.</p>
        <p>Optional: in Settings you can connect an AI service so bots set to <b>AI answers</b> sound more natural. It needs internet and your own API key (it may cost money). Without it — or whenever it fails — bots answer offline.</p>
      </Section>
      <Section title="Keyboard">
        <p>On the TV window, any key (except F11/Esc/Tab) can be assigned as a buzzer under Buzzers. F11 toggles full screen.</p>
      </Section>
    </div>
  );
}
