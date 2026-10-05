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
 * Search engines — allowed only on /, /privacy, /terms
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
 * Spec §12.2: The allow list is checked first. Allowed bots never count as blocked.
 * Matching is case-insensitive.
 */
export function isBotBlocked(userAgent) {
  if (!userAgent) return false;

  // Check allow list first (Spec §12.2)
  const allowed = getAllowedBots();
  const userAgentLower = userAgent.toLowerCase();
  if (allowed.some(bot => userAgentLower.includes(bot.toLowerCase()))) {
    return false; // Allowed bots are never blocked
  }

  const blocked = getBlockedBots();
  return blocked.some(bot => userAgentLower.includes(bot.toLowerCase()));
}

/**
 * Check if a bot is allowed
 */
export function isBotAllowed(userAgent) {
  if (!userAgent) return false;

  const allowed = getAllowedBots();
  const searchEngines = SEARCH_ENGINES;
  const userAgentLower = userAgent.toLowerCase();

  // Check explicit allows (case-insensitive)
  if (allowed.some(bot => userAgentLower.includes(bot.toLowerCase()))) {
    return true;
  }

  // Check search engines (they're handled separately by path restrictions)
  if (searchEngines.some(bot => userAgentLower.includes(bot.toLowerCase()))) {
    return true;
  }

  return false;
}

/**
 * Check if a search engine is allowed on a specific path
 * Spec §17 decision 3: Search engines allowed only on /, /privacy, /terms
 * Accept both /privacy/ and /privacy (with or without trailing slash)
 * But do NOT allow child paths like /privacy/something
 */
export function isSearchEngineAllowedOnPath(userAgent, path) {
  if (!userAgent) return false;

  const searchEngines = SEARCH_ENGINES;
  const userAgentLower = userAgent.toLowerCase();
  const isSearchEngine = searchEngines.some(bot => userAgentLower.includes(bot.toLowerCase()));

  if (!isSearchEngine) return false;

  // Normalize path for comparison (remove trailing slash for /privacy and /terms)
  const normalizedPath = path === '/privacy/' ? '/privacy' :
                         path === '/terms/' ? '/terms' :
                         path;

  // Only allow on specific paths (exact match only, no children)
  return normalizedPath === '/' ||
         normalizedPath === '/privacy' ||
         normalizedPath === '/terms';
}
