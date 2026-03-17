# FEATURE PROMPT: MODEL MANAGEMENT LAYER
# DataSync Platform — Models + Syncs Separation

---

## CONTEXT & MOTIVATION

Hệ thống hiện tại có khái niệm `Job` = source + destination + schedule gộp chung.

Cần tách thành 2 tầng rõ ràng:

```
Model  = "Nguồn dữ liệu được định nghĩa"
         (source connection + loại object + tên/SQL + schema columns)

Sync   = "Hành động vận chuyển"
         (Model → destination connection + dest table name + schedule)
```

**Lý do tách:**
- 1 Model có thể sync tới nhiều destination khác nhau
- Người dùng quản lý "nguồn" và "đích" độc lập nhau
- Khi source thay đổi schema → sửa Model một lần, tất cả Syncs liên quan được cập nhật
- Model có thể tồn tại mà chưa có Sync nào (trạng thái DRAFT)
- Dễ reuse: tạo Model một lần, tạo nhiều Sync đến các môi trường khác nhau (prod, staging, analytics)

---

## DATA MODEL CHANGES

### Xóa model `Job`, thay bằng `Model` + `Sync`

```prisma
// ============================================================
// MODEL — định nghĩa nguồn dữ liệu
// ============================================================
model Model {
  id                  String      @id @default(cuid())
  workspaceId         String
  workspace           Workspace   @relation(fields: [workspaceId], references: [id])

  name                String      // tên do user đặt, VD: "dim_faculty", "Monthly Salary Report"
  description         String?
  tags                String[]    // phân loại, VD: ["hr", "finance", "operational"]

  // Source configuration
  sourceConnId        String
  sourceConn          Connection  @relation(fields: [sourceConnId], references: [id])
  sourceType          SourceType  // TABLE | VIEW | MATVIEW | CUSTOM_SQL
  sourceSchema        String?     // null nếu CUSTOM_SQL
  sourceName          String?     // table/view/matview name, null nếu CUSTOM_SQL
  customSql           String?     // SQL query, chỉ dùng khi CUSTOM_SQL

  // Schema cache — tự detect, lưu lại để dùng trong Sync creation
  detectedColumns     Json?       // ColumnDef[] serialized
  lastSchemaCheckedAt DateTime?
  schemaStatus        SchemaStatus @default(UNKNOWN)
  // UNKNOWN = chưa detect
  // SYNCED  = columns match với lần detect gần nhất
  // DRIFTED = source có thay đổi columns so với cached
  // ERROR   = không connect được để check

  status              ModelStatus @default(DRAFT)
  // DRAFT   = mới tạo, chưa có sync nào
  // ACTIVE  = đang có ít nhất 1 sync active
  // PAUSED  = tất cả syncs bị pause
  // ERROR   = có sync đang error

  ownerId             String?
  createdAt           DateTime    @default(now())
  updatedAt           DateTime    @updatedAt

  syncs               Sync[]      // 1 model → nhiều syncs
}

enum SourceType   { TABLE VIEW MATVIEW CUSTOM_SQL }
enum ModelStatus  { DRAFT ACTIVE PAUSED ERROR }
enum SchemaStatus { UNKNOWN SYNCED DRIFTED ERROR }

// ============================================================
// SYNC — kết nối Model với một destination
// ============================================================
model Sync {
  id              String      @id @default(cuid())
  workspaceId     String
  workspace       Workspace   @relation(fields: [workspaceId], references: [id])

  // Liên kết với Model
  modelId         String
  model           Model       @relation(fields: [modelId], references: [id])

  // Tên hiển thị — auto generate, user có thể override
  // Default: "{model.name} → {destConn.name}"
  name            String

  // Destination configuration
  destConnId      String
  destConn        Connection  @relation(fields: [destConnId], references: [id])
  destSchema      String      @default("public")
  destName        String      // tên table tại dest, default = model.name (slugified)

  // Sync behavior
  syncMode        SyncMode    @default(FULL_REFRESH)
  incrementalCol  String?     // chỉ dùng khi syncMode = INCREMENTAL

  // Column mapping override (nếu user muốn đổi tên cột hoặc type tại dest)
  columnMappings  Json?       // Array<{ sourceCol: string, destCol: string, destType: string }>

  // Schedule
  schedule        String?     // cron expression, VD: "0 2 * * *"
  scheduleEnabled Boolean     @default(false)
  timezone        String      @default("UTC")

  // State
  status          SyncStatus  @default(ACTIVE)
  lastRunAt       DateTime?
  lastRunStatus   RunStatus?
  nextRunAt       DateTime?   // computed từ schedule, cached

  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  runs            SyncRun[]
}

enum SyncMode   { FULL_REFRESH INCREMENTAL }
enum SyncStatus { ACTIVE PAUSED DRAFT ERROR DISABLED }

// ============================================================
// SYNC RUN — lịch sử mỗi lần chạy
// ============================================================
model SyncRun {
  id              String      @id @default(cuid())
  syncId          String
  sync            Sync        @relation(fields: [syncId], references: [id])

  status          RunStatus
  triggeredBy     TriggerBy
  startedAt       DateTime    @default(now())
  finishedAt      DateTime?
  durationMs      Int?
  rowsProcessed   Int?
  bytesTransferred Int?
  errorMessage    String?
  logOutput       String?
  syncPlan        Json?       // snapshot SyncPlan đã thực thi
}

enum RunStatus  { PENDING RUNNING SUCCESS FAILED CANCELLED }
enum TriggerBy  { MANUAL SCHEDULER API }
```

