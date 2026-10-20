// R12-13: reading the hosting Wi-Fi from Windows' netsh output (sample outputs, no real network).
import { describe, expect, it } from 'vitest';
import { parseProfileXml, parseWlanInterfaces } from '../../src/server/wifi';

const ENGLISH = `
There is 1 interface on the system:

    Name                   : Wi-Fi
    Description            : Intel(R) Wi-Fi 6 AX201 160MHz
    GUID                   : 4b0c1e2a-0000-1111-2222-333344445555
    Physical address       : aa:bb:cc:dd:ee:ff
    Interface type         : Primary
    State                  : connected
    SSID                   : Home Network 5G
    AP BSSID               : 11:22:33:44:55:66
    Band                   : 5 GHz
    Channel                : 44
    Network type           : Infrastructure
    Radio type             : 802.11ax
    Authentication         : WPA2-Personal
    Cipher                 : CCMP
    Connection mode        : Auto Connect
    Receive rate (Mbps)    : 1201
    Transmit rate (Mbps)   : 1201
    Signal                 : 92%
    Profile                : Home Network 5G

    Hosted network status  : Not available
`;

const GERMAN_TWO = `
Es sind 2 Schnittstellen auf dem System vorhanden:

    Name                   : WLAN
    Beschreibung           : Realtek 8822CE
    GUID                   : 11111111-2222-3333-4444-555555555555
    Physische Adresse      : 00:11:22:33:44:55
    Status                 : Getrennt
    Funkstatus             : Hardware Ein

    Name                   : WLAN 2
    Beschreibung           : USB Adapter
    GUID                   : 66666666-2222-3333-4444-555555555555
    Physische Adresse      : 00:11:22:33:44:66
    Status                 : Verbunden
    SSID                   : Gäste
    BSSID                  : 11:22:33:44:55:77
    Profil                 : Gäste
`;

describe('netsh wlan show interfaces (R12-13)', () => {
  it('finds the adapter, its network and profile', () => {
    expect(parseWlanInterfaces(ENGLISH)).toEqual([{ name: 'Wi-Fi', ssid: 'Home Network 5G', profile: 'Home Network 5G' }]);
  });
  it('reads translated output and several adapters; a disconnected one has no network', () => {
    expect(parseWlanInterfaces(GERMAN_TWO)).toEqual([
      { name: 'WLAN', ssid: null, profile: null },
      { name: 'WLAN 2', ssid: 'Gäste', profile: 'Gäste' },
    ]);
  });
  it('no wireless adapter (Ethernet only, service off): nothing', () => {
    expect(parseWlanInterfaces('There is no wireless interface on the system.\r\n')).toEqual([]);
    expect(parseWlanInterfaces('')).toEqual([]);
  });
});

const profile = (security: string) => `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>Home &amp; Garden</name>
  <SSIDConfig><SSID><hex>486F6D65</hex><name>Home &amp; Garden</name></SSID></SSIDConfig>
  <connectionType>ESS</connectionType>
  <MSM><security>${security}</security></MSM>
</WLANProfile>`;

describe('exported WLAN profile (R12-13)', () => {
  it('a readable WPA2 key', () => {
    const p = parseProfileXml(profile('<authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption></authEncryption><sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>s3cret &lt;pw&gt;</keyMaterial></sharedKey>'));
    expect(p).toEqual({ ssid: 'Home & Garden', open: false, password: 's3cret <pw>' });
  });
  it('a key Windows keeps protected (no permission) is not used', () => {
    const p = parseProfileXml(profile('<authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption></authEncryption><sharedKey><keyType>passPhrase</keyType><protected>true</protected><keyMaterial>01000000D08C9DDF0115D1118C7A00C04FC297EB</keyMaterial></sharedKey>'));
    expect(p.password).toBeNull();
    expect(p.open).toBe(false);
  });
  it('an open network has no password', () => {
    const p = parseProfileXml(profile('<authEncryption><authentication>open</authentication><encryption>none</encryption></authEncryption>'));
    expect(p).toEqual({ ssid: 'Home & Garden', open: true, password: null });
  });
  it('enterprise (802.1X) networks have no shared key', () => {
    const p = parseProfileXml(profile('<authEncryption><authentication>WPA2</authentication><encryption>AES</encryption><useOneX>true</useOneX></authEncryption>'));
    expect(p.password).toBeNull();
    expect(p.open).toBe(false);
  });
});

