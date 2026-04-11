# Refactoring Plan — Stage 6.3

> Generated: 2026-04-11 | Based on graphify analysis (590 nodes, 728 edges, 38 communities)

## Audit Summary

| # | File | Lines | Over Threshold | Refactor? |
|---|------|-------|----------------|-----------|
| 1 | web/utils.py | 875 | Yes (300) | **YES — #1 PRIORITY** |
| 2 | backapp_oldfiles/Home.jsx | 864 | — | NO (legacy backup) |
| 3 | web/routers/applications.py | 852 | Yes (400) | YES |
| 4 | frontend/src/pages/Objects.jsx | 851 | Yes (500) | YES |
| 5 | frontend/src/pages/System.jsx | 770 | Yes (500) | YES |
| 6 | frontend/src/features/applications/components/EditAppModal.jsx | 708 | Yes (500) | YES |
| 7 | frontend/src/features/applications/components/CreateAppModal.jsx | 706 | Yes (500) | YES |
| 8 | frontend/src/pages/Home.jsx | 588 | Yes (500) | YES |
| 9 | main_max.py | 533 | Yes (300) | YES |
| 10 | web/routers/users.py | 485 | Yes (400) | YES |
| 11 | frontend/src/pages/Review.jsx | 481 | Yes (500) | LOW PRIORITY |
| 12 | frontend/src/features/applications/components/ViewAppModal.jsx | 466 | No (500) | NO |
| 13 | frontend/src/pages/KP.jsx | 455 | No (500) | NO |
| 14 | web/routers/system.py | 446 | Yes (400) | YES |
| 15 | web/routers/exchange.py | 436 | Yes (400) | YES |
| 16 | frontend/src/features/layout/components/ProfileModal.jsx | 428 | No (500) | NO |
| 17 | main.py | 390 | Yes (300) | LOW PRIORITY |
| 18 | web/routers/equipment.py | 380 | No (400) | NO |
| 19 | web/schedule_generator.py | 359 | — | **NO — SACRED FILE** |
| 20 | web/routers/objects.py | 337 | No (400) | NO |
| 21 | web/scheduler.py | 321 | Yes (300) | LOW PRIORITY |

**Excluded by rule:** Database repo mixins (already modular via mixin pattern), schedule_generator.py (sacred file).

---

## Refactoring Items

### 1. `web/utils.py` — GOD MODULE DECOMPOSITION

- **Lines:** 875
- **Risk:** HIGH (graphify: 11+ edges, Community 1 "Utility Functions & Helpers" cohesion 0.08, verify_moderator_plus has 11 edges across all routers)
- **Current responsibilities (6 distinct domains):**
  1. Image generation & font management (`create_app_image`, `download_font`, `get_fonts`, `wrap_text`, `clean_text`, `strip_html`, `process_base64_image`)
  2. MAX API messaging (`get_max_bot`, `send_max_text`, `send_max_message`, `get_max_group_id`, `get_max_dm_chat_id`)
  3. Multi-platform notifications (`notify_group_chat`, `notify_users`, `send_schedule_notifications`)
  4. App publishing logic (`execute_app_publish`)
  5. Team/object enrichment & linked ID resolution (`fetch_teams_dict`, `enrich_app_with_team_name`, `resolve_id`, `get_all_linked_ids`)
  6. Schedule helpers & smart scheduling (`get_smr_debtors`, `get_waiting_apps_for_date`, `get_schedule_dates`, `send_smart_schedule_prompt`)
  7. Account conflict alerts (`notify_role_conflict`, `notify_fio_match`)

- **Proposed split:**

