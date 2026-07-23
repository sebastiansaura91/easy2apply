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
  it("is true when angled at a role or job", () => {
    expect(isApplication(row({ targetRole: "head-of-commercial" }))).toBe(true);
    expect(isApplication(row({ targetRoleLabel: "VP CX" }))).toBe(true);
    expect(isApplication(row({ tailoredForJob: "Head of Product" }))).toBe(true);
  });
  it("is false for a plain master template", () => {
    expect(isApplication(row())).toBe(false);
    expect(isApplication(row({}))).toBe(false);
  });
});

describe("splitTemplatesApplications", () => {
  it("puts angled copies under applications and everything else under templates", () => {
    const master = row();
    const application = row({ targetRole: "head-of-product", tailoredForJob: "Head of Product" });
    const { templates, applications } = splitTemplatesApplications([master, application]);
    expect(templates).toEqual([master]);
    expect(applications).toEqual([application]);
  });

  it("handles an empty list", () => {
    expect(splitTemplatesApplications([])).toEqual({ templates: [], applications: [] });
  });
});
