基于 Next.js 构建的全栈电商解决方案，集成了现代 Web 技术栈

快速开发 代码易懂 方便二开 源码全开源







## 需求文档（PRD）

### 1. 项目概述

NextMall 是一个功能完整的现代化电商平台，基于 `Next.js 15 + tRPC + TypeScript + Prisma + React + Chakra UI + NextAuth.js` 实现端到端业务闭环（前台商城 + H5/移动端 + 供应商视图 + 管理后台）。

系统目标是提供可二开的电商/内容一体化能力，并通过 tRPC + Prisma 保证前后端类型一致与数据安全。

### 2. 目标

- 提供用户侧“浏览商品 -> 收藏/足迹 -> 购物车 -> 下单 -> 支付码展示 -> 物流状态流转 -> 收货确认”的完整流程
- 提供管理侧“多模块 CRUD + 统计看板 + 操作审计日志”的后台能力
- 支持供应商侧对“自身商品相关订单”的状态处理与数据统计

### 3. 角色与权限

系统角色（以数据库与业务校验为准）：

- `SUPERADMIN`：超级管理员（全权限）
- `VENDOR`：供应商（处理自身商品相关订单，查看供应商数据统计）
- `NORMAL`：普通用户（下单、地址/购物车/收藏/足迹、我的订单）
- `STORE`：普通门店（在数据库/部分接口输入枚举中存在；前端常量目前未完全覆盖，需保持一致性）

权限策略：

- 后端统一使用 tRPC procedure：
  - `publicProcedure`：匿名可调用（商品列表/详情、课程/合集/Banner、短信验证码发送等）
  - `protectedProcedure`：登录后可调用（购物车、地址、我的订单、收藏/足迹等）
  - `superAdminProcedure`：仅超级管理员可调用（用户管理、Banner/Category/Product/Course/Collection 等后台 CRUD）
- 供应商对订单状态更新采用业务级校验：仅可更新“包含自身商品”的订单（见 `orderRouter.updateStatus`）

### 4. 功能需求

#### 4.1 认证与用户

- 短信验证码：
  - `REGISTER`/`LOGIN`/`RESET` 三类验证码（`smsRouter.sendCode` / `smsRouter.verifyCode`）
  - 开发环境可返回验证码以便联调
- 注册：
  - 校验短信验证码有效性并标记使用
  - 创建 `User`（手机号、用户名、密码 hash、手机号验证时间等）
  - 接口：`userRouter.register`
- 登录：
  - NextAuth Credentials provider，支持“手机号 + 密码”（`src/server/auth/config.ts`）
- 找回密码：
  - 基于邮箱触发重置邮件（`userRouter.recoverPassword`）
- 密码修改：
  - 需要登录校验旧密码并更新新密码（`userRouter.changePassword`）

#### 4.2 用户管理（后台）

- 用户列表分页/排序/筛选（role/status）与批量删除
- 用户创建/更新/删除（软删除：`isDeleted=true`）
- 操作审计：对创建/更新/删除进行 OperationLog 记录
- 接口：`userRouter.list/create/update/delete/deleteMany`（由 `superAdminProcedure` 保护）

#### 4.3 商品与规格

- 商品列表（前台）：
  - 分类筛选、关键词搜索、排序与分页
  - 价格排序支持按规格最低价计算（见 `productRouter.list`）
- 商品详情（前台）：
  - 返回规格与所属供应商信息
  - 已登录用户返回 `isFavorited`
  - 页面访问可自动写入浏览足迹（Footprint）并更新时间
- 商品管理（后台）：
  - 创建/更新/删除商品与多规格（`productRouter.create/update/delete/deleteMany`）
  - 删除校验：禁止删除被购物车或订单引用的商品/规格
- 收藏与足迹：
  - 收藏/取消收藏：`toggleFavorite`
  - 我的收藏：`getFavorites`
  - 我的足迹：`getFootprints`

#### 4.4 购物车

- 购物车列表：返回商品、供应商、规格信息（`cartRouter.list`）
- 添加到购物车：
  - 支持商品与规格（specId 可选，实际取决于商品是否有规格）
  - 已存在相同商品+规格则累加数量
- 数量更新/删除/批量删除/清空/数量统计

#### 4.5 收货地址

