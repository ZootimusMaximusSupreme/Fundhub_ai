import { test } from 'node:test';
import assert from 'node:assert';
import {
  ALLOWED_LINK_PREVIEWS_AND_ADS,
  SEARCH_ENGINES,
  SEARCH_ENGINE_ALLOWED_PATHS,
  getBlockedBots,
  getAllowedBots,
  isBotBlocked,
  isBotAllowed,
  isSearchEngineAllowedOnPath,
} from './bot-policy.mjs';

test('critical bots must stay allowed', () => {
  const critical = [
    'facebookexternalhit',
    'Facebot',
    'meta-externalads',
    'AdsBot-Google',
    'AdsBot-Google-Mobile',
  ];

  for (const bot of critical) {
    assert.ok(!isBotBlocked(bot), `${bot} must not be blocked`);
    assert.ok(getAllowedBots().some(b => bot.includes(b) || bot.includes(b)), `${bot} must be in allowed list`);
  }
});

test('Applebot must be allowed on home page', () => {
  const applebotUserAgent = 'Applebot/1.0';
  const homePath = '/';

  assert.ok(isSearchEngineAllowedOnPath(applebotUserAgent, homePath), 'Applebot should be allowed on /');
  assert.ok(!isBotBlocked(applebotUserAgent), 'Applebot must not be blocked');
});

test('critical link preview bots are in allowed list', () => {
  const critical = [
    'facebookexternalhit',
    'Facebot',
    'meta-externalads',
    'AdsBot-Google',
    'AdsBot-Google-Mobile',
  ];

  const allowed = ALLOWED_LINK_PREVIEWS_AND_ADS;

  for (const bot of critical) {
    const found = allowed.includes(bot);
    assert.ok(found, `${bot} must be in ALLOWED_LINK_PREVIEWS_AND_ADS list`);
  }
});

test('search engines are restricted to allowed paths', () => {
  const searchBots = ['Googlebot', 'Bingbot', 'DuckDuckBot', 'Applebot'];

  for (const bot of searchBots) {
    assert.ok(isSearchEngineAllowedOnPath(`${bot}/1.0`, '/'), `${bot} should be allowed on /`);
    assert.ok(isSearchEngineAllowedOnPath(`${bot}/1.0`, '/privacy/'), `${bot} should be allowed on /privacy/`);
    assert.ok(isSearchEngineAllowedOnPath(`${bot}/1.0`, '/terms/'), `${bot} should be allowed on /terms/`);
    assert.ok(!isSearchEngineAllowedOnPath(`${bot}/1.0`, '/app/'), `${bot} should NOT be allowed on /app/`);
    assert.ok(!isSearchEngineAllowedOnPath(`${bot}/1.0`, '/watch'), `${bot} should NOT be allowed on /watch`);
  }
});

test('blocked bots are not in allowed list', () => {
  const blocked = getBlockedBots();
  const allowed = getAllowedBots();

  for (const bot of blocked) {
    assert.ok(!allowed.includes(bot), `${bot} must not be in both blocked and allowed lists`);
  }
});

test('no AI crawlers in allowed list', () => {
  const allowed = getAllowedBots();
  const blocked = getBlockedBots();

  const aiCrawlers = blocked.filter(bot =>
    bot.includes('GPT') ||
    bot.includes('Claude') ||
    bot.includes('Bot')
  );

  for (const crawler of aiCrawlers) {
    assert.ok(!isBotAllowed(crawler), `AI crawler ${crawler} must not be allowed`);
  }
});

test('user agents without recognized bots are not blocked', () => {
  const normalUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X)';
  assert.ok(!isBotBlocked(normalUserAgent), 'Normal user agents should not be blocked');
});

test('search engines are recognized correctly', () => {
  const searchBots = SEARCH_ENGINES;

  for (const bot of searchBots) {
    assert.ok(isBotAllowed(`${bot}/1.0`), `${bot} should be recognized as allowed bot`);
  }
});