| New File | Contents | ~Lines |
|----------|----------|--------|
| `web/services/image_service.py` | `create_app_image`, `download_font`, `get_fonts`, `wrap_text`, `clean_text`, `strip_html`, `process_base64_image` | ~200 |
| `web/services/max_api.py` | `get_max_bot`, `send_max_text`, `send_max_message`, `get_max_group_id`, `get_max_dm_chat_id` | ~100 |
| `web/services/notifications.py` | `notify_group_chat`, `notify_users`, `send_schedule_notifications`, `notify_role_conflict`, `notify_fio_match` | ~200 |
| `web/services/publish_service.py` | `execute_app_publish` | ~130 |
| `web/services/schedule_helpers.py` | `get_smr_debtors`, `get_waiting_apps_for_date`, `get_schedule_dates`, `send_smart_schedule_prompt` | ~100 |
| `web/utils.py` (remains) | `verify_moderator_plus`, `fetch_teams_dict`, `enrich_app_with_team_name`, `resolve_id`, `get_all_linked_ids` | ~145 |

- **Migration strategy:** Create `web/services/` package. Move functions, update all import paths. `web/utils.py` remains as a thin file with auth guards and enrichment helpers that are used everywhere.

---

### 2. `web/routers/applications.py` — Extract service layer

- **Lines:** 852
- **Risk:** MEDIUM (graphify: Community 6 "Applications Backend Logic", 24 nodes, cohesion 0.09)
- **Current responsibilities:**
  - Application CRUD (create, update, delete)
  - Approval & status transitions (approve, reject, publish, complete)
  - Resource availability checking (time-overlap detection)
  - Schedule generation & publishing
  - Data enrichment (members, equipment, teams)
  - Column migration (`ensure_app_columns`)

- **Proposed split:**

| New File | Contents | ~Lines |
|----------|----------|--------|
| `web/services/app_service.py` | `create_app`, `update_app`, `delete_app`, `check_availability`, `enrich_app_with_members_data`, `ensure_app_columns`, `get_active_objects` | ~300 |
| `web/services/app_workflow.py` | `approve_app`, `reject_app`, `publish_app`, `free_app_team`, `free_app_equipment`, schedule publishing logic | ~250 |
| `web/routers/applications.py` (remains) | Thin router: endpoint definitions, request validation, delegates to services | ~300 |

---

### 3. `frontend/src/features/applications/components/CreateAppModal.jsx` + `EditAppModal.jsx` — Consolidate duplicates

- **Lines:** 706 + 708 = 1414 total
- **Risk:** MEDIUM (Community 3 "Application Cards & Modals", self-contained UI components)
- **Current responsibilities:** Nearly identical form logic for creating and editing work orders — object selection, team/member assignment, equipment selection with time slots, exchange requests.

- **Proposed split:**

| New File | Contents | ~Lines |
|----------|----------|--------|
| `frontend/src/features/applications/components/AppFormModal.jsx` | Unified form modal with `isEditMode` prop. Shared state, validation, submission logic | ~500 |
| `frontend/src/features/applications/components/ObjectSelector.jsx` | Searchable object dropdown (extracted from both modals) | ~80 |
| `frontend/src/features/applications/components/EquipmentSelector.jsx` | Equipment grid with availability badges + time slots | ~120 |
| `frontend/src/features/applications/components/ResourcePanel.jsx` | Team selection + member toggling | ~100 |

- Delete `CreateAppModal.jsx` and `EditAppModal.jsx` after consolidation.

---

### 4. `frontend/src/pages/Objects.jsx` — Split by domain

- **Lines:** 851
- **Risk:** LOW (graphify: Community 4 "Objects & Extra Works API", cohesion 0.06, mostly self-contained page)
- **Current responsibilities:** Object CRUD, resource assignment, KP catalog management, PDF parsing, file uploads, statistics modal.

- **Proposed split:**

| New File | Contents | ~Lines |
|----------|----------|--------|
| `frontend/src/pages/Objects.jsx` (remains) | Object list, create/archive, top-level state, tab routing | ~250 |
| `frontend/src/features/objects/components/ObjectEditModal.jsx` | 4-tab edit modal (info, resources, KP, files) | ~300 |
| `frontend/src/features/objects/components/PDFImportWizard.jsx` | 3-step PDF parsing flow | ~120 |
| `frontend/src/features/objects/components/ObjectStatsModal.jsx` | Statistics visualization modal | ~100 |
| `frontend/src/features/objects/components/ObjectRequestModal.jsx` | Foreman object request form | ~80 |