- 地址列表、创建、更新、删除、获取
- 默认地址规则：
  - 若用户无地址：首个地址自动设为默认
  - 设置为默认时会同步取消其他地址默认标记
- 默认地址删除后会自动将“最早创建的地址”设为默认

#### 4.6 订单与履约

- 创建订单：
  - 输入：`items[]`（productId/specId/quantity/remark 可选） + `addressId`
  - 校验：
    - address 必须属于当前用户
    - spec 必须存在且库存足够
  - 计价：
    - 单项总价 = `spec.price * quantity + product.logiPrice`
  - 库存与销量：
    - 扣减对应规格库存（decrement）
    - 订单创建后递增商品销量（increment sales）
  - 订单结构说明：
    - 当前实现采用“每个 Order 对应一个购买项”的结构（schema 注释与 `orderRouter.create` 循环创建一致）
- 订单列表/详情：
  - 普通用户：仅可查询自己的订单与订单详情
  - 后台：可查询所有订单（可按 status/userId/search）
- 订单状态流转：
  - 状态枚举：`PAID / CHECKED / DELIVERED / COMPLETED / CANCELLED`
  - 状态更新（由 `VENDOR` 与 `SUPERADMIN` 执行）：
    - VENDOR：仅更新包含自身商品的订单
    - SUPERADMIN：全量可更新
- 收货确认：
  - `DELIVERED` -> `COMPLETED`（仅订单归属用户可执行）
- 取消订单：
  - 恢复规格库存并回滚商品销量（`orderRouter.cancel`）
  - 注意：当前实现校验“订单 status 必须为 `CANCELLED` 才允许执行 cancel”，建议在二期复核业务规则并与前端联动
- 支付码管理：
  - 后台上传最新支付码图片；前台展示最新记录
  - 上传图片使用 Vercel Blob（`paymentRouter.upload`）

#### 4.7 内容管理（课程/合集/Banner）

- Banner：
  - 前台列表支持 `isActive` 筛选；后台 CRUD（`bannerRouter`）
- 课程：
  - 前台列表支持合集/上架筛选；详情接口会递增播放次数
  - 后台 CRUD（`courseRouter`）
- 合集：
  - 前台列表与后台 CRUD（`collectionRouter`）

#### 4.8 统计与运维（后台）

- 操作日志：
  - 获取日志列表（分页 + 多条件筛选）
  - 统计（按 action/module/status、时间范围聚合）
  - 接口：`logRouter.getList/getStats`
- 看板统计：
  - 用户统计、订单统计、成交统计（基于订单状态聚合）
  - 库存预警：查找 `productSpec.stock < 10` 且商品处于上架状态
  - 供应商数据统计：按年/月区间汇总订单项的售价/成本/运费等指标
  - 接口：`dashboardRouter.*`

### 5. 数据模型要求（Prisma）

关键领域对象及核心字段（用于实现与验收对齐）：

- `User`：id/name/email/phone/password/status/role/isDeleted/createdAt/updatedAt
- `SmsCode`：phone/code/type/used/expiresAt
- `Address`：userId/name/phone/province/city/district/detail/isDefault
- `Product`：title/images/owner/vendor/logistics/logiPrice/description/isActive/minAmount/sales/isDeleted
- `ProductSpec`：productId/value/image/price/inPrice/stock
- `Cart`：userId/productId/specId/quantity
- `Order`：userId/addressId/items/status/totalPrice/paidAt/trackingNumber/shippingInfo/refundInfo/isDeleted
- `OrderItem`：orderId/productId/specId/specInfo/quantity/price/logiPrice/remark
- `Footprint`：userId/productId/viewedAt
- `ProductFavorite`：userId/productId/createdAt
- `Payment`：image/filename/originalName
- `Course / Collection / Banner / OperationLog`：支持前台展示与后台管理/统计

### 6. 接口/服务契约（tRPC）

- 服务端入口聚合：`src/server/api/root.ts`
- 关键认证与权限入口：
  - 登录态来自 NextAuth（`createTRPCContext` 内部读取 session）
  - 程序保护来自 `src/server/api/trpc.ts`（public/protected/superAdmin）
- 输入校验：
  - 统一使用 `zod` 定义输入 schema
- 审计日志：
  - 通过 `logger` / `logOperation` 写入 `OperationLog`

### 7. 非功能需求

