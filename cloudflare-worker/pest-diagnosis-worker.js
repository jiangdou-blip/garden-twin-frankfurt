const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
      }

      if (!env.OPENROUTER_API_KEY) {
        return json({ error: "Missing OPENROUTER_API_KEY" }, 500);
      }

      const input = await request.json();
      const prompt = [
        "你是一位德国有机菜园病虫害顾问。",
        "请根据下面信息判断病虫害或生理问题，并给出适合法兰克福家庭有机种植的处理方案。",
        "只输出 JSON，不要 Markdown。",
        "JSON 字段必须是：diagnosis 字符串，confidence 35-95 数字，severity 字符串，solution 字符串数组。",
        "",
        JSON.stringify({
          crop: input.crop || "未指定作物",
          note: input.note || "",
          imageStats: input.imageStats || null,
          weather: input.weather || null,
          moisture: input.moisture || null,
          location: input.location || "Frankfurt am Main, Germany",
        }),
      ].join("\n");

      const userContent = [{ type: "text", text: prompt }];
      if (input.photo && typeof input.photo === "string" && input.photo.startsWith("data:image/")) {
        userContent.push({ type: "image_url", image_url: { url: input.photo } });
      }

      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://jiangdou-blip.github.io/garden-twin-frankfurt/",
          "X-OpenRouter-Title": "Garden Twin Frankfurt",
        },
        body: JSON.stringify({
          model: env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "你是严谨的德国有机菜园顾问。输出必须是可解析 JSON。",
            },
            {
              role: "user",
              content: userContent,
            },
          ],
          max_tokens: 600,
          temperature: 0.2,
        }),
      });

      const raw = await response.text();
      if (!response.ok) {
        return json({ error: `OpenRouter ${response.status}`, detail: raw.slice(0, 500) }, 502);
      }

      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return fallback(raw);
      }

      const content = data.choices?.[0]?.message?.content || "";
      let result;
      try {
        result = JSON.parse(stripCodeFence(content));
      } catch {
        return fallback(content);
      }

      return json(normalizeDiagnosis(result));
    } catch (error) {
      return json({ error: "Worker runtime error", detail: String(error?.message || error) }, 500);
    }
  },
};

function normalizeDiagnosis(data) {
  return {
    diagnosis: String(data.diagnosis || "待复核：叶面异常").slice(0, 120),
    confidence: Math.max(35, Math.min(95, Number(data.confidence) || 55)),
    severity: String(data.severity || "待复核").slice(0, 20),
    solution: Array.isArray(data.solution) && data.solution.length
      ? data.solution.slice(0, 5).map((item) => String(item).slice(0, 180))
      : ["请补充清晰近照并复查。"],
  };
}

function stripCodeFence(value) {
  return String(value)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function fallback(text) {
  return json({
    diagnosis: String(text || "待复核：叶面异常").slice(0, 120),
    confidence: 55,
    severity: "待复核",
    solution: ["请补充清晰近照、叶背照片和发生时间，再复查。"],
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
