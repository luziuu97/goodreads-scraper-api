/**
 * Detects HTML that is not the real Goodreads page: WAF challenges, captchas, CDN walls.
 * Goodreads may return HTTP 200 with this body, so check content, not only status.
 */
export function isLikelyBlockedOrChallengeHtml(html: string): boolean {
  const lower = html.toLowerCase();
  return lower.includes(
    "in order to continue, we need to verify that you're not a robot",
  );
}
