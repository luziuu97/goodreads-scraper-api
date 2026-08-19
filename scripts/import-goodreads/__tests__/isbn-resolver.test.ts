const mockFindMany = jest.fn();
const mockFindFirst = jest.fn();
const mockGetCached = jest.fn();
const mockSetCached = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    edition: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
    work: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

jest.mock('@/lib/redis-cache', () => ({
  getCachedResponse: (...args: unknown[]) => mockGetCached(...args),
  setCachedResponse: (...args: unknown[]) => mockSetCached(...args),
}));

import { resolveCanonicalByIsbn } from '../../../lib/canonical/resolver';

describe('resolveCanonicalByIsbn', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockFindFirst.mockReset();
    mockGetCached.mockReset();
    mockSetCached.mockReset();
    mockGetCached.mockResolvedValue(null);
    mockSetCached.mockResolvedValue(undefined);
  });

  test('returns the only edition when ISBN maps to one work', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'ed-1', workId: 'work-1', work: { popularityScore: 10, ratingsCount: 5 } },
    ]);

    const result = await resolveCanonicalByIsbn('9780062388148');
    expect(result).toEqual({ workId: 'work-1', editionId: 'ed-1' });
  });

  test('picks the more popular work when the same ISBN is on two works', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'ed-a', workId: 'work-a', work: { popularityScore: 1, ratingsCount: 2 } },
      { id: 'ed-b', workId: 'work-b', work: { popularityScore: 40, ratingsCount: 200 } },
    ]);

    const result = await resolveCanonicalByIsbn('9780062388148');
    expect(result).toEqual({ workId: 'work-b', editionId: 'ed-b' });
    expect(mockSetCached).toHaveBeenCalled();
  });

  test('returns null only when no edition exists', async () => {
    mockFindMany.mockResolvedValue([]);
    await expect(resolveCanonicalByIsbn('9780062388148')).resolves.toBeNull();
  });
});
