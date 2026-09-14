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

## 新增 Skill 与日期

Skills 右侧日期表示「加入博客的日期」，不是 GitHub 仓库的创建日期。
新增时使用下面的命令，自动按北京时间写入当天日期，后续编辑不改变日期：

```sh
python3 scripts/add-skill.py --name "Skill 名称" --url "https://github.com/用户名/仓库" --description "介绍"
```

可用 `--dry-run` 先查看条目；补录历史条目时使用 `--date YYYY-MM-DD`。
直接编辑 `data/skills.yaml` 时也必须填写 `date`，缺失会导致 Hugo 构建报错，以免漏掉日期。
「做网页」保留原先指定的 2026-09-01；「3D 收藏卡」记录本次加入日期 2026-09-14。


## 字体与字号规则

- 博客页面统一使用本地加载的 **Noto Serif SC**，涵盖首页、文章归档及详情、项目、Skills、关于、导航、页脚和联系弹窗。`serif` 仅作为字体未加载时的后备。
- 字体统一由 `assets/css/custom.css` 的 `--font-serif` 控制，不再混用系统无衬线或等宽字体。
- Skills 条目标题、文章归档条目标题与关于页正文共用 `--font-size-list-title: 1rem`。关于页正文保留正文字重和行距，其他文章详情正文大小不受影响。
- 项目封面内的文字、嵌入的独立作品不属于博客文字样式，不随此规则替换。


## 首页精选文章

在 `data/featured_articles.yaml` 中按展示顺序填写原文章路径。
首页直接读取原文章的标题、发布日期和链接，不另起标题，不手写日期，也不复制文章内容。
替换精选只需修改路径；若路径无效，构建会报错，避免发布失效入口。


## 机器人动态项目封面

首页精选与项目页共用机器人互动封面，项目资料用 `interactiveRobot: true` 启用。
封面保留原像素版的自主待机与表情，整张脸与视线跟随鼠标；点击仍进入原机器人展示网址。
表情整体放大 25%，默认下移 8 个逻辑像素，并按当前表情轮廓约束位置，避开云朵和草地。
首页精选通过 `featured` 选择，目前用机器人替换《纸上有光》，后者仍显示于项目页。
背景为静态像素场景，表情使用固定低分辨率透明画布；不嵌入完整展示网站。

表情输出使用 534×300 画布与保留调色板的边缘重建，不使用模糊滤镜；取消自主左右扫视和横向微摆，横向跟随由鼠标控制，其余待机表情保留。
