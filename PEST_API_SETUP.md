# 病虫害监测接口设置

不要把 OpenRouter API key 放进 `src/`、`index.html` 或 GitHub 仓库。

推荐使用 Cloudflare Worker 做安全代理：

1. 立刻撤销已经公开过的旧 key。
2. 新建一个 OpenRouter key，最好设置额度上限。
3. 在 Cloudflare Workers 新建 Worker。
4. 将 `cloudflare-worker/pest-diagnosis-worker.js` 的内容粘贴进去。
5. 在 Worker 的 Settings → Variables 里添加 Secret：
   - `OPENROUTER_API_KEY`：你的新 OpenRouter key
   - `OPENROUTER_MODEL`：可选，例如 `openai/gpt-4o-mini`
6. 部署 Worker，复制 Worker URL。
7. 在 `src/pestApiConfig.js` 填入：

```js
window.GARDEN_TWIN_PEST_API_URL = "https://你的-worker-url.workers.dev";
```

如果这个地址为空，网页会使用本地识别规则，不会影响正常使用。

