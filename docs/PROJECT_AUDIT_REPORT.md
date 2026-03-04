# 业务中台 (Business Center) 项目审计报告

## 1. 项目概况

**项目结构**：Monorepo 风格，包含前端管理后台 (`admin-portal`) 和后端服务 (`supabase`)。
**技术栈**：
- **前端**：React 18 + Vite 5 + TypeScript + Tailwind CSS + Radix UI
- **后端**：Supabase (PostgreSQL + Edge Functions)
- **环境**：Windows 适配良好（包含 `@rollup/rollup-win32-x64-msvc` 等依赖）

## 2. 发现的问题与改进建议

### 2.1 项目配置与依赖管理

*   **问题 1：根目录依赖混乱**
    *   根目录 `package.json` 包含了一些前端依赖（如 `class-variance-authority`, `clsx`, `tailwind-merge`），这些实际上应该属于 `admin-portal`。
    *   **建议**：移除根目录中不必要的 `dependencies`，仅保留开发工具（如 `supabase` CLI）或配置 Monorepo Workspace。

*   **问题 2：缺失 Workspace 配置**
    *   虽然采用了多包结构，但根目录 `package.json` 未配置 `workspaces` 字段。
    *   **建议**：在根目录 `package.json` 中添加 `"workspaces": ["admin-portal", "supabase/functions/*"]`，以便统一管理依赖和脚本。

*   **问题 3：Supabase 本地开发环境缺失**
    *   `supabase/config.toml` 文件缺失，意味着无法使用 `supabase start` 启动本地完整的开发环境（数据库、Auth、Storage 等）。
    *   目前开发可能严重依赖远程 Supabase 项目，增加了开发风险和调试难度。
    *   **建议**：运行 `supabase init` 生成配置文件，并配置本地开发环境。

*   **问题 4：Supabase Functions 配置不完善**
    *   `supabase/functions/` 目录下缺失 `deno.json` 和 `import_map.json`。
    *   虽然使用了 `_shared` 目录，但代码中采用了相对路径引用（如 `../_shared/auth-middleware.ts`）。
    *   **建议**：添加 `import_map.json` 以支持绝对路径引用（如 `import ... from "@shared/auth-middleware.ts"`），并添加 `deno.json` 用于统一 lint 和 format 配置。

### 2.2 数据库迁移管理

*   **问题 5：迁移文件重复且版本不一致**
    *   存在两套数据库脚本：`database/`（按序号命名，如 `001_platform_schema.sql`）和 `supabase/migrations/`（按时间戳命名，如 `20240101...`）。
    *   两套脚本内容存在差异（例如 UUID 生成函数不同：`uuid_generate_v4()` vs `gen_random_uuid()`）。
    *   **建议**：以 `supabase/migrations/` 为单一事实来源（Source of Truth），归档或删除 `database/` 目录，避免维护混乱。

### 2.3 代码质量与规范

*   **前端代码**：
    *   ✅ `admin-portal` 代码结构清晰，组件划分合理。
    *   ✅ `bun run lint` 检查通过，无明显语法或风格错误。
    *   ✅ 针对 Windows 环境添加了必要的 rollup 补丁，避免了常见的构建错误。

*   **后端代码**：
    *   ✅ Edge Functions 逻辑清晰，使用了中间件模式处理 Auth。
    *   ⚠️ 部分 Functions 缺乏错误处理的统一封装，虽然有 `_shared/response.ts` 但未在所有地方使用。

## 3. 总结

项目整体结构清晰，技术选型现代且合理。主要问题集中在 **工程化配置**（Monorepo 管理、本地开发环境）和 **数据库脚本版本控制** 上。

**优先改进事项**：
1.  整理 `package.json` 依赖。
2.  统一数据库迁移脚本管理。
3.  补充 Supabase 本地开发配置。
