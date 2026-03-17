# FULL STACK SAAS BUILD PROMPT
# DataSync — PostgreSQL-centric Data Synchronization Platform

---

## ROLE

You are a Senior Full Stack Engineer + Principal Product Designer building a production-grade SaaS platform.
Your output must be complete, runnable, and production-quality — not a prototype.

---

## PRODUCT OVERVIEW

**DataSync** là nền tảng đồng bộ dữ liệu giữa các PostgreSQL databases (và MySQL).

Vấn đề cốt lõi mà sản phẩm giải quyết:
- Người dùng cần đồng bộ data từ **nhiều DB nguồn → 1 DB đích**
- DB đích có các **view và materialized view** phụ thuộc lẫn nhau vào các bảng đã sync
- Khi sync lại (DROP + RECREATE table), các view phụ thuộc bị ảnh hưởng theo chuỗi
- Hệ thống phải **phân tích dependency**, xây **kế hoạch sync an toàn**, thực thi theo đúng thứ tự
- Ngoài sync table/view từ source, user còn có thể dùng **Custom SQL** làm nguồn (khi không có quyền tạo view trên DB nguồn)

**Target users:** Data Engineer, BI/Analytics Engineer, Technical Operations Manager

---

## TECH STACK

### Frontend
- **Next.js 14** (App Router)
- **TypeScript** toàn bộ
- **Tailwind CSS** cho styling
- **shadcn/ui** cho base components
- **Recharts** cho charts
- **React Flow** cho Dependency Graph canvas
- **CodeMirror 6** cho SQL Editor
- **React Query (TanStack Query)** cho data fetching
- **Zustand** cho global state
- **React Hook Form + Zod** cho forms

### Backend
- **Next.js API Routes** (hoặc tách riêng **FastAPI** nếu phù hợp hơn)
- **PostgreSQL** làm application database (lưu metadata của SaaS)
- **Prisma ORM** cho application DB
- **BullMQ + Redis** cho job queue và scheduler
- **node-postgres (pg)** cho kết nối tới user's databases
- **SSH tunneling support** (node-ssh) cho DB behind firewall

### Infrastructure consideration
- Docker Compose cho local dev
- Environment variables cho secrets
- Mã hóa credentials bằng AES-256 trước khi lưu DB

---

## INFORMATION ARCHITECTURE

```
App
├── Dashboard                    ← overview tổng hệ thống
├── Connections                  ← quản lý DB connections (source + destination)
├── Models                       ← quản lý source models
│   ├── Model List               ← danh sách model đã định nghĩa
│   └── Model Editor             ← tạo/sửa model (table/view/custom SQL)
├── Sync Jobs
│   ├── Sync List                ← danh sách tất cả sync jobs
│   └── Sync Editor              ← tạo/sửa sync từ model
├── Dependency Graph             ← visualize cây phụ thuộc tại DB đích
├── Sync Plan                    ← review kế hoạch trước khi chạy
├── Scheduler                    ← cấu hình lịch chạy
├── History & Logs               ← lịch sử chạy, log từng run
└── Settings
    ├── General
    ├── Users & Roles
    ├── Notifications
    ├── API Keys
    └── Audit Logs
```

### Model-first Flow (Updated)

Luồng chuẩn của sản phẩm: **quản lý model trước, cấu hình sync sau**.

1. Tạo `Model`
   - Chọn **Source Database**
   - Chọn **Model Type**: `TABLE` | `VIEW` | `CUSTOM_SQL`
   - Cấu hình definition (object name hoặc SQL)
   - Đặt **Model Name**
   - Save model (lưu kèm schema snapshot)

2. Tạo `Sync Job` từ model
   - Chọn model đã tạo
   - Chọn **Destination Database**
   - Chọn `Destination Schema` + `Destination Table Name`
     - Mặc định auto-fill từ source object
   - Chọn sync mode + thời gian chạy (manual/cron)
   - Save sync

3. Chạy/đánh giá kế hoạch sync
   - Generate Sync Plan
   - Review impacted objects + warnings
   - Execute theo kế hoạch an toàn (dependency-aware)

### Detailed Validation Rules

- Khi save model:
  - Source connection phải `ACTIVE`
  - Nếu TABLE/VIEW: object phải tồn tại và preview thành công
  - Nếu CUSTOM_SQL: chỉ cho phép SELECT, query phải chạy được với `LIMIT 0/50`
  - Model name unique trong workspace

- Khi save sync:
  - Model phải còn `ACTIVE`
  - Destination connection phải `ACTIVE`
  - Destination name hợp lệ và xử lý conflict rõ ràng
  - Nếu incremental: cột incremental phải nằm trong model schema snapshot

---

## DATA MODELS (Application Database — Prisma Schema)