---

### 5. `frontend/src/pages/System.jsx` — Extract admin sections

- **Lines:** 770
- **Risk:** LOW (graphify: Community 9 "System Settings & Schedule", cohesion 0.10, admin-only page)
- **Current responsibilities:** User management, system settings, server logs, notification config, schedule control.

- **Proposed split:**

| New File | Contents | ~Lines |
|----------|----------|--------|
| `frontend/src/pages/System.jsx` (remains) | Page layout, tab switching, shared state | ~150 |
| `frontend/src/features/system/components/UserManagement.jsx` | User list, role assignment, CRUD | ~250 |
| `frontend/src/features/system/components/SystemSettings.jsx` | Settings form (schedule times, toggles) | ~150 |
| `frontend/src/features/system/components/LogViewer.jsx` | Client + server log tabs | ~120 |
| `frontend/src/features/system/components/GlassCard.jsx` | Reusable glass-morphism card wrapper | ~30 |

---

### 6. `frontend/src/pages/Home.jsx` — Extract kanban + form logic

- **Lines:** 588
- **Risk:** LOW (graphify: Community 3, self-contained page)
- **Current responsibilities:** Kanban board (4 columns), order form state, team/equipment availability checks, debtors widget.

- **Proposed split:**

| New File | Contents | ~Lines |
|----------|----------|--------|
| `frontend/src/pages/Home.jsx` (remains) | Page layout, data fetching, modal coordination | ~200 |
| `frontend/src/features/applications/components/KanbanBoard.jsx` | 4-column board + card rendering logic | ~200 |
| `frontend/src/features/applications/hooks/useAppForm.js` | Form state, availability checks, submit logic | ~150 |

---

### 7. `web/routers/system.py` — Extract service layer

- **Lines:** 446
- **Risk:** LOW (graphify: Community 9, cohesion 0.10)
- **Current responsibilities:** Broadcasting, server logs, test notifications, SMR debt/reminders, smart scheduling endpoints.

- **Proposed split:**

| New File | Contents | ~Lines |
|----------|----------|--------|
| `web/services/broadcast_service.py` | `broadcast_to_group`, `broadcast_to_dm`, test notification logic | ~120 |
| `web/routers/system.py` (remains) | Thin router: endpoints delegate to services | ~326 |

---

### 8. `web/routers/exchange.py` — Extract helpers

- **Lines:** 436
- **Risk:** LOW (graphify: Community 18 "Equipment Exchange Flow", cohesion 0.29 — well-isolated)
- **Current responsibilities:** Exchange request lifecycle, donor notifications, availability checks.

- **Proposed split:**

| New File | Contents | ~Lines |
|----------|----------|--------|
| `web/services/exchange_service.py` | `create_exchange_request`, `respond_exchange`, `cancel_exchange`, `check_equip_for_exchange`, helper functions | ~300 |
| `web/routers/exchange.py` (remains) | Thin router: 5 endpoint definitions | ~136 |

---

### 9. `web/routers/users.py` — Extract account linking

- **Lines:** 485
- **Risk:** MEDIUM (graphify: Community 13 "Users API & Data Models", cohesion 0.10, account linking touches auth flow)
- **Current responsibilities:** User CRUD, profile management, account linking/merging, role assignment.

- **Proposed split:**

| New File | Contents | ~Lines |
|----------|----------|--------|
| `web/services/user_service.py` | Profile logic, avatar processing, user deletion cascade | ~150 |
| `web/services/account_link_service.py` | `link_account_v2`, `admin_link`, `_determine_primary`, `_validate_link`, `get_linked_account`, `unlink_platform` | ~200 |
| `web/routers/users.py` (remains) | Thin router: endpoint definitions | ~135 |

- Note: `web/services/account_merge.py` already exists for merge logic. The new `account_link_service.py` handles the linking/unlinking flow that wraps around it.

---

### 10. `main_max.py` — Extract shared bot logic

