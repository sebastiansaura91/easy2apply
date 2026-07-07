import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { unzipSync, strFromU8 } from "https://esm.sh/fflate@0.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Base64-encode bytes in chunks. `btoa(String.fromCharCode(...bytes))` spreads the
 * entire byte array as function arguments and overflows the call stack for any file
 * over ~100 KB — i.e. essentially every real PDF. Chunking avoids that.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000; // 32 KB per chunk — safely under the arg-count limit
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Extract plain text from a .docx. A DOCX is a ZIP archive, not UTF-8 text — decoding
 * it directly yields binary garbage. We unzip it and pull the text out of
 * word/document.xml, turning paragraph/break tags into newlines.
 */
function extractDocxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const docXml = files["word/document.xml"];
  if (!docXml) throw new Error("Invalid DOCX: word/document.xml not found");
  const xml = strFromU8(docXml);
  const withBreaks = xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\s*\/?>/g, "\t")
    .replace(/<w:br\s*\/?>/g, "\n");
  const text = withBreaks.replace(/<[^>]+>/g, "");
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const CV_PARSE_PROMPT = `You are a CV/resume parser. Extract structured data from the following CV text and return ONLY valid JSON matching this exact schema. Do not include any markdown formatting or code blocks - return raw JSON only.

Schema:
{
  "contact": { "name": "", "email": "", "phone": "", "city": "", "linkedin": "", "website": "" },
  "profile": "professional summary string",
  "experience": [{ "id": "exp-1", "title": "", "company": "", "location": "", "startDate": "YYYY-MM", "endDate": "YYYY-MM", "isPresent": false, "bullets": ["..."] }],
  "education": [{ "id": "edu-1", "degree": "", "school": "", "field": "", "startDate": "YYYY-MM", "endDate": "YYYY-MM" }],
  "skills": ["skill1", "skill2"],
  "certifications": [{ "id": "cert-1", "name": "", "issuer": "", "date": "" }],
  "projects": [{ "id": "proj-1", "name": "", "description": "", "bullets": [] }],
  "languages": [{ "id": "lang-1", "language": "", "level": "" }],
  "other": "",
  "sections": [
    { "id": "contact", "type": "contact", "enabled": true, "order": 0 },
    { "id": "profile", "type": "profile", "enabled": true, "order": 1 },
    { "id": "experience", "type": "experience", "enabled": true, "order": 2 },
    { "id": "education", "type": "education", "enabled": true, "order": 3 },
    { "id": "skills", "type": "skills", "enabled": true, "order": 4 },
    { "id": "certifications", "type": "certifications", "enabled": false, "order": 5 },
    { "id": "projects", "type": "projects", "enabled": false, "order": 6 },
    { "id": "languages", "type": "languages", "enabled": true, "order": 7 },
    { "id": "other", "type": "other", "enabled": false, "order": 8 }
  ]
}

Rules:
- Generate unique IDs for each item (exp-1, exp-2, edu-1, etc.)
- Set "isPresent": true if the end date says "present", "nu", "pågående", "current" or similar
- For dates, use YYYY-MM format. If only year is given, use YYYY-01
- Enable sections that have content (set enabled: true), disable empty ones
- If no professional summary/profile is found, leave it as empty string
- Extract ALL bullet points from experience entries
- Keep the original language of the CV content`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    
    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Detect format by MIME type, falling back to file extension (some browsers omit type).
    const name = (file.name || "").toLowerCase();
    const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
    const isDocx =
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      name.endsWith(".docx");

    let messages: any[];

    if (isPdf) {
      // Send PDF as inline data for Gemini's multimodal capabilities
      const base64 = bytesToBase64(bytes);
      messages = [
        {
          role: "user",
          content: [
            { type: "text", text: CV_PARSE_PROMPT + "\n\nParse the attached CV document:" },
            {
              type: "image_url",
              image_url: {
                url: `data:application/pdf;base64,${base64}`,
              },
            },
          ],
        },
      ];
    } else {
      // DOCX must be unzipped; other text formats decode as UTF-8.
      let text: string;
      if (isDocx) {
        text = extractDocxText(bytes);
      } else {
        text = new TextDecoder("utf-8").decode(bytes);
      }
      if (!text.trim()) {
        return new Response(JSON.stringify({ error: "Could not read any text from the file. Try a PDF or paste the text." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      messages = [
        {
          role: "user",
          content: CV_PARSE_PROMPT + "\n\nHere is the CV text:\n\n" + text,
        },
      ];
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        temperature: 0.1,
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached. Please try again in a moment." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits and retry." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    // Clean up potential markdown formatting
    let jsonStr = content.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI JSON output");
      return new Response(JSON.stringify({ error: "Could not parse the CV. Please try again." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ cv: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error parsing CV:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