describe('R14-5: hotspot and host-approved elevated read (fake PowerShell, no real network)', async () => {
  const { elevatedExportScript, encodePowerShell, hotspotConfig, hotspotScript, isHotspotAdapter, wifiPasswordElevated } = await import('../../src/server/wifi');
  const fs = await import('node:fs');
  const path = await import('node:path');

  it('recognises the Mobile Hotspot adapter by its Windows name', () => {
    expect(isHotspotAdapter('Local Area Connection* 10')).toBe(true);
    expect(isHotspotAdapter('LAN-Verbindung* 3')).toBe(true);
    expect(isHotspotAdapter('Wi-Fi')).toBe(false);
    expect(isHotspotAdapter('Ethernet 2')).toBe(false);
    expect(isHotspotAdapter(null)).toBe(false);
  });

  it('reads the hotspot name, and its passphrase only when asked', async () => {
    const scripts: string[] = [];
    const ps = async (s: string) => (scripts.push(s), { code: 0, stdout: JSON.stringify({ ssid: 'GAME-PC 1234', passphrase: s.includes('$c.Passphrase') ? 'hunter22' : null }) });
    expect(await hotspotConfig(false, ps)).toEqual({ ssid: 'GAME-PC 1234', passphrase: null });
    expect(await hotspotConfig(true, ps)).toEqual({ ssid: 'GAME-PC 1234', passphrase: 'hunter22' });
    expect(hotspotScript(false)).not.toContain('Passphrase;');
    expect(await hotspotConfig(true, async () => ({ code: 2, stdout: '' }))).toBeNull(); // no hotspot running
  });

  it('the elevated export runs netsh alone through Windows’ prompt, quoting the profile safely', () => {
    const s = elevatedExportScript("Bob's Wi-Fi", 'C:\Temp\oj-wlan-x');
    expect(s).toContain('-Verb RunAs');
    expect(s).toContain("-FilePath 'netsh.exe'");
    expect(s).toContain(`name="Bob''s Wi-Fi"`); // single quotes doubled inside the PowerShell string
    expect(s).toContain('exit 1223'); // cancelled prompt
    expect(Buffer.from(encodePowerShell(s), 'base64').toString('utf16le')).toBe(s);
  });

  it('a cancelled prompt is "declined"; an approved one hands back the password; nothing is left on disk', async () => {
    expect(await wifiPasswordElevated('Home', async () => ({ code: 1223, stdout: '' }))).toEqual({ ok: false, reason: 'declined' });
    let dir = '';
    const approved = async (script: string) => {
      dir = /folder="([^"]+)"/.exec(script)![1];
      fs.writeFileSync(path.join(dir, 'Wi-Fi-Home.xml'), '<WLANProfile><SSIDConfig><SSID><name>Home</name></SSID></SSIDConfig><MSM><security><authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption></authEncryption><sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>s3cret &amp; safe</keyMaterial></sharedKey></security></MSM></WLANProfile>');
      return { code: 0, stdout: '' };
    };
    expect(await wifiPasswordElevated('Home', approved)).toEqual({ ok: true, open: false, password: 's3cret & safe' });
    expect(fs.existsSync(dir)).toBe(false);
    // Names netsh cannot take are refused before anything runs.
    let ran = false;
    expect(await wifiPasswordElevated('Bad"name', async () => ((ran = true), { code: 0, stdout: '' }))).toEqual({ ok: false, reason: 'not-available' });
    expect(ran).toBe(false);
  });
});
