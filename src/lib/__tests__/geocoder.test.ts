import { describe, it, expect } from 'vitest';
import { _buildGeocoderFallbacks as build } from '../geocoder';

// Each case lists the address we'd send first and the (ordered)
// fallback variants the geocoder should retry when the first try
// misses. The original address must never appear in the fallback
// list — the caller already sent that as the first attempt.

describe('_buildGeocoderFallbacks', () => {
  describe('addresses with no unit markers — no fallbacks', () => {
    const cases = [
      '60 Grafton Cres SW',
      '434 Patterson Blvd SW',
      '2 Cougarstone Pk SW',
      '1717 24A St SW',                  // suite-like char but not a unit marker
    ];
    for (const addr of cases) {
      it(`returns [] for ${JSON.stringify(addr)}`, () => {
        expect(build(addr)).toEqual([]);
      });
    }
  });

  describe('unit-dash-building prefix', () => {
    it('strips a simple numeric prefix', () => {
      expect(build('1602-1025 5 Ave SW')).toEqual(['1025 5 Ave SW']);
    });
    it('strips a single-digit prefix', () => {
      expect(build('2-1932 37 St SW')).toEqual(['1932 37 St SW']);
    });
    it('strips a letter+digits prefix', () => {
      expect(build('M403-1919 University Dr NW')).toEqual(['1919 University Dr NW']);
    });
    it('strips a letter-only prefix', () => {
      expect(build('a-606 25 Ave NE')).toEqual(['606 25 Ave NE']);
    });
    it('strips a digits+letter prefix', () => {
      expect(build('116a-3730 50 St NW')).toEqual(['3730 50 St NW']);
    });
    it('strips a digits+letter prefix with multiple letters', () => {
      expect(build('204c-5601 Dalton Dr NW')).toEqual(['5601 Dalton Dr NW']);
    });
    it('handles slash-separated unit-bld', () => {
      expect(build('5/1234 Main St SW')).toEqual(['1234 Main St SW']);
    });
  });

  describe('unit-style suffix', () => {
    it('strips "ste N"', () => {
      expect(build('80 Galbraith Dr SW ste 36')).toEqual(['80 Galbraith Dr SW']);
    });
    it('strips "Suite N" case-insensitively', () => {
      expect(build('7401 Springbank Blvd SW Suite 34')).toEqual(['7401 Springbank Blvd SW']);
    });
    it('strips "unit X" where X is a letter', () => {
      expect(build('20 14 St NW unit b')).toEqual(['20 14 St NW']);
    });
    it('strips "apt N"', () => {
      expect(build('123 Main St apt 5')).toEqual(['123 Main St']);
    });
    it('strips "#N"', () => {
      expect(build('123 Main St #5')).toEqual(['123 Main St']);
    });
  });

  describe('both prefix and suffix', () => {
    it('returns prefix-stripped, suffix-stripped, and both-stripped', () => {
      const got = build('M403-1919 University Dr NW unit 7');
      expect(got).toEqual([
        '1919 University Dr NW unit 7',          // prefix only
        'M403-1919 University Dr NW',            // suffix only
        '1919 University Dr NW',                 // both
      ]);
    });
  });

  describe('does not over-match', () => {
    it('does not treat a normal house number as a unit prefix', () => {
      // "5 Cougarstone..." has no dash/slash after the leading number,
      // so nothing to strip.
      expect(build('5 Cougarstone Pk SW')).toEqual([]);
    });
    it('does not strip a street name that happens to contain "apt"', () => {
      // Trailing "Apt" must be followed by a unit token; "Apt Lane" alone
      // (no following number/letter) isn't a unit marker.
      expect(build('123 Apt Lane SW')).toEqual([]);
    });
  });
});