---

## INFORMATION ARCHITECTURE UPDATE

```
Sidebar navigation:

  Dashboard
  ──────────────────
  Models                ← TRANG CHÍNH để quản lý nguồn dữ liệu
  Syncs                 ← list tất cả syncs (cross-model view)
  ──────────────────
  Dependency Graph
  Scheduler
  History & Logs
  ──────────────────
  Connections
  Settings
```

**Relationship navigation:**
- Model detail page → có section "Syncs" → list syncs của model đó → "Add Sync" button
- Sync detail page → có link "← Model: dim_faculty" để back về model
- Syncs list page → có column "Model" để biết sync đến từ model nào

---

## API ROUTES

```
# Models
POST   /api/models                        tạo model
GET    /api/models                        list (filter: status, source, tag, search)
GET    /api/models/:id                    detail + syncs list
PUT    /api/models/:id                    update (name, desc, sql, tags)
DELETE /api/models/:id                    xóa (chỉ được xóa nếu không có active syncs)
POST   /api/models/:id/detect-schema      chạy schema detection, cập nhật detectedColumns
POST   /api/models/:id/preview            preview data (50 rows)
GET    /api/models/:id/schema-diff        so sánh cached schema vs schema thực tế hiện tại

# Syncs
POST   /api/models/:id/syncs              tạo sync mới cho model
GET    /api/syncs                         list tất cả syncs (global)
GET    /api/syncs/:id                     detail
PUT    /api/syncs/:id                     update (dest, schedule, mapping)
DELETE /api/syncs/:id                     xóa
POST   /api/syncs/:id/run                 trigger manual run
POST   /api/syncs/:id/cancel              cancel run đang chạy
PUT    /api/syncs/:id/toggle              enable/disable
GET    /api/syncs/:id/runs                list SyncRuns
GET    /api/syncs/:id/plan                generate + return SyncPlan (chưa execute)

# SyncRuns
GET    /api/runs/:runId                   run detail
GET    /api/runs/:runId/logs              SSE stream logs
```

---

## SCREEN 1: MODELS LIST PAGE

**URL:** `/models`

### Layout

Header row:
```
Models                                    [+ New Model]
X models · Y active · Z with errors
```

Filter/control bar:
```
[🔍 Search models...]  [Source ▼]  [Status ▼]  [Tag ▼]  [Sort: Updated ▼]
```

### Table columns

```
□  Status  Name  Source  Type  Syncs  Last Run  Schema  Updated  Actions
```

Chi tiết từng column:

**Status badge:**
- 🟢 Active — có sync đang chạy tốt
- 🔴 Error — có ít nhất 1 sync failed
- ⏸ Paused — tất cả syncs bị pause
- ⚪ Draft — chưa có sync nào

