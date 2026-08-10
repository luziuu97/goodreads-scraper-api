import { normalizedTitleKey } from './normalize';

export interface WorkRecord {
  work_id: string;
  original_title: string;
  best_book_id: string;
  ratings_count: number;
  text_reviews_count: number;
  original_publication_year: string;
  media_type: string;
  primaryAuthorId?: string;
}

export interface DuplicateCandidate {
  groupKey: string;
  works: WorkRecord[];
  dominant: WorkRecord;
  confidence: 'high' | 'medium';
}

export class DuplicateDetector {
  private groups: Map<string, WorkRecord[]> = new Map();

  addWork(work: WorkRecord): void {
    const normTitle = normalizedTitleKey(work.original_title);
    if (!normTitle) return;

    const groupKey = `${normTitle}|${work.original_publication_year || ''}|${work.media_type || ''}`;
    
    let group = this.groups.get(groupKey);
    if (!group) {
      group = [];
      this.groups.set(groupKey, group);
    }
    group.push(work);
  }

  getCandidates(minGroupSize: number = 2): DuplicateCandidate[] {
    const candidates: DuplicateCandidate[] = [];

    for (const [groupKey, works] of this.groups.entries()) {
      if (works.length >= minGroupSize) {
        let dominant = works[0];
        for (let i = 1; i < works.length; i++) {
          if (works[i].ratings_count > dominant.ratings_count) {
            dominant = works[i];
          }
        }

        const parts = groupKey.split('|');
        const hasYear = parts[1] !== '';

        candidates.push({
          groupKey,
          works,
          dominant,
          confidence: hasYear ? 'high' : 'medium'
        });
      }
    }

    return candidates;
  }
}
