interface ToolParams {
  type: 'object';
  properties: Record<string, { type: string; description?: string; enum?: string[] }>;
  required: string[];
}
interface ToolDecl { name: string; description: string; parameters: ToolParams; }

export const RESULT_TOOL_NAMES = new Set(['web_search', 'search_products']);

export const RESULT_TOOL_DECLS: ToolDecl[] = [
  {
    name: 'web_search',
    description:
      'Search the web and SHOW the result on the user\'s canvas as a rich card (news headlines or link cards). ' +
      'Use for news, current events, and "show me / pull up / find links about X". Set presentation to "news" for ' +
      'headline-style results, "links" for general result cards. Then speak a short summary; never read the card aloud.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for.' },
        presentation: { type: 'string', enum: ['news', 'links'], description: 'How to show it.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_products',
    description:
      'Search Amazon for real products and SHOW them on the user\'s canvas as product cards (image, price, rating, ' +
      'buy link). Use for "find me / show me / search for <product>". Speak 2-3 highlights; never invent products, ' +
      'prices, or ratings — only what the tool returns. If it comes back empty, say so and offer to try again.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The product to search for, e.g. "wireless headphones".' },
        limit: { type: 'number', description: 'Max products (default 5).' },
      },
      required: ['query'],
    },
  },
];
