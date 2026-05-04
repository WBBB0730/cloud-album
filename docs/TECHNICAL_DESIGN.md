# 云相册技术设计

## 技术栈

- Web 框架：Next.js。
- 后端入口：Server Action。
- 数据库：PostgreSQL。
- ORM：Drizzle ORM。
- Migration：Drizzle Kit 生成 SQL migration，migration 文件提交到仓库。
- 文件存储：腾讯云 COS 私有 bucket。

## ORM 选择

第一版使用 Drizzle ORM。

选择原因：

- 项目依赖 PostgreSQL 的约束、索引和事务语义。
- 空间隔离、逻辑删除、删除批次恢复、上传状态管理都需要清晰的 SQL 边界。
- Drizzle 更贴近 SQL，便于表达复杂查询、事务和自定义 migration。
- ORM 负责类型安全和查询组织，不决定业务模型。

不采用 Prisma 作为第一选择，原因是本项目更需要直接掌控 SQL migration、部分唯一索引、复合索引和复杂事务。

## 数据库目录组织

```text
src/db/
  client.ts
  schema/
    auth.ts
    spaces.ts
    albums.ts
    uploads.ts
    deletes.ts
    index.ts
  migrations/
```

职责：

- `client.ts`：数据库连接和 Drizzle 实例。
- `schema/auth.ts`：`users`、`account_invites`、`sessions`。
- `schema/spaces.ts`：`spaces`、`space_members`。
- `schema/albums.ts`：`folders`、`media`。
- `schema/uploads.ts`：`upload_sessions`。
- `schema/deletes.ts`：`delete_batches`。
- `schema/index.ts`：统一导出 schema。
- `migrations/`：Drizzle Kit 生成的 SQL migration。

## 业务目录组织

```text
src/features/
  auth/
    actions.ts
    service.ts
    queries.ts
  spaces/
    actions.ts
    service.ts
    queries.ts
  albums/
    actions.ts
    service.ts
    queries.ts
  uploads/
    actions.ts
    service.ts
    queries.ts
  trash/
    actions.ts
    service.ts
    queries.ts
  admin/
    actions.ts
    service.ts
    queries.ts
```

分层规则：

- `actions.ts`：Server Action 入口，负责表单解析、当前用户获取、调用 service、触发 revalidate。
- `service.ts`：业务事务、权限判断、跨表写入、状态流转。
- `queries.ts`：数据库查询和小范围写入封装。

Server Action 不直接散写数据库操作。涉及空间校验、上传确认、删除恢复的逻辑必须进入 service 层。

成员管理页通过 `src/features/app/view-actions.ts` 读取当前空间成员，写入仍走 `src/features/spaces/actions.ts`；读取、邀请、移除和退出都必须在 service 层校验当前用户属于目标空间。只有空间创建者可以移除其他成员，且创建者不能被移除；移除其他成员和自己退出空间都会清空对应用户的 `last_space_id`；空间创建者不能退出空间，必须由 service 层拒绝。

空间和相册重命名必须通过 Server Action 调用 service 层完成。重命名时先校验当前用户属于目标空间，再校验当前用户是该空间创建者；全局管理员身份不赋予空间内重命名权限。名称统一使用 `safeName` 清理，空名称必须拒绝。

新建空间和新建相册不使用独立页面，分别在空间入口页和相册首页用 `NameEditDialog` 弹窗提交。弹窗输入默认填入“我的空间”和“我的相册”，提交后直接调用对应 Server Action，成功后跳转到新空间或新相册。

全局管理后台账号操作采用禁用账号而不是物理删除用户行。`users.disabled_at` 和 `users.disabled_by` 记录禁用状态和操作者；禁用时清理该用户 `sessions`，登录和会话读取都必须拒绝已禁用账号；历史上传者、删除者、空间创建者等外键记录保留；管理员不能禁用当前登录账号。

## 核心数据表

第一版核心表：

- `users`
- `account_invites`
- `sessions`
- `spaces`
- `space_members`
- `folders`
- `media`
- `upload_sessions`
- `delete_batches`

## 关键约束

- `users.phone` 唯一。
- `space_members(space_id, user_id)` 唯一。
- `folders.space_id` 必填。
- `media.space_id` 必填。
- `media.folder_id` 必须归属同一个 `space_id`。
- 同一手机号不能同时存在多个未处理注册邀请。
- 注册邀请保留 `token_hash` 用于注册校验，同时保存 nullable `token` 供全局管理员在待注册邀请列表中再次复制链接；服务端返回管理后台数据时不能把 `token_hash` 下发到客户端，已撤销邀请不返回。
- 普通列表默认过滤 `deleted_at is null` 和 `permanently_deleted_at is null`。
- 回收站首页按文件夹展示，不直接混排所有已删除媒体。
- 删除批次使用 `delete_batches` 记录批次元信息，`folders` 和 `media` 通过 `delete_batch_id` 关联。

