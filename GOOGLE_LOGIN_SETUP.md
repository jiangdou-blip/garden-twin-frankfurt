# Garden Twin 网页版：Google 登录与用户数据保存

这个版本已经支持 Firebase Google 登录和 Firestore 云端保存。未填写 Firebase 配置时，网页仍会使用浏览器本地保存。

## 1. 创建 Firebase 项目

1. 打开 Firebase Console，创建一个项目。
2. 添加 Web App。
3. 复制 Firebase 给你的 `firebaseConfig`。
4. 粘贴到 `src/firebaseConfig.js`。

## 2. 开启 Google 登录

在 Firebase Console：

1. Authentication -> Sign-in method。
2. 启用 Google。
3. 添加授权域名：本地测试用 `localhost`，部署后添加你的正式域名。

## 3. 开启 Firestore

1. Firestore Database -> Create database。
2. 建议先选择测试模式，确认功能可用后再改规则。
3. 推荐规则：

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /gardenUsers/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 4. Chrome 打开

本地运行：

```bash
node server.mjs
```

然后用 Chrome 打开：

```text
http://127.0.0.1:5174/index.html?appVersion=38
```

## 5. 部署

这个项目是纯静态网页，可以部署到 Firebase Hosting、Netlify、Vercel 或任意静态网站服务。

部署后，每个 Google 用户的数据会保存到：

```text
Firestore / gardenUsers / {Google uid}
```
