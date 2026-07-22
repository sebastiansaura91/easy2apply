import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_bullet_bank",
  title: "List saved bullets",
  description: "List the signed-in user's saved bullet-point library, optionally filtered by tag.",
  inputSchema: {
    tag: z.string().optional().describe("Filter by tag substring."),
    limit: z.number().int().min(1).max(200).optional().describe("Maximum bullets to return. Defaults to 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ tag, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("bullet_bank")
      .select("id, text, tags, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (tag) q = q.contains("tags", [tag]);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { bullets: data ?? [] },
    };
  },
});