## 索引方向

建议索引：

- `media(space_id, folder_id, taken_at desc)`：文件夹媒体列表。
- `media(space_id, deleted_at)`：回收站查询。
- `media(space_id, permanently_deleted_at)`：永久删除过滤。
- `folders(space_id, deleted_at)`：空间文件夹和回收站文件夹查询。
- `space_members(user_id, space_id)`：用户空间列表。
- `account_invites(phone)`：邀请查重。
- `users(disabled_at)`：账号禁用状态。

部分唯一索引、复杂约束如果 Drizzle schema 表达不顺，使用自定义 SQL migration。

## Migration 规则

- 使用 Drizzle Kit 从 schema 生成 SQL migration。
- migration 文件必须提交到仓库。
- 生产环境只运行 migration。
- 不使用直接推送 schema 到生产库的方式替代 migration。

## 事务边界

必须使用事务的场景：

- 接受注册邀请并创建用户。
- 创建空间并加入创建者为成员。
- 通过手机号邀请用户加入空间。
- 移除空间成员或退出空间。
- 创建上传记录和媒体草稿。
- 上传完成确认并更新媒体状态。
- 上传客户端使用单一上传队列调度器，按文件维度最多 5 并发；每个文件内部的 COS 分片上传优先避免抢占其它文件的上传通道；总进度按完成文件数 / 队列文件总数计算，并显示剩余数量；成功项从可见队列隐藏但保留在总进度统计中；存在等待或上传中文件时，页面内返回使用自定义确认，刷新/关闭使用 `beforeunload`，浏览器返回使用 history guard，确认离开时必须避免和系统级拦截二次冲突。
- 批量删除媒体。
- 文件夹封面使用 `folders.cover_media_id` 保存手动选择的媒体；空间文件夹列表优先读取该媒体作为封面，如果该媒体已删除、永久删除或不可用，则回退到文件夹内最新可用媒体。
- 相册页和回收站文件夹页的多选、拖动范围快速选择由 `useMediaSelection` 统一管理；首次进入选择态使用 0.8 秒长按时长，选择态内快速选择使用 0.5 秒长按时长；快速选择长按到时后先对起始媒体执行本次选择或取消选择，之后必须实际拖动才启动范围选择和边缘自动滚动；拖动过程中按起点到当前媒体项重新计算本次范围，起点未选中时选中范围、起点已选中时取消选中范围，松手确认当前范围，不改变筛选和普通纵向滚动行为。
- 相册媒体网格缩略图使用 `IntersectionObserver` 懒加载；进入加载范围前只渲染灰色占位，不挂载真实图片或视频元素；进入加载范围后保持已加载状态，避免后台签名 URL 刷新导致可见缩略图回退占位。
- 媒体预览中的视频使用原生播放器；视频渲染区域需要避开底部缩略图浮层，视频播放中隐藏预览顶部栏和底部缩略图栏；左右切换或页面隐藏时暂停所有预览视频并恢复 1 倍速；视频播放中长按画面区域临时切到 2 倍速，松手、取消、暂停、结束或切换后恢复 1 倍速；视频未播放或暂停时不拦截原生长按保存。
- 删除文件夹并联动删除文件夹内媒体。
- 恢复文件夹并恢复同一删除批次媒体。
- 回收站文件夹内媒体支持批量恢复和批量永久删除，写入必须走 service 层并校验当前用户属于目标空间。
- 永久删除状态写入。

## 空间隔离

所有业务查询和写入必须带 `space_id`。

签发 COS 上传授权、签发媒体读取 URL、删除、恢复、永久删除前，必须校验当前用户属于目标空间。

全局管理员能力是应用级权限，不等同于空间成员权限。

## 导航返回

有明确上级的应用内页面使用固定返回目标，而不是依赖浏览器真实访问历史。页面内顶部返回按钮通过统一的返回逻辑进入固定上级；物理返回键和浏览器自带返回通过统一的 `useFixedBackNavigation` 进入固定上级。打开媒体预览时，相册页暂停固定返回，让物理返回优先关闭预览；相册页和回收站文件夹页处于多选状态时，顶部返回和浏览器/手机返回优先退出多选；上传页存在等待或上传中文件时，固定返回先进入离开确认。
