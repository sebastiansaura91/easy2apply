import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Read file as text - for PDF we'll send as base64, for text-based formats as text
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    // Convert to base64 for the AI to process
    const base64 = btoa(String.fromCharCode(...bytes));
    
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Use Gemini with document understanding
    const isPdf = file.type === "application/pdf";
    const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    
    let messages: any[];
    
    if (isPdf) {
      // Send PDF as inline data for Gemini's multimodal capabilities
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
      // For DOCX and other text formats, decode as text
      const decoder = new TextDecoder("utf-8");
      const text = decoder.decode(bytes);
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", errorText);
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

    const parsed = JSON.parse(jsonStr);

    return new Response(JSON.stringify({ cv: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error parsing CV:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
