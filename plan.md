# 开发文档（Plan）

本文档用于指导在现有 NextMall 项目上进行二开/维护：包含本地开发方式、模块边界、以及新增业务能力时的实现流程与注意事项。

## 1. 项目概览
- 前端/路由：`src/app/*`（Next.js App Router）
- 客户端数据层：tRPC + React Query（`src/trpc/*`、`src/app/_components/trpc.ts`）
- 服务端 API：tRPC Router（`src/server/api/*`）
- 数据层：Prisma（`prisma/schema.prisma`，PostgreSQL）
- 认证：NextAuth（`src/server/auth/*`，Credentials：手机号 + 密码）

## 2. 本地开发与初始化

### 2.1 安装依赖
```bash
pnpm install
```

### 2.2 配置环境变量
1. 复制示例：
   ```bash
   cp .env.example .env
   ```
2. 重点检查：
   - `DATABASE_URL`
   - `AUTH_SECRET`、`AUTH_URL`（可选，但生产环境需正确）
   - `SMTP_HOST/SMTP_USER/SMTP_PASS`（用于找回密码邮件）
   - `BLOB_READ_WRITE_TOKEN`（用于图片上传；例如支付码）
   - `FIRST_SUPERUSER` / `FIRST_SUPERUSER_PASSWORD`（seed 初始化超级管理员）

> 提示：NextAuth/Prisma 的相关逻辑会在启动时读取环境变量。

### 2.3 数据库初始化
开发环境建议执行：
```bash
pnpm db:generate
npx prisma db seed
```
如果你使用的是现有迁移脚本，`db:generate` 会进行迁移并更新数据库；seed 会创建 `SUPERADMIN` 账号（当前 seed 逻辑仅创建超级管理员）。

### 2.4 启动开发服务器
```bash
pnpm dev
```

### 2.5 常用脚本
- `pnpm check`：`next lint` + `tsc --noEmit`
- `pnpm typecheck`：TypeScript 类型检查
- `pnpm lint`：ESLint
- `pnpm format:write` / `pnpm format:check`：Prettier
- `pnpm build` / `pnpm start`：构建与生产启动

## 3. 关键目录与职责边界

### 3.1 服务端（tRPC + Prisma）
- `src/server/db.ts`
  - Prisma Client 单例，避免开发环境下频繁创建连接
- `src/server/auth/*`
  - NextAuth 配置与适配（Credentials provider）
- `src/server/api/trpc.ts`
  - 定义 `publicProcedure` / `protectedProcedure` / `superAdminProcedure`
  - 创建 tRPC context：包含 Prisma `db` 与 NextAuth session
- `src/server/api/root.ts`
  - 聚合所有 router（`post/user/banner/category/product/collection/course/address/cart/order/payment/log/dashboard/util/sms` 等）
- `src/server/api/routers/*`
  - 每个业务域一个 router，使用 zod 校验输入并返回结构化结果

### 3.2 前端（Next.js App Router）
- `src/app/**/page.tsx`
  - 路由页面（商城、H5、登录注册、供应商端、管理端）
- `src/app/_components/trpc.ts`
  - RSC 侧 hydration：把 tRPC caller 和 React Query client 织入页面
- `src/trpc/react.tsx`
  - Client 侧 tRPC client：`httpBatchStreamLink` + React Query provider

### 3.3 约定
- 服务端“能力”优先封装在 `src/server/api/routers/*` 中，再由前端路由/组件调用。
- 涉及“写操作/状态变更”建议写入 `OperationLog`，便于后台审计与排障。

## 4. 新增业务能力：标准开发流程

以“新增一个后台能力（如：订单退款）”为例，通用流程如下：

1. 领域建模（如需）
   - 更新 `prisma/schema.prisma`
   - 生成迁移并落库（`pnpm db:generate`）
2. 服务端实现
   - 新建/修改 `src/server/api/routers/<domain>.ts`
   - 使用 `zod` 定义输入 schema
   - 选择权限入口：
     - 匿名：`publicProcedure`
     - 仅登录：`protectedProcedure`
     - 管理后台：`superAdminProcedure`
   - 如果需要角色/数据归属控制（如供应商只能操作自身商品订单），在 procedure 内做校验
   - 关键操作调用 `logger.*` 或 `logOperation` 写入 `OperationLog`
3. 聚合路由
   - 把新 router 或新过程加入 `src/server/api/root.ts`
4. 前端接入
   - 在对应页面（`src/app/...`）中调用：
     - Query：`api.<router>.<procedure>.useQuery`
     - Mutation：`api.<router>.<procedure>.useMutation`
   - 处理 loading/error，并在 UI 上体现权限差异（例如未登录/无权限态）
5. 验收与回归
   - 覆盖权限场景：未登录、NORMAL、VENDOR、SUPERADMIN
   - 覆盖数据一致性：库存扣减/恢复、软删除、订单状态流转

## 5. 权限与安全开发建议
- 后台 CRUD 尽量复用 `superAdminProcedure`，减少误暴露风险
- 供应商侧能力必须进行“包含自身商品”的订单过滤与校验（复用订单相关逻辑模式）
- 任何“创建/更新/删除/状态变更”建议记录 OperationLog（后台可追溯）
- 上传图片资源应校验 base64 格式与允许类型；依赖 `BLOB_READ_WRITE_TOKEN`

## 6. 质量保障
- 本地必须跑：
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm check`（覆盖 lint + tsc）
- 建议回归清单（按关键链路）：
  - 注册/登录/修改密码
  - 商品列表/详情/收藏/足迹
  - 购物车与下单：库存扣减、订单创建、订单详情
  - 订单状态更新与收货确认
  - 地址默认逻辑与删除回退
  - 后台 CRUD 与日志统计

## 7. 当前实现需要复核的点（基于代码现状）
- `orderRouter.cancel` 当前校验订单 `status` 必须为 `CANCELLED` 才允许 cancel；如产品规则是“待支付/待发货可取消”，需要调整后端条件并同步前端按钮状态
- 角色枚举一致性：数据库存在 `STORE`，但前端 `src/app/const/status.ts` 目前只定义了 `SUPERADMIN/VENDOR/NORMAL`；如要启用门店角色，需要补齐并做端到端一致性梳理

## 8. 部署参考
- Docker Compose：`docker compose up -d`
- 生产环境镜像按 `Dockerfile` 构建（包含 Prisma generate/migrate/seed 并产出 standalone）
- 如果 Docker 构建中遇到 env 校验问题，使用 `SKIP_ENV_VALIDATION=1`（项目在 NextConfig/脚本中已支持）

