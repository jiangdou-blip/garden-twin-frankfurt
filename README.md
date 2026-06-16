# Garden Twin Frankfurt

法兰克福菜地管理看板，用于规划地块、记录作物、查看天气、管理任务与病虫害监测日志。

## 在线发布到 GitHub Pages

1. 在 GitHub 新建仓库，例如 `garden-twin-frankfurt`。
2. 上传本项目根目录中的文件。
3. 打开仓库 `Settings` → `Pages`。
4. `Build and deployment` 选择 `Deploy from a branch`。
5. Branch 选择 `main`，目录选择 `/root`，点击 `Save`。
6. 等待 1-2 分钟后，GitHub 会生成一个可分享网址。

## Google 登录和云端保存

当前 `src/firebaseConfig.js` 里的 Firebase 配置为空，因此网页会以本地保存模式运行。

如果需要 Google 登录和每个用户独立保存数据：

1. 在 Firebase Console 创建 Web App。
2. 启用 Authentication 的 Google 登录。
3. 启用 Firestore Database。
4. 将 Firebase 配置填入 `src/firebaseConfig.js`。
5. 在 Firebase Authentication 的 Authorized domains 中加入 GitHub Pages 域名。

## 本地预览

直接打开 `index.html` 可以运行。也可以使用本地服务器：

```bash
node server.mjs
```

