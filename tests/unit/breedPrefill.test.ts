import { describe, expect, it } from 'vitest';
import { auditPrefillFat, auditPrefillWeight } from '../../src/domain/auditHerd';
import { breedById, breedPrefill, BREEDS } from '../../src/domain/breeds';
import type { BreedStandard } from '../../src/domain/types';

describe('breedPrefill (Change 4 breed defaults and cited prefill audits)', () => {
  const rathi = breedById('rathi', BREEDS)!;
  const sahiwal = breedById('sahiwal', BREEDS)!;
  const kankrej = breedById('kankrej', BREEDS)!;
  const hfCrossbred = breedById('hf_crossbred', BREEDS)!;
  const ndCow = breedById('nondescript_cow', BREEDS)!;
  const ndBuffalo = breedById('nondescript_buffalo', BREEDS)!;

  it('finds all required benchmark breeds in the compiled database', () => {
    expect(rathi).toBeDefined();
    expect(sahiwal).toBeDefined();
    expect(kankrej).toBeDefined();
    expect(hfCrossbred).toBeDefined();
    expect(ndCow).toBeDefined();
    expect(ndBuffalo).toBeDefined();
  });

  describe('Rathi (cited weight and midpoint fat)', () => {
    it('returns weight 295 kg and fat 3.85% calculated as midpoint of 3.7–4.0% (AC-C4-1.3, AC-C4-1.4)', () => {
      const prefill = breedPrefill(rathi);
      expect(prefill).toEqual({
        weightKg: 295,
        fatPct: 3.85,
        fatIsMidpoint: true,
      });
    });

    it('generates cited audit for weight matching AC-C4-1.3', () => {
      const audit = auditPrefillWeight(rathi);
      expect(audit).not.toBeNull();
      if (!audit) return;

      expect(audit.originType).toBe('cited_source');
      expect(audit.numericValue).toBe(295);
      expect(audit.formattedValue).toContain('295');
      expect(audit.formattedValue).toContain('kg');
      expect(audit.citation?.doc).toContain('NDDB, Dairying in Rajasthan 2016');
      expect(audit.citation?.table).toBe('Table III.2.1');
      expect(audit.citation?.page).toBe('p. 46');
      expect(audit.notes?.[0].en).toBe('typical female body weight from the breed table');
      expect(audit.notes?.[0].hi).toBe('नस्ल की तालिका से मादा का आम वज़न');
    });

    it('generates midpoint audit for fat matching AC-C4-1.4', () => {
      const audit = auditPrefillFat(rathi);
      expect(audit).not.toBeNull();
      if (!audit) return;

      expect(audit.originType).toBe('cited_source');
      expect(audit.numericValue).toBe(3.85);
      expect(audit.formattedValue).toBe('3.85%');
      expect(audit.citation?.formula).toBe('(low + high) / 2 = (3.7 + 4) / 2 = 3.85');
      expect(audit.notes?.[0].en).toBe('calculated from cited range');
      expect(audit.notes?.[0].hi).toBe('प्रकाशित सीमा से निकाला गया');
      expect(audit.extraRows).toEqual([
        { label: { hi: 'सीमा का निचला सिरा', en: 'Low end of the range' }, value: '3.7%' },
        { label: { hi: 'सीमा का ऊपरी सिरा', en: 'High end of the range' }, value: '4%' },
      ]);
    });
  });

  describe('Sahiwal (single cited fat value)', () => {
    it('returns weight 298 kg and fat 4.93% as single value, not a midpoint (AC-C4-1.4)', () => {
      const prefill = breedPrefill(sahiwal);
      expect(prefill).toEqual({
        weightKg: 298,
        fatPct: 4.93,
        fatIsMidpoint: false,
      });
    });

    it('generates cited audit without midpoint formula or extra rows (AC-C4-1.4)', () => {
      const audit = auditPrefillFat(sahiwal);
      expect(audit).not.toBeNull();
      if (!audit) return;

      expect(audit.originType).toBe('cited_source');
      expect(audit.numericValue).toBe(4.93);
      expect(audit.formattedValue).toBe('4.93%');
      expect(audit.citation?.formula).toBeUndefined();
      expect(audit.notes).toBeUndefined();
      expect(audit.extraRows).toBeUndefined();
      expect(audit.citation?.doc).toContain('NDDB');
    });
  });

  describe('Blank breeds remain blank', () => {
    const blankBreeds: [string, BreedStandard][] = [
      ['Kankrej', kankrej],
      ['HF crossbred', hfCrossbred],
      ['Non-descript cow', ndCow],
      ['Non-descript buffalo', ndBuffalo],
    ];

    it.each(blankBreeds)('%s has null prefill for weight and fat', (_name, breed) => {
      const prefill = breedPrefill(breed);
      expect(prefill.weightKg).toBeNull();
      expect(prefill.fatPct).toBeNull();
      expect(prefill.fatIsMidpoint).toBe(false);
    });

    it.each(blankBreeds)('%s returns null audits for weight and fat', (_name, breed) => {
      expect(auditPrefillWeight(breed)).toBeNull();
      expect(auditPrefillFat(breed)).toBeNull();
    });
  });

  describe('Typed value persistence across breed selection (SPEC AC-C4-1.5)', () => {
    interface CardState {
      breedId: string;
      weightText: string;
      weightTyped: boolean;
      fatText: string;
      fatTyped: boolean;
    }

    function onSelectBreed(state: CardState, nextBreed: BreedStandard): CardState {
      const pf = breedPrefill(nextBreed);
      return {
        ...state,
        breedId: nextBreed.id,
        // Typed value wins; untouched re-prefills
        weightText: state.weightTyped ? state.weightText : pf.weightKg !== null ? String(pf.weightKg) : '',
        fatText: state.fatTyped ? state.fatText : pf.fatPct !== null ? String(pf.fatPct) : '',
      };
    }

    it('preserves user typed weight when user switches breeds', () => {
      // 1. Initially select Rathi: prefilled with 295 kg and 3.85%
      const rathiPf = breedPrefill(rathi);
      let card: CardState = {
        breedId: rathi.id,
        weightText: String(rathiPf.weightKg),
        weightTyped: false,
        fatText: String(rathiPf.fatPct),
        fatTyped: false,
      };

      // 2. User types custom weight 340 kg
      card.weightText = '340';
      card.weightTyped = true;

      // 3. User switches to Sahiwal
      card = onSelectBreed(card, sahiwal);

      // Typed weight 340 must survive, fat re-prefills to Sahiwal's 4.93
      expect(card.weightText).toBe('340');
      expect(card.weightTyped).toBe(true);
      expect(card.fatText).toBe('4.93');
      expect(card.fatTyped).toBe(false);

      // 4. User switches to Kankrej (blank breed)
      card = onSelectBreed(card, kankrej);

      // Typed weight 340 still survives, fat becomes empty
      expect(card.weightText).toBe('340');
      expect(card.weightTyped).toBe(true);
      expect(card.fatText).toBe('');
      expect(card.fatTyped).toBe(false);
    });

    it('preserves user typed fat when user switches breeds', () => {
      const rathiPf = breedPrefill(rathi);
      let card: CardState = {
        breedId: rathi.id,
        weightText: String(rathiPf.weightKg),
        weightTyped: false,
        fatText: String(rathiPf.fatPct),
        fatTyped: false,
      };

      // User types custom fat 4.2%
      card.fatText = '4.2';
      card.fatTyped = true;

      // User switches to Sahiwal
      card = onSelectBreed(card, sahiwal);

      // Weight updates to Sahiwal 298, typed fat 4.2 survives
      expect(card.weightText).toBe('298');
      expect(card.weightTyped).toBe(false);
      expect(card.fatText).toBe('4.2');
      expect(card.fatTyped).toBe(true);
    });
  });
});
