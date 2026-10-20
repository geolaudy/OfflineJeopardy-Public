// R14-11: the splash screen's page (splash.ts shows it): self-contained HTML, no network, no Node.
export const splashPage = (version: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>OfflineJeopardy</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; user-select: none; cursor: default; }
  body {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px;
    background: radial-gradient(ellipse at 50% 35%, #1a2bd8 0%, #0a14b0 45%, #030766 100%);
    color: #fff; font-family: 'Segoe UI', system-ui, sans-serif;
    opacity: 0; animation: in .35s ease-out forwards;
  }
  body.out { animation: out .25s ease-in forwards; }
  @keyframes in { to { opacity: 1; } }
  @keyframes out { from { opacity: 1; } to { opacity: 0; } }
  .name { text-align: center; line-height: .95; filter: drop-shadow(4px 4px 0 #000); }
  .name .a { display: block; font: 400 30px Impact, 'Arial Narrow Bold', 'Arial Black', sans-serif; letter-spacing: .32em; color: #fff; padding-left: .32em; }
  .name .b { display: block; font: 400 78px Impact, 'Arial Narrow Bold', 'Arial Black', sans-serif; letter-spacing: .02em; color: #e9b24f; }
  .box { width: 360px; display: flex; flex-direction: column; gap: 10px; }
  .status { min-height: 22px; font-size: 15px; font-weight: 600; text-align: center; color: #e2e8ff; }
  .bar { position: relative; height: 8px; overflow: hidden; border-radius: 99px; background: rgb(0 0 0 / .35); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .12); }
  .bar i { position: absolute; top: 0; bottom: 0; width: 38%; border-radius: 99px; background: linear-gradient(90deg, #c88a2c, #f5c96b, #c88a2c); animation: slide 1.25s ease-in-out infinite; }
  @keyframes slide { from { left: -38%; } to { left: 100%; } }
  body.failed .bar i { animation: none; left: 0; width: 100%; background: #dc2626; }
  body.failed .status { color: #fecaca; }
  .ver { position: fixed; bottom: 10px; right: 14px; font-size: 11px; color: rgb(255 255 255 / .45); }
</style></head>
<body>
  <div class="name" aria-label="OfflineJeopardy"><span class="a">OFFLINE</span><span class="b">JEOPARDY!</span></div>
  <div class="box"><div class="status" id="s" role="status">Initializing application…</div><div class="bar"><i></i></div></div>
  <div class="ver">Version ${version}</div>
  <script>
    window.setStatus = (t, failed) => { document.getElementById('s').textContent = t; document.body.classList.toggle('failed', !!failed); };
    window.fadeOut = () => document.body.classList.add('out');
  </script>
</body></html>`;
