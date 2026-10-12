import { useState } from 'react';
import { AVATARS, PLAYER_COLORS } from '../lib/avatars';
import { Button, ColorPicker, Field, inputCls, cx } from './ui';

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
}

/** Profile creation with PIN + confirmation. */
export function ProfileCreateForm({ onSubmit, busy, submitLabel = 'Create profile' }: { onSubmit: (p: NewProfile) => void; busy?: boolean; submitLabel?: string }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]);
  const [avatar, setAvatar] = useState(AVATARS[Math.floor(Math.random() * AVATARS.length)].id);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const pinOk = /^\d{4}$/.test(pin);
  const match = pin === pin2;
  const valid = name.trim().length > 0 && pinOk && match;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit({ name: name.trim(), nickname: '', color, avatar, pin });
      }}
    >
      <Field label="Your name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoComplete="nickname" placeholder="e.g. Alex" name="name" />
      </Field>
      <Field label="Avatar" group>
        <AvatarPicker value={avatar} onChange={setAvatar} />
      </Field>
      <Field label="Color" group>
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
