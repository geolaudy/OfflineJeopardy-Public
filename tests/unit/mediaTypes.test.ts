import { describe, expect, it } from 'vitest';
import { acceptFor, formatList, MEDIA_FORMATS } from '../../src/shared/mediaTypes';
import { sniffMedia } from '../../src/server/images';

describe('media picker formats (R3-1)', () => {
  it('lists explicit extensions per kind so Windows file dialogs filter correctly', () => {
    const audio = acceptFor('audio').split(',');
    expect(audio).toEqual(expect.arrayContaining(['.mp3', '.wav', '.ogg', '.m4a', 'audio/mpeg']));
    expect(audio.some((a) => a.startsWith('image') || a === '.png')).toBe(false);
    expect(acceptFor('image')).not.toMatch(/audio|video|\.mp3/);
    expect(acceptFor('video').split(',')).toEqual(expect.arrayContaining(['.mp4', '.webm']));
    // No kind = everything
    expect(acceptFor()).toContain('.png');
    expect(acceptFor()).toContain('.mp3');
    expect(acceptFor()).toContain('.webm');
    expect(acceptFor()).not.toContain('*');
  });

  it('matches what the server sniffs', () => {
    expect(sniffMedia(Buffer.from('ID3xxxxxxxxxxxxx'))?.kind).toBe('audio');
    expect(sniffMedia(Buffer.from('OggSxxxxxxxxxxxx'))?.kind).toBe('audio');
    expect(MEDIA_FORMATS.audio.exts).toContain('.ogg');
    expect(formatList('audio')).toBe('MP3, M4A, WAV, OGG');
    expect(formatList('image')).toBe('JPG, PNG, WEBP, GIF, AVIF, TIFF');
  });
});
