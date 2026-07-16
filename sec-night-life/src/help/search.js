import { getArticlesForAudience, articleMatchesAudience, HELP_ARTICLES } from './catalog';
import { getFaqsForAudience, HELP_FAQS } from './faqs';
import { CATEGORY_ORDER, HELP_CATEGORIES } from './categories';

function normalizeQuery(q) {
  return String(q || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function haystackArticle(article) {
  return [
    article.title,
    article.summary,
    ...(article.keywords || []),
    article.category,
  ]
    .join(' ')
    .toLowerCase();
}

function haystackFaq(faq) {
  return [faq.question, faq.answer].join(' ').toLowerCase();
}

/**
 * @param {string} query
 * @param {'partygoer' | 'venue'} audience
 */
export function searchHelp(query, audience) {
  const q = normalizeQuery(query);
  const articles = getArticlesForAudience(audience);
  const faqs = getFaqsForAudience(audience);

  if (!q) {
    return { articles, faqs, isEmptyQuery: true };
  }

  const tokens = q.split(' ').filter(Boolean);

  const matchedArticles = articles.filter((a) => {
    const hay = haystackArticle(a);
    return tokens.every((t) => hay.includes(t));
  });

  const matchedFaqs = faqs.filter((f) => {
    const hay = haystackFaq(f);
    return tokens.every((t) => hay.includes(t));
  });

  return { articles: matchedArticles, faqs: matchedFaqs, isEmptyQuery: false };
}

/**
 * Group articles by category for browse UI.
 * @param {'partygoer' | 'venue'} audience
 */
export function groupArticlesByCategory(audience) {
  const articles = getArticlesForAudience(audience);
  const groups = [];

  for (const catId of CATEGORY_ORDER) {
    const items = articles.filter((a) => a.category === catId);
    if (!items.length) continue;
    const meta = HELP_CATEGORIES[catId];
    groups.push({
      id: catId,
      label: meta?.label || catId,
      description: meta?.description || '',
      articles: items,
    });
  }

  return groups;
}

export function resolveDefaultAudience() {
  try {
    const mode = localStorage.getItem('sec_active_mode');
    if (mode === 'business') return 'venue';
  } catch {
    /* ignore */
  }
  return 'partygoer';
}

export { HELP_ARTICLES, HELP_FAQS, articleMatchesAudience };
