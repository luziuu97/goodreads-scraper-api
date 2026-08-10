import { normalizeContributorRole } from '../lib/normalize';

describe('Contributor role placement', () => {
  test('primary author role goes to WorkContributor (isEditionSpecific=false)', () => {
    expect(normalizeContributorRole('Author')).toEqual({ role: 'AUTHOR', isEditionSpecific: false });
  });
  test('translator role goes to EditionContributor (isEditionSpecific=true)', () => {
    expect(normalizeContributorRole('Translator')).toEqual({ role: 'TRANSLATOR', isEditionSpecific: true });
  });
  test('narrator role goes to EditionContributor', () => {
    expect(normalizeContributorRole('Narrator')).toEqual({ role: 'NARRATOR', isEditionSpecific: true });
  });
  test('illustrator role goes to WorkContributor', () => {
    expect(normalizeContributorRole('Illustrator')).toEqual({ role: 'ILLUSTRATOR', isEditionSpecific: false });
  });
  test('editor role goes to EditionContributor', () => {
    expect(normalizeContributorRole('Editor')).toEqual({ role: 'EDITOR', isEditionSpecific: true });
  });
  test('foreword role maps to CONTRIBUTOR, EditionContributor', () => {
    expect(normalizeContributorRole('Foreword')).toEqual({ role: 'CONTRIBUTOR', isEditionSpecific: true });
  });
  test('empty role string maps to AUTHOR, WorkContributor', () => {
    expect(normalizeContributorRole('')).toEqual({ role: 'AUTHOR', isEditionSpecific: false });
  });
  test('unknown role maps to CONTRIBUTOR, EditionContributor', () => {
    expect(normalizeContributorRole('Something Else')).toEqual({ role: 'CONTRIBUTOR', isEditionSpecific: true });
  });
});
