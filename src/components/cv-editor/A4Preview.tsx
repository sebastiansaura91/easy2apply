import { forwardRef } from "react";
import { CVContent, CVSection } from "@/types/cv";

interface A4PreviewProps {
  cv: CVContent;
  enabledSections: CVSection[];
  t: (k: any) => string;
}

export const A4Preview = forwardRef<HTMLDivElement, A4PreviewProps>(function A4Preview({ cv, enabledSections, t }, ref) {
  return (
    <div ref={ref} className="a4-preview" style={{ transform: "scale(0.75)", transformOrigin: "top center" }}>
    <div className="a4-preview" style={{ transform: "scale(0.75)", transformOrigin: "top center" }}>
      {enabledSections.map((section) => {
        switch (section.type) {
          case "contact":
            return (
              <div key={section.id}>
                <h1>{cv.contact.name || "Ditt Namn"}</h1>
                <p className="contact-line">
                  {[cv.contact.email, cv.contact.phone, cv.contact.city, cv.contact.linkedin, cv.contact.website]
                    .filter(Boolean)
                    .join(" · ")}
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
                    {exp.bullets.filter(Boolean).length > 0 && (
                      <ul>
                        {exp.bullets.filter(Boolean).map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
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
                    {p.bullets.length > 0 && <ul>{p.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
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
