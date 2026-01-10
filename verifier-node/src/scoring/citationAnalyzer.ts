import { ModelResponse } from '../llm-providers/modelRouter';
import { logger } from '../utils/logger';

export interface Citation {
  text: string;
  url?: string;
  type: 'url' | 'doi' | 'reference' | 'quote';
}

/**
 * Analyze citations in model responses
 */
export function analyzeCitations(responses: ModelResponse[]): number {
  logger.debug('Analyzing citations', { responseCount: responses.length });

  let totalCitations = 0;
  let qualityCitations = 0;

  for (const response of responses) {
    const citations = extractCitations(response.response);
    totalCitations += citations.length;

    // Count quality citations (URLs, DOIs)
    qualityCitations += citations.filter(
      (c) => c.type === 'url' || c.type === 'doi'
    ).length;
  }

  if (totalCitations === 0) {
    return 0;
  }

  // Quality score based on presence and quality of citations
  const citationDensity = totalCitations / responses.length;
  const qualityRatio = qualityCitations / totalCitations;

  // Score combines density and quality
  const densityScore = Math.min(100, citationDensity * 20); // Max at 5 citations
  const qualityScore = qualityRatio * 100;

  const finalScore = (densityScore * 0.5 + qualityScore * 0.5);

  logger.debug('Citation analysis complete', {
    totalCitations,
    qualityCitations,
    score: finalScore,
  });

  return Math.round(finalScore);
}

/**
 * Extract citations from text
 */
export function extractCitations(text: string): Citation[] {
  const citations: Citation[] = [];

  // Extract URLs
  const urlRegex = /https?:\/\/[^\s]+/g;
  const urls = text.match(urlRegex) || [];
  urls.forEach((url) => {
    citations.push({
      text: url,
      url,
      type: 'url',
    });
  });

  // Extract DOIs
  const doiRegex = /10\.\d{4,}\/[^\s]+/g;
  const dois = text.match(doiRegex) || [];
  dois.forEach((doi) => {
    citations.push({
      text: doi,
      url: `https://doi.org/${doi}`,
      type: 'doi',
    });
  });

  // Extract quoted references
  const quoteRegex = /"([^"]+)"/g;
  let match;
  while ((match = quoteRegex.exec(text)) !== null) {
    if (match[1].length > 20) {
      citations.push({
        text: match[1],
        type: 'quote',
      });
    }
  }

  // Extract reference patterns like [1], (Smith 2020)
  const refRegex = /\[(\d+)\]|\(([A-Z][a-z]+ \d{4})\)/g;
  while ((match = refRegex.exec(text)) !== null) {
    citations.push({
      text: match[0],
      type: 'reference',
    });
  }

  return citations;
}

/**
 * Validate citation quality
 */
export function validateCitation(citation: Citation): boolean {
  switch (citation.type) {
    case 'url':
      // Check if URL is from a reputable domain
      if (!citation.url) return false;
      const domain = new URL(citation.url).hostname;
      const reputableDomains = [
        'wikipedia.org',
        'arxiv.org',
        'nature.com',
        'science.org',
        'ieee.org',
        'acm.org',
        'nih.gov',
        'edu',
      ];
      return reputableDomains.some((d) => domain.includes(d));

    case 'doi':
      // DOIs are generally reliable
      return true;

    case 'quote':
    case 'reference':
      // Need more context to validate
      return citation.text.length > 10;

    default:
      return false;
  }
}
