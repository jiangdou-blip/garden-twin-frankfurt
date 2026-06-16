const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method === "GET") {
      return json({ ok: true, service: "garden-pest-diagnosis" });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    try {
      if (!env || !env.OPENROUTER_API_KEY) {
        return json({ error: "Missing OPENROUTER_API_KEY" }, 500);
      }

      let input = {};
      try {
        input = await request.json();
      } catch (error) {
        return json({ error: "Invalid JSON body" }, 400);
      }

      const local = localDiagnosis(input);
      const prompt = [
        "你是一位德国法兰克福家庭有机菜园病虫害顾问。",
        "根据输入信息判断问题，并给出有机处理方案。",
        "只输出 JSON，不要 Markdown。",
        "JSON 字段：diagnosis 字符串，confidence 35-95 数字，severity 字符串，solution 字符串数组。",
        "如果不确定，请保守判断，并建议补拍叶背、茎基部和全株照片。",
        "",
        "输入：",
        JSON.stringify({
          crop: input.crop || "未指定作物",
          note: input.note || "",
          imageStats: input.imageStats || null,
          weather: input.weather || null,
          moisture: input.moisture || null,
          location: input.location || "Frankfurt am Main, Germany",
          localReference: local,
        }),
      ].join("\n");

      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.OPENROUTER_API_KEY,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://jiangdou-blip.github.io/garden-twin-frankfurt/",
          "X-OpenRouter-Title": "Garden Twin Frankfurt",
        },
        body: JSON.stringify({
          model: env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
          messages: [
            { role: "system", content: "你输出严格 JSON，不能输出 Markdown。" },
            { role: "user", content: prompt },
          ],
          max_tokens: 500,
          temperature: 0.2,
        }),
      });

      const raw = await response.text();
      if (!response.ok) {
        return json({ error: "OpenRouter request failed", status: response.status, detail: raw.slice(0, 500), fallback: local }, 502);
      }

      let data;
      try {
        data = JSON.parse(raw);
      } catch (error) {
        return json(local);
      }

      const content = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : "";

      try {
        return json(normalizeDiagnosis(JSON.parse(stripCodeFence(content)), local));
      } catch (error) {
        return json(local);
      }
    } catch (error) {
      return json({ error: "Worker runtime error", detail: String(error && error.message ? error.message : error) }, 500);
    }
  },
};

function localDiagnosis(input) {
  const crop = String(input.crop || "");
  const note = String(input.note || "");
  const text = crop + " " + note;
  const stats = input.imageStats || {};
  if (/白粉|粉状|灰白|霉/.test(text) || (Number(stats.whiteRatio) > 0.16 && Number(stats.greenRatio) > 0.18)) {
    return {
      diagnosis: "疑似白粉病",
      confidence: 78,
      severity: "中",
      solution: [
        "剪除重病叶并带出菜地。",
        "减少叶面喷水，早晨浇根部，增加通风。",
        "可按标签使用有机许可的碳酸氢钾或 Netzschwefel，先小范围试喷。",
      ],
    };
  }
  if (/蚜|小绿虫|卷叶|蜜露/.test(text)) {
    return {
      diagnosis: "疑似蚜虫危害",
      confidence: 76,
      severity: "中",
      solution: [
        "用清水冲洗叶背和嫩梢，连续观察 2-3 天。",
        "保护瓢虫、草蛉等天敌。",
        "严重时傍晚使用钾皂或 Neem，重点喷叶背。",
      ],
    };
  }
  return {
    diagnosis: "待复核：叶面异常",
    confidence: 55,
    severity: "待复核",
    solution: ["补拍叶背、茎基部和全株照片，并记录是否扩散。"],
  };
}

function normalizeDiagnosis(data, fallback) {
  return {
    diagnosis: String(data.diagnosis || fallback.diagnosis).slice(0, 120),
    confidence: Math.max(35, Math.min(95, Number(data.confidence) || fallback.confidence)),
    severity: String(data.severity || fallback.severity).slice(0, 20),
    solution: Array.isArray(data.solution) && data.solution.length
      ? data.solution.slice(0, 5).map((item) => String(item).slice(0, 180))
      : fallback.solution,
  };
}

function stripCodeFence(value) {
  return String(value || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
