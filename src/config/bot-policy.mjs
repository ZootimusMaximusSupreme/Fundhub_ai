/**
 * Bot policy for Fundhub
 *
 * Spec: docs/specs/marketing-machine-2026-10-04.md, Appendix C
 * - Blocked bots: AI crawlers, scrapers, and other unwanted agents
 * - Allowed bots: Meta link previews, ad review, search engines (limited), our scanner
 * - Search engines: restricted to /, /privacy, /terms only
 */

/**
 * AI crawlers and fetchers — all blocked
 */
export const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  'Claude-Web',
  'CCBot',
  'PerplexityBot',
  'Perplexity-User',
  'GoogleOther',
  'Bytespider',
  'Amazonbot',
  'meta-externalagent',
  'meta-externalfetcher',
  'meta-webindexer',
  'FacebookBot',
  'cohere-ai',
  'cohere-training-data-crawler',
  'Diffbot',
  'DuckAssistBot',
  'MistralAI-User',
  'YouBot',
  'AI2Bot',
  'Ai2Bot-Dolma',
  'Timpibot',
  'ImagesiftBot',
  'Omgilibot',
  'omgili',
  'PetalBot',
  'img2dataset',
  'Webzio-Extended',
  'ICC-Crawler',
];

/**
 * AI training opt-out tokens (robots.txt only)
 */
export const AI_TRAINING_OPT_OUT = [
  'Google-Extended',
  'Applebot-Extended',
];

/**
 * Scrapers and SEO tools — all blocked
 */
export const SCRAPERS = [
  'AhrefsBot',
  'SemrushBot',
  'MJ12bot',
  'DotBot',
  'DataForSeoBot',
  'BLEXBot',
  'Barkrowler',
  'SeekportBot',
  'serpstatbot',
  'ia_archiver',
  'archive.org_bot',
  'Scrapy',
];

/**
 * Link previews and ad review — all allowed
 * These must remain allowed for Meta ad review and link previews to work.
 */
export const ALLOWED_LINK_PREVIEWS_AND_ADS = [
  'facebookexternalhit',
  'Facebot',
  'meta-externalads',
  'AdsBot-Google',
  'AdsBot-Google-Mobile',
  'Twitterbot',
  'LinkedInBot',
  'Slackbot-LinkExpanding',
  'TelegramBot',
  'WhatsApp',
  'Discordbot',
];

/**
 * Search engines — allowed only on /, /privacy/, /terms/
 */
export const SEARCH_ENGINES = [
  'Googlebot',
  'Bingbot',
  'DuckDuckBot',
  'Applebot',
];

/**
 * Restricted paths for search engines
 */
export const SEARCH_ENGINE_ALLOWED_PATHS = [
  '/',
  '/privacy/',
  '/terms/',
];

/**
 * Our own scanner — identified by header
 */
export const FUNDHUB_SCANNER_HEADER = 'x-fundhub-scan';

/**
 * Get all blocked bots (union of AI crawlers and scrapers, excluding opt-outs)
 */
export function getBlockedBots() {
  return [...AI_CRAWLERS, ...SCRAPERS];
}

/**
 * Get all allowed bots
 */
export function getAllowedBots() {
  return ALLOWED_LINK_PREVIEWS_AND_ADS;
}

/**
 * Check if a bot is blocked
 */
export function isBotBlocked(userAgent) {
  if (!userAgent) return false;

  const blocked = getBlockedBots();
  return blocked.some(bot => userAgent.includes(bot));
}

/**
 * Check if a bot is allowed
 */
export function isBotAllowed(userAgent) {
  if (!userAgent) return false;

  const allowed = getAllowedBots();
  const searchEngines = SEARCH_ENGINES;

  // Check explicit allows
  if (allowed.some(bot => userAgent.includes(bot))) {
    return true;
  }

  // Check search engines (they're handled separately by path restrictions)
  if (searchEngines.some(bot => userAgent.includes(bot))) {
    return true;
  }

  return false;
}

/**
 * Check if a search engine is allowed on a specific path
 * Search engines are only allowed on: /, /privacy/, /terms/
 */
export function isSearchEngineAllowedOnPath(userAgent, path) {
  if (!userAgent) return false;

  const searchEngines = SEARCH_ENGINES;
  const isSearchEngine = searchEngines.some(bot => userAgent.includes(bot));

  if (!isSearchEngine) return false;

  // Only allow on specific paths
  if (path === '/') return true;
  if (path === '/privacy/') return true;
  if (path === '/terms/') return true;

  // Also allow children of /privacy/ and /terms/
  if (path.startsWith('/privacy/')) return true;
  if (path.startsWith('/terms/')) return true;

  return false;
}