```prisma
// Workspace (multi-tenant)
model Workspace {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  createdAt   DateTime @default(now())
  connections Connection[]
  models      Model[]
  jobs        Job[]
  users       WorkspaceUser[]
}

// DB Connection (source hoặc destination)
model Connection {
  id           String         @id @default(cuid())
  workspaceId  String
  workspace    Workspace      @relation(fields: [workspaceId], references: [id])
  name         String
  type         ConnectionType // POSTGRES | MYSQL
  role         ConnectionRole // SOURCE | DESTINATION | BOTH
  host         String
  port         Int
  database     String
  username     String
  passwordEnc  String         // AES-256 encrypted
  sslMode      String?        // disable | require | verify-full
  sshEnabled   Boolean        @default(false)
  sshHost      String?
  sshPort      Int?
  sshUser      String?
  sshKeyEnc    String?
  status       ConnStatus     // ACTIVE | ERROR | TESTING | DISABLED
  lastTestedAt DateTime?
  lastError    String?
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  sourceModels Model[]        @relation("ModelSource")
  destinationJobs Job[]       @relation("JobDestination")
}

enum ConnectionType { POSTGRES MYSQL }
enum ConnectionRole { SOURCE DESTINATION BOTH }
enum ConnStatus { ACTIVE ERROR TESTING DISABLED }

// Source Model (định nghĩa nguồn dữ liệu, tái sử dụng cho nhiều sync jobs)
model Model {
  id              String          @id @default(cuid())
  workspaceId     String
  workspace       Workspace       @relation(fields: [workspaceId], references: [id])
  name            String
  description     String?
  sourceType      ModelSourceType // TABLE | VIEW | CUSTOM_SQL
  sourceConnId    String
  sourceConn      Connection      @relation("ModelSource", fields: [sourceConnId], references: [id])
  sourceSchema    String?
  sourceName      String?         // table/view name, null nếu CUSTOM_SQL
  customSql       String?         // SQL query, chỉ SELECT
  detectedSchema  Json?           // snapshot cột detect được từ source
  version         Int             @default(1)
  status          ModelStatus     @default(ACTIVE)
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  jobs            Job[]
  @@unique([workspaceId, name])
}

enum ModelSourceType { TABLE VIEW CUSTOM_SQL }
enum ModelStatus     { ACTIVE ARCHIVED DRAFT }

// Sync Job (thực thi đồng bộ từ 1 model sang destination)
model Job {
  id              String      @id @default(cuid())
  workspaceId     String
  workspace       Workspace   @relation(fields: [workspaceId], references: [id])
  name            String
  description     String?
  modelId         String
  model           Model       @relation(fields: [modelId], references: [id])
  destConnId      String
  destConn        Connection  @relation("JobDestination", fields: [destConnId], references: [id])
  destSchema      String      @default("public")
  destName        String
  syncMode        SyncMode    // FULL_REFRESH | INCREMENTAL
  incrementalCol  String?     // column dùng để incremental sync
  status          JobStatus   // ACTIVE | PAUSED | DRAFT | ERROR
  schedule        String?     // cron expression
  scheduleEnabled Boolean     @default(false)
  columnMappings  Json?       // override column types nếu cần
  lastRunAt       DateTime?
  lastRunStatus   RunStatus?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  runs            JobRun[]
  ownerId         String?
}

enum SyncMode   { FULL_REFRESH INCREMENTAL }
enum JobStatus  { ACTIVE PAUSED DRAFT ERROR }

// Job Run (lịch sử chạy)
model JobRun {
  id            String    @id @default(cuid())
  jobId         String
  job           Job       @relation(fields: [jobId], references: [id])
  status        RunStatus // PENDING | RUNNING | SUCCESS | FAILED | CANCELLED
  triggeredBy   TriggerBy // MANUAL | SCHEDULER | API
  startedAt     DateTime  @default(now())
  finishedAt    DateTime?
  durationMs    Int?
  rowsProcessed Int?
  bytesTransfer Int?
  errorMessage  String?
  logOutput     String?   // full log text
  syncPlan      Json?     // snapshot của SyncPlan đã thực thi
}

enum RunStatus { PENDING RUNNING SUCCESS FAILED CANCELLED }
enum TriggerBy { MANUAL SCHEDULER API }

// Destination Object Registry
// Theo dõi các object tại DB đích — managed (do tool tạo) vs user-created
model DestObject {
  id           String         @id @default(cuid())
  workspaceId  String
  connId       String
  schema       String
  name         String
  objectType   DestObjectType // TABLE | VIEW | MATVIEW
  ownership    Ownership      // MANAGED | USER_CREATED
  definition   String?        // DDL SQL để recreate nếu là USER_CREATED
  jobId        String?        // nếu MANAGED, link về Job
  lastSyncedAt DateTime?
  @@unique([connId, schema, name])
}

enum DestObjectType { TABLE VIEW MATVIEW }
enum Ownership     { MANAGED USER_CREATED }
```

