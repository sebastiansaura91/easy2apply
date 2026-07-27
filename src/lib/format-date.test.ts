import { describe, it, expect } from "vitest";
import { formatCvDate, formatCvDateRange } from "./format-date";

describe("formatCvDate", () => {
  it("formats YYYY-MM per language", () => {
    expect(formatCvDate("2021-01", "sv")).toBe("jan 2021");
    expect(formatCvDate("2021-01", "en")).toBe("Jan 2021");
    expect(formatCvDate("2023-12", "sv")).toBe("dec 2023");
  });
  it("passes through bare years and unparseable values", () => {
    expect(formatCvDate("2019", "en")).toBe("2019");
    expect(formatCvDate("våren 2020", "sv")).toBe("våren 2020");
    expect(formatCvDate("", "sv")).toBe("");
    expect(formatCvDate("2021-13", "sv")).toBe("2021-13");
  });
});

describe("formatCvDateRange", () => {
  it("renders a full range", () => {
    expect(formatCvDateRange("2020-03", "2023-06", false, "en", "Present")).toBe("Mar 2020 – Jun 2023");
  });
  it("uses the present label", () => {
    expect(formatCvDateRange("2021-01", "", true, "sv", "nuvarande")).toBe("jan 2021 – nuvarande");
  });
  it("degrades gracefully when one side is missing", () => {
    expect(formatCvDateRange("", "2022-05", false, "en", "Present")).toBe("May 2022");
    expect(formatCvDateRange("", "", false, "en", "Present")).toBe("");
  });
});
