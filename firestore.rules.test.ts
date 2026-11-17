import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import fs from 'node:fs';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

const ADMIN = { uid: 'admin_1', email: 'btuttle@orangeusd.org', email_verified: true };
const SPOOF_ADMIN = { uid: 'spoof_1', email: 'btuttle@orangeusd.org', email_verified: false };
const CREATOR = { uid: 'creator_a', email: 'creator@example.com', email_verified: true };
const MEMBER_VIEWER = { uid: 'viewer_b', email: 'viewer@example.com', email_verified: true };
const MEMBER_CONTRIB = { uid: 'contrib_c', email: 'contrib@example.com', email_verified: true };
const OUTSIDER = { uid: 'outsider_d', email: 'outsider@example.com', email_verified: true };
const UNWHITELISTED = { uid: 'blocked_e', email: 'blocked@example.com', email_verified: true };

async function runTests() {
  testEnv = await initializeTestEnvironment({
    projectId: 'cadence-rbac-test',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'boards', 'board_1'), {
      id: 'board_1',
      ownerId: CREATOR.uid,
      title: 'Shared Board',
      description: 'Team roadmap',
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'boards', 'board_archived'), {
      id: 'board_archived',
      ownerId: CREATOR.uid,
      title: 'Archived Board',
      description: 'Locked',
      status: 'archived',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'boards', 'board_1', 'columns', 'col_1'), {
      id: 'col_1',
      boardId: 'board_1',
      ownerId: CREATOR.uid,
      createdBy: CREATOR.uid,
      title: 'To Do',
      position: 1000,
      wipLimit: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'boards', 'board_1', 'tasks', 'task_1'), {
      id: 'task_1',
      boardId: 'board_1',
      columnId: 'col_1',
      ownerId: CREATOR.uid,
      createdBy: CREATOR.uid,
      assigneeId: '',
      title: 'Existing Task',
      description: '',
      priority: 'medium',
      position: 1000,
      tags: [],
      dueDate: '',
      completed: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'boards', 'board_1', 'members', MEMBER_VIEWER.uid), {
      uid: MEMBER_VIEWER.uid,
      boardId: 'board_1',
      ownerId: CREATOR.uid,
      displayName: 'Viewer',
      role: 'viewer',
      canView: true,
      canCreateTasks: false,
      canEditTasks: false,
      canDeleteTasks: false,
      canManageColumns: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'boards', 'board_1', 'members', MEMBER_CONTRIB.uid), {
      uid: MEMBER_CONTRIB.uid,
      boardId: 'board_1',
      ownerId: CREATOR.uid,
      displayName: 'Contributor',
      role: 'contributor',
      canView: true,
      canCreateTasks: true,
      canEditTasks: true,
      canDeleteTasks: false,
      canManageColumns: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'boards', 'board_1', 'invites', 'inv_viewer'), {
      id: 'inv_viewer',
      boardId: 'board_1',
      ownerId: CREATOR.uid,
      createdBy: CREATOR.uid,
      label: 'Read only',
      role: 'viewer',
      canCreateTasks: false,
      canEditTasks: false,
      canDeleteTasks: false,
      canManageColumns: false,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'users', CREATOR.uid, 'private', 'info'), {
      uid: CREATOR.uid,
      email: CREATOR.email,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    for (const allowedEmail of [CREATOR.email, MEMBER_VIEWER.email, MEMBER_CONTRIB.email, OUTSIDER.email]) {
      await setDoc(doc(db, 'whitelist', allowedEmail), {
        email: allowedEmail,
        label: 'Test Cohort',
        active: true,
        canCreateBoards: allowedEmail === CREATOR.email,
        addedBy: ADMIN.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await setDoc(doc(db, 'accessCodes', 'CAD_INACTIVE'), {
      id: 'CAD_INACTIVE',
      label: 'Expired Cohort',
      active: false,
      createdBy: ADMIN.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  const dbAdmin = testEnv.authenticatedContext(ADMIN.uid, { email: ADMIN.email, email_verified: true }).firestore();
  const dbSpoof = testEnv.authenticatedContext(SPOOF_ADMIN.uid, { email: SPOOF_ADMIN.email, email_verified: false }).firestore();
  const dbCreator = testEnv.authenticatedContext(CREATOR.uid, { email: CREATOR.email, email_verified: true }).firestore();
  const dbViewer = testEnv.authenticatedContext(MEMBER_VIEWER.uid, { email: MEMBER_VIEWER.email, email_verified: true }).firestore();
  const dbContrib = testEnv.authenticatedContext(MEMBER_CONTRIB.uid, { email: MEMBER_CONTRIB.email, email_verified: true }).firestore();
  const dbOutsider = testEnv.authenticatedContext(OUTSIDER.uid, { email: OUTSIDER.email, email_verified: true }).firestore();
  const dbBlocked = testEnv.authenticatedContext(UNWHITELISTED.uid, { email: UNWHITELISTED.email, email_verified: true }).firestore();

  // 1. Admin Email Spoofing
  await assertFails(getDocs(collection(dbSpoof, 'boards')));

  // 2. Self-Assigned Global Admin
  await assertFails(
    setDoc(doc(dbOutsider, 'admins', OUTSIDER.uid), {
      uid: OUTSIDER.uid,
      displayName: 'Hack',
      addedBy: OUTSIDER.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 3. Self-Assigned Board Membership
  await assertFails(
    setDoc(doc(dbOutsider, 'boards', 'board_1', 'members', OUTSIDER.uid), {
      uid: OUTSIDER.uid,
      boardId: 'board_1',
      ownerId: CREATOR.uid,
      displayName: 'Intruder',
      role: 'manager',
      canView: true,
      canCreateTasks: true,
      canEditTasks: true,
      canDeleteTasks: true,
      canManageColumns: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 4. Invite Privilege Escalation
  await assertFails(
    setDoc(doc(dbOutsider, 'boards', 'board_1', 'members', OUTSIDER.uid), {
      uid: OUTSIDER.uid,
      boardId: 'board_1',
      ownerId: CREATOR.uid,
      displayName: 'Escalated',
      role: 'viewer',
      canView: true,
      canCreateTasks: true,
      canEditTasks: false,
      canDeleteTasks: false,
      canManageColumns: false,
      inviteId: 'inv_viewer',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 5. Viewer Task Creation Bypass
  await assertFails(
    setDoc(doc(dbViewer, 'boards', 'board_1', 'tasks', 'task_v'), {
      id: 'task_v',
      boardId: 'board_1',
      columnId: 'col_1',
      ownerId: CREATOR.uid,
      createdBy: MEMBER_VIEWER.uid,
      assigneeId: '',
      title: 'Unauthorized',
      description: '',
      priority: 'low',
      position: 2000,
      tags: [],
      dueDate: '',
      completed: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 6. Contributor Column Tampering
  await assertFails(
    updateDoc(doc(dbContrib, 'boards', 'board_1', 'columns', 'col_1'), {
      title: 'Renamed by Contrib',
      wipLimit: 0,
      updatedAt: serverTimestamp(),
    })
  );

  // 7. Unauthorized Task Deletion
  await assertFails(deleteDoc(doc(dbContrib, 'boards', 'board_1', 'tasks', 'task_1')));

  // 8. Non-Admin Archived Board Mutation
  await assertFails(
    updateDoc(doc(dbCreator, 'boards', 'board_archived'), {
      title: 'Reopened',
      description: 'Nope',
      updatedAt: serverTimestamp(),
    })
  );

  // 9. Blanket List Scraping
  await assertFails(getDocs(collection(dbOutsider, 'boards')));
  await assertFails(getDocs(collection(dbOutsider, 'emailLookup')));
  await assertFails(getDocs(collection(dbOutsider, 'users')));
  await assertFails(getDocs(collection(dbOutsider, 'boards', 'board_1', 'invites')));

  // 10. BoardRef Orphan Spoofing
  await assertFails(
    setDoc(doc(dbOutsider, 'users', OUTSIDER.uid, 'boardRefs', 'board_1'), {
      boardId: 'board_1',
      userId: OUTSIDER.uid,
      boardTitle: 'Shared Board',
      boardOwnerId: CREATOR.uid,
      role: 'viewer',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 11. Shadow Field & Value Poisoning
  await assertFails(
    updateDoc(doc(dbContrib, 'boards', 'board_1', 'tasks', 'task_1'), {
      description: 'a'.repeat(3000),
      updatedAt: serverTimestamp(),
    })
  );

  // 12. PII Leak Attempt
  await assertFails(getDoc(doc(dbContrib, 'users', CREATOR.uid, 'private', 'info')));

  // 13. Outsider Assignee Injection
  await assertFails(
    updateDoc(doc(dbContrib, 'boards', 'board_1', 'tasks', 'task_1'), {
      assigneeId: OUTSIDER.uid,
      title: 'Existing Task',
      description: '',
      priority: 'medium',
      tags: [],
      dueDate: '',
      completed: false,
      updatedAt: serverTimestamp(),
    })
  );

  // 14. Chat Sender Spoofing & Outsider Chat Post
  await assertFails(
    setDoc(doc(dbOutsider, 'boards', 'board_1', 'messages', 'msg_bad1'), {
      id: 'msg_bad1',
      boardId: 'board_1',
      taskId: 'task_1',
      taskTitle: 'Existing Task',
      ownerId: CREATOR.uid,
      senderId: OUTSIDER.uid,
      senderName: 'Outsider',
      text: 'Hello',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(
    setDoc(doc(dbContrib, 'boards', 'board_1', 'messages', 'msg_bad2'), {
      id: 'msg_bad2',
      boardId: 'board_1',
      taskId: 'task_1',
      taskTitle: 'Existing Task',
      ownerId: CREATOR.uid,
      senderId: CREATOR.uid,
      senderName: 'Spoofed',
      text: 'Impersonated message',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 15. Unsafe Task Link Injection
  await assertFails(
    updateDoc(doc(dbContrib, 'boards', 'board_1', 'tasks', 'task_1'), {
      links: [{ label: 'Bad', url: 'javascript:alert(1)', kind: 'other' }],
      updatedAt: serverTimestamp(),
    })
  );

  // 16. Column Color Rule Poisoning
  await assertFails(
    updateDoc(doc(dbCreator, 'boards', 'board_1', 'columns', 'col_1'), {
      title: 'To Do',
      wipLimit: 0,
      colorRules: [{ threshold: -1, color: 'javascript:alert(1)' }],
      updatedAt: serverTimestamp(),
    })
  );

  // 17. Unwhitelisted Access Bypass
  await assertFails(
    setDoc(doc(dbBlocked, 'users', UNWHITELISTED.uid), {
      uid: UNWHITELISTED.uid,
      displayName: 'Blocked User',
      theme: 'light',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(getDocs(collection(dbBlocked, 'whitelist')));
  await assertFails(getDoc(doc(dbBlocked, 'whitelist', CREATOR.email)));
  await assertFails(
    setDoc(doc(dbBlocked, 'whitelist', UNWHITELISTED.email), {
      email: UNWHITELISTED.email,
      label: 'Self-added',
      active: true,
      addedBy: UNWHITELISTED.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(getDocs(collection(dbBlocked, 'accessCodes')));
  await assertFails(
    setDoc(doc(dbBlocked, 'whitelist', UNWHITELISTED.email), {
      email: UNWHITELISTED.email,
      label: 'Expired Cohort',
      active: true,
      addedBy: UNWHITELISTED.uid,
      inviteCode: 'CAD_INACTIVE',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // Positive assertions: Admin sees all boards; Contributor creates task; Viewer posts task chat; Outsider redeems viewer invite atomically
  await assertSucceeds(getDocs(collection(dbAdmin, 'boards')));
  await assertSucceeds(getDoc(doc(dbAdmin, 'boards', 'board_1')));
  await assertSucceeds(
    setDoc(doc(dbContrib, 'boards', 'board_1', 'tasks', 'task_ok'), {
      id: 'task_ok',
      boardId: 'board_1',
      columnId: 'col_1',
      ownerId: CREATOR.uid,
      createdBy: MEMBER_CONTRIB.uid,
      assigneeId: MEMBER_CONTRIB.uid,
      title: 'Allowed Task',
      description: '',
      priority: 'medium',
      position: 2000,
      tags: ['team'],
      dueDate: '',
      completed: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  await assertSucceeds(
    setDoc(doc(dbViewer, 'boards', 'board_1', 'messages', 'msg_ok1'), {
      id: 'msg_ok1',
      boardId: 'board_1',
      taskId: 'task_1',
      taskTitle: 'Existing Task',
      ownerId: CREATOR.uid,
      senderId: MEMBER_VIEWER.uid,
      senderName: 'Viewer',
      text: 'Looks good to me!',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  const joinBatch = writeBatch(dbOutsider);
  joinBatch.set(doc(dbOutsider, 'boards', 'board_1', 'members', OUTSIDER.uid), {
    uid: OUTSIDER.uid,
    boardId: 'board_1',
    ownerId: CREATOR.uid,
    displayName: 'New Viewer',
    role: 'viewer',
    canView: true,
    canCreateTasks: false,
    canEditTasks: false,
    canDeleteTasks: false,
    canManageColumns: false,
    inviteId: 'inv_viewer',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  joinBatch.set(doc(dbOutsider, 'users', OUTSIDER.uid, 'boardRefs', 'board_1'), {
    boardId: 'board_1',
    userId: OUTSIDER.uid,
    boardTitle: 'Shared Board',
    boardOwnerId: CREATOR.uid,
    role: 'viewer',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await assertSucceeds(joinBatch.commit());
  await assertSucceeds(getDocs(query(collection(dbViewer, 'boards', 'board_1', 'tasks'), where('boardId', '==', 'board_1'))));
  await assertSucceeds(
    updateDoc(doc(dbCreator, 'boards', 'board_1', 'columns', 'col_1'), {
      title: 'To Do',
      wipLimit: 4,
      colorRules: [{ threshold: 3, color: '#f59e0b' }, { threshold: 4, color: '#ef4444' }],
      updatedAt: serverTimestamp(),
    })
  );
  await assertSucceeds(getDoc(doc(dbBlocked, 'whitelist', UNWHITELISTED.email)));
  await assertSucceeds(getDocs(collection(dbAdmin, 'whitelist')));
  await assertSucceeds(
    setDoc(doc(dbAdmin, 'whitelist', 'student1@orangeusd.org'), {
      email: 'student1@orangeusd.org',
      label: 'Period 2',
      active: true,
      canCreateBoards: false,
      addedBy: ADMIN.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  await assertSucceeds(
    updateDoc(doc(dbAdmin, 'whitelist', 'student1@orangeusd.org'), {
      canCreateBoards: true,
      updatedAt: serverTimestamp(),
    })
  );
  await assertSucceeds(
    updateDoc(doc(dbAdmin, 'whitelist', 'student1@orangeusd.org'), {
      label: 'Period 3',
      active: false,
      canCreateBoards: false,
      updatedAt: serverTimestamp(),
    })
  );
  await assertSucceeds(deleteDoc(doc(dbAdmin, 'whitelist', 'student1@orangeusd.org')));
  await assertSucceeds(
    setDoc(doc(dbAdmin, 'accessCodes', 'CAD_SPRING26'), {
      id: 'CAD_SPRING26',
      label: 'Spring 26',
      active: true,
      canCreateBoards: false,
      createdBy: ADMIN.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(
    setDoc(doc(dbBlocked, 'whitelist', UNWHITELISTED.email), {
      email: UNWHITELISTED.email,
      label: 'Spring 26',
      active: true,
      canCreateBoards: true,
      addedBy: UNWHITELISTED.uid,
      inviteCode: 'CAD_SPRING26',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  await assertSucceeds(
    setDoc(doc(dbBlocked, 'whitelist', UNWHITELISTED.email), {
      email: UNWHITELISTED.email,
      label: 'Spring 26',
      active: true,
      canCreateBoards: false,
      addedBy: UNWHITELISTED.uid,
      inviteCode: 'CAD_SPRING26',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(
    setDoc(doc(dbOutsider, 'boards', 'board_denied'), {
      id: 'board_denied',
      ownerId: OUTSIDER.uid,
      title: 'Unauthorized Board',
      description: 'No create permission',
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  await assertSucceeds(
    setDoc(doc(dbCreator, 'boards', 'board_allowed'), {
      id: 'board_allowed',
      ownerId: CREATOR.uid,
      title: 'Creator Board',
      description: 'Allowed to create',
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  await assertSucceeds(deleteDoc(doc(dbAdmin, 'accessCodes', 'CAD_SPRING26')));

  await testEnv.cleanup();
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