---

## CORE BUSINESS LOGIC

### Module 1: Connection Manager

```typescript
// services/connection.service.ts

interface TestConnectionResult {
  success: boolean
  latencyMs: number
  serverVersion: string
  error?: string
  schemas?: string[]
}

// Test connection: thử connect, trả về latency + server version
async function testConnection(connId: string): Promise<TestConnectionResult>

// List objects trong một schema
async function listObjects(connId: string, schema: string): Promise<{
  name: string
  type: 'table' | 'view' | 'matview'
  rowCount?: number
  sizeBytes?: number
}[]>

// Preview data từ object hoặc custom SQL (50 rows)
async function previewData(connId: string, sqlOrObject: string): Promise<{
  columns: { name: string; type: string }[]
  rows: Record<string, unknown>[]
  rowCount: number
  executionMs: number
}>
```

### Module 2: Dependency Analyzer

Đây là module quan trọng nhất. Chạy trên **DB đích**, phân tích toàn bộ dependency graph.

```typescript
// services/dependency.service.ts

interface DependencyNode {
  id: string           // schema.name
  schema: string
  name: string
  objectType: 'table' | 'view' | 'matview'
  ownership: 'managed' | 'user_created'
  jobId?: string       // nếu managed
  definition?: string  // DDL để recreate
  dependsOn: string[]  // ids của nodes mà object này phụ thuộc vào
  dependedBy: string[] // ids của nodes phụ thuộc vào object này
}

interface DependencyGraph {
  nodes: DependencyNode[]
  edges: { from: string; to: string }[]
}

// Query pg_depend + pg_rewrite để build graph
async function analyzeDependencies(connId: string): Promise<DependencyGraph>

// SQL để lấy dependency trong PostgreSQL:
// SELECT DISTINCT
//   dependent_ns.nspname || '.' || dependent_view.relname AS dependent,
//   source_ns.nspname || '.' || source_table.relname AS depends_on
// FROM pg_depend
// JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid
// JOIN pg_class dependent_view ON pg_rewrite.ev_class = dependent_view.oid
// JOIN pg_class source_table ON pg_depend.refobjid = source_table.oid
// JOIN pg_namespace dependent_ns ON dependent_view.relnamespace = dependent_ns.oid
// JOIN pg_namespace source_ns ON source_table.relnamespace = source_ns.oid
// WHERE dependent_view.relname != source_table.relname

// Lấy DDL definition của view/matview để save trước khi drop
async function getObjectDefinition(connId: string, schema: string, name: string): Promise<string>
// dùng: SELECT pg_get_viewdef('"schema"."name"', true) hoặc pg_get_viewdef cho matview
```

### Module 3: Model Manager

Tách phần định nghĩa source thành `Model`, để người dùng quản lý model trước, rồi mới tạo sync job từ model đó.

```typescript
// services/model.service.ts

interface SourceModel {
  id: string
  name: string
  sourceType: 'TABLE' | 'VIEW' | 'CUSTOM_SQL'
  sourceConnId: string
  sourceSchema?: string
  sourceName?: string
  customSql?: string
  detectedSchema?: {
    columns: { name: string; pgType: string; nullable: boolean }[]
  }
  version: number
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT'
}

// Tạo model: validate source + lưu schema snapshot
async function createModel(payload: {
  workspaceId: string
  name: string
  sourceType: 'TABLE' | 'VIEW' | 'CUSTOM_SQL'
  sourceConnId: string
  sourceSchema?: string
  sourceName?: string
  customSql?: string
}): Promise<SourceModel>

// Re-validate model khi source thay đổi
async function refreshModelSchema(modelId: string): Promise<SourceModel>
```

### Module 4: Sync Plan Generator

Trước khi thực thi, tạo ra kế hoạch chi tiết.

