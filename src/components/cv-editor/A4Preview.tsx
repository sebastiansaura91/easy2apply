import { forwardRef, useEffect, useRef, useState } from "react";
import { CVContent, CVSection } from "@/types/cv";
import { TemplateStyle } from "@/lib/templates";

interface A4PreviewProps {
  cv: CVContent;
  enabledSections: CVSection[];
  t: (k: any) => string;
  style?: TemplateStyle;
}

export const A4Preview = forwardRef<HTMLDivElement, A4PreviewProps>(function A4Preview({ cv, enabledSections, t, style }, ref) {
  const styleVars = style
    ? {
        "--cv-font": style.cssFont,
        "--cv-accent": style.accentHex,
        "--cv-heading-transform": style.uppercaseHeadings ? "uppercase" : "none",
        "--cv-heading-spacing": style.headingSpacing,
      }
    : {};
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [pxPerMm, setPxPerMm] = useState(0);

  useEffect(() => {
    // Measure 1mm in CSS pixels using a probe element (accounts for browser zoom/DPI).
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;height:100mm;";
    document.body.appendChild(probe);
    setPxPerMm(probe.getBoundingClientRect().height / 100);
    document.body.removeChild(probe);
  }, []);

  useEffect(() => {
    const el = innerRef.current;
    if (!el || pxPerMm === 0) return;
    const pageHeightPx = 297 * pxPerMm;
    const update = () => {
      const h = el.getBoundingClientRect().height;
      setPageCount(Math.max(1, Math.ceil(h / pageHeightPx)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pxPerMm, cv, enabledSections]);

  return (
    <div
      ref={(node) => {
        innerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      className="a4-preview"
      style={{ transform: "scale(0.75)", transformOrigin: "top center", position: "relative", ...styleVars } as React.CSSProperties}
    >
      {/* Page break indicators */}
      {pxPerMm > 0 && pageCount > 1 && Array.from({ length: pageCount - 1 }).map((_, i) => {
        const top = (i + 1) * 297 * pxPerMm;
        return (
          <div
            key={`pb-${i}`}
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${top}px`,
              borderTop: "1px dashed hsl(var(--primary))",
              pointerEvents: "none",
              zIndex: 5,
            }}
          >
            <span
              style={{
                position: "absolute",
                right: "8pt",
                top: "-9pt",
                background: "hsl(var(--primary))",
                color: "hsl(var(--primary-foreground))",
                fontSize: "8pt",
                fontWeight: 600,
                padding: "1pt 6pt",
                borderRadius: "3pt",
                fontFamily: "Inter, sans-serif",
                letterSpacing: "0.3pt",
              }}
            >
              Page {i + 2}
            </span>
          </div>
        );
      })}
      {enabledSections.map((section) => {
        switch (section.type) {
          case "contact":
            return (
              <div key={section.id} style={{ marginBottom: "10pt" }}>
                {/* Name + contact rendered as body flow text (not header) so ATS + recruiters parse it on the first scan line. */}
                <p style={{ fontSize: "16pt", fontWeight: 700, margin: 0, lineHeight: 1.1 }}>
                  {cv.contact.name || t("yourName")}
                </p>
                <p style={{ margin: "4pt 0 0 0", fontSize: "9.5pt", lineHeight: 1.4 }}>
                  {[
                    cv.contact.email && `${t("contactEmail")}: ${cv.contact.email}`,
                    cv.contact.phone && `${t("contactPhone")}: ${cv.contact.phone}`,
                    cv.contact.city && `${t("contactAddress")}: ${cv.contact.city}`,
                    cv.contact.linkedin && `${t("contactLinkedin")}: ${cv.contact.linkedin}`,
                    cv.contact.website && `${t("contactWebsite")}: ${cv.contact.website}`,
                  ].filter(Boolean).join(" · ")}
                </p>
              </div>
            );
          case "profile":
            return cv.profile ? (
              <div key={section.id}>
                <h2>{t("sectionProfile")}</h2>
                <p>{cv.profile}</p>
              </div>
            ) : null;
          case "experience":
            return cv.experience.length > 0 ? (
              <div key={section.id}>
                <h2>{t("sectionExperience")}</h2>
                {cv.experience.map((exp) => (
                  <div key={exp.id} style={{ marginBottom: "10pt" }}>
                    <h3>
                      {exp.title}{exp.company ? `, ${exp.company}` : ""}
                      {exp.location ? ` – ${exp.location}` : ""}
                    </h3>
                    <p className="contact-line">
                      {exp.startDate} – {exp.isPresent ? t("present") : exp.endDate}
                    </p>
                    {(exp.pnlSize || exp.headcount || exp.revenueImpact) && (
                      <p className="role-meta">
                        {[
                          exp.pnlSize && `${t("labelPnl")}: ${exp.pnlSize}`,
                          exp.headcount && `${t("labelTeam")}: ${exp.headcount}`,
                          exp.revenueImpact && `${t("labelRevenue")}: ${exp.revenueImpact}`,
                        ].filter(Boolean).join("   ·   ")}
                      </p>
                    )}
                    {exp.roleScope && <p className="role-scope">{exp.roleScope}</p>}
                    {exp.bullets.filter(Boolean).length > 0 && (
                      exp.bulletStyle === "numbered" ? (
                        <ol>
                          {exp.bullets.filter(Boolean).map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ol>
                      ) : (
                        <ul>
                          {exp.bullets.filter(Boolean).map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      )
                    )}
                  </div>
                ))}
              </div>
            ) : null;
          case "education":
            return cv.education.length > 0 ? (
              <div key={section.id}>
                <h2>{t("sectionEducation")}</h2>
                {cv.education.map((edu) => (
                  <div key={edu.id} style={{ marginBottom: "8pt" }}>
                    <h3>{edu.degree}{edu.field ? `, ${edu.field}` : ""}</h3>
                    <p className="contact-line">{edu.school} · {edu.startDate} – {edu.endDate}</p>
                  </div>
                ))}
              </div>
            ) : null;
          case "skills":
            return cv.skills.length > 0 ? (
              <div key={section.id}>
                <h2>{t("sectionSkills")}</h2>
                <p>{cv.skills.join(", ")}</p>
              </div>
            ) : null;
          case "certifications":
            return cv.certifications.length > 0 ? (
              <div key={section.id}>
                <h2>{t("sectionCertifications")}</h2>
                {cv.certifications.map((cert) => (
                  <p key={cert.id}>{cert.name} – {cert.issuer} ({cert.date})</p>
                ))}
              </div>
            ) : null;
          case "projects":
            return cv.projects.length > 0 ? (
              <div key={section.id}>
                <h2>{t("sectionProjects")}</h2>
                {cv.projects.map((p) => (
                  <div key={p.id}>
                    <h3>{p.name}</h3>
                    <p>{p.description}</p>
                    {p.bullets.filter(Boolean).length > 0 && <ul>{p.bullets.filter(Boolean).map((b, i) => <li key={i}>{b}</li>)}</ul>}
                  </div>
                ))}
              </div>
            ) : null;
          case "languages":
            return cv.languages.length > 0 ? (
              <div key={section.id}>
                <h2>{t("sectionLanguages")}</h2>
                {cv.languages.map((lang) => (
                  <p key={lang.id}>{lang.language} – {lang.level}</p>
                ))}
              </div>
            ) : null;
          case "other":
            return cv.other ? (
              <div key={section.id}>
                <h2>{t("sectionOther")}</h2>
                <p>{cv.other}</p>
              </div>
            ) : null;
          default:
            return null;
        }
      })}
    </div>
  );
});
