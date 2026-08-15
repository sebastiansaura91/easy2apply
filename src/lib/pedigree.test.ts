import { describe, expect, it } from "vitest";
import { collectProxyTerms, isPedigreeTerm } from "./pedigree";

describe("pedigree", () => {
  const proxies = collectProxyTerms({
    competence_themes: [
      { proxy_terms: ["McKinsey", "Bain", "BCG"] },
      { proxy_terms: ["civilingenjörsexamen"] },
      {},
    ],
  });

  it("collects proxy terms lowercased across themes", () => {
    expect(proxies.has("mckinsey")).toBe(true);
    expect(proxies.has("civilingenjörsexamen")).toBe(true);
    expect(proxies.size).toBe(4);
  });

  it("flags declared proxies and known brands (frozen-profile fallback)", () => {
    expect(isPedigreeTerm("McKinsey", proxies)).toBe(true);
    expect(isPedigreeTerm("BCG", new Set())).toBe(true);
    expect(isPedigreeTerm("Big 4", new Set())).toBe(true);
    expect(isPedigreeTerm("McKinsey, Bain eller BCG", new Set())).toBe(true);
  });

  it("never flags real capability keywords", () => {
    expect(isPedigreeTerm("prissättning", proxies)).toBe(false);
    expect(isPedigreeTerm("business case", proxies)).toBe(false);
    expect(isPedigreeTerm("Salesforce", proxies)).toBe(false);
    expect(isPedigreeTerm("förändringsledning", new Set())).toBe(false);
  });
});
