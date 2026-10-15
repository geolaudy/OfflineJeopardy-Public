import { useEffect, useRef, useState } from 'react';
import { Camera, Smile } from 'lucide-react';
import { AVATARS, PLAYER_COLORS } from '../lib/avatars';
import { Avatar, Button, ColorPicker, Field, inputCls, cx } from './ui';

export function AvatarPicker({ value, onChange, list = AVATARS }: { value: string; onChange: (id: string) => void; list?: { id: string; emoji: string; label: string }[] }) {
  return (
    <div className="grid grid-cols-5 gap-2 sm:grid-cols-10" role="radiogroup" aria-label="Avatar">
      {list.map((a) => (
        <button
          key={a.id}
          type="button"
          role="radio"
          aria-checked={value === a.id}
          aria-label={a.label}
          onClick={() => onChange(a.id)}
          className={cx('flex aspect-square items-center justify-center rounded-xl text-3xl', value === a.id ? 'bg-blue-100 ring-4 ring-blue-600' : 'bg-slate-100')}
        >
          {a.emoji}
        </button>
      ))}
    </div>
  );
}

export interface NewProfile {
  name: string;
  nickname: string;
  color: string;
  avatar: string;
  pin: string;
  /** Uploaded profile picture, sent right after the profile is created (null = default picture). */
  picture?: File | null;
}

/**
 * One "Profile Picture" (R4-13): either an uploaded photo or one of the default pictures, always
 * previewed in the round frame with the colour ring exactly as the lobby shows it.
 */
export function ProfilePicturePicker({
  name,
  color,
  avatar,
  uploadUrl,
  usePicture,
  onAvatar,
  onUsePicture,
  onPickFile,
}: {
  name: string;
  color: string;
  avatar: string;
  /** The uploaded picture (or a local preview of it), kept while a default picture is chosen. */
  uploadUrl: string | null;
  /** The upload is the selected picture (otherwise the default picture `avatar`). */
  usePicture: boolean;
  /** A default picture was tapped (selects it; the upload is kept). */
  onAvatar: (id: string) => void;
  /** Go back to the uploaded picture. */
  onUsePicture: () => void;
  onPickFile: (f: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  // The tabs only switch what is browsed — looking at the default pictures changes nothing (R5-16).
  const [mode, setMode] = useState<'default' | 'upload'>(uploadUrl && usePicture ? 'upload' : 'default');
  const shown = usePicture ? uploadUrl : null;
  return (
    <div className="space-y-3" data-testid="picture-picker">
      <div className="flex justify-center">
        <Avatar profile={{ name, color, avatar, pictureUrl: shown }} size={104} />
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Profile picture">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'upload'}
          onClick={() => {
            setMode('upload');
            if (!uploadUrl) fileRef.current?.click();
          }}
          className={cx('flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold', mode === 'upload' ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600')}
          data-testid="picture-mode-upload"
        >
          <Camera size={16} aria-hidden /> Upload Picture
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'default'}
          onClick={() => setMode('default')}
          className={cx('flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold', mode === 'default' ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600')}
          data-testid="picture-mode-default"
        >
          <Smile size={16} aria-hidden /> Choose Default Picture
        </button>
      </div>
      {mode === 'default' ? (
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-10" role="radiogroup" aria-label="Default picture">
          {AVATARS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={!usePicture && avatar === a.id}
              aria-label={a.label}
              onClick={() => onAvatar(a.id)}
              className={cx('flex aspect-square items-center justify-center rounded-full p-0.5', !usePicture && avatar === a.id ? 'ring-4 ring-blue-600 ring-offset-2' : '')}
            >
              <Avatar profile={{ name, color, avatar: a.id, pictureUrl: null }} size={44} />
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {uploadUrl && !usePicture && (
            <Button type="button" size="sm" onClick={onUsePicture} data-testid="picture-use-upload">
              <img src={uploadUrl} alt="" className="size-6 rounded-full object-cover" /> Use my uploaded picture
            </Button>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()} data-testid="picture-choose-file">
            <Camera size={16} aria-hidden /> {uploadUrl ? 'Choose another picture' : 'Choose a picture'}
          </Button>
          <span className="w-full text-center text-xs text-slate-500">JPG, PNG or WebP from your phone, tablet or computer. It is resized and kept on the game computer.</span>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) {
            setMode('upload');
            onPickFile(f);
          }
        }}
        data-testid="picture-input"
      />
    </div>
  );
}

/** Previews a chosen file as an object URL (released when it changes). */
function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

/** Profile creation with PIN + confirmation. */
export function ProfileCreateForm({ onSubmit, busy, submitLabel = 'Create profile' }: { onSubmit: (p: NewProfile) => void; busy?: boolean; submitLabel?: string }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]);
  const [avatar, setAvatar] = useState(AVATARS[Math.floor(Math.random() * AVATARS.length)].id);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [picture, setPicture] = useState<File | null>(null);
  const [usePicture, setUsePicture] = useState(false);
  const preview = useObjectUrl(picture);
  const pinOk = /^\d{4}$/.test(pin);
  const match = pin === pin2;
  const valid = name.trim().length > 0 && pinOk && match;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit({ name: name.trim(), nickname: '', color, avatar, pin, picture: usePicture ? picture : null });
      }}
    >
      <Field label="Your name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoComplete="nickname" placeholder="e.g. Alex" name="name" />
      </Field>
      <Field label="Profile Picture" group>
        <ProfilePicturePicker
          name={name}
          color={color}
          avatar={avatar}
          uploadUrl={preview}
          usePicture={usePicture}
          onAvatar={(id) => {
            setAvatar(id);
            setUsePicture(false);
          }}
          onUsePicture={() => setUsePicture(true)}
          onPickFile={(f) => {
            setPicture(f);
            setUsePicture(true);
          }}
        />
      </Field>
      <Field label="Preferred Color" group hint="Used in a game whenever nobody else has it.">
        <ColorPicker value={color} onChange={setColor} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="4-digit PIN" hint="Leading zeros are fine">
          <input
            className={inputCls}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            inputMode="numeric"
            pattern="\d{4}"
            type="password"
            autoComplete="new-password"
            name="pin"
            aria-label="PIN"
          />
        </Field>
        <Field label="Confirm PIN">
          <input
            className={inputCls}
            value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 4))}
            inputMode="numeric"
            type="password"
            autoComplete="new-password"
            name="pin2"
            aria-label="Confirm PIN"
          />
        </Field>
      </div>
      {pin2.length === 4 && !match && <p className="text-sm font-semibold text-red-700">The PINs don't match.</p>}
      <p className="text-xs text-slate-500">Your PIN protects your profile on this game computer. It is stored securely and never shown again.</p>
      <Button type="submit" size="lg" className="w-full" disabled={!valid} busy={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}
