// @vitest-environment jsdom
// Gamepad buzz-button choices have readable names (R7-32).
import { describe, expect, it } from 'vitest';
import { buttonChoiceLabel } from '../../src/web/components/ControllersPanel';

describe('gamepad button labels (R7-32)', () => {
  it('names shoulders, triggers and groups', () => {
    expect(buttonChoiceLabel('gamepad', 'any')).toBe('Any button');
    expect(buttonChoiceLabel('gamepad', 'B6')).toBe('LT / ZL');
    expect(buttonChoiceLabel('gamepad', 'B4,B6')).toBe('LB / L or LT / ZL');
    expect(buttonChoiceLabel('gamepad', 'B4,B5,B6,B7')).toBe('Any shoulder or trigger');
    expect(buttonChoiceLabel('joycon', 'SL,SR')).toBe('SL,SR');
  });
});