```typescript
// services/sync-plan.service.ts

interface SyncStep {
  stepNumber: number
  action: SyncAction
  objectType: 'table' | 'view' | 'matview'
  schema: string
  name: string
  reason: string
  estimatedRows?: number
  risk: 'low' | 'medium' | 'high'
}

type SyncAction =
  | 'SAVE_DEFINITION'   // lưu DDL của user_created object
  | 'DROP_OBJECT'       // drop object (safe vì đã lưu definition)
  | 'SYNC_DATA'         // thực hiện sync từ source
  | 'RECREATE_OBJECT'   // recreate view/matview từ saved definition
  | 'REFRESH_MATVIEW'   // REFRESH MATERIALIZED VIEW

interface SyncPlan {
  jobId: string
  targetObject: string   // schema.name của table sẽ sync
  affectedObjects: {
    userCreated: DependencyNode[]  // sẽ bị DROP + RECREATE
    managed: DependencyNode[]      // sẽ bị DROP (rồi sync lại bởi job khác)
  }
  steps: SyncStep[]
  estimatedDuration: string
  warnings: string[]     // cảnh báo schema drift, v.v.
}

// Generate sync plan cho một sync job
async function generateSyncPlan(jobId: string): Promise<SyncPlan>
// Lưu ý: sync job đọc source config thông qua modelId

// Ví dụ output của generateSyncPlan:
// Steps:
// 1. SAVE_DEFINITION  — v_salary_report   (user_created view, sẽ bị ảnh hưởng)
// 2. SAVE_DEFINITION  — mv_dashboard      (user_created matview)
// 3. DROP_OBJECT      — mv_dashboard      (dependency của v_salary_report)
// 4. DROP_OBJECT      — v_salary_report   (dependency của dim_faculty)
// 5. DROP_OBJECT      — dim_faculty       (managed table, sẽ sync mới)
// 6. SYNC_DATA        — dim_faculty       (từ ERP DB, ~230K rows)
// 7. RECREATE_OBJECT  — v_salary_report
// 8. RECREATE_OBJECT  — mv_dashboard
// 9. REFRESH_MATVIEW  — mv_dashboard
```

### Module 5: Sync Executor

Thực thi sync plan theo thứ tự, stream log ra client qua SSE.

```typescript
// services/sync-executor.service.ts

interface ExecutorOptions {
  jobRunId: string
  plan: SyncPlan
  onLog: (message: string, level: 'info' | 'warn' | 'error' | 'success') => void
  onProgress: (step: number, total: number) => void
}

// Thực hiện từng step trong plan
async function executeSyncPlan(options: ExecutorOptions): Promise<RunStatus>

// Transfer strategies:
// 1. TABLE model source → pg_dump (custom format) → pg_restore tại đích
// 2. VIEW model source → COPY TO CSV → CREATE TABLE + COPY FROM CSV tại đích
// 3. CUSTOM_SQL model source → execute query → stream COPY TO stdout → COPY FROM stdin tại đích
// Strategy 3 dùng Node.js stream để không load toàn bộ data vào memory

// Schema detection cho CUSTOM_SQL:
async function detectSchema(connId: string, sql: string): Promise<{
  columns: { name: string; pgType: string; nullable: boolean }[]
}>
// Dùng: SELECT * FROM (...sql...) AS q LIMIT 0
// Rồi query information_schema cho temporary table

// Incremental sync (nếu syncMode = INCREMENTAL):
// SELECT * FROM source WHERE {incrementalCol} > {lastMaxValue}
// INSERT INTO dest ... ON CONFLICT DO UPDATE
```

### Module 6: Scheduler

```typescript
// services/scheduler.service.ts
// Dùng BullMQ

// Đăng ký schedule cho một job
async function upsertSchedule(jobId: string, cronExpression: string): Promise<void>

// Remove schedule
async function removeSchedule(jobId: string): Promise<void>

// Dependency-aware scheduling:
// Nếu job B phụ thuộc vào kết quả của job A (ví dụ cùng sync vào cùng dest DB),
// scheduler phải chờ job A hoàn thành trước khi trigger job B
// Implement bằng BullMQ's job dependencies feature
```

---

## API ROUTES

```
POST   /api/connections              — tạo connection
GET    /api/connections              — list connections
GET    /api/connections/:id          — detail
PUT    /api/connections/:id          — update
DELETE /api/connections/:id          — delete
POST   /api/connections/:id/test     — test connection
GET    /api/connections/:id/objects  — list DB objects
POST   /api/connections/:id/preview  — preview SQL (50 rows)

POST   /api/models                   — tạo model source
GET    /api/models                   — list models (filter: type, source, status)
GET    /api/models/:id               — model detail + schema snapshot
PUT    /api/models/:id               — update model
DELETE /api/models/:id               — archive/delete model
POST   /api/models/:id/preview       — preview source data (50 rows)
POST   /api/models/:id/refresh       — refresh detected schema

POST   /api/jobs                     — tạo sync job từ model
GET    /api/jobs                     — list sync jobs (filter: status, model, dest)
GET    /api/jobs/:id                 — detail + last runs
PUT    /api/jobs/:id                 — update sync config
DELETE /api/jobs/:id                 — delete sync job
POST   /api/jobs/:id/plan            — generate sync plan
POST   /api/jobs/:id/run             — trigger manual run
POST   /api/jobs/:id/cancel          — cancel running job
PUT    /api/jobs/:id/schedule        — update schedule
PUT    /api/jobs/:id/toggle          — enable/disable

GET    /api/jobs/:id/runs            — list runs của job
GET    /api/runs/:runId              — detail run
GET    /api/runs/:runId/logs         — GET logs (SSE stream)

GET    /api/dependencies/:connId     — get dependency graph cho dest DB

GET    /api/dashboard/stats          — tổng hợp stats cho dashboard
GET    /api/dashboard/activity       — recent activity timeline
```

