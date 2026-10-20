// R12-13: the Wi-Fi the game is hosted on, for the lobby's "Join this Wi-Fi" step. Windows only,
// through Windows' own documented command (netsh wlan) — nothing bypassed. The password is read
// only when the host asks to show it, kept in memory only, and never logged. R14-5: where Windows
// keeps the saved password for administrators, the host may approve one elevated read (Windows'
// own permission prompt, on the game computer) — the app itself never runs elevated. A Windows
// Mobile Hotspot run by this computer is read through Windows' tethering API.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface WlanInterface {
  /** Adapter name ("Wi-Fi"), the same name os.networkInterfaces() uses. */
  name: string;
  /** Connected network, null when the adapter is not connected. */
  ssid: string | null;
  /** Saved profile used for the connection (usually the SSID). */
  profile: string | null;
}

/**
 * Parses `netsh wlan show interfaces`. Blocks are separated by blank lines; each starts with the
 * adapter's name. Labels other than "SSID" are translated on non-English Windows, so the name is
 * taken as the first "label : value" line of a block and the profile as the last one; SSID (not
 * BSSID) is the same everywhere and appears only while connected.
 */
export function parseWlanInterfaces(text: string): WlanInterface[] {
  const out: WlanInterface[] = [];
  for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    const pairs = block
      .split('\n')
      .map((l) => /^\s*([^:]+?)\s*:\s?(.*)$/.exec(l))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => [m[1].trim(), m[2].trim()] as const);
    const ssid = pairs.find(([k]) => k === 'SSID');
    if (!pairs.length || !(ssid || pairs.some(([k]) => k === 'BSSID' || /^(GUID|Physical address)$/i.test(k)))) continue;
    const profile = pairs.find(([k]) => /^(Profile|Profil|Perfil|Profilo|Profiel)$/i.test(k));
    out.push({ name: pairs[0][1], ssid: ssid?.[1] || null, profile: profile?.[1] || null });
  }
  return out.filter((i) => i.name);
}

/** Parses an exported WLAN profile (XML tags are never translated). */
export function parseProfileXml(xml: string): { ssid: string | null; open: boolean; password: string | null } {
  const tag = (t: string) => new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(xml)?.[1] ?? null;
  const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const ssidBlock = /<SSID>([\s\S]*?)<\/SSID>/.exec(xml)?.[1] ?? '';
  const ssid = /<name>([\s\S]*?)<\/name>/.exec(ssidBlock)?.[1] ?? null;
  const auth = tag('authentication');
  const open = auth === 'open' && (tag('encryption') ?? 'none') === 'none';
  // Without permission Windows exports the key encrypted (<protected>true</protected>): unusable.
  const key = tag('protected') === 'false' ? tag('keyMaterial') : null;
  return { ssid: ssid != null ? decode(ssid) : null, open, password: key != null ? decode(key) : null };
}

const run = (args: string[]) =>
  new Promise<string>((resolve, reject) =>
    execFile('netsh', args, { windowsHide: true, timeout: 6000, encoding: 'utf8' }, (err, stdout) => (err ? reject(err) : resolve(stdout))),
  );

/** Wireless adapters (Windows); empty elsewhere or when the WLAN service is not running. */
export async function wlanInterfaces(): Promise<WlanInterface[]> {
  if (process.platform !== 'win32') return [];
  try {
    return parseWlanInterfaces(await run(['wlan', 'show', 'interfaces']));
  } catch {
    return [];
  }
}

export type HostingWifi =
  | { ssid: string; adapter: string; profile: string; kind: 'wifi' | 'hotspot' }
  | { ssid: null; reason: 'unsupported' | 'ethernet' | 'not-connected' };

/** Windows names the virtual adapter of a Mobile Hotspot (Wi-Fi Direct) "<connection>* <n>"
 *  ("Local Area Connection* 10", "LAN-Verbindung* 3"). */
export const isHotspotAdapter = (name: string | null) => !!name && /\*\s*\d+$/.test(name);

/** The Wi-Fi network of the adapter the game is hosted on (the join QR's address). */
export async function hostingWifi(adapterName: string | null, hotspot: (withPassword: boolean) => Promise<HotspotConfig | null> = hotspotConfig): Promise<HostingWifi> {
  if (process.platform !== 'win32') return { ssid: null, reason: 'unsupported' };
  const list = await wlanInterfaces();
  const mine = adapterName ? list.find((i) => i.name.toLowerCase() === adapterName.toLowerCase()) : undefined;
  if (!mine && isHotspotAdapter(adapterName)) {
    // R14-5: players join this computer's own hotspot.
    const h = await hotspot(false);
    if (h) return { ssid: h.ssid, adapter: adapterName!, profile: '', kind: 'hotspot' };
  }
  // Hosting on a cable: the PC's Wi-Fi (if any) may be another network — never guess.
  if (!mine) return { ssid: null, reason: list.some((i) => i.ssid) || adapterName ? 'ethernet' : 'not-connected' };
  if (!mine.ssid) return { ssid: null, reason: 'not-connected' };
  return { ssid: mine.ssid, adapter: mine.name, profile: mine.profile ?? mine.ssid, kind: 'wifi' };
}

