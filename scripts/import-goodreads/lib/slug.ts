import { titleToSlug } from './normalize';

export function makeSlug(title: string, fallbackId?: string): string {
  const slug = titleToSlug(title);
  if (!slug || slug === 'untitled') {
    return fallbackId ? `work-${fallbackId}` : 'work-unknown';
  }
  return slug;
}

export function makeUniqueSlug(
  title: string,
  fallbackId: string,
  usedSlugs: Set<string>
): string {
  const baseSlug = makeSlug(title, fallbackId);
  
  if (!usedSlugs.has(baseSlug)) {
    usedSlugs.add(baseSlug);
    return baseSlug;
  }

  let attempt = `${baseSlug}-${fallbackId}`;
  if (!usedSlugs.has(attempt)) {
    usedSlugs.add(attempt);
    return attempt;
  }

  let counter = 2;
  while (true) {
    attempt = `${baseSlug}-${fallbackId}-${counter}`;
    if (!usedSlugs.has(attempt)) {
      usedSlugs.add(attempt);
      return attempt;
    }
    counter++;
  }
}

export function makeAuthorSlug(
  name: string,
  authorId: string,
  usedSlugs: Set<string>
): string {
  let baseSlug = titleToSlug(name);
  if (!baseSlug || baseSlug === 'untitled') {
    baseSlug = `author-${authorId}`;
  }

  if (!usedSlugs.has(baseSlug)) {
    usedSlugs.add(baseSlug);
    return baseSlug;
  }

  let attempt = `${baseSlug}-${authorId}`;
  if (!usedSlugs.has(attempt)) {
    usedSlugs.add(attempt);
    return attempt;
  }

  let counter = 2;
  while (true) {
    attempt = `${baseSlug}-${authorId}-${counter}`;
    if (!usedSlugs.has(attempt)) {
      usedSlugs.add(attempt);
      return attempt;
    }
    counter++;
  }
}

export function makeSeriesSlug(
  title: string,
  seriesId: string,
  usedSlugs: Set<string>
): string {
  let baseSlug = titleToSlug(title);
  if (!baseSlug || baseSlug === 'untitled') {
    baseSlug = `series-${seriesId}`;
  }

  if (!usedSlugs.has(baseSlug)) {
    usedSlugs.add(baseSlug);
    return baseSlug;
  }

  let attempt = `${baseSlug}-${seriesId}`;
  if (!usedSlugs.has(attempt)) {
    usedSlugs.add(attempt);
    return attempt;
  }

  let counter = 2;
  while (true) {
    attempt = `${baseSlug}-${seriesId}-${counter}`;
    if (!usedSlugs.has(attempt)) {
      usedSlugs.add(attempt);
      return attempt;
    }
    counter++;
  }
}