---

## UI/UX DESIGN SYSTEM

### Philosophy
"Operational Clarity" — người dùng hiểu toàn bộ hệ thống trong vài giây.
Cảm giác: **powerful but calm**. Giống Linear, Vercel, Stripe dashboard.

### Colors
```
Primary:    #4F46E5  (indigo)
Secondary:  #06B6D4  (cyan)
Success:    #16A34A
Warning:    #F59E0B
Error:      #EF4444
Info:       #2563EB

Background: #F8F9FC
Surface:    #FFFFFF
Border:     #E5E7EB
TextPrimary:   #0F172A
TextSecondary: #64748B
TextMuted:     #94A3B8
```

### Typography — Inter font
```
Page title:      28px / semibold
Section title:   18px / semibold
Table header:    13px / medium / uppercase / letter-spacing
Table cell:      14px / normal
Label/meta:      12px / medium
Badge:           11px / semibold
```

### Spacing — 8px system
### Radius — buttons/inputs: 8px | cards: 16px | modals: 20px
### Shadows — ultra subtle only, prefer border over shadow

---

## SCREENS

### Screen 1: Dashboard

Layout: sidebar trái cố định 240px + topbar 56px + main content.

**Hero stats row** (5 cards ngang):
- Total Jobs | Healthy | Failed | Running Now | Disabled

**Bento grid 2 cột:**
- Trái: Sync Health donut chart (Healthy/Failed/Warning/Paused) + trend line 7 ngày
- Phải: Failed Jobs list — name, source→dest, error snippet, time ago, retry button

**Row 2:**
- Recent Activity timeline (sync started/finished, connection error, schedule changed)
- Top Connections table (name, type, jobs count, last activity, status badge)

**Quick Actions bar:** Create Model | Create Sync Job | Add Connection | View Logs

States: loading skeleton (shimmer), empty state với CTA, error banner top.

---

### Screen 2: Connections

Grid view (3 columns) + list view toggle.

**Filter bar:** search | type (PostgreSQL/MySQL) | role (Source/Dest/Both) | status

**Connection Card:**
- DB icon (colored by type) + name + type badge
- Status indicator (dot: green/red/yellow)
- Role badges: SOURCE | DESTINATION
- Stats: X jobs using | Last tested: 2h ago
- Bottom actions: Test | Edit | View Objects | Delete

**Add Connection Modal/Drawer (multi-step):**
- Step 1: Choose type (PostgreSQL / MySQL) — icon cards
- Step 2: Fill connection form (host, port, db, user, password, SSL mode)
- Step 3: SSH Tunnel toggle + config (optional)
- Step 4: Test Connection — realtime feedback (connecting... → latency + version)
- Confirm & Save

**Object Explorer side panel** (khi click "View Objects"):
- Tree: schemas → tables/views/matviews
- Search objects
- Click object → preview data (50 rows in mini table)

---

### Screen 3: Models List

**Header:** "Models" + "New Model" button + count badge

**Filter/control bar:**
- Search input
- Status filter (All | Active | Draft | Archived | Error)
- Source Connection filter
- Source type filter (Table | View | Custom SQL)
- Usage filter (Any | Unused | In-use)

**Data Table** — columns:
```
□  Status  Model Name  Source Type  Source Object  Schema Snapshot  Used By  Updated At  Actions
```

- Source Object: `connection.schema.object` hoặc badge "Custom SQL"
- Schema Snapshot: số cột detect được + trạng thái drift
- Used By: số sync jobs đang dùng model
- Actions: Preview | Edit | Create Sync | More (Duplicate / Archive / Delete)

**Row hover:** subtle background + show actions
**Click row:** mở Model Detail side drawer

**Model Detail Drawer** (slide từ phải, 480px wide):
- Header: model name + status badge + Edit button
- Tabs: Overview | Schema | SQL (if custom) | Sync Jobs
- Overview: source info + last validated time + usage count
- Schema: cột/type/nullable + warning nếu source thay đổi
- SQL: readonly SQL editor (nếu CUSTOM_SQL)
- Sync Jobs: list các sync đang dùng model này

**Bulk actions** (khi chọn nhiều rows): Refresh Schema | Archive | Delete

---

### Screen 4: New/Edit Model (Model Editor)

Wizard 3 bước rõ ràng:

**Step 1: Source Database**
- Dropdown: chọn Source Connection
- Optional: chọn schema mặc định để filter object explorer
- Nút "Test source access" kiểm tra quyền đọc metadata

