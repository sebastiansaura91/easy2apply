import { describe, it, expect } from "vitest";
import { getResumeMeta, groupResumesByKind, HasMeta } from "./resume-grouping";

const row = (meta?: object): HasMeta => ({ content_json: meta ? { __meta: meta } : {} });

describe("getResumeMeta", () => {
  it("returns empty object when there is no metadata", () => {
    expect(getResumeMeta({ content_json: null })).toEqual({});
    expect(getResumeMeta({})).toEqual({});
    expect(getResumeMeta({ content_json: {} })).toEqual({});
  });

  it("returns the stored __meta", () => {
    expect(getResumeMeta(row({ isTemplate: true }))).toEqual({ isTemplate: true });
  });
});

describe("groupResumesByKind", () => {
  it("puts templates, applications and plain CVs in the right buckets", () => {
    const template = row({ isTemplate: true });
    const application = row({ tailoredForJob: "Head of Product", tailoredForCompany: "Acme" });
    const plain = row();
    const { templates, applications, others } = groupResumesByKind([template, application, plain]);
    expect(templates).toEqual([template]);
    expect(applications).toEqual([application]);
    expect(others).toEqual([plain]);
  });

  it("treats a template flag as winning over a tailored marker (never double-listed)", () => {
    const both = row({ isTemplate: true, tailoredForJob: "Head of Commercial" });
    const { templates, applications, others } = groupResumesByKind([both]);
    expect(templates).toEqual([both]);
    expect(applications).toEqual([]);
    expect(others).toEqual([]);
  });

  it("handles an empty list", () => {
    expect(groupResumesByKind([])).toEqual({ templates: [], applications: [], others: [] });
  });
});