- 安全：
  - 密码 `bcrypt` hash 存储，登录校验走 `NextAuth Credentials`
  - 权限校验由 tRPC procedure 完成，关键业务做角色/数据归属校验
- 可用性：
  - 使用软删除（`isDeleted`）保护历史记录一致性
- 可观测性：
  - OperationLog + 服务器侧 TRPC 耗时输出
- 上传：
  - 使用 `@vercel/blob` 按公开访问方式保存图片资源，并依赖环境变量 `BLOB_READ_WRITE_TOKEN`
- 性能：
  - 列表接口支持分页、排序、过滤；客户端使用 React Query + tRPC hydration

### 8. 部署与运行前置条件

- Node.js 18+；PostgreSQL 17+
- 环境变量：
  - `DATABASE_URL`、`AUTH_SECRET`、`AUTH_URL`、`SMTP_HOST/SMTP_USER/SMTP_PASS` 等
  - `BLOB_READ_WRITE_TOKEN` 用于图片上传
- Docker Compose：
  - `docker compose up -d` 启动 `postgres` + Next 应用
- 初始化：
  - 执行 Prisma migrate 并运行 seed（当前 seed 只创建 `SUPERADMIN`）

### 9. 验收标准（示例）

- 注册/登录：短信验证码注册链路可用，Credentials 登录成功
- 商品：列表/详情/收藏/足迹行为符合预期；规格价格与库存校验正确
- 购物车与下单：添加购物车成功；下单校验库存并创建订单成功；扣减库存与递增销量正确
- 订单履约：状态更新在权限范围生效；收货确认正确完成状态流转
- 地址：默认地址与删除默认地址后的回退规则正确
- 后台：用户管理、Banner/Category/Product/Course/Collection CRUD 与统计面板可用；日志能按条件检索

### 10. 约束与假设

- 当前订单建模为“每个 Order 对应一个购买项”（如需支持多项合单，需要调整 `orderRouter.create` 与数据结构）
- 取消订单业务规则建议在复核后与前端 UI 状态条件同步
- `STORE` 角色在数据库存在，但前端 `ROLES` 常量未完全覆盖；后续需做角色一致性梳理

## 需求文档（PRD）
### 1. 项目概述
NextMall 是一个功能完整的现代化电商平台，基于 `Next.js 15 + tRPC + TypeScript + Prisma + React + Chakra UI + NextAuth.js` 实现端到端业务闭环（前台商城 + H5/移动端 + 供应商视图 + 管理后台）。

系统目标是提供可二开的电商/内容一体化能力，并通过 tRPC + Prisma 保证前后端类型一致与数据安全。

### 2. 目标
- 提供用户侧“浏览商品 -> 收藏/足迹 -> 购物车 -> 下单 -> 支付码展示 -> 物流状态流转 -> 收货确认”的完整流程
- 提供管理侧“多模块 CRUD + 统计看板 + 操作审计日志”的后台能力
- 支持供应商侧对“自身商品相关订单”的状态处理与数据统计

### 3. 角色与权限
系统角色（以数据库与业务校验为准）：
- `SUPERADMIN`：超级管理员（全权限）
- `VENDOR`：供应商（处理自身商品相关订单，查看供应商数据统计）
- `NORMAL`：普通用户（下单、地址/购物车/收藏/足迹、我的订单）
- `STORE`：普通门店（在数据库/部分接口输入枚举中存在；前端常量目前未完全覆盖，需保持一致性）

权限策略：
- 后端统一使用 tRPC procedure：
  - `publicProcedure`：匿名可调用（商品列表/详情、课程/合集/Banner、短信验证码发送等）
  - `protectedProcedure`：登录后可调用（购物车、地址、我的订单、收藏/足迹等）
  - `superAdminProcedure`：仅超级管理员可调用（用户管理、Banner/Category/Product/Course/Collection 等后台 CRUD）
- 供应商对订单状态更新采用业务级校验：仅可更新“包含自身商品”的订单（见 `orderRouter.updateStatus`）

### 4. 功能需求
#### 4.1 认证与用户
- 短信验证码：
  - `REGISTER`/`LOGIN`/`RESET` 三类验证码（`smsRouter.sendCode` / `smsRouter.verifyCode`）
  - 开发环境可返回验证码以便联调
- 注册：
  - 校验短信验证码有效性并标记使用
  - 创建 `User`（手机号、用户名、密码 hash、手机号验证时间等）
  - 接口：`userRouter.register`
