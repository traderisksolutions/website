// schema.org JSON-LD for an article, built at save time so every page ships structured data
// from its first crawl. Pure.

export function buildArticleJsonLd(input: {
  title: string
  description: string | null
  url: string
  orgName: string
  orgDomain: string
  datePublished: string
  dateModified?: string
  language?: string
  faq?: { question: string; answer: string }[]
}): Record<string, unknown> {
  const graph: Record<string, unknown>[] = [{
    '@type': 'BlogPosting',
    headline: input.title.slice(0, 110),
    ...(input.description ? { description: input.description } : {}),
    url: input.url,
    inLanguage: input.language === 'id' ? 'id' : 'en',
    mainEntityOfPage: { '@type': 'WebPage', '@id': input.url },
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    author: { '@type': 'Organization', name: input.orgName, url: `https://${input.orgDomain}` },
    publisher: { '@type': 'Organization', name: input.orgName },
  }]
  const faq = (input.faq ?? []).filter(f => f.question?.trim() && f.answer?.trim())
  if (faq.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: faq.map(f => ({ '@type': 'Question', name: f.question.trim(), acceptedAnswer: { '@type': 'Answer', text: f.answer.replace(/\[F\d+\]/g, '').trim() } })),
    })
  }
  return { '@context': 'https://schema.org', '@graph': graph }
}