**Step 2: Model Type & Definition**

Model Type selector (3 options dạng card):
```
┌──────────┐ ┌──────────┐ ┌──────────┐
│  TABLE   │ │   VIEW   │ │  CUSTOM  │
│          │ │          │ │   SQL    │
└──────────┘ └──────────┘ └──────────┘
```

Nếu chọn TABLE/VIEW:
- Dropdown hoặc search: chọn Object name
- Preview button → hiện 50 rows inline

Nếu chọn CUSTOM SQL:
- **SQL Editor** (CodeMirror 6):
  - Syntax highlighting PostgreSQL
  - Auto-complete (keywords + table/column names từ DB)
  - Resize handle
  - "Run Preview" button
- Preview panel: bảng 50 rows, auto-detect columns
- Column type override table: cho phép sửa type nếu detect sai

**Step 3: Model Identity**
- Input: Model Name (bắt buộc, unique trong workspace)
- Description (optional)
- Show model signature: `sourceConn + sourceType + source object/sql hash`

**Sticky bottom bar:** Cancel | Save as Draft | Save Model

---

### Screen 5: Sync Jobs List

**Header:** "Sync Jobs" + "New Sync Job" button + count badge

**Filter/control bar:**
- Search input
- Status filter (All | Active | Paused | Draft | Error)
- Model filter
- Destination filter

**Data Table** — columns:
```
□  Status  Sync Name  Model  Destination  Schedule  Last Run  Duration  Rows  Actions
```

- Model: tên model + source type badge
- Destination: `connection.schema.table`
- Actions: ▶ Run | ⏸ Pause | ✎ Edit | View Plan | View Logs | Delete

**Bulk actions** (khi chọn nhiều rows): Run Selected | Pause Selected | Delete Selected

---

### Screen 6: New/Edit Sync Job (Sync Editor)

Wizard 2 bước (source readonly từ model):

**Step 1: Select Model**
- Chọn model từ dropdown/search
- Preview readonly: source connection, source type, object/sql snippet, schema snapshot
- CTA phụ: "Edit Model" nếu cần chỉnh source

**Step 2: Destination & Schedule**
- Dropdown: chọn Destination Connection
- Input: Destination Schema
- Input: Destination Table Name
  - Auto-fill từ source object name
  - Nếu model CUSTOM_SQL: auto-fill từ model name (slugify)
- Sync Mode: Full Refresh | Incremental
  - Nếu Incremental: chọn Incremental Column từ model.detectedSchema
- Schedule: Manual only hoặc Enable schedule (cron + timezone)
- Sync Name: auto-generated, editable

**Validation trước Save:**
- Model phải ACTIVE và source connection truy cập được
- Destination table name hợp lệ, xử lý conflict rõ ràng
- Incremental column phải tồn tại trong schema snapshot

**Sticky bottom bar:** Cancel | Save as Draft | Save & View Plan

---

### Screen 7: Sync Plan (Pre-execution Review)

Trang hiển thị sau khi user click "Run" hoặc "Save & View Plan".
Đây là màn hình quan trọng, cần thiết kế cẩn thận.

**Header:** "Sync Plan — dim_faculty" + job description

**Impact Summary banner:**
```
⚠ This sync will affect 3 objects in the destination database.
  2 user-created views will be temporarily dropped and recreated.
```

**Affected Objects section:**
Grid 2 loại:
- 🟦 Managed (do tool quản lý): dim_faculty
- 🟨 User-created (do user tạo, sẽ DROP → RECREATE): v_salary_report, mv_dashboard

Mỗi object hiện: icon + type + name + ownership badge + "View definition" expandable

**Step-by-step Plan timeline:**
```
Step 1  ●  SAVE DEFINITION    v_salary_report (view)          low risk
Step 2  ●  SAVE DEFINITION    mv_dashboard (matview)          low risk
Step 3  ●  DROP               mv_dashboard                    medium risk
Step 4  ●  DROP               v_salary_report                 medium risk
Step 5  ●  DROP TABLE         dim_faculty                     medium risk
Step 6  ●  SYNC DATA          dim_faculty ← ERP DB            ~230K rows estimated
Step 7  ●  RECREATE           v_salary_report
Step 8  ●  RECREATE           mv_dashboard
Step 9  ●  REFRESH            mv_dashboard
```

Mỗi step: icon action + object type badge + name + risk badge + expand để xem SQL preview

**Warnings section** (nếu có):
- Schema drift: "Source has 2 new columns not present in destination"
- Estimated duration warning nếu lớn

**Bottom actions:**
- Cancel
- Execute Plan (primary button, confirm dialog nếu high risk)

---

### Screen 8: Dependency Graph

Full-page canvas với React Flow.