- 登录：
  - NextAuth Credentials provider，支持“手机号 + 密码”（`src/server/auth/config.ts`）
- 找回密码：
  - 基于邮箱触发重置邮件（`userRouter.recoverPassword`）
- 密码修改：
  - 需要登录校验旧密码并更新新密码（`userRouter.changePassword`）

#### 4.2 用户管理（后台）
- 用户列表分页/排序/筛选（role/status）与批量删除
- 用户创建/更新/删除（软删除：`isDeleted=true`）
- 操作审计：对创建/更新/删除进行 OperationLog 记录
- 接口：`userRouter.list/create/update/delete/deleteMany`（由 `superAdminProcedure` 保护）

#### 4.3 商品与规格
##### 4.3.1 商品分类（二级子分类）
- **结构**：分类支持两级——**一级分类**（`parentId` 为空）与**二级子分类**（`parentId` 指向一级）。数据库字段为 `Category.parentId` 自关联。
- **商品归属**：商品仅允许关联到**叶子分类**（该分类下无子分类）。若某一级分类下已挂有商品，则不允许再在该一级下新增子分类（需先迁移/移除商品）。
- **接口**：
  - `category.tree`：返回一级及嵌套的二级列表（H5 分类页）
  - `category.roots`：仅一级分类（H5 首页宫格）
  - `category.leafCategories`：可挂载商品的叶子分类（后台商品表单下拉）
  - `category.list`：分页列表，含 `parent`、`parentId`、`_count`（子分类数/商品数）
  - `product.list` 增加 `parentCategoryId`：按一级分类筛选时，自动包含其下所有二级分类的商品
- **前端**：
  - 管理后台「分类管理」：展示层级/父分类，新建时可选择上级（空为一级）
  - 管理后台「商品管理」：分类下拉仅叶子项，展示「一级名 / 二级名」
  - H5 首页：入口为一级分类；H5「分类」页左侧一级、右侧二级标签 + 对应商品列表，URL 支持 `?id=`（一级或二级 id）与 `&sub=`（二级 id）
- 商品列表（前台）：
  - 分类筛选、关键词搜索、排序与分页
  - 价格排序支持按规格最低价计算（见 `productRouter.list`）
- 商品详情（前台）：
  - 返回规格与所属供应商信息
  - 已登录用户返回 `isFavorited`
  - 页面访问可自动写入浏览足迹（Footprint）并更新时间
- 商品管理（后台）：
  - 创建/更新/删除商品与多规格（`productRouter.create/update/delete/deleteMany`）
  - 删除校验：禁止删除被购物车或订单引用的商品/规格
- 收藏与足迹：
  - 收藏/取消收藏：`toggleFavorite`
  - 我的收藏：`getFavorites`
  - 我的足迹：`getFootprints`

#### 4.4 购物车
- 购物车列表：返回商品、供应商、规格信息（`cartRouter.list`）
- 添加到购物车：
  - 支持商品与规格（specId 可选，实际取决于商品是否有规格）
  - 已存在相同商品+规格则累加数量
- 数量更新/删除/批量删除/清空/数量统计

#### 4.5 收货地址
- 地址列表、创建、更新、删除、获取
- 默认地址规则：
  - 若用户无地址：首个地址自动设为默认
  - 设置为默认时会同步取消其他地址默认标记
- 默认地址删除后会自动将“最早创建的地址”设为默认

#### 4.6 订单与履约
- 创建订单：
  - 输入：`items[]`（productId/specId/quantity/remark 可选） + `addressId`
  - 校验：
    - address 必须属于当前用户
    - spec 必须存在且库存足够
  - 计价：
    - 单项总价 = `spec.price * quantity + product.logiPrice`
  - 库存与销量：
    - 扣减对应规格库存（decrement）
    - 订单创建后递增商品销量（increment sales）
  - 订单结构说明：
    - 当前实现采用“每个 Order 对应一个购买项”的结构（schema 注释与 `orderRouter.create` 循环创建一致）
- 订单列表/详情：
  - 普通用户：仅可查询自己的订单与订单详情
  - 后台：可查询所有订单（可按 status/userId/search）