/** R14-5: PowerShell's -EncodedCommand form (UTF-16LE, base64): values never pass through a shell. */
export const encodePowerShell = (script: string) => Buffer.from(script, 'utf16le').toString('base64');
const psString = (s: string) => `'${s.replace(/'/g, "''")}'`;

type PsRunner = (script: string, timeoutMs: number) => Promise<{ code: number; stdout: string }>;
const runPowerShell: PsRunner = (script, timeoutMs) =>
  new Promise((resolve) =>
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShell(script)], { windowsHide: true, timeout: timeoutMs, encoding: 'utf8' }, (err, stdout) =>
      resolve({ code: err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : 1) : 0, stdout: stdout ?? '' }),
    ),
  );

export interface HotspotConfig {
  ssid: string;
  passphrase: string | null;
}

/** The script that reads the running Mobile Hotspot's network (and, when asked, its passphrase)
 *  through Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager. */
export function hotspotScript(withPassword: boolean) {
  return [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
    '$null = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime]',
    '$null = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]',
    'foreach ($p in [Windows.Networking.Connectivity.NetworkInformation]::GetConnectionProfiles()) {',
    '  try {',
    '    $m = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($p)',
    "    if ($m.TetheringOperationalState -ne 'On') { continue }",
    '    $c = $m.GetCurrentAccessPointConfiguration()',
    `    [Console]::Out.Write((@{ ssid = $c.Ssid; passphrase = ${withPassword ? '$c.Passphrase' : '$null'} } | ConvertTo-Json -Compress))`,
    '    exit 0',
    '  } catch { }',
    '}',
    'exit 2',
  ].join('\n');
}

/** The Mobile Hotspot this computer runs, or null (none running, or Windows refused). */
export async function hotspotConfig(withPassword: boolean, ps: PsRunner = runPowerShell): Promise<HotspotConfig | null> {
  if (process.platform !== 'win32' && ps === runPowerShell) return null;
  const r = await ps(hotspotScript(withPassword), 8000);
  if (r.code !== 0) return null;
  try {
    const j = JSON.parse(r.stdout) as { ssid?: unknown; passphrase?: unknown };
    return typeof j.ssid === 'string' && j.ssid ? { ssid: j.ssid, passphrase: typeof j.passphrase === 'string' && j.passphrase ? j.passphrase : null } : null;
  } catch {
    return null;
  }
}

export type PasswordResult = { ok: true; open: boolean; password: string | null } | { ok: false; reason: 'unsupported' | 'not-available' | 'declined' };

/**
 * The saved password of a WLAN profile, as Windows hands it to the signed-in user without
 * elevation (`netsh wlan export profile key=clear`). Where Windows keeps it protected — no admin
 * rights, enterprise networks — the result is 'not-available' and the host types it instead. The
 * export lands in a private temporary folder that is deleted straight away.
 */
export async function wifiPassword(profile: string): Promise<PasswordResult> {
  if (process.platform !== 'win32') return { ok: false, reason: 'unsupported' };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-wlan-'));
  try {
    await run(['wlan', 'export', 'profile', `name=${profile}`, 'key=clear', `folder=${dir}`]);
    const file = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith('.xml'));
    if (!file) return { ok: false, reason: 'not-available' };
    const p = parseProfileXml(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (p.open) return { ok: true, open: true, password: null };
    return p.password ? { ok: true, open: false, password: p.password } : { ok: false, reason: 'not-available' };
  } catch {
    return { ok: false, reason: 'not-available' };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** R14-5: the script for the host-approved elevated export. Start-Process -Verb RunAs shows Windows'
 *  own permission prompt (UAC) for netsh alone; cancelling it ends with ERROR_CANCELLED (1223). */
export function elevatedExportScript(profile: string, dir: string) {
  const args = `wlan export profile name="${profile}" key=clear folder="${dir}"`;
  return [
    "$ErrorActionPreference = 'Stop'",
    `try { $p = Start-Process -FilePath 'netsh.exe' -ArgumentList ${psString(args)} -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode } catch { exit 1223 }`,
  ].join('\n');
}

/**
 * R14-5: the saved password through one elevated netsh export — run only when the host asks for it
 * (the Windows prompt appears on the game computer; the host approves or cancels it there). The
 * export lands in a private temporary folder that is deleted straight away; nothing is logged.
 */
export async function wifiPasswordElevated(profile: string, ps: PsRunner = runPowerShell): Promise<PasswordResult> {
  if (process.platform !== 'win32' && ps === runPowerShell) return { ok: false, reason: 'unsupported' };
  // netsh cannot take a profile name with a double quote or a line break in its arguments.
  if (!profile || /["\r\n]/.test(profile)) return { ok: false, reason: 'not-available' };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-wlan-'));
  try {
    const r = await ps(elevatedExportScript(profile, dir), 120_000);
    if (r.code === 1223) return { ok: false, reason: 'declined' };
    const file = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith('.xml'));
    if (!file) return { ok: false, reason: 'not-available' };
    const p = parseProfileXml(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (p.open) return { ok: true, open: true, password: null };
    return p.password ? { ok: true, open: false, password: p.password } : { ok: false, reason: 'not-available' };
  } catch {
    return { ok: false, reason: 'not-available' };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