**Toolbar trái:**
- Zoom in/out/fit
- Toggle: show all objects | show only affected | show only managed
- Filter by schema

**Legend:**
```
🟦 Managed Table      🟩 Managed Matview
🟨 User View          🟧 User Matview
→  depends on
```

**Nodes:**
- Rounded rect với icon (table/view/matview)
- Name + schema
- Ownership badge (MANAGED / USER)
- Status indicator (synced / stale / error)
- Click → side panel với details

**Edges:**
- Arrow từ object → objects nó phụ thuộc vào
- Highlight path khi hover/select node

**Side panel** (khi click node):
- Object info
- Nếu MANAGED: link về Job, last sync time, row count
- Nếu USER: DDL definition, "View in DB" button
- Dependencies list up/down
- Action: Run dependent job (nếu managed)

---

### Screen 9: History & Logs

**Filter bar:** Job filter | Status filter | Date range | Triggered by

**Runs table:**
```
Job Name | Status | Triggered By | Started | Duration | Rows | Bytes | Actions
```

**Click row → Run Detail page:**
- Summary cards: status, duration, rows, bytes
- Sync Plan snapshot (những steps đã thực thi)
- **Log Viewer:**
  - Terminal-style: dark background, monospace font
  - ANSI color codes (info=cyan, warn=yellow, error=red, success=green)
  - Timestamp mỗi dòng
  - Search/filter trong log
  - Download log button

---

### Screen 10: Scheduler

**Calendar view** (week view) showing khi nào các jobs sẽ chạy.

**List view toggle:** bảng tất cả jobs có schedule.

```
Job Name | Schedule (cron) | Human readable | Next Run | Last Run | Status | Toggle
```

Toggle: enable/disable schedule inline.

Click job → Sync Editor focused on Schedule section.

**"Test Schedule" feature:** input cron → hiện 10 next run times.

---

### Screen 11: Settings

Left sub-navigation tabs:
- General | Users & Roles | Notifications | API Keys | Audit Logs

**General:** workspace name, timezone, retention policy (log retention days)

**Users & Roles:**
- Table: email, name, role, joined, status, actions
- Invite user form
- Roles: Admin | Editor | Viewer

**Notifications:**
- Toggle: Email on job failure | Slack webhook | Email on success
- Inputs: Slack webhook URL, email recipients

**API Keys:**
- List keys: name, prefix, created, last used, scope
- Create key modal: name + scope + expiry
- Copy key (shown once)

**Audit Logs:**
- Table: timestamp, user, action, resource, IP
- Filter: user, action type, date range
- Export CSV

---

## SIDEBAR COMPONENT

Fixed left sidebar, 240px wide (collapsible to 56px icon-only).

```
[Logo + "DataSync"] 

Navigation:
  Dashboard
  Connections
  ─────────────
  Models
  Sync Jobs
  Dependency Graph
  Scheduler
  History & Logs
  ─────────────
  Settings

Bottom:
  [Avatar] User name
  Workspace name (switcher)
```

Active state: subtle indigo background + left border accent.
Collapse animation: smooth 200ms ease.

---

## TOPBAR COMPONENT

Height 56px, white background, bottom border.

```
[← breadcrumb / page title]     [🔍 Search...] [🔔 Notifications] [Avatar]
```

- Global search: cmd+K opens command palette (search models, sync jobs, connections, runs)
- Notifications dropdown: recent failures, schedule alerts
- Workspace switcher trong user menu

---

## STATUS BADGE SYSTEM

Dùng nhất quán toàn app:

```
● Healthy   — green bg/text
● Failed    — red bg/text
● Warning   — amber bg/text
● Running   — blue bg/text + pulse animation
● Paused    — gray bg/text
● Draft     — slate bg/text
● Pending   — yellow bg/text
```

Badge: pill shape, icon dot + text, 11px semibold, không chỉ dùng màu (có text label).

---

## EMPTY STATES

Mỗi màn hình chính phải có empty state đẹp:
- Illustration nhỏ (SVG inline, đơn giản)
- Heading + description ngắn
- Primary CTA button

Ví dụ Jobs empty: "No sync jobs yet" + "Create your first job" button

---

## LOADING STATES

Dùng **skeleton shimmer** thay vì spinner là chính.
Skeleton phải khớp với layout thật (không generic).
Spinner chỉ dùng cho inline actions (button loading state).

---

## ERROR HANDLING UI

- Form validation: inline error dưới field, red border
- API error: toast (top-right, auto-dismiss 5s)
- Critical error: full banner below topbar
- Connection failure trong test: inline error với retry button
- Run failure: highlighted row + error message expandable

---

## REAL-TIME FEATURES

- **Log streaming:** SSE (Server-Sent Events) từ `/api/runs/:id/logs`
  - UI: terminal auto-scrolls, "Pause scroll" button
  - Show live step progress bar

