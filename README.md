# 业务中台迁移包 (Business Center Migration Kit)

本目录包含了将业务中台独立化所需的所有数据库脚本和后端函数代码。

## 目录结构

```
platform-migration/
├── 001_platform_schema.sql       # 核心数据库结构 (表、索引、RLS)
├── 002_initial_seed.sql          # 初始化数据 (注册 Voice Reflect 应用)
├── supabase/
│   └── functions/
│       ├── report-usage/         # [API] Token 消耗上报接口
│       └── create-payment/       # [API] 统一下单接口
└── README.md                     # 本文件
```

## 执行步骤 (Step-by-Step)

### 1. 准备中台环境
1.  登录 [Supabase Dashboard](https://supabase.com/dashboard)。
2.  创建一个**新项目**，命名为 `Business Center`（不要使用现有的 Voice Reflect 项目）。
3.  记录下该项目的 `Reference ID`, `Project URL` 和 `anon/service_role` Keys。

### 2. 初始化数据库
1.  进入新项目的 **SQL Editor**。
2.  复制并执行 `001_platform_schema.sql` 中的所有内容。
    *   *验证*：检查 Table Editor，确认 `platform_apps`, `platform_users` 等表已创建。
3.  复制并执行 `002_initial_seed.sql` 中的所有内容。
    *   *验证*：检查 `platform_apps` 表，确认已存在 `Voice Reflect` 记录。

### 3. 部署 Edge Functions
您可以使用 Supabase CLI 将 `supabase/functions` 下的代码部署到中台项目。

```bash
# 登录 Supabase
supabase login

# 链接到中台项目 (替换为您的 Project ID)
supabase link --project-ref your-platform-project-id

# 部署函数
supabase functions deploy report-usage
supabase functions deploy create-payment
```

### 4. 下一步：漫反射对接
完成上述步骤后，中台即准备就绪。接下来需要在 Voice Reflect 项目中配置中台的 API 地址和 App Key，开始双写测试。
