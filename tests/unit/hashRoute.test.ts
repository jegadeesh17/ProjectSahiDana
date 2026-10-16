import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  guardStep,
  hashFor,
  parseHash,
  useAuditDrawerHistory,
  useHashStep,
} from '../../src/lib/hashRoute';

describe('hashRoute (Change 4 hash navigation, guards and drawer history)', () => {
  beforeEach(() => {
    window.location.hash = '';
    window.history.replaceState(null, '', '/');
  });

  describe('parseHash and hashFor', () => {
    it('maps empty hash, #/ and unknown hashes to null (ARCHITECTURE line 1717)', () => {
      expect(parseHash('')).toBeNull();
      expect(parseHash('#')).toBeNull();
      expect(parseHash('#/')).toBeNull();
      expect(parseHash('#/unknown')).toBeNull();
      expect(parseHash('#/home')).toBeNull();
      expect(parseHash('#/result/extra')).toBeNull();
    });

    it('parses valid step hashes with or without trailing slash', () => {
      expect(parseHash('#/animals')).toBe('animals');
      expect(parseHash('#/animals/')).toBe('animals');
      expect(parseHash('#/feeds')).toBe('feeds');
      expect(parseHash('#/feeds/')).toBe('feeds');
      expect(parseHash('#/result')).toBe('result');
      expect(parseHash('#/result/')).toBe('result');
    });

    it('generates correct hash addresses', () => {
      expect(hashFor('animals')).toBe('#/animals');
      expect(hashFor('feeds')).toBe('#/feeds');
      expect(hashFor('result')).toBe('#/result');
    });
  });

  describe('guardStep (Navigation rules: SPEC AC-C4-1.1, AC-C4-E1)', () => {
    it('#/feeds or #/result without at least 1 animal redirects to animals', () => {
      expect(guardStep('feeds', { hasAnimals: false, hasBudget: true, hasPlan: false })).toBe('animals');
      expect(guardStep('result', { hasAnimals: false, hasBudget: true, hasPlan: true })).toBe('animals');
    });

    it('#/feeds or #/result without valid budget redirects to animals', () => {
      expect(guardStep('feeds', { hasAnimals: true, hasBudget: false, hasPlan: false })).toBe('animals');
      expect(guardStep('result', { hasAnimals: true, hasBudget: false, hasPlan: true })).toBe('animals');
    });

    it('#/result with plan === null redirects to feeds (unless calculating)', () => {
      expect(guardStep('result', { hasAnimals: true, hasBudget: true, hasPlan: false })).toBe('feeds');
      expect(guardStep('result', { hasAnimals: true, hasBudget: true, hasPlan: false, calculating: true })).toBe('result');
    });

    it('allows valid steps when guard conditions are satisfied', () => {
      expect(guardStep('animals', { hasAnimals: false, hasBudget: false, hasPlan: false })).toBe('animals');
      expect(guardStep('feeds', { hasAnimals: true, hasBudget: true, hasPlan: false })).toBe('feeds');
      expect(guardStep('result', { hasAnimals: true, hasBudget: true, hasPlan: true })).toBe('result');
    });
  });

  describe('useHashStep hook', () => {
    it('normalises no hash to #/animals (ARCHITECTURE line 1850)', () => {
      window.location.hash = '';
      const { result } = renderHook(() => useHashStep());

      expect(result.current[0]).toBe('animals');
      expect(window.location.hash).toBe('#/animals');
    });

    it('normalises #/ to #/animals', () => {
      window.location.hash = '#/';
      const { result } = renderHook(() => useHashStep());

      expect(result.current[0]).toBe('animals');
      expect(window.location.hash).toBe('#/animals');
    });

    it('normalises unknown hash to #/animals', () => {
      window.location.hash = '#/bogus-screen';
      const { result } = renderHook(() => useHashStep());

      expect(result.current[0]).toBe('animals');
      expect(window.location.hash).toBe('#/animals');
    });

    it('updates step and history on go()', () => {
      window.location.hash = '#/animals';
      const { result } = renderHook(() => useHashStep());

      act(() => {
        result.current[1]('feeds');
      });

      expect(result.current[0]).toBe('feeds');
      expect(window.location.hash).toBe('#/feeds');
    });

    it('popstate changes the step (ARCHITECTURE line 1850)', () => {
      window.location.hash = '#/animals';
      const { result } = renderHook(() => useHashStep());

      act(() => {
        window.location.hash = '#/feeds';
        window.dispatchEvent(new PopStateEvent('popstate'));
      });

      expect(result.current[0]).toBe('feeds');

      act(() => {
        window.location.hash = '#/result';
        window.dispatchEvent(new PopStateEvent('popstate'));
      });

      expect(result.current[0]).toBe('result');
    });

    it('enforces guards and redirects invalid routes (SPEC AC-C4-1.1)', () => {
      // Trying to open #/feeds without animals redirects to animals
      window.location.hash = '#/feeds';
      const { result } = renderHook(() =>
        useHashStep({
          hasAnimals: false,
          hasBudget: true,
          hasPlan: false,
        }),
      );

      expect(result.current[0]).toBe('animals');
      expect(window.location.hash).toBe('#/animals');
    });

    it('redirects #/result to #/feeds when plan is null (AC-C4-E1)', () => {
      window.location.hash = '#/result';
      const { result } = renderHook(() =>
        useHashStep({
          hasAnimals: true,
          hasBudget: true,
          hasPlan: false,
        }),
      );

      expect(result.current[0]).toBe('feeds');
      expect(window.location.hash).toBe('#/feeds');
    });
  });

  describe('Audit drawer history entry and Back behavior (AC-C4-R5, ARCHITECTURE line 1850)', () => {
    it('the drawer entry is closed by Back without a step change', () => {
      window.location.hash = '#/animals';
      const { result: stepResult } = renderHook(() => useHashStep());
      expect(stepResult.current[0]).toBe('animals');

      const onClose = vi.fn();
      const { rerender } = renderHook(
        ({ isOpen }) => useAuditDrawerHistory(isOpen, onClose),
        { initialProps: { isOpen: false } },
      );

      // Open drawer: pushes history entry with same hash
      act(() => {
        rerender({ isOpen: true });
      });

      expect(window.location.hash).toBe('#/animals');
      expect(stepResult.current[0]).toBe('animals');

      // Phone Back button pressed -> popstate event dispatched
      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate'));
      });

      // Drawer is closed via callback
      expect(onClose).toHaveBeenCalled();
      // Screen step is preserved without change
      expect(stepResult.current[0]).toBe('animals');
      expect(window.location.hash).toBe('#/animals');
    });
  });
});
