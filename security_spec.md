# Security Specification — Cadence Multi-User RBAC & Admin Firestore Rules

## 1. Data Invariants

1. **Identity & Email Verification**: All writes require `request.auth != null` and `request.auth.token.email_verified == true`.
2. **Global Admins**: Global administrators are verified via `isAdmin()`, which checks `request.auth.token.email_verified == true` alongside either the bootstrapped runtime admin email (`btuttle@orangeusd.org`) or a trusted `/admins/{uid}` document. Admins have full access to all boards and utilities across the workspace.
3. **PII Isolation & Safe Collaboration Lookup**: User emails are strictly isolated in `/users/{userId}/private/info`. Collaboration lookup uses `/emailLookup/{sha256(email)}` with `allow list: if false;` and zero plaintext email fields.
4. **Master Gate & Granular Board Permissions**:
   - The Board (`/boards/{boardId}`) is the ownership anchor (`ownerId`).
   - Board Creators and Admins can grant, update, and revoke collaborator permissions in `/boards/{boardId}/members/{memberUid}` (`canView`, `canCreateTasks`, `canEditTasks`, `canDeleteTasks`, `canManageColumns`).
   - Every sub-resource write (`columns`, `tasks`, `subtasks`, `messages`) checks both the parent Board's existence/status AND the caller's role/permission flag via `get()`.
   - Revoking a member deletes `/boards/{boardId}/members/{memberUid}` and synchronously removes all access to the board and its subcollections.
5. **Board-Scoped Assignee Integrity**: When assigning or reassigning a task (`assigneeId != ''`), `assigneeId` MUST belong to the board creator (`board.ownerId`), an active board member (`/boards/{boardId}/members/{assigneeId}`), or a global admin (`/admins/{assigneeId}`).
6. **Task Chat Log Integrity**: Messages in `/boards/{boardId}/messages/{messageId}` require board membership (`canAccessBoard(boardId)`) and board active status (or global admin), must reference an existing task `/boards/{boardId}/tasks/{taskId}`, must bind `senderId == request.auth.uid`, and are immutable after creation (deletable only by sender, board creator, or admin).
7. **Invite Escalation Prevention**: When redeeming `/boards/{boardId}/invites/{inviteId}`, the created `/boards/{boardId}/members/{uid}` document MUST match the invite's exact permission booleans and `role`, and `active == true`.
8. **Atomicity Guarantee**: Creating `/users/{uid}/boardRefs/{boardId}` during invite redemption requires `existsAfter(/databases/$(database)/documents/boards/$(boardId)/members/$(uid))` in the same batch.
9. **Terminal State Locking**: Archived boards (`status == 'archived'`) block all non-admin updates to the board and all non-admin writes to columns, tasks, subtasks, messages, and invites.
10. **Temporal Integrity & Immutability**: `createdAt == request.time` on create, immutable on update; `updatedAt == request.time` on create and update; `createdBy == request.auth.uid` on new task/column/subtask/invite creation.
11. **Task Link & Milestone Integrity**: Task `links` are bounded to 8 items with `http(s)://` URLs (blocking `javascript:`/`data:` schemes), and `milestones`/`placedOnColumnAt`/`completedAt` enforce bounded `YYYY-MM-DD` dates and max 8 milestones.
12. **Column Threshold Color & Notification Toggle Integrity**: Column `colorRules` are bounded to 6 rules with integer thresholds (`1..100`) and a strict color allowlist (`slate`, `amber`, `red`, `emerald`, `blue`, `violet`), and `Task.notificationsEnabled` is strictly boolean.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Admin Email Spoofing**: User signs in with `email: "btuttle@orangeusd.org"` and `email_verified: false` and attempts to list `/boards` or read another user's board. -> `PERMISSION_DENIED`
2. **Self-Assigned Global Admin**: Non-admin User B attempts to create `/admins/{uid_B}` to escalate to global admin. -> `PERMISSION_DENIED`
3. **Self-Assigned Board Membership**: Non-member User B attempts to create `/boards/board_1/members/{uid_B}` with `canManageColumns: true` without an invite or owner grant. -> `PERMISSION_DENIED`
4. **Invite Privilege Escalation**: User B redeems a `viewer` invite (`canCreateTasks: false`) while submitting `canCreateTasks: true` in `/boards/board_1/members/{uid_B}`. -> `PERMISSION_DENIED`
5. **Viewer Task Creation Bypass**: Board member User B with `canCreateTasks: false` attempts to create a task in `/boards/board_1/tasks/t_new`. -> `PERMISSION_DENIED`
6. **Contributor Column Tampering**: Board member User B with `canCreateTasks: true, canManageColumns: false` attempts to rename or delete a column. -> `PERMISSION_DENIED`
7. **Unauthorized Task Deletion**: Board member User B with `canEditTasks: true, canDeleteTasks: false` attempts to delete a task. -> `PERMISSION_DENIED`
8. **Non-Admin Archived Board Mutation**: Board creator or member attempts to create a task, message, or update a column on an `archived` board. -> `PERMISSION_DENIED`
9. **Blanket List Scraping**: User B attempts `list` on `/boards`, `/emailLookup`, `/users`, or `/boards/board_1/invites`. -> `PERMISSION_DENIED`
10. **BoardRef Orphan Spoofing**: User B attempts to create `/users/{uid_B}/boardRefs/board_1` without being a member of `board_1`. -> `PERMISSION_DENIED`
11. **Shadow Field & Value Poisoning**: Board member attempts to inject `isAdmin: true` or a 10KB description into a task update. -> `PERMISSION_DENIED`
12. **PII Leak Attempt**: Board member User B attempts to `get` `/users/{uid_A}/private/info` of the board creator. -> `PERMISSION_DENIED`
13. **Outsider Assignee Injection**: Board contributor attempts to assign a task to an outsider UID who is not allowed on the board. -> `PERMISSION_DENIED`
14. **Chat Sender Spoofing & Outsider Chat Post**: Non-member attempts to post to `/boards/board_1/messages`, or member attempts to post with `senderId != request.auth.uid`. -> `PERMISSION_DENIED`
15. **Unsafe Task Link Injection**: Board contributor attempts to attach a `javascript:alert(1)` link to a task. -> `PERMISSION_DENIED`
16. **Column Color Rule Poisoning**: Board creator or manager attempts to inject an arbitrary color value (`expression(alert(1))`) or negative threshold into `Column.colorRules`. -> `PERMISSION_DENIED`

