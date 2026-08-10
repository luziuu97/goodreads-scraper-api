import { BoundedTopHeap } from '../lib/heap';

type WorkItem = { work_id: number; ratings_count: number; text_reviews_count: number };

const comparator = (a: WorkItem, b: WorkItem): number => {
  if (a.ratings_count !== b.ratings_count) return a.ratings_count - b.ratings_count;
  if (a.text_reviews_count !== b.text_reviews_count) return a.text_reviews_count - b.text_reviews_count;
  return b.work_id - a.work_id; // work_id ASC = larger work_id evicted
};

describe('BoundedTopHeap', () => {
  test('selects top N from more than N items', () => {
    const heap = new BoundedTopHeap<WorkItem>(3, comparator);
    heap.push({ work_id: 1, ratings_count: 10, text_reviews_count: 0 });
    heap.push({ work_id: 2, ratings_count: 50, text_reviews_count: 0 });
    heap.push({ work_id: 3, ratings_count: 30, text_reviews_count: 0 });
    heap.push({ work_id: 4, ratings_count: 40, text_reviews_count: 0 });
    heap.push({ work_id: 5, ratings_count: 20, text_reviews_count: 0 });

    const top = heap.toArray();
    // Top 3 should be 2 (50), 4 (40), 3 (30)
    expect(top).toHaveLength(3);
    const ids = top.map(x => x.work_id).sort();
    expect(ids).toEqual([2, 3, 4]);
  });

  test('deterministic tie-breaking by work_id ASC', () => {
    const heap = new BoundedTopHeap<WorkItem>(2, comparator);
    // same ratings, same reviews, so lower work_id is preferred (bigger work_id evicted)
    heap.push({ work_id: 1, ratings_count: 10, text_reviews_count: 5 });
    heap.push({ work_id: 3, ratings_count: 10, text_reviews_count: 5 });
    heap.push({ work_id: 2, ratings_count: 10, text_reviews_count: 5 });

    const top = heap.toArray();
    expect(top).toHaveLength(2);
    const ids = top.map(x => x.work_id).sort();
    expect(ids).toEqual([1, 2]); // 3 gets evicted
  });

  test('heap with exactly N items', () => {
    const heap = new BoundedTopHeap<WorkItem>(3, comparator);
    heap.push({ work_id: 1, ratings_count: 10, text_reviews_count: 0 });
    heap.push({ work_id: 2, ratings_count: 50, text_reviews_count: 0 });
    heap.push({ work_id: 3, ratings_count: 30, text_reviews_count: 0 });

    const top = heap.toArray();
    expect(top).toHaveLength(3);
    const ids = top.map(x => x.work_id).sort();
    expect(ids).toEqual([1, 2, 3]);
  });

  test('heap with fewer than N items', () => {
    const heap = new BoundedTopHeap<WorkItem>(5, comparator);
    heap.push({ work_id: 1, ratings_count: 10, text_reviews_count: 0 });
    heap.push({ work_id: 2, ratings_count: 50, text_reviews_count: 0 });

    const top = heap.toArray();
    expect(top).toHaveLength(2);
    const ids = top.map(x => x.work_id).sort();
    expect(ids).toEqual([1, 2]);
  });

  test('single item', () => {
    const heap = new BoundedTopHeap<WorkItem>(2, comparator);
    heap.push({ work_id: 1, ratings_count: 10, text_reviews_count: 0 });

    const top = heap.toArray();
    expect(top).toHaveLength(1);
    expect(top[0].work_id).toBe(1);
  });

  test('all same ratings_count ties broken by text_reviews_count', () => {
    const heap = new BoundedTopHeap<WorkItem>(2, comparator);
    heap.push({ work_id: 1, ratings_count: 10, text_reviews_count: 5 });
    heap.push({ work_id: 2, ratings_count: 10, text_reviews_count: 20 });
    heap.push({ work_id: 3, ratings_count: 10, text_reviews_count: 10 });

    const top = heap.toArray();
    expect(top).toHaveLength(2);
    const ids = top.map(x => x.work_id).sort();
    expect(ids).toEqual([2, 3]); // Highest text_reviews_count are 20 and 10
  });

  test('all same ratings_count and text_reviews_count ties broken by work_id', () => {
    const heap = new BoundedTopHeap<WorkItem>(2, comparator);
    heap.push({ work_id: 5, ratings_count: 10, text_reviews_count: 5 });
    heap.push({ work_id: 2, ratings_count: 10, text_reviews_count: 5 });
    heap.push({ work_id: 1, ratings_count: 10, text_reviews_count: 5 });
    heap.push({ work_id: 4, ratings_count: 10, text_reviews_count: 5 });

    const top = heap.toArray();
    expect(top).toHaveLength(2);
    const ids = top.map(x => x.work_id).sort();
    expect(ids).toEqual([1, 2]); // Lowest work_ids are preferred
  });
});