- **Lines:** 533
- **Risk:** MEDIUM (graphify: Community 20 "MAX Bot Entry", cohesion 0.39 — well-isolated but shares patterns with main.py)
- **Current responsibilities:** MAX bot setup, user ID extraction, FSM registration, commands, button callbacks, webhook management.

- **Proposed split:**

| New File | Contents | ~Lines |
|----------|----------|--------|
| `bot/max_commands.py` | Command handlers: `/start`, `/web`, `/join`, `/schedule`, `/setchat` | ~200 |
| `bot/max_callbacks.py` | Button callback handlers: smart_publish, exchange, team_ask/yes, equip_yes | ~150 |
| `main_max.py` (remains) | Bot init, webhook, `extract_and_save_ids`, message routing, FSM state management | ~183 |

---

## Execution Order

Ordered by risk (lowest first) and dependency (independent modules first):

| Phase | File(s) | Risk | Rationale |
|-------|---------|------|-----------|
| **Phase 1** | `web/utils.py` → `web/services/*` | HIGH | God module — #1 priority per graphify. All other refactors depend on stable service imports. Do this first to establish `web/services/` package. |
| **Phase 2** | `web/routers/exchange.py` | LOW | Well-isolated (cohesion 0.29), few consumers, safe to extract first among routers. |
| **Phase 3** | `web/routers/system.py` | LOW | Admin-only endpoints, low blast radius. |
| **Phase 4** | `web/routers/applications.py` | MEDIUM | Core workflow — extract service layer after utils.py is stabilized. |
| **Phase 5** | `web/routers/users.py` | MEDIUM | Account linking touches auth — do after app workflow is stable. |
| **Phase 6** | `frontend/src/features/applications/components/CreateAppModal.jsx` + `EditAppModal.jsx` → `AppFormModal.jsx` | MEDIUM | Biggest frontend win (1414 LOC dedup). Test thoroughly — modal is critical path. |
| **Phase 7** | `frontend/src/pages/Objects.jsx` | LOW | Self-contained page, extract sub-modals. |
| **Phase 8** | `frontend/src/pages/System.jsx` | LOW | Admin page, low risk. |
| **Phase 9** | `frontend/src/pages/Home.jsx` | LOW | Extract kanban board after AppFormModal is consolidated. |
| **Phase 10** | `main_max.py` | MEDIUM | Bot entry point — extract carefully, test webhook flow. |

---

## Files NOT Being Refactored (with reasons)

| File | Lines | Reason |
|------|-------|--------|
| `web/schedule_generator.py` | 359 | Sacred file per project rules |
| `database/db_manager.py` | 252 | Mixin pattern — already modular |
| `database/apps_repo.py` | 230 | Mixin — under threshold |
| `database/kp_repo.py` | 209 | Mixin — under threshold |
| `backapp_oldfiles/Home.jsx` | 864 | Legacy backup — not active code |
| `web/routers/equipment.py` | 380 | Under 400-line router threshold |
| `web/routers/objects.py` | 337 | Under 400-line router threshold |
| `web/scheduler.py` | 321 | Cohesive job definitions, splitting would scatter related cron logic |
| `main.py` | 390 | Similar to main_max.py but smaller; defer to Phase 10+ |
| `frontend/src/pages/Review.jsx` | 481 | Just under 500, moderate complexity |
| `frontend/src/pages/KP.jsx` | 455 | Under 500-line threshold |
| `frontend/src/features/applications/components/ViewAppModal.jsx` | 466 | Under threshold, read-only component |
| `frontend/src/features/layout/components/ProfileModal.jsx` | 428 | Under threshold |

---

## Expected Outcome

After all phases:
- `web/utils.py`: 875 → ~145 lines (auth guards + enrichment only)
- `web/services/` package: 6+ new service modules with clear domain boundaries
- `web/routers/`: All routers become thin HTTP layers (~130-300 lines each)
- Frontend application modals: 1414 → ~800 lines (shared `AppFormModal` + extracted components)
- `Objects.jsx`: 851 → ~250 lines + 4 feature components
- `System.jsx`: 770 → ~150 lines + 4 feature components
- Total new files: ~20 | Total lines eliminated via dedup: ~600+
