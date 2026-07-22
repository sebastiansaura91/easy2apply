import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCvsTool from "./tools/list-cvs";
import getCvTool from "./tools/get-cv";
import listJobPostingsTool from "./tools/list-job-postings";
import listBulletBankTool from "./tools/list-bullet-bank";

// The OAuth issuer MUST be the direct Supabase host. Read the project ref from
// VITE_SUPABASE_PROJECT_ID so it's inlined by Vite at build time (import-safe).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "cvsakert-mcp",
  title: "CVSäkert",
  version: "0.1.0",
  instructions:
    "Tools for CVSäkert. Read the signed-in user's CVs, tailored applications, saved job postings, and bullet library. All reads are scoped to the user by RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listCvsTool, getCvTool, listJobPostingsTool, listBulletBankTool],
});