**Name:**
- Tên model (bold)
- Dòng phụ: source object `public.faculty` hoặc `Custom SQL` (italic, muted)

**Source:**
- Icon DB type (PostgreSQL/MySQL icon nhỏ)
- Tên connection (VD: "ERP DB")

**Type badge:**
- TABLE / VIEW / MATVIEW / SQL
- Màu khác nhau, nhỏ gọn

**Syncs:**
- Số lượng: "3 syncs"
- Mini status dots: ●●○ (2 healthy, 1 failed) — hover để xem detail

**Last Run:**
- Thời gian relative: "2h ago"
- Màu theo status: green/red/gray

**Schema:**
- SYNCED (green check)
- DRIFTED (amber warning — source đã thay đổi columns)
- UNKNOWN (gray dash)
- ERROR (red)

**Actions menu:**
- Preview Data
- Add Sync
- Edit Model
- Detect Schema
- Duplicate
- Delete

### Empty state
```
[icon: database với dấu +]
No models yet
Define your first data source to start syncing.
[+ Create your first model]
```

### Schema Drift banner (nếu có models bị drift)
```
⚠ 2 models have schema changes in their source databases.
  Review and update column mappings to avoid sync errors.  [View affected models →]
```

---

## SCREEN 2: CREATE MODEL (Wizard)

**URL:** `/models/new`

Multi-step wizard, progress bar ở top.

```
[1. Source] ──── [2. Define] ──── [3. Preview] ──── [4. Details]
```

---

### Step 1: Choose Source Connection

Header: "Where is your data?"

Grid cards của connections (chỉ hiện connections có role SOURCE hoặc BOTH):

```
┌─────────────────────────┐  ┌─────────────────────────┐
│ 🐘                      │  │ 🐬                      │
│ ERP Database            │  │ HR System               │
│ PostgreSQL · 10.10.3.x  │  │ MySQL · hr-db.internal  │
│ ● Connected             │  │ ● Connected             │
│                 [Select]│  │                 [Select]│
└─────────────────────────┘  └─────────────────────────┘
```

Nếu connection đang lỗi: hiện badge ERROR, vẫn cho chọn nhưng warn.

"Don't see your database? [+ Add connection]" link ở bottom.

---

### Step 2: Define Source

Header: "What data do you want?"

#### Source Type selector

4 option cards:

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  📋          │ │  👁          │ │  🗄          │ │  </> SQL     │
│  TABLE       │ │  VIEW        │ │  MATVIEW     │ │  CUSTOM SQL  │
│              │ │              │ │              │ │              │
│  Direct copy │ │  Read from   │ │  Copy from   │ │  Write your  │
│  of a table  │ │  a view      │ │  mat. view   │ │  own query   │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

#### Nếu chọn TABLE / VIEW / MATVIEW:

```
Schema  [public ▼]         ← dropdown, load từ connection

Object  [Search tables...] ← searchable dropdown, hiện tên + row count estimate
         ○ faculty          (230K rows, 12 cols)
         ○ department       (450 rows, 8 cols)
         ○ salary_history   (1.2M rows, 15 cols)
```

Auto-load schema list và object list sau khi user chọn connection.
Loading skeleton trong lúc fetch.

#### Nếu chọn CUSTOM SQL:

```
Write your SQL query:
┌─────────────────────────────────────────────────────────┐
│ SELECT                                                  │  ← CodeMirror 6
│   e.id,                                                 │  PostgreSQL syntax highlight
│   e.full_name,                                         │  Keyword autocomplete
│   e.department_id,                                     │  Table/column autocomplete
│   d.name as department_name,                            │  (fetch từ connection)
│   e.salary                                              │
│ FROM employees e                                        │
│ JOIN departments d ON d.id = e.department_id            │
│ WHERE e.active = true                                   │
└─────────────────────────────────────────────────────────┘
                                        [▶ Run Preview]

Tips:
• Only SELECT statements are allowed
• Avoid SELECT * — specify columns explicitly for better schema detection
• Large queries will be previewed with LIMIT 50
```

**Security note trong UI:** "INSERT, UPDATE, DELETE, DROP statements are not allowed."

---

### Step 3: Preview & Confirm Schema

