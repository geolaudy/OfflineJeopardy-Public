// Profile customization: name, nickname, picture (with crop), avatar, color, buzzer preferences, PIN.
import { useEffect, useRef, useState } from 'react';
import { meApi, tokens } from '../../lib/api';
import { Avatar, Button, ColorPicker, Field, Modal, inputCls, toast } from '../../components/ui';
import { AvatarPicker } from '../../components/ProfileForm';
import type { Me } from './JoinPage';

export default function ProfileTab({ me, setMe, signOut }: { me: Me; setMe: (m: Me) => void; signOut: (forget: boolean) => void }) {
  const [name, setName] = useState(me.name);
  const [nickname, setNickname] = useState(me.nickname);
  const [color, setColor] = useState(me.color);
  const [avatar, setAvatar] = useState(me.avatar);
  const [busy, setBusy] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(me.name);
    setNickname(me.nickname);
    setColor(me.color);
    setAvatar(me.avatar);
  }, [me.id, me.updatedAt]);

  const dirty = name !== me.name || nickname !== me.nickname || color !== me.color || avatar !== me.avatar;
  const save = async () => {
    setBusy(true);
    try {
      setMe(await meApi<Me>('PATCH', '/api/me', { name: name.trim(), nickname: nickname.trim(), color, avatar }));
      toast('Saved — the TV and host see it now', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const savePref = async (patch: Partial<Me>) => {
    try {
      setMe(await meApi<Me>('PATCH', '/api/me', patch));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col items-center gap-3">
        <Avatar profile={{ ...me, color, avatar }} size={112} />
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            📷 {me.pictureUrl ? 'Change photo' : 'Add photo'}
          </Button>
          {me.pictureUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                setMe(await meApi<Me>('DELETE', '/api/me/picture'));
              }}
            >
              Remove photo
            </Button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setFile(f);
            e.target.value = '';
          }}
          data-testid="picture-input"
        />
      </section>

      <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={30} aria-label="Name" />
        </Field>
        <Field label="Nickname (shown on the scoreboard)" hint="Optional">
          <input className={inputCls} value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={30} aria-label="Nickname" />
        </Field>
        <Field label="Avatar" group hint={me.pictureUrl ? 'Your photo is shown instead of the avatar.' : undefined}>
          <AvatarPicker value={avatar} onChange={setAvatar} />
        </Field>
        <Field label="Color" group>
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Button size="lg" className="w-full" disabled={!dirty || !name.trim()} busy={busy} onClick={save} data-testid="save-profile">
          Save changes
        </Button>
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h3 className="font-bold">Buzzer preferences</h3>
        <p className="text-xs text-slate-500">Tells the host what you like to use. The host still confirms which controller is yours.</p>
        <Field label="I prefer to buzz with">
          <select className={inputCls} value={me.preferredBuzzer} onChange={(e) => savePref({ preferredBuzzer: e.target.value })}>
            <option value="phone">My phone</option>
            <option value="joycon">A Joy-Con</option>
            <option value="keyboard">A keyboard key</option>
            <option value="gamepad">Another controller</option>
          </select>
        </Field>
        {me.preferredBuzzer === 'joycon' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Joy-Con side">
              <select className={inputCls} value={me.preferredSide} onChange={(e) => savePref({ preferredSide: e.target.value })}>
                <option value="any">No preference</option>
                <option value="L">Left (L)</option>
                <option value="R">Right (R)</option>
              </select>
            </Field>
            <Field label="Buzz button">
              <select className={inputCls} value={me.preferredButton} onChange={(e) => savePref({ preferredButton: e.target.value })}>
                {['any', 'SL', 'SR', 'A', 'B', 'X', 'Y', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'L', 'R', 'ZL', 'ZR'].map((b) => (
                  <option key={b} value={b}>
                    {b === 'any' ? 'Any button' : b}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="h-6 w-6 accent-blue-700" checked={me.statsPrivate} onChange={(e) => savePref({ statsPrivate: e.target.checked })} />
          <span>Keep my statistics private (hidden from the leaderboard)</span>
        </label>
      </section>

      <section className="grid gap-2">
        <Button variant="secondary" onClick={() => setPinOpen(true)}>
          Change PIN
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            downloadProfile().catch((e) => {
              toast((e as Error).message, 'error');
            })
          }
        >
          Download my data
        </Button>
        <Button variant="secondary" onClick={() => signOut(false)} data-testid="sign-out">
          Sign out
        </Button>
        <Button variant="ghost" onClick={() => signOut(true)}>
          Sign out on all devices
        </Button>
        <Button variant="ghost" className="text-red-700" onClick={() => setDelOpen(true)}>
          Delete my profile
        </Button>
      </section>
      {file && (
        <CropModal
          file={file}
          onClose={() => setFile(null)}
          onDone={(m) => {
            setMe(m);
            setFile(null);
            toast('Photo updated', 'success');
          }}
        />
      )}
      <ChangePin open={pinOpen} onClose={() => setPinOpen(false)} />
      <DeleteProfile open={delOpen} onClose={() => setDelOpen(false)} onDeleted={() => signOut(false)} />
    </div>
  );
}

async function downloadProfile() {
  const res = await fetch('/api/me/export', { headers: { authorization: `Bearer ${tokens.profile}` } });
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'my-offlinejeopardy-profile.json';
  a.click();
}

/** Square crop with zoom + position, then upload. Server re-validates, resizes and re-encodes. */
function CropModal({ file, onClose, onDone }: { file: File; onClose: () => void; onDone: (m: Me) => void }) {
  const [url] = useState(() => URL.createObjectURL(file));
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [px, setPx] = useState(0.5);
  const [py, setPy] = useState(0.5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  if (file.size > 10 * 1024 * 1024) {
    return (
      <Modal open onClose={onClose} title="Photo too large">
        <p>Please choose a photo smaller than 10 MB.</p>
      </Modal>
    );
  }
  // crop square side as fraction of the shorter edge
  const side = dims ? Math.min(dims.w, dims.h) / zoom : 0;
  const crop = dims
    ? {
        w: side / dims.w,
        h: side / dims.h,
        x: ((dims.w - side) * px) / dims.w,
        y: ((dims.h - side) * py) / dims.h,
      }
    : null;
  const upload = async () => {
    if (!crop) return;
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append('cropX', String(crop.x));
    fd.append('cropY', String(crop.y));
    fd.append('cropW', String(crop.w));
    fd.append('cropH', String(crop.h));
    fd.append('file', file, file.name || 'photo.jpg');
    try {
      onDone(await meApi<Me>('POST', '/api/me/picture', undefined, fd));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const previewSize = 220;
  return (
    <Modal open onClose={onClose} title="Position your photo">
      <div className="space-y-4">
        <div className="relative mx-auto overflow-hidden rounded-full bg-slate-200" style={{ width: previewSize, height: previewSize }}>
          <img
            src={url}
            alt="Preview"
            onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="absolute max-w-none"
            style={
              dims && crop
                ? {
                    width: (dims.w / side) * previewSize,
                    height: (dims.h / side) * previewSize,
                    left: -crop.x * (dims.w / side) * previewSize,
                    top: -crop.y * (dims.h / side) * previewSize,
                  }
                : { opacity: 0 }
            }
          />
        </div>
        <Field label="Zoom">
          <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full" />
        </Field>
        <Field label="Left / right">
          <input type="range" min={0} max={1} step={0.01} value={px} onChange={(e) => setPx(Number(e.target.value))} className="w-full" />
        </Field>
        <Field label="Up / down">
          <input type="range" min={0} max={1} step={0.01} value={py} onChange={(e) => setPy(Number(e.target.value))} className="w-full" />
        </Field>
        {err && <p className="font-semibold text-red-700">{err}</p>}
        <Button size="lg" className="w-full" onClick={upload} busy={busy} disabled={!dims} data-testid="upload-photo">
          Use this photo
        </Button>
        {!dims && <p className="text-center text-sm text-slate-500">Loading preview… (If this photo format can't be previewed, it may still upload fine.)</p>}
      </div>
    </Modal>
  );
}

function ChangePin({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = /^\d{4}$/.test(cur) && /^\d{4}$/.test(next) && next === next2;
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4);
  return (
    <Modal open={open} onClose={onClose} title="Change PIN">
      <div className="space-y-3">
        <Field label="Current PIN">
          <input className={inputCls} type="password" inputMode="numeric" value={cur} onChange={(e) => setCur(digits(e.target.value))} />
        </Field>
        <Field label="New PIN">
          <input className={inputCls} type="password" inputMode="numeric" value={next} onChange={(e) => setNext(digits(e.target.value))} />
        </Field>
        <Field label="Confirm new PIN">
          <input className={inputCls} type="password" inputMode="numeric" value={next2} onChange={(e) => setNext2(digits(e.target.value))} />
        </Field>
        {next2.length === 4 && next !== next2 && <p className="text-sm text-red-700">The new PINs don't match.</p>}
        <Button
          size="lg"
          className="w-full"
          disabled={!ok}
          busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await meApi('POST', '/api/me/pin', { currentPin: cur, newPin: next });
              toast('PIN changed', 'success');
              setCur('');
              setNext('');
              setNext2('');
              onClose();
            } catch (e) {
              toast((e as Error).message, 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          Change PIN
        </Button>
      </div>
    </Modal>
  );
}

function DeleteProfile({ open, onClose, onDeleted }: { open: boolean; onClose: () => void; onDeleted: () => void }) {
  const [pin, setPin] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Delete profile?">
      <div className="space-y-3">
        <p>Your name, photo and PIN are removed. Past game results stay in other players' history as "Deleted player".</p>
        <Field label="Enter your PIN to confirm">
          <input className={inputCls} type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
        </Field>
        <Button
          variant="danger"
          className="w-full"
          disabled={pin.length !== 4}
          onClick={async () => {
            try {
              await meApi('DELETE', '/api/me', { pin });
              tokens.profile = null;
              onDeleted();
            } catch (e) {
              toast((e as Error).message, 'error');
            }
          }}
        >
          Delete forever
        </Button>
      </div>
    </Modal>
  );
}
