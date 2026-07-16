/**
 * @typedef {'partygoer' | 'venue' | 'both'} HelpAudience
 * @typedef {'heading' | 'p' | 'steps' | 'callout' | 'image' | 'tip' | 'warning' | 'related'} SectionType
 *
 * @typedef {Object} HelpImageSection
 * @property {'image'} type
 * @property {string} src
 * @property {string} alt
 * @property {string} [caption]
 * @property {string} [path] Where to find this in the app
 * @property {boolean} [illustrative]
 *
 * @typedef {Object} HelpStepsSection
 * @property {'steps'} type
 * @property {string[]} items
 *
 * @typedef {Object} HelpCalloutSection
 * @property {'callout' | 'tip' | 'warning'} type
 * @property {string} [title]
 * @property {string} text
 *
 * @typedef {Object} HelpTextSection
 * @property {'heading' | 'p'} type
 * @property {string} text
 *
 * @typedef {Object} HelpRelatedSection
 * @property {'related'} type
 * @property {string[]} ids
 *
 * @typedef {HelpImageSection | HelpStepsSection | HelpCalloutSection | HelpTextSection | HelpRelatedSection} HelpSection
 *
 * @typedef {Object} HelpArticle
 * @property {string} id
 * @property {HelpAudience} audience
 * @property {string} category
 * @property {string} title
 * @property {string} summary
 * @property {number} readMinutes
 * @property {string[]} keywords
 * @property {HelpSection[]} sections
 */

export {};