- 订单状态流转：
  - 状态枚举：`PAID / CHECKED / DELIVERED / COMPLETED / CANCELLED`
  - 状态更新（由 `VENDOR` 与 `SUPERADMIN` 执行）：
    - VENDOR：仅更新包含自身商品的订单
    - SUPERADMIN：全量可更新
- 收货确认：
  - `DELIVERED` -> `COMPLETED`（仅订单归属用户可执行）
- 取消订单：
  - 恢复规格库存并回滚商品销量（`orderRouter.cancel`）
  - 注意：当前实现校验“订单 status 必须为 `CANCELLED` 才允许执行 cancel”，建议在二期复核业务规则并与前端联动
- 支付码管理：
  - 后台上传最新支付码图片；前台展示最新记录
  - 上传图片使用 Vercel Blob（`paymentRouter.upload`）

#### 4.7 内容管理（课程/合集/Banner）
- Banner：
  - 前台列表支持 `isActive` 筛选；后台 CRUD（`bannerRouter`）
- 课程：
  - 前台列表支持合集/上架筛选；详情接口会递增播放次数
  - 后台 CRUD（`courseRouter`）
- 合集：
  - 前台列表与后台 CRUD（`collectionRouter`）

#### 4.8 统计与运维（后台）
- 操作日志：
  - 获取日志列表（分页 + 多条件筛选）
  - 统计（按 action/module/status、时间范围聚合）
  - 接口：`logRouter.getList/getStats`
- 看板统计：
  - 用户统计、订单统计、成交统计（基于订单状态聚合）
  - 库存预警：查找 `productSpec.stock < 10` 且商品处于上架状态
  - 供应商数据统计：按年/月区间汇总订单项的售价/成本/运费等指标
  - 接口：`dashboardRouter.*`

### 5. 数据模型要求（Prisma）
关键领域对象及核心字段（用于实现与验收对齐）：
- `User`：id/name/email/phone/password/status/role/isDeleted/createdAt/updatedAt
- `SmsCode`：phone/code/type/used/expiresAt
- `Address`：userId/name/phone/province/city/district/detail/isDefault
- `Product`：title/images/owner/vendor/logistics/logiPrice/description/isActive/minAmount/sales/isDeleted
- `ProductSpec`：productId/value/image/price/inPrice/stock
- `Cart`：userId/productId/specId/quantity
- `Order`：userId/addressId/items/status/totalPrice/paidAt/trackingNumber/shippingInfo/refundInfo/isDeleted
- `OrderItem`：orderId/productId/specId/specInfo/quantity/price/logiPrice/remark
- `Footprint`：userId/productId/viewedAt
- `ProductFavorite`：userId/productId/createdAt
- `Payment`：image/filename/originalName
- `Course / Collection / Banner / OperationLog`：支持前台展示与后台管理/统计

### 6. 接口/服务契约（tRPC）
- 服务端入口聚合：`src/server/api/root.ts`
- 关键认证与权限入口：
  - 登录态来自 NextAuth（`createTRPCContext` 内部读取 session）
  - 程序保护来自 `src/server/api/trpc.ts`（public/protected/superAdmin）
- 输入校验：
  - 统一使用 `zod` 定义输入 schema
- 审计日志：
  - 通过 `logger` / `logOperation` 写入 `OperationLog`

### 7. 非功能需求
- 安全：
  - 密码 `bcrypt` hash 存储，登录校验走 `NextAuth Credentials`
  - 权限校验由 tRPC procedure 完成，关键业务做角色/数据归属校验
- 可用性：
  - 使用软删除（`isDeleted`）保护历史记录一致性
- 可观测性：
  - OperationLog + 服务器侧 TRPC 耗时输出
- 上传：
  - 使用 `@vercel/blob` 按公开访问方式保存图片资源，并依赖环境变量 `BLOB_READ_WRITE_TOKEN`
- 性能：
  - 列表接口支持分页、排序、过滤；客户端使用 React Query + tRPC hydration

### 8. 部署与运行前置条件
- Node.js 18+；PostgreSQL 17+
- 环境变量：
  - `DATABASE_URL`、`AUTH_SECRET`、`AUTH_URL`、`SMTP_HOST/SMTP_USER/SMTP_PASS` 等
  - `BLOB_READ_WRITE_TOKEN` 用于图片上传
- Docker Compose：
  - `docker compose up -d` 启动 `postgres` + Next 应用