Chạy sau khi user click "Run Preview" (CUSTOM SQL) hoặc auto-load (TABLE/VIEW/MATVIEW).

#### Preview table (50 rows)

```
Previewing: public.faculty  |  50 of ~230,421 rows  |  Ran in 0.3s

┌──────┬─────────────────┬───────────────┬──────────────┬──────────┐
│ id   │ full_name       │ department_id │ hire_date    │ salary   │
│ int4 │ varchar(255)    │ int4          │ date         │ numeric  │
├──────┼─────────────────┼───────────────┼──────────────┼──────────┤
│ 1    │ Nguyen Van A    │ 3             │ 2019-03-15   │ 15000000 │
│ 2    │ Tran Thi B      │ 1             │ 2021-07-01   │ 18000000 │
│ ...  │ ...             │ ...           │ ...          │ ...      │
└──────┴─────────────────┴───────────────┴──────────────┴──────────┘
```

Header row thứ 2 hiện **detected type** (italic, muted). Click vào type → mở type override dropdown.

#### Detected Columns panel (collapsible, bên phải hoặc bên dưới)

```
Detected 12 columns                              [Edit types ✎]

Column          Detected Type      Override
─────────────────────────────────────────────
id              integer            —
full_name       varchar(255)       —
department_id   integer            —
hire_date       date               —
salary          numeric(15,2)      ← [text ▼] override nếu cần
```

#### Warnings panel (nếu có)

```
⚠ Detected Issues:
• Column "notes" is type TEXT — may affect sync performance for large values
• Column "metadata" is JSONB — ensure destination supports this type
```

---

### Step 4: Name & Details

```
Model Name *
[dim_faculty                    ]
← Auto-suggested từ object name, editable

Description (optional)
[Faculty data from ERP system, used for HR reporting and dashboards]

Tags (optional)
[hr ×] [operational ×] [+ add tag...]

Source Summary (readonly display):
  Connection:  ERP Database (PostgreSQL)
  Object:      public.faculty
  Type:        TABLE
  Columns:     12 detected
```

**Save button:** "Create Model →"

Sau khi save:
- Redirect về Model detail page
- Hiển thị success toast: "Model 'dim_faculty' created. Ready to add your first sync."
- Có prominent CTA: "Add your first sync →"

---

## SCREEN 3: MODEL DETAIL PAGE

**URL:** `/models/:id`

### Header

```
🐘 ERP Database                              ← breadcrumb
dim_faculty                    [Edit] [⋮ More ▼]
Faculty data from ERP system

  ● Active  ·  TABLE  ·  public.faculty  ·  12 columns  ·  Updated 2h ago
```

### Tabs

```
[Overview]  [Syncs (3)]  [Schema]  [History]
```

---

### Tab: Overview

**2-column layout:**

**Left — Source Info card:**
```
Source
  Connection   ERP Database (PostgreSQL 15.3)
  Type         TABLE
  Object       public.faculty
  Schema       public
  Est. Rows    ~230,421
  Size         ~45 MB

Schema Status  ✔ Synced  (checked 2h ago)  [Re-check now]
```

**Right — Sync Summary card:**
```
Syncs
  3 total  ·  2 active  ·  1 paused

  ● Dashboard DB     Last run: 2h ago ✔    [Run ▶]
  ● Analytics DB     Last run: 1d ago ✔    [Run ▶]
  ⏸ Staging DB       Paused               [Resume]

  [+ Add Sync]
```

**Bottom — Recent Activity (mini timeline):**
```
2h ago    ✔ Sync to Dashboard DB completed — 230,421 rows in 1m 23s
1d ago    ✔ Sync to Analytics DB completed — 230,419 rows in 2m 11s
3d ago    ✘ Sync to Dashboard DB failed — Connection timeout
3d ago    ↺ Sync to Dashboard DB retried manually
```

---

### Tab: Syncs

Full list của tất cả syncs thuộc model này.

