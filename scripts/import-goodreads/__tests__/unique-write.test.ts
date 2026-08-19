import {
  findOrCreateOnConflict,
  isUniqueConstraintError,
  withInflight,
} from '../../../lib/canonical/unique-write';

describe('isUniqueConstraintError', () => {
  test('recognizes Prisma P2002', () => {
    expect(isUniqueConstraintError({ code: 'P2002' })).toBe(true);
  });

  test('recognizes Postgres unique_violation 23505', () => {
    expect(isUniqueConstraintError({ code: '23505' })).toBe(true);
  });

  test('recognizes a wrapped Prisma unique error', () => {
    expect(isUniqueConstraintError({ cause: { code: 'P2002' } })).toBe(true);
  });

  test('rejects unrelated errors', () => {
    expect(isUniqueConstraintError({ code: 'P2025' })).toBe(false);
    expect(isUniqueConstraintError(new Error('boom'))).toBe(false);
    expect(isUniqueConstraintError(null)).toBe(false);
  });
});

describe('findOrCreateOnConflict', () => {
  test('returns the existing row without creating', async () => {
    const existing = { id: 'a1', slug: 'jane-doe' };
    const create = jest.fn();
    const result = await findOrCreateOnConflict({
      find: async () => existing,
      create,
    });
    expect(result).toBe(existing);
    expect(create).not.toHaveBeenCalled();
  });

  test('creates when no row exists', async () => {
    const created = { id: 'a2', slug: 'jane-doe' };
    const result = await findOrCreateOnConflict({
      find: async () => null,
      create: async () => created,
    });
    expect(result).toBe(created);
  });

  test('reuses the winner after a unique-constraint race', async () => {
    const winner = { id: 'a1', slug: 'jane-doe' };
    let finds = 0;
    const result = await findOrCreateOnConflict({
      find: async () => {
        finds += 1;
        return finds === 1 ? null : winner;
      },
      create: async () => {
        const err = new Error('Unique constraint failed on the fields: (`slug`)') as Error & { code: string };
        err.code = 'P2002';
        throw err;
      },
    });
    expect(result).toBe(winner);
  });

  test('does not invent a fallback row after a unique conflict', async () => {
    const err = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    await expect(
      findOrCreateOnConflict({
        find: async () => null,
        create: async () => {
          throw err;
        },
        retries: 1,
        retryDelayMs: 1,
      })
    ).rejects.toBe(err);
  });
});

describe('withInflight', () => {
  test('coalesces concurrent calls with the same key into one run', async () => {
    let runs = 0;
    const task = () =>
      withInflight('isbn:9781455510832', async () => {
        runs += 1;
        await new Promise((r) => setTimeout(r, 20));
        return 'work-1';
      });

    const [a, b] = await Promise.all([task(), task()]);
    expect(a).toBe('work-1');
    expect(b).toBe('work-1');
    expect(runs).toBe(1);
  });

  test('allows a later call after the first finishes', async () => {
    let runs = 0;
    const task = () =>
      withInflight('slug:ghost-queen', async () => {
        runs += 1;
        return runs;
      });

    expect(await task()).toBe(1);
    expect(await task()).toBe(2);
  });
});
