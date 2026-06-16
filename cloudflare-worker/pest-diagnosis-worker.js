const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
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
    const payload = {
      model: env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: [
            "你是一位德国有机菜园病虫害顾问。",
            "根据作物、观察记录、图片和天气，输出严格 JSON。",
            "不要输出 Markdown。字段：diagnosis 字符串，confidence 35-95 数字，severity 字符串，solution 字符串数组。",
            "建议要适合法兰克福家庭有机种植，优先使用物理防治、改善通风、水分管理和欧盟常见有机园艺方案。",
          ].join("\\n"),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                crop: input.crop,
                note: input.note,
                imageStats: input.imageStats,
                weather: input.weather,
                moisture: input.moisture,
                location: input.location,
              }),
            },
            ...(input.photo ? [{ type: "image_url", image_url: { url: input.photo } }] : []),
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 600,
      temperature: 0.2,
    };

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://jiangdou-blip.github.io/garden-twin-frankfurt/",
        "X-OpenRouter-Title": "Garden Twin Frankfurt",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return json({ error: `OpenRouter ${response.status}` }, 502);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    let result;
    try {
      result = JSON.parse(content);
    } catch {
      result = { diagnosis: content.slice(0, 120), confidence: 55, severity: "待复核", solution: ["请补充清晰近照并复查。"] };
    }

    return json(result);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

