import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  assertTransition,
  canTransition,
  allowedTransitions,
  isTerminal,
} from '../../src/modules/orders/orderStateMachine.js';
import { ORDER_STATUSES, ACTOR_TYPES } from '../../src/shared/constants.js';

/**
 * The authoritative table from master-sdd 7.3, transcribed independently of the
 * implementation. If the implementation grows an eleventh edge, TC-197 fails
 * before any behavioural test has to catch it.
 */
const SPEC_TABLE = {
  PENDING: {
    CONFIRMED: ['RESTAURANT'],
    CANCELLED: ['CUSTOMER', 'RESTAURANT', 'ADMIN', 'SYSTEM'],
  },
  CONFIRMED: {
    PREPARING: ['RESTAURANT'],
    CANCELLED: ['CUSTOMER', 'RESTAURANT', 'ADMIN'],
  },
  PREPARING: {
    READY_FOR_PICKUP: ['RESTAURANT'],
    CANCELLED: ['RESTAURANT', 'ADMIN'],
  },
  READY_FOR_PICKUP: {
    OUT_FOR_DELIVERY: ['DRIVER'],
    CANCELLED: ['ADMIN'],
  },
  OUT_FOR_DELIVERY: {
    DELIVERED: ['DRIVER'],
    CANCELLED: ['ADMIN'],
  },
  DELIVERED: {},
  CANCELLED: {},
};

describe('TC-197: the implementation table matches the SDD', () => {
  it('has exactly the documented from-states', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual(Object.keys(SPEC_TABLE).sort());
  });

  it('has exactly the documented edges and actor lists', () => {
    for (const [from, edges] of Object.entries(SPEC_TABLE)) {
      expect(Object.keys(TRANSITIONS[from]).sort()).toEqual(Object.keys(edges).sort());
      for (const [to, actors] of Object.entries(edges)) {
        expect([...TRANSITIONS[from][to]].sort()).toEqual([...actors].sort());
      }
    }
  });

  it('declares exactly 10 legal edges', () => {
    const edgeCount = Object.values(TRANSITIONS).reduce(
      (n, edges) => n + Object.keys(edges).length,
      0,
    );
    expect(edgeCount).toBe(10);
  });
});

describe('TC-198: all 245 status x status x role combinations', () => {
  const combinations = [];
  for (const from of ORDER_STATUSES) {
    for (const to of ORDER_STATUSES) {
      for (const actor of ACTOR_TYPES) {
        combinations.push([from, to, actor]);
      }
    }
  }

  it('covers 7 x 7 x 5 = 245 combinations', () => {
    expect(combinations).toHaveLength(245);
  });

  it.each(combinations)('%s -> %s as %s matches the spec table', (from, to, actor) => {
    const expected = (SPEC_TABLE[from]?.[to] ?? []).includes(actor);
    // A reason is supplied so that reason-required edges are judged on the
    // transition itself rather than on a missing field.
    const attempt = () => assertTransition(from, to, { actorRole: actor, reason: 'OUT_OF_STOCK' });

    if (expected) {
      expect(attempt).not.toThrow();
      expect(canTransition(from, to, actor)).toBe(true);
    } else {
      expect(attempt).toThrow();
      expect(canTransition(from, to, actor)).toBe(false);
    }
  });

  it("permits exactly 16 actor-qualified transitions and refuses 229", () => {
    const permitted = combinations.filter(([f, t, a]) => canTransition(f, t, a));
    expect(permitted).toHaveLength(16);
    expect(combinations.length - permitted.length).toBe(229);
  });

  it('rejects every refusal with INVALID_ORDER_TRANSITION', () => {
    for (const [from, to, actor] of combinations) {
      if (canTransition(from, to, actor)) continue;
      try {
        assertTransition(from, to, { actorRole: actor, reason: 'OUT_OF_STOCK' });
        throw new Error(`expected refusal for ${from} -> ${to} as ${actor}`);
      } catch (err) {
        expect(err.code).toBe('INVALID_ORDER_TRANSITION');
        expect(err.status).toBe(409);
      }
    }
  });
});

describe('TC-199: self-transitions are refused', () => {
  it.each(ORDER_STATUSES)('%s -> itself is refused for every actor', (status) => {
    for (const actor of ACTOR_TYPES) {
      expect(() => assertTransition(status, status, { actorRole: actor })).toThrow();
    }
  });
});

describe('TC-200: terminal states permit nothing, including for ADMIN', () => {
  it.each(['DELIVERED', 'CANCELLED'])('%s has no outgoing edge', (terminal) => {
    expect(isTerminal(terminal)).toBe(true);
    for (const to of ORDER_STATUSES) {
      for (const actor of ACTOR_TYPES) {
        expect(() => assertTransition(terminal, to, { actorRole: actor, reason: 'ADMIN_INTERVENTION' }))
          .toThrow();
      }
    }
  });

  it('an admin cannot resurrect a delivered order', () => {
    expect(() =>
      assertTransition('DELIVERED', 'OUT_FOR_DELIVERY', { actorRole: 'ADMIN', reason: 'ADMIN_INTERVENTION' }),
    ).toThrow(/final/i);
  });
});