- **Job status updates:** polling mỗi 5s cho running jobs
  - Hoặc WebSocket nếu prefer

- **Dashboard stats:** auto-refresh mỗi 30s

---

## SECURITY REQUIREMENTS

- DB credentials mã hóa AES-256-GCM trước khi lưu
- Encryption key từ environment variable (không hardcode)
- API routes kiểm tra authentication header
- SQL Editor: không cho phép DML/DDL statements trong Custom SQL
  - Parse và reject: INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE
  - Chỉ cho phép SELECT statements
- Audit log mọi action quan trọng: create/delete connection, run job, change schedule

---

## IMPLEMENTATION NOTES

1. **pg_dump / pg_restore** có thể gọi qua `child_process.spawn` trong Node.js, stream stdout/stderr vào log
2. **COPY protocol** dùng stream để không load data vào memory: source COPY TO stdout → pipe → dest COPY FROM stdin
3. **Dependency graph** lưu cache trong Redis sau khi analyze, TTL 5 phút, invalidate khi job chạy xong
4. **Sync Plan** generate lúc user click "Run" hoặc khi view Plan page, không cache (luôn fresh)
5. **BullMQ scheduler**: mỗi job có một repeating job trong Bull queue, key = jobId
6. **SSH tunnel**: tạo tunnel trước khi connect, forward local random port → remote DB port, dùng port đó để connect

---

## FILE STRUCTURE

```
/
├── app/
│   ├── (dashboard)/
│   │   ├── page.tsx                    ← Dashboard
│   │   ├── connections/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── models/
│   │   │   ├── page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   ├── jobs/
│   │   │   ├── page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       ├── plan/page.tsx
│   │   │       └── runs/[runId]/page.tsx
│   │   ├── dependency-graph/page.tsx
│   │   ├── scheduler/page.tsx
│   │   ├── history/page.tsx
│   │   └── settings/
│   │       └── [...section]/page.tsx
│   └── api/
│       ├── connections/route.ts
│       ├── models/route.ts
│       ├── jobs/route.ts
│       └── runs/[id]/logs/route.ts     ← SSE endpoint
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   └── Topbar.tsx
│   ├── ui/                             ← shadcn components
│   ├── connections/
│   ├── models/
│   │   ├── ModelTable.tsx
│   │   ├── ModelEditor.tsx
│   │   └── ModelDetailDrawer.tsx
│   ├── jobs/
│   │   ├── SyncJobTable.tsx
│   │   ├── SyncJobEditor.tsx
│   │   └── SyncJobDetailDrawer.tsx
│   ├── dependency-graph/
│   │   └── DependencyCanvas.tsx        ← React Flow
│   ├── sync-plan/
│   │   └── SyncPlanView.tsx
│   └── logs/
│       └── LogViewer.tsx               ← terminal style
├── services/
│   ├── connection.service.ts
│   ├── model.service.ts
│   ├── dependency.service.ts
│   ├── sync-plan.service.ts
│   ├── sync-executor.service.ts
│   └── scheduler.service.ts
├── lib/
│   ├── db.ts                           ← Prisma client
│   ├── redis.ts                        ← Bull + cache
│   ├── crypto.ts                       ← AES encrypt/decrypt
│   └── pg-client.ts                    ← dynamic pg connections
├── prisma/
│   └── schema.prisma
└── docker-compose.yml
```

---

## START HERE

Build theo thứ tự sau:

1. **Setup:** Next.js 14 + Prisma + shadcn/ui + Tailwind — boilerplate
2. **Layout:** Sidebar + Topbar + page shell
3. **Connections:** CRUD + test connection (hardcode mock data trước, wire API sau)
4. **Models List + Model Editor:** hoàn thiện quản lý model trước
5. **Sync Jobs List + Sync Editor:** tạo sync dựa trên model
6. **Sync Plan UI:** static plan display rồi wire backend
7. **Dependency Graph:** React Flow canvas với mock data
8. **Backend services:** connection → model → dependency → sync-plan → executor
9. **Scheduler:** BullMQ integration
10. **History + Log Viewer:** SSE log streaming
11. **Dashboard:** aggregate stats từ real data
12. **Settings:** Users, API Keys, Audit Log

Với mỗi bước: build UI → wire mock data → wire real API.
Không skip bước UI để đi thẳng vào backend.

---

## CONSTRAINTS

- Không dùng `any` trong TypeScript
- Mọi async function phải có error handling
- DB credentials không bao giờ được log ra console hoặc response
- Custom SQL chỉ cho phép SELECT
- Mọi destructive action (delete connection, drop table) phải có confirm dialog
- Log viewer không hiện credentials dù chúng xuất hiện trong error message (mask them)
