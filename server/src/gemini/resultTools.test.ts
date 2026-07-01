import { describe, it, expect } from 'vitest';
import { RESULT_TOOL_NAMES, RESULT_TOOL_DECLS } from './resultTools.js';

describe('result tools', () => {
  it('exposes exactly web_search and search_products', () => {
    expect([...RESULT_TOOL_NAMES].sort()).toEqual(['search_products', 'web_search']);
  });
  it('search_products requires query, web_search requires query', () => {
    const byName = Object.fromEntries(RESULT_TOOL_DECLS.map((d) => [d.name, d]));
    expect(byName.search_products.parameters.required).toContain('query');
    expect(byName.web_search.parameters.required).toContain('query');
    expect(byName.web_search.parameters.properties.presentation.enum).toEqual(['news', 'links']);
  });
});
