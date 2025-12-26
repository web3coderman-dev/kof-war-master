# ⚔️ 拳皇：利刃突击 | KOF: Skill Demo (Warmaster Edition)

这是一套基于 **Vite + Canvas AP**I 构建的企业级 2D 格斗游戏引擎。具备高保真动画分片、动态音效合成以及基于读帧逻辑的战争大师 (Warmaster) 级 AI 系统。

## 🌟 核心特性
- **战争大师 AI (v12.0)**：具备读帧能力、战术拉扯与多段连招的高智商对手。
- **英雄工厂系统 (v11.0)**：支持多英雄注册，内置经典 RYO 与 科技战士 TECH-STRIKER。
- **动态生命维度 (v10.0)**：5倍血量池，配合动态色彩分块 UI，极致对战时长。
- **军用级音频引擎**：基于 Web Audio API 的实时波形合成，非采样模拟打击感。

## 🚀 快速启动

### 本地开发
```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 生产构建 (准备分享)
```bash
# 生成优化后的分发包
npm run build
```
构建产物将存放在 `dist/` 目录。

## 🌐 云端一键上线 (分享给朋友)

我们推荐使用 **Vercel** 获取免费且极速的公网网址：

1. 浏览器打开 [Vercel Deployment Explorer](https://vercel.com/import/browse)。
2. 将本地生成的 `dist` 文件夹直接拖入网页。
3. 等待 10 秒，你将获得一个类似于 `kof-demo.vercel.app` 的全球访问链接。

## 🎮 操作说明
- **Player 1**: 
  - `W`: 跳跃 | `A/D`: 左右移动
  - `J`: 攻击 (PUNCH)
  - `K`: 强力踢击 (KICK)
  - `L`: 必杀大招 (SUPER)
- **快捷键**:
  - `S + D + J`: 隐藏式必杀指令缓冲测试

---
> [!NOTE]
> 本项目由 **Antigravity** 首席架构师团队设计，旨在展示 Web 端极致的性能调度与 AI 博弈算法。
