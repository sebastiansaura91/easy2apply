import { describe, it, expect } from "vitest";
import { getResumeMeta, isApplication, splitTemplatesApplications, HasMeta } from "./resume-grouping";

const row = (meta?: object): HasMeta => ({ content_json: meta ? { __meta: meta } : {} });

describe("getResumeMeta", () => {
  it("returns empty object when there is no metadata", () => {
    expect(getResumeMeta({ content_json: null })).toEqual({});
    expect(getResumeMeta({})).toEqual({});
    expect(getResumeMeta({ content_json: {} })).toEqual({});
  });
});

describe("isApplication", () => {
  it("uses the explicit isTemplate flag", () => {
    expect(isApplication(row({ isTemplate: false }))).toBe(true);
    expect(isApplication(row({ isTemplate: true }))).toBe(false);
    // A template categorized with a role stays a template, not an application.
    expect(isApplication(row({ isTemplate: true, targetRole: "head-of-product" }))).toBe(false);
  });
  it("treats a role-only CV (no job) as a categorized template", () => {
    expect(isApplication(row({ targetRole: "head-of-commercial" }))).toBe(false);
  });
  it("falls back to tailoredForJob for legacy rows without the flag", () => {
    expect(isApplication(row({ tailoredForJob: "Head of Product" }))).toBe(true);
  });
  it("is false for a plain master template", () => {
    expect(isApplication(row())).toBe(false);
    expect(isApplication(row({}))).toBe(false);
  });
});

describe("splitTemplatesApplications", () => {
  it("keeps role-categorized templates as templates and job copies as applications", () => {
    const master = row();
    const roleTemplate = row({ isTemplate: true, targetRole: "head-of-product" });
    const application = row({ isTemplate: false, tailoredForJob: "Head of Product" });
    const { templates, applications } = splitTemplatesApplications([master, roleTemplate, application]);
    expect(templates).toEqual([master, roleTemplate]);
    expect(applications).toEqual([application]);
  });

  it("handles an empty list", () => {
    expect(splitTemplatesApplications([])).toEqual({ templates: [], applications: [] });
  });
});
