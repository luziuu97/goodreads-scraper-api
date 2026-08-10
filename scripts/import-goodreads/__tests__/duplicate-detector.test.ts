import { DuplicateDetector } from '../lib/duplicate-detector';

describe('DuplicateDetector', () => {
  test('groups works with same normalized title, year, media_type', () => {
    const detector = new DuplicateDetector();
    detector.addWork({ work_id: '1', original_title: 'Test Book', original_publication_year: '2020', media_type: 'book', ratings_count: 100, best_book_id: '101', text_reviews_count: 10 });
    detector.addWork({ work_id: '2', original_title: 'test book', original_publication_year: '2020', media_type: 'book', ratings_count: 200, best_book_id: '102', text_reviews_count: 20 });
    
    const candidates = detector.getCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].works).toHaveLength(2);
  });

  test('dominant work is the one with highest ratings_count', () => {
    const detector = new DuplicateDetector();
    detector.addWork({ work_id: '1', original_title: 'Book', original_publication_year: '2020', media_type: 'book', ratings_count: 100, best_book_id: '101', text_reviews_count: 10 });
    detector.addWork({ work_id: '2', original_title: 'Book', original_publication_year: '2020', media_type: 'book', ratings_count: 500, best_book_id: '102', text_reviews_count: 50 });
    detector.addWork({ work_id: '3', original_title: 'Book', original_publication_year: '2020', media_type: 'book', ratings_count: 50, best_book_id: '103', text_reviews_count: 5 });

    const candidates = detector.getCandidates();
    expect(candidates[0].dominant.work_id).toBe('2');
  });

  test('no candidates when all works are unique', () => {
    const detector = new DuplicateDetector();
    detector.addWork({ work_id: '1', original_title: 'Book A', original_publication_year: '2020', media_type: 'book', ratings_count: 100, best_book_id: '101', text_reviews_count: 10 });
    detector.addWork({ work_id: '2', original_title: 'Book B', original_publication_year: '2020', media_type: 'book', ratings_count: 100, best_book_id: '102', text_reviews_count: 10 });
    
    expect(detector.getCandidates()).toHaveLength(0);
  });

  test('skips works with empty original_title', () => {
    const detector = new DuplicateDetector();
    detector.addWork({ work_id: '1', original_title: '', original_publication_year: '2020', media_type: 'book', ratings_count: 100, best_book_id: '101', text_reviews_count: 10 });
    detector.addWork({ work_id: '2', original_title: '', original_publication_year: '2020', media_type: 'book', ratings_count: 200, best_book_id: '102', text_reviews_count: 20 });
    
    expect(detector.getCandidates()).toHaveLength(0);
  });

  test('different years = different groups', () => {
    const detector = new DuplicateDetector();
    detector.addWork({ work_id: '1', original_title: 'Book A', original_publication_year: '2020', media_type: 'book', ratings_count: 100, best_book_id: '101', text_reviews_count: 10 });
    detector.addWork({ work_id: '2', original_title: 'Book A', original_publication_year: '2021', media_type: 'book', ratings_count: 100, best_book_id: '102', text_reviews_count: 10 });
    
    expect(detector.getCandidates()).toHaveLength(0);
  });
});
