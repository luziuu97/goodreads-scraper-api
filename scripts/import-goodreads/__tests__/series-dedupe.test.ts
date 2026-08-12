import { collapseWorkSeries } from '../../../lib/canonical/reader';

describe('collapseWorkSeries', () => {
  test('keeps the Hardcover series with a position over a Goodreads import duplicate', () => {
    const series = collapseWorkSeries([
      {
        position: null,
        isPrimary: true,
        series: {
          id: 'gr-series',
          slug: 'percy-jackson-and-the-olympians-166250',
          canonicalName: 'Percy Jackson and the Olympians',
          externalIds: [{ provider: 'goodreads-dataset', externalId: '166250' }],
        },
      },
      {
        position: 1,
        isPrimary: true,
        series: {
          id: 'hc-series',
          slug: 'percy-jackson-and-the-olympians',
          canonicalName: 'Percy Jackson and the Olympians',
          externalIds: [{ provider: 'hardcover', externalId: '41764' }],
        },
      },
    ]);

    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({
      id: 'hc-series',
      slug: 'percy-jackson-and-the-olympians',
      name: 'Percy Jackson and the Olympians',
      position: 1,
      isPrimary: true,
    });
  });

  test('copies a known position onto the surviving series when the winner is missing one', () => {
    const series = collapseWorkSeries([
      {
        position: 3,
        isPrimary: false,
        series: {
          id: 'named',
          slug: 'the-empyrean-99999',
          canonicalName: 'The Empyrean',
          externalIds: [],
        },
      },
      {
        position: null,
        isPrimary: true,
        series: {
          id: 'clean',
          slug: 'the-empyrean',
          canonicalName: 'The Empyrean',
          externalIds: [{ provider: 'hardcover', externalId: '1' }],
        },
      },
    ]);

    expect(series).toHaveLength(1);
    expect(series[0].id).toBe('clean');
    expect(series[0].position).toBe(3);
  });

  test('keeps distinct series names', () => {
    const series = collapseWorkSeries([
      {
        position: 1,
        isPrimary: true,
        series: { id: 'a', slug: 'harry-potter', canonicalName: 'Harry Potter', externalIds: [] },
      },
      {
        position: 2,
        isPrimary: false,
        series: { id: 'b', slug: 'potter-companion', canonicalName: 'Harry Potter Companion', externalIds: [] },
      },
    ]);

    expect(series).toHaveLength(2);
  });
});