describe('TC-201: status skipping is refused', () => {
  const skips = [
    ['PENDING', 'PREPARING'],
    ['PENDING', 'READY_FOR_PICKUP'],
    ['PENDING', 'DELIVERED'],
    ['CONFIRMED', 'READY_FOR_PICKUP'],
    ['PREPARING', 'OUT_FOR_DELIVERY'],
    ['READY_FOR_PICKUP', 'DELIVERED'],
  ];
  it.each(skips)('%s -> %s is refused for every actor', (from, to) => {
    for (const actor of ACTOR_TYPES) {
      expect(() => assertTransition(from, to, { actorRole: actor })).toThrow();
    }
  });
});

describe('TC-202: backwards transitions are refused', () => {
  const backwards = [
    ['CONFIRMED', 'PENDING'],
    ['PREPARING', 'CONFIRMED'],
    ['READY_FOR_PICKUP', 'PREPARING'],
    ['OUT_FOR_DELIVERY', 'READY_FOR_PICKUP'],
    ['DELIVERED', 'OUT_FOR_DELIVERY'],
  ];
  it.each(backwards)('%s -> %s is refused', (from, to) => {
    for (const actor of ACTOR_TYPES) {
      expect(() => assertTransition(from, to, { actorRole: actor })).toThrow();
    }
  });
});

describe('TC-213: a legal edge is still closed to the wrong actor', () => {
  it('PREPARING -> CANCELLED is legal for RESTAURANT and ADMIN', () => {
    expect(() => assertTransition('PREPARING', 'CANCELLED', { actorRole: 'RESTAURANT', reason: 'OUT_OF_STOCK' }))
      .not.toThrow();
    expect(() => assertTransition('PREPARING', 'CANCELLED', { actorRole: 'ADMIN', reason: 'ADMIN_INTERVENTION' }))
      .not.toThrow();
  });

  it('but a CUSTOMER may not cancel once the food is being cooked', () => {
    expect(() => assertTransition('PREPARING', 'CANCELLED', { actorRole: 'CUSTOMER' }))
      .toThrow(/may not move it/i);
  });

  it('the customer window closes after CONFIRMED', () => {
    expect(() => assertTransition('PENDING', 'CANCELLED', { actorRole: 'CUSTOMER' })).not.toThrow();
    expect(() => assertTransition('CONFIRMED', 'CANCELLED', { actorRole: 'CUSTOMER' })).not.toThrow();
    expect(() => assertTransition('READY_FOR_PICKUP', 'CANCELLED', { actorRole: 'CUSTOMER' })).toThrow();
    expect(() => assertTransition('OUT_FOR_DELIVERY', 'CANCELLED', { actorRole: 'CUSTOMER' })).toThrow();
  });
});

describe('TC-220: a reason is mandatory for restaurant and admin cancellations', () => {
  it('refuses a restaurant cancellation with no reason', () => {
    expect(() => assertTransition('PENDING', 'CANCELLED', { actorRole: 'RESTAURANT' }))
      .toThrow(/reason is required/i);
  });

  it('refuses an admin cancellation with no reason', () => {
    expect(() => assertTransition('READY_FOR_PICKUP', 'CANCELLED', { actorRole: 'ADMIN' }))
      .toThrow(/reason is required/i);
  });

  it('allows a customer cancellation without one (it defaults)', () => {
    expect(() => assertTransition('PENDING', 'CANCELLED', { actorRole: 'CUSTOMER' })).not.toThrow();
  });

  it('allows the SYSTEM timeout cancellation', () => {
    expect(() => assertTransition('PENDING', 'CANCELLED', { actorRole: 'SYSTEM' })).not.toThrow();
  });
});

describe('allowedTransitions', () => {
  it('reports what each actor may do next', () => {
    expect(allowedTransitions('PENDING', 'RESTAURANT').sort()).toEqual(['CANCELLED', 'CONFIRMED']);
    expect(allowedTransitions('PENDING', 'CUSTOMER')).toEqual(['CANCELLED']);
    expect(allowedTransitions('PREPARING', 'CUSTOMER')).toEqual([]);
    expect(allowedTransitions('READY_FOR_PICKUP', 'DRIVER')).toEqual(['OUT_FOR_DELIVERY']);
    expect(allowedTransitions('DELIVERED', 'ADMIN')).toEqual([]);
  });
});

describe('unknown statuses', () => {
  it('refuses a status that is not in the machine', () => {
    expect(() => assertTransition('NOT_A_STATUS', 'PENDING', { actorRole: 'ADMIN' }))
      .toThrow(/Unknown order status/);
  });
});
