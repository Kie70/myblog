# 博客写作与发布指南

## 博客内容存放位置

文章保存在 **`content/posts/`**（技术与实战）和 **`content/thinking/`**（思考与记录）两个目录，原文和已有 URL 不需要移动。

`params.mainSections` 明确列出这两个文章目录；`/archives/`、头像入口 `/profile/`、搜索索引和 RSS 使用同一文章集合。项目、关于等页面不进入文章集合。首页精选文章仍由首页模板人工选择。

## 新建博客的步骤

### 1. 在 `content/posts/` 下创建 `.md` 文件

**重要：文件扩展名必须是 `.md` 或 `.markdown`**，否则 Hugo 无法识别为博客文章。

推荐命名方式：`文章标题-slug.md`（例如：`XJTLU-quiz-reminder.md`）

### 2. 文件必须包含 front matter（前置元数据）

每篇博客开头需要 YAML 格式的元数据，格式如下：

```yaml
---
title: "你的文章标题"
date: 2026-02-12T01:00:00+08:00
draft: false
---

（下面是正文内容，使用 Markdown 语法）
```

- **title**：显示在列表和文章页的标题
- **date**：发布日期，格式为 `YYYY-MM-DDTHH:mm:ss+08:00`
- **draft**：设为 `false` 才会在首页显示；设为 `true` 时仅本地预览可见，不会发布

### 3. 使用 Hugo 快捷命令创建新文章（可选）

```bash
hugo new posts/你的文章标题.md
```

会自动生成带正确 front matter 的模板，但 `draft` 默认为 `true`，发布前需改为 `false`。

## 本地预览

```bash
hugo server -D
```

访问 http://localhost:1313 预览，`-D` 会包含 draft 文章。

## 推送到 GitHub 发布

1. 将新文章保存到 `content/posts/` 或 `content/thinking/`，并以 `.md` 结尾
2. 确认 front matter 中 `draft: false`
3. 执行 Git 提交与推送：

```bash
git add content/posts/你的文章.md
git commit -m "新增博客：你的文章标题"
git push origin main
```

推送到 GitHub 后，Vercel/Cloudflare Pages 会自动构建并部署，新文章会出现在线上博客中。

## 常见问题

### 文章在首页不显示？

- 检查文件扩展名是否为 `.md` 或 `.markdown`
- 检查 front matter 中 `draft` 是否为 `false`
- 检查 `date` 格式是否正确

## 字体与首页后台预取

Noto Serif SC 随网站托管于 `static/fonts/noto-serif-sc/`，不请求 Google 字体服务。首页使用约 106 KB 的精简字形包，其余文字按需使用本地分片；字体未到达时先显示后备字体。字体文件名包含内容哈希，Vercel 和 Cloudflare 的字体缓存配置可安全缓存一年。来源、许可证和可选的精简字形更新步骤见该目录的 `SOURCE.md`。

首页先完成资源加载并获得绘制机会，然后在浏览器空闲时预取 `/archives/`、`/profile/`、`/projects/` 三个页面的 HTML。不会预加载全部文章正文，也不会执行目标页面脚本或下载目标页面图片。支持的浏览器使用 Speculation Rules；其余支持预取的浏览器使用低优先级 `link rel=prefetch`。未支持预取、离线、后台页面、开启省流或慢速网络时保留正常链接访问。预取是浏览器可选择执行的优化，实际缓存复用受浏览器和网络策略影响。