```
[+ Add Sync]                               Active: 2 · Paused: 1

┌────────────────┬──────────┬─────────────────┬──────────────┬──────────────┬──────────┐
│ Destination    │ Status   │ Dest Table      │ Schedule     │ Last Run     │ Actions  │
├────────────────┼──────────┼─────────────────┼──────────────┼──────────────┼──────────┤
│ 🐘 Dashboard   │ ● Active │ public.dim_fac..│ Daily 2AM    │ 2h ago ✔    │ ▶ ⏸ ✎ ⋮ │
│ 🐘 Analytics   │ ● Active │ reporting.facul │ Weekly Mon   │ 1d ago ✔    │ ▶ ⏸ ✎ ⋮ │
│ 🐘 Staging     │ ⏸ Paused │ public.dim_fac..│ Daily 2AM    │ 5d ago ✔    │ ▶ ▷ ✎ ⋮ │
└────────────────┴──────────┴─────────────────┴──────────────┴──────────────┴──────────┘
```

---

### Tab: Schema

Hiển thị columns đã detect với option để re-detect.

```
Schema last detected: 2 hours ago  [Re-detect Schema]

12 columns  ·  No changes detected since last sync

Column          Type              Nullable   Notes
──────────────────────────────────────────────────────────────
id              integer           NOT NULL   ← primary key hint
full_name       varchar(255)      NOT NULL
department_id   integer           nullable
hire_date       date              nullable
salary          numeric(15,2)     nullable
created_at      timestamp         NOT NULL
...
```

**Schema Drift state** (nếu có drift):
```
⚠ Schema Changed Detected
  Source has 2 changes since last sync:

  + added:    "employee_code"  varchar(50)    [nullable]
  ~ changed:  "salary"  numeric(10,2) → numeric(15,2)

  [Review & Apply Changes]   [Dismiss]
```

"Review & Apply Changes" mở modal để user chọn:
- Áp dụng thay đổi vào tất cả syncs liên quan
- Hoặc áp dụng từng sync một

---

## SCREEN 4: ADD SYNC (from Model)

**URL:** `/models/:id/syncs/new`
**Cũng accessible từ:** `/syncs/new?modelId=xxx`

Vì đây là bước 2 trong luồng sau khi đã có Model, form này đơn giản hơn Create Model.

Header:
```
← dim_faculty
Add Sync
Send this model's data to a destination database
```

Single-page form với 3 sections:

---

### Section 1: Destination

```
Source (readonly — hiện model đã chọn, không sửa được ở đây)
┌─────────────────────────────────────────────────────┐
│ 📦 dim_faculty    ERP Database · public.faculty     │
│    TABLE · 12 columns · ~230K rows                  │
└─────────────────────────────────────────────────────┘

Destination Connection *
[Choose destination database ▼]
  ○ 🐘 Dashboard DB  (PostgreSQL · db.dashboard.co)
  ○ 🐘 Analytics DB  (PostgreSQL · analytics.co)
  ○ + Add new connection

Destination Schema
[public                    ]  ← default "public", editable

Destination Table Name *
[dim_faculty               ]  ← auto-fill từ model.name (slugified), editable
```

Hiển thị preview: "Will sync to → Dashboard DB / public.dim_faculty"

Nếu table đã tồn tại tại dest: hiển thị warning
```
ℹ Table "public.dim_faculty" already exists in Dashboard DB
  It will be dropped and recreated on first sync.
  Existing dependencies (views/matviews) will be preserved.
```

---

### Section 2: Sync Behavior

```
Sync Mode
  ◉ Full Refresh     — Drop and recreate the table on every sync
  ○ Incremental      — Only sync new or updated rows

[Nếu chọn Incremental:]
  Incremental Column *
  [Select column ▼]
    ○ created_at  (timestamp)
    ○ updated_at  (timestamp)  ← recommended
    ○ id          (integer)
  ℹ DataSync will only sync rows where this column is greater than the last sync value.
```

---

### Section 3: Schedule

```
Schedule
  ○ Manual only         — Run only when triggered manually
  ◉ Scheduled           — Run automatically on a schedule

[Nếu chọn Scheduled:]

  Timezone  [Asia/Ho_Chi_Minh (UTC+7) ▼]

  Schedule Builder:
  ┌──────────────────────────────────────────────────────┐
  │  Quick presets:                                      │
  │  [Every hour] [Every 6h] [Daily] [Weekly] [Monthly] │
  │                                                      │
  │  Or custom cron:                                     │
  │  [0  ] [2  ] [*  ] [*  ] [*  ]                      │
  │  min   hr    day   mo    dow                         │
  │                                                      │
  │  → Runs every day at 02:00 AM (UTC+7)               │
  │    Next 3 runs:                                     │
  │    • Tomorrow, Mar 12 at 02:00 AM                   │
  │    • Mar 13 at 02:00 AM                             │
  │    • Mar 14 at 02:00 AM                             │
  └──────────────────────────────────────────────────────┘
```

---

### Section 4: Name (auto-generated, collapsible)

```
Sync Name (auto-generated)
[dim_faculty → Dashboard DB                ]  ← editable
```

---

### Bottom action bar (sticky)

```
[Cancel]                          [Save as Draft]  [Save & Run Now ▶]
```

- **Save as Draft**: lưu sync, không chạy ngay
- **Save & Run Now**: lưu sync rồi trigger run ngay → redirect về Sync Run detail page với live log

---

## SCREEN 5: SYNCS LIST PAGE (Global)

**URL:** `/syncs`

View tất cả syncs cross-model, giữ nguyên thiết kế cũ nhưng thêm column "Model".

### Table columns

```
□  Status  Name  Model  Destination  Schedule  Last Run  Duration  Rows  Actions
```

**Model column:**
- Tên model (clickable → model detail)
- Nhỏ gọn, không chiếm quá nhiều space

**Name column:**
- Tên sync ("dim_faculty → Dashboard DB")
- Dòng phụ: dest schema.table

Các column còn lại giữ nguyên như thiết kế ban đầu.

---

## SCREEN 6: SYNC DETAIL / DRAWER

Click vào sync row → mở side drawer (480px).

### Tabs: Overview | Runs | Configuration | Logs

**Overview tab:**
```
Model          dim_faculty
               ERP Database · public.faculty · TABLE

Destination    Dashboard DB
               public.dim_faculty

Sync Mode      Full Refresh
Schedule       Daily at 02:00 AM (Asia/Ho_Chi_Minh)
Next Run       Tomorrow at 02:00 AM

Last Run       2 hours ago · SUCCESS · 230,421 rows · 1m 23s
               [View logs →]

[Run Now ▶]  [Pause ⏸]  [Edit ✎]
```

**Runs tab:**
```
12 runs in last 30 days

Date              Status    Rows      Duration   Triggered   Actions
─────────────────────────────────────────────────────────────────────
Mar 11 02:00 AM  ● Success  230,421   1m 23s     Scheduler   [Logs]
Mar 10 02:00 AM  ● Success  230,419   1m 21s     Scheduler   [Logs]
Mar 09 02:00 AM  ✘ Failed   —         0m 12s     Scheduler   [Logs]
Mar 08 14:32 PM  ● Success  230,415   1m 19s     Manual      [Logs]
```

---

## SERVICES LAYER CHANGES

### model.service.ts (NEW FILE)

```typescript
export interface ModelCreateInput {
  workspaceId: string
  name: string
  description?: string
  tags: string[]
  sourceConnId: string
  sourceType: SourceType
  sourceSchema?: string
  sourceName?: string
  customSql?: string
}

// Tạo model, auto-detect schema, lưu detectedColumns
export async function createModel(input: ModelCreateInput): Promise<Model>

// Detect schema từ source, update detectedColumns + lastSchemaCheckedAt
export async function detectModelSchema(modelId: string): Promise<{
  columns: ColumnDef[]
  changed: boolean           // so sánh với cached, true nếu có thay đổi
  diff: SchemaDiff | null
}>

// So sánh columns hiện tại với cached
export interface SchemaDiff {
  added: ColumnDef[]
  removed: ColumnDef[]
  changed: Array<{ column: string; oldType: string; newType: string }>
}

// Preview data của model (50 rows)
export async function previewModel(modelId: string): Promise<PreviewResult>

// Update model status dựa trên syncs của nó
export async function refreshModelStatus(modelId: string): Promise<ModelStatus>
// DRAFT nếu syncs.length = 0
// ERROR nếu có sync.status = ERROR
// PAUSED nếu tất cả syncs.status = PAUSED
// ACTIVE nếu có ít nhất 1 sync ACTIVE
```

### sync.service.ts (REFACTOR từ job.service.ts)

```typescript
export interface SyncCreateInput {
  modelId: string
  workspaceId: string
  destConnId: string
  destSchema: string
  destName: string
  syncMode: SyncMode
  incrementalCol?: string
  schedule?: string
  scheduleEnabled: boolean
  timezone: string
  columnMappings?: ColumnMapping[]
}

// Tạo sync
export async function createSync(input: SyncCreateInput): Promise<Sync>
// Sau khi tạo: gọi refreshModelStatus(modelId)

// Update sync
export async function updateSync(syncId: string, input: Partial<SyncCreateInput>): Promise<Sync>

// Toggle enable/disable
export async function toggleSync(syncId: string): Promise<Sync>

// Trigger manual run
export async function triggerRun(syncId: string, triggeredBy: TriggerBy): Promise<string>
// Returns syncRunId
```

### sync-plan.service.ts (UPDATE)

Thay vì nhận `jobId`, giờ nhận `syncId`:

```typescript
export async function generateSyncPlan(syncId: string): Promise<SyncPlan>
// Load sync → load model → lấy source config từ model
// Logic còn lại giữ nguyên
```

`SyncPlan.sourceDescription` giờ hiển thị model name:
```typescript
sourceDescription: `Model "${model.name}" — ${model.sourceConn.name} · ${model.sourceName ?? 'Custom SQL'}`
```

---

## MIGRATION từ Job → Model + Sync

Nếu đang có dữ liệu cũ với bảng `Job`:

```typescript
// migration script
async function migrateJobsToModelSync() {
  const jobs = await prisma.job.findMany({ include: { sourceConn: true, destConn: true } })

  for (const job of jobs) {
    // Tạo Model từ Job
    const model = await prisma.model.create({
      data: {
        workspaceId: job.workspaceId,
        name: job.name,
        sourceConnId: job.sourceConnId,
        sourceType: job.sourceType,
        sourceSchema: job.sourceSchema,
        sourceName: job.sourceName,
        customSql: job.customSql,
        status: 'ACTIVE',
      }
    })

    // Tạo Sync từ Job
    await prisma.sync.create({
      data: {
        workspaceId: job.workspaceId,
        modelId: model.id,
        name: `${job.name} → ${job.destConn.name}`,
        destConnId: job.destConnId,
        destSchema: job.destSchema,
        destName: job.destName,
        syncMode: job.syncMode,
        incrementalCol: job.incrementalCol,
        schedule: job.schedule,
        scheduleEnabled: job.scheduleEnabled,
        status: job.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
      }
    })
  }
}
```

---

## KEY UX DECISIONS & RATIONALE

### 1. Model tồn tại độc lập với Sync
User có thể tạo Model mà chưa sync đi đâu. Hữu ích khi muốn:
- Chuẩn bị source trước, sync sau khi dest DB sẵn sàng
- Review schema trước khi commit

### 2. Auto-fill tên Sync
`name = "{model.name} → {destConn.name}"` — user hiếm khi cần đổi, nhưng vẫn có thể.

### 3. Schema Drift chỉ warning, không block
Nếu source đổi schema, sync vẫn có thể chạy nếu user chấp nhận. Không tự động break sync.

### 4. Dest table name default = model name (slugified)
```typescript
function slugifyModelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '_')         // spaces → underscore
    .replace(/[^a-z0-9_]/g, '')   // remove special chars
    .replace(/^(\d)/, '_$1')      // không bắt đầu bằng số
}
// "Monthly Salary Report" → "monthly_salary_report"
// "dim_faculty" → "dim_faculty" (giữ nguyên)
```

### 5. Column Mapping override (nâng cao, optional)
Ẩn trong "Advanced" collapsible section của Add Sync form.
User có thể map `source_column → dest_column` và override type.
Hữu ích khi dest DB có naming convention khác source.

### 6. 1 Sync = 1 Destination (không cho fanout)
Mỗi sync chỉ đến 1 dest table. Nếu muốn sync cùng data đến 2 dest,
user tạo 2 Sync từ cùng 1 Model. Giữ logic đơn giản, tránh phức tạp.