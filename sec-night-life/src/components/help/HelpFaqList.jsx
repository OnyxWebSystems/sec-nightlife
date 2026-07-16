import React from 'react';
import { Link } from 'react-router-dom';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { createPageUrl } from '@/utils';

/**
 * @param {{ faqs: Array<{ id: string, question: string, answer: string, articleId?: string }>, audience: string }} props
 */
export default function HelpFaqList({ faqs, audience }) {
  if (!faqs.length) {
    return (
      <p className="text-sm px-1" style={{ color: 'var(--sec-text-muted)' }}>
        No FAQs match your search.
      </p>
    );
  }

  return (
    <Accordion
      type="single"
      collapsible
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: 'var(--sec-bg-card)',
        border: '1px solid rgba(192, 192, 192, 0.22)',
      }}
    >
      {faqs.map((faq, index) => (
        <AccordionItem
          key={faq.id}
          value={faq.id}
          className="border-0 px-4"
          style={
            index !== faqs.length - 1
              ? { borderBottom: '1px solid rgba(192, 192, 192, 0.12)' }
              : undefined
          }
        >
          <AccordionTrigger
            className="text-sm font-medium hover:no-underline py-4"
            style={{ color: 'var(--sec-text-primary)' }}
          >
            {faq.question}
          </AccordionTrigger>
          <AccordionContent>
            <p className="text-sm pb-1" style={{ color: 'var(--sec-text-secondary)', lineHeight: 1.55 }}>
              {faq.answer}
            </p>
            {faq.articleId ? (
              <Link
                to={`${createPageUrl('HelpArticle')}?id=${encodeURIComponent(faq.articleId)}&audience=${audience}`}
                className="inline-block text-xs font-semibold mt-2 mb-3"
                style={{ color: 'var(--sec-accent)' }}
              >
                Read full guide →
              </Link>
            ) : null}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
