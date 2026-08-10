// Re-export from canonical
export { normalizeBookFormat, normalizeLanguageCode } from '../../../lib/canonical/constants';

/**
 * Normalize an ISBN string. Returns null if invalid.
 */
export function normalizeIsbn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const stripped = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const isbn = stripped.replace(/[^0-9X]/g, '');
  if (isbn.length === 10 || isbn.length === 13) {
    return isbn;
  }
  return null;
}

/**
 * Detect placeholder/generic Goodreads cover URLs. Returns true if it's a placeholder.
 */
export function isPlaceholderCover(url: string | null | undefined): boolean {
  if (!url) return true;
  const lowerUrl = url.toLowerCase();
  
  if (lowerUrl.includes('nophoto')) return true;
  if (lowerUrl.includes('nocover')) return true;
  if (lowerUrl.includes('/assets/')) return true;
  if (lowerUrl.includes('placeholder')) return true;
  if (lowerUrl.includes('default') && lowerUrl.includes('cover')) return true;
  
  if (lowerUrl.endsWith('no_cover.jpg')) return true;
  if (lowerUrl.endsWith('111x148-bcc042a9c91a29c1d680899eff700a03.png')) return true;
  
  return false;
}

/**
 * Normalize a publication date from year/month/day strings.
 */
export function normalizePublicationDate(
  year: string | null | undefined,
  month?: string | null | undefined,
  day?: string | null | undefined
): string | null {
  if (!year) return null;
  const parsedYear = parseInt(year, 10);
  if (isNaN(parsedYear) || parsedYear <= 0) return null;

  const yStr = parsedYear.toString().padStart(4, '0');
  
  if (!month) return yStr;
  const parsedMonth = parseInt(month, 10);
  if (isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) return yStr;
  
  const mStr = parsedMonth.toString().padStart(2, '0');

  if (!day) return `${yStr}-${mStr}`;
  const parsedDay = parseInt(day, 10);
  if (isNaN(parsedDay) || parsedDay < 1 || parsedDay > 31) return `${yStr}-${mStr}`;
  
  const dStr = parsedDay.toString().padStart(2, '0');
  return `${yStr}-${mStr}-${dStr}`;
}

/**
 * Normalize a title string: trim + collapse internal whitespace
 */
export function normalizeTitle(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Produce a lowercase, diacritics-stripped, whitespace-collapsed title key for dedup
 */
export function normalizedTitleKey(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Normalize a Goodreads contributor role to canonical role name and placement
 */
export function normalizeContributorRole(rawRole: string | null | undefined): {
  role: string;
  isEditionSpecific: boolean;
} {
  const roleStr = (rawRole || '').trim().toLowerCase();
  
  if (!roleStr || roleStr === 'author') {
    return { role: 'AUTHOR', isEditionSpecific: false };
  }
  
  switch (roleStr) {
    case 'author':
      return { role: 'AUTHOR', isEditionSpecific: false };
    case 'translator':
      return { role: 'TRANSLATOR', isEditionSpecific: true };
    case 'narrator':
      return { role: 'NARRATOR', isEditionSpecific: true };
    case 'illustrator':
      return { role: 'ILLUSTRATOR', isEditionSpecific: false };
    case 'editor':
      return { role: 'EDITOR', isEditionSpecific: true };
    case 'adaptation':
      return { role: 'ADAPTATION', isEditionSpecific: true };
    case 'introduction':
    case 'foreword':
    case 'preface':
    case 'afterword':
      return { role: 'CONTRIBUTOR', isEditionSpecific: true };
    default:
      return { role: 'CONTRIBUTOR', isEditionSpecific: true };
  }
}

/**
 * Parse a numeric string safely, returning 0 for missing/invalid
 */
export function safeInt(raw: string | null | undefined): number {
  if (!raw) return 0;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Produce a slug from a title string
 */
export function titleToSlug(raw: string): string {
  if (!raw) return 'untitled';
  
  const slug = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
    
  return slug || 'untitled';
}
