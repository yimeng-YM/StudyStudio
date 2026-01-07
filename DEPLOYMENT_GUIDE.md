# StudyStudio 网络部署与分享指南

本文档将详细指导您如何将 StudyStudio 部署到互联网上，以便与好友分享使用。

我们推荐使用 **GitHub + Vercel** 的组合，这是目前最流行、免费且稳定的前端项目托管方案。

---

## 准备工作

在开始之前，请确保您的项目根目录下已经包含了 `.gitignore` 文件（我刚才已经为您创建好了）。

- 这个文件的作用是告诉 Git **忽略** `node_modules` 等不必要的大文件。
- **重要原则**：永远不要上传 `node_modules` 文件夹到网络，因为它太大且包含了成千上万个小文件。Vercel 会在服务器上自动为您安装这些依赖。

---

## 步骤一：将代码上传到 GitHub

如果您还没有 GitHub 账号，请先访问 [github.com](https://github.com) 注册。

### 方法 A：使用 GitHub Desktop（推荐新手使用）

1.  下载并安装 [GitHub Desktop](https://desktop.github.com/)。
2.  登录您的 GitHub 账号。
3.  点击左上角的 **File** -> **Add local repository...**。
4.  选择您的 StudyStudio 项目文件夹路径（即 `c:\Users\yimeng\Documents\StudyStudio`）。
5.  如果提示 "This directory does not appear to be a Git repository"，点击 **create a repository**。
    - **Name**: StudyStudio
    - **Git Ignore**: 选择 Node (或者直接不做选择，因为我们已经手动创建了 .gitignore)
    - 点击 **Create repository**。
6.  点击顶部的 **Publish repository** 按钮。
    - 取消勾选 "Keep this code private"（如果您希望这是一个公开项目，方便免费部署）。
    - 点击 **Publish Repository**。

### 方法 B：使用命令行 (Git Bash / CMD)

如果您电脑上已安装 Git，可以在项目文件夹下打开终端运行：

```bash
# 1. 初始化 Git 仓库
git init

# 2. 添加所有文件（会自动忽略 node_modules）
git add .

# 3. 提交代码
git commit -m "Initial commit"

# 4. 关联远程仓库 (需先在 GitHub 网页上创建一个新的空仓库)
# 替换下面的 URL 为您自己的 GitHub 仓库地址
git remote add origin https://github.com/您的用户名/StudyStudio.git

# 5. 推送代码
git push -u origin master
```

---

## 步骤二：使用 Vercel 部署网站

1.  访问 [vercel.com](https://vercel.com) 并使用 **GitHub 账号** 登录。
2.  在控制台点击 **Add New...** -> **Project**。
3.  在左侧列表中，您应该能看到刚才上传的 `StudyStudio` 仓库，点击 **Import**。
4.  **配置项目**：
    - **Framework Preset**: Vercel 通常会自动识别为 `Vite`。如果没有，请手动选择 Vite。
    - **Root Directory**: 保持默认 `./`。
    - **Build Command**: 保持默认 `npm run build` 或 `vite build`。
    - **Output Directory**: 保持默认 `dist`。
5.  点击 **Deploy** 按钮。
6.  等待约 1-2 分钟，屏幕上会撒花庆祝，并提供一个 **Domain**（域名），例如 `https://study-studio-xyz.vercel.app`。

🎉 **恭喜！您的网站已经上线了！** 您可以将这个链接发给任何好友，他们都能在手机或电脑上访问。

---

## 步骤三：如何分享您的笔记数据

由于 StudyStudio 是一个**纯前端应用**，它没有后端数据库。所有数据（笔记、思维导图、设置）都存储在**每个用户自己的浏览器**中。

这意味着：**好友打开您的链接时，看到的是一个空白的 StudyStudio。**

如果您希望分享您的笔记内容，请按以下步骤操作：

### 1. 导出您的数据

1.  打开您本地运行的（或已部署的）StudyStudio。
2.  点击左下角的 **设置 (Settings)** 图标。
3.  在“数据管理”区域，点击 **导出数据备份**。
4.  您会下载得到一个 `.json` 文件。

### 2. 发送给好友

通过微信、QQ 或邮件将这个 `.json` 文件发送给好友。

### 3. 好友导入数据

1.  好友打开您部署好的 Vercel 链接。
2.  进入 **设置 (Settings)** 页面。
3.  点击 **导入备份文件**，选择您发送的 `.json` 文件。
4.  导入成功后页面会刷新，您的笔记将自动**合并**到好友的 StudyStudio 中（如果好友已经有自己的笔记，系统会自动重命名导入的内容以避免冲突，原有数据不会被覆盖）。

---

## 常见问题

**Q: 为什么好友用不了 AI 功能？**
A: AI 功能需要 API Key。为了安全，API Key 存储在浏览器本地。好友需要在他们的电脑上，进入“设置”页面，填入他们自己的 OpenAI API Key 才能使用 AI 对话功能。

**Q: 我更新了代码怎么办？**
A: 您只需要在本地修改代码后，再次通过 GitHub Desktop 点击 **Commit** 和 **Push**。Vercel 会检测到 GitHub 的变动，并自动为您重新部署更新版本。
