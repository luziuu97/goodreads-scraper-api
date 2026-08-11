import { prisma } from '../lib/db';
import { normalizeSearchText } from '../lib/canonical/constants';
import { toIso639_1 } from '../lib/languages';

async function main() {
  const [duplicateIsbn13, duplicateIsbn10, titles, translations, editions] = await Promise.all([
    prisma.edition.groupBy({
      by: ['isbn13'],
      where: { isbn13: { not: null } },
      _count: { _all: true },
      having: { isbn13: { _count: { gt: 1 } } },
    }),
    prisma.edition.groupBy({
      by: ['isbn10'],
      where: { isbn10: { not: null } },
      _count: { _all: true },
      having: { isbn10: { _count: { gt: 1 } } },
    }),
    prisma.workTitle.findMany({ select: { id: true, title: true, normalizedTitle: true } }),
    prisma.workTranslation.findMany({ select: { workId: true, language: true } }),
    prisma.edition.findMany({ select: { language: true } }),
  ]);

  const titleKeyMismatches = titles.filter(
    (title) => title.normalizedTitle !== normalizeSearchText(title.title)
  );
  const logicalTranslations = new Map<string, number>();
  for (const translation of translations) {
    const language = toIso639_1(translation.language) || translation.language;
    const key = `${translation.workId}:${language}`;
    logicalTranslations.set(key, (logicalTranslations.get(key) || 0) + 1);
  }
  const duplicateTranslationLanguages = [...logicalTranslations.values()].filter((count) => count > 1).length;
  const nonCanonicalEditionLanguages = editions.filter(
    (edition) => edition.language && edition.language !== 'und' && toIso639_1(edition.language) !== edition.language
  ).length;

  console.log(JSON.stringify({
    duplicateIsbn13Groups: duplicateIsbn13.length,
    duplicateIsbn10Groups: duplicateIsbn10.length,
    duplicateIsbn13,
    duplicateIsbn10,
    titleKeyMismatches: titleKeyMismatches.length,
    duplicateTranslationLanguageGroups: duplicateTranslationLanguages,
    nonCanonicalEditionLanguages,
    undeterminedEditionLanguages: editions.filter((edition) => edition.language === 'und').length,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