- 初始化：
  - 执行 Prisma migrate 并运行 seed（当前 seed 只创建 `SUPERADMIN`）

### 9. 验收标准（示例）
- 注册/登录：短信验证码注册链路可用，Credentials 登录成功
- 商品：列表/详情/收藏/足迹行为符合预期；规格价格与库存校验正确
- 购物车与下单：添加购物车成功；下单校验库存并创建订单成功；扣减库存与递增销量正确
- 订单履约：状态更新在权限范围生效；收货确认正确完成状态流转
- 地址：默认地址与删除默认地址后的回退规则正确
- 后台：用户管理、Banner/Category/Product/Course/Collection CRUD 与统计面板可用；日志能按条件检索

### 10. 约束与假设
- 当前订单建模为“每个 Order 对应一个购买项”（如需支持多项合单，需要调整 `orderRouter.create` 与数据结构）
- 取消订单业务规则建议在复核后与前端 UI 状态条件同步
- `STORE` 角色在数据库存在，但前端 `ROLES` 常量未完全覆盖；后续需做角色一致性梳理

## 前言

> 现在很多开源电商项目有以下问题

1. 开源的都是很老的版本，技术栈老，界面丑陋，不说多好看吧，就真的很老的设计，新的都要额外收费；
2. 动不动各种跑不起来，不知道是缺了个什么玩意儿；跑起来复杂；
3. 体验版本和实际开源根本不一致；
4. 很多版本跑起来内存占用很多，服务器呜呜呜的，首屏也做得很差；

针对上面问题推荐大家一起开源学习下面这个项目！

[项目开源地址 感谢点星+收藏](https://github.com/NSGUF/nextmall)

## 🚀 项目简介

NextMall 是一个功能完整的现代化电商平台，专为追求高性能和用户体验而设计。项目采用 Next.js 15 + TRpc + TypeScript + Prisma + React + Chakra 的全栈技术架构，提供了完整的电商业务流程，包括商品管理、订单处理、用户系统、支付集成等核心功能。

## 🌟 优势

1. 极致开发体验 next.js/trpc/prisma/chakra，方便二次开发
2. 高性能
3. node+postgre就可快速本地部署或者docker一键部署
4. 现代化的界面设计
5. 开源学习：提供完整的代码

## ⚡ 高性能

1. 服务器占用小 100M多一点

内存占用  
2. 客户端加载小 几百kb的静态资源  








## ✨ 核心特性

### 🛍️ 商城功能

- **商品管理**: 完整的商品发布、编辑、分类管理系统
- **多规格支持**: 支持商品多规格、库存管理
- **购物车**: 智能购物车，支持规格选择和数量调整
- **订单系统**: 完整的订单流程，从下单到发货的全流程管理
- **收货地址**: 多地址管理，支持默认地址设置

### 👥 用户系统

- **多角色权限**: 超级管理员、供应商、普通用户等多角色体系
- **认证授权**: 基于 NextAuth.js 的安全认证系统
- **用户资料**: 完整的用户信息管理和头像上传
- **收藏足迹**: 商品收藏和浏览历史功能

### 📚 内容管理

- **课程系统**: 支持视频课程发布和播放
- **合集管理**: 课程合集和分类组织
- **Banner管理**: 首页轮播图和广告位管理

### 📱 移动端适配

- **响应式设计**: 完美适配桌面端和移动端
- **PWA支持**: 渐进式 Web 应用体验
- **H5界面**: 专门优化的移动端商城界面

### 🔧 管理后台

- **超级管理员**: 拥有系统最高权限，可管理所有用户、商品、订单、供应商及平台设置，查看和分析全站销售数据、用户行为，分配和调整各类权限，进行系统维护与审计。
- **供应商**: 可管理自身商品及库存，查看本店铺的订单和销售数据，分析商品表现，及时响应库存预警，支持商品上下架和价格调整。
- **数据统计**: 销售数据、用户行为等全面统计
- **操作日志**: 完整的系统操作审计日志
- **权限管理**: 细粒度的权限控制系统

## 🚀 快速开始

### 📋 环境要求

- Node.js 18+ & PostgreSQL 17+ 
- 或 Docker & Docker Compose (推荐)

### 🐳 Docker 一键部署

```bash
# 克隆项目
git clone https://github.com/your-username/nextmall.git
cd nextmall

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，设置数据库密码等配置

# 启动服务
docker compose up -d
```

访问 [http://localhost:3000](http://localhost:3000) 即可使用

### 💻 本地开发

1. **安装依赖**

```bash
pnpm install
```

1. **配置数据库**

```bash
# 将 .env.example 重命名为 .env 并配置数据库连接
cp .env.example .env

# 推送数据库结构
c

# 创建管理员账号
npx prisma db seed
```

1. **启动开发服务器**

```bash
pnpm dev
```

1. **构建生产版本**

```bash
pnpm build
pnpm start
```

### 🔧 其他可用命令

```bash
# 数据库操作
pnpm db:studio      # 打开 Prisma Studio
pnpm db:generate    # 生成 Prisma 客户端
pnpm db:migrate     # 运行数据库迁移

# 代码质量
pnpm lint           # 运行 ESLint
pnpm typecheck      # TypeScript 类型检查
pnpm format:write   # 格式化代码
```

## 🏗️ 技术架构

### 前端技术栈

- **[Next.js 15](https://nextjs.org/)** - React 全栈框架
- **[TypeScript](https://www.typescriptlang.org/)** - 类型安全的 JavaScript
- **[Chakra UI](https://chakra-ui.com/)** - 现代化 React 组件库
- **[React Query](https://tanstack.com/query)** - 数据获取和状态管理
- **[React Hook Form](https://react-hook-form.com/)** - 高性能表单处理
- **[Next Themes](https://github.com/pacocoursey/next-themes)** - 主题切换支持

### 后端技术栈

- **[tRPC](https://trpc.io/)** - 端到端类型安全 API
- **[Prisma](https://prisma.io/)** - 现代化数据库 ORM
- **[NextAuth.js](https://next-auth.js.org/)** - 认证授权解决方案
- **[PostgreSQL](https://www.postgresql.org/)** - 关系型数据库
- **[Zod](https://zod.dev/)** - TypeScript 优先的模式验证

### 开发工具

- **[ESLint](https://eslint.org/)** - 代码质量检测
- **[Prettier](https://prettier.io/)** - 代码格式化
- **[Docker](https://www.docker.com/)** - 容器化部署
- **[pnpm](https://pnpm.io/)** - 高效的包管理器

## 📝 功能清单

### ✅ 已完成功能

#### 用户系统

- 用户注册/登录
- 多角色权限系统 (超级管理员/供应商/普通用户)
- 收货地址管理

#### 商品系统

- 商品发布和编辑
- 多规格商品支持
- 商品分类管理
- 商品图片上传
- 库存管理
- 商品收藏/足迹功能

#### 订单系统

- 购物车功能
- 订单创建和管理
- 订单状态流转
- 物流信息管理
- 支付码上传管理

#### 内容管理

- 视频课程系统
- 课程合集管理
- Banner 轮播图管理
- 用户浏览足迹

#### 管理功能

- 后台管理界面
- 数据统计面板
- 操作日志记录
- 系统配置管理

## 📸 界面展示

### 登录注册



### 📱 普通用户界面



### ⚙️ 管理后台

#### admin



#### 供应商



## 🤝 贡献指南

我们欢迎任何形式的贡献！无论是报告 bug、提出新功能建议，还是提交代码改进。

### 如何贡献

1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的修改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开一个 Pull Request

### 开发规范

- 遵循现有的代码风格
- 为新功能添加适当的测试
- 更新相关文档
- 确保所有测试通过

## 📄 许可证

本项目基于 Apache License 许可证开源 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🌟 社区与支持

### 获取帮助

- 📖 查看我们的 [文档](README.md)
- 🐛 报告问题请提交 [Issue](https://github.com/nsguf/nextmall/issues)
- 💬 加入讨论区参与社区交流

qq群：585353647  
公众号：





### 项目统计

- ⭐ Stars: 给项目点个星星吧！
- 🍴 Fork: 欢迎 Fork 项目进行二次开发
- 👥 贡献者: 感谢所有为项目做出贡献的开发者

## 声明

本项目仅做技术交流和学习，不建议用于商业目的！

---

如果这个项目对您有帮助，请给它一个 ⭐ Star ⭐

如果这个项目对你有帮助，请不要忘记给个 ⭐ Star 支持一下！这对我来说意义重大，也是我持续更新的动力源泉。