import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-ovms-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

const getDb = (auth?: { uid: string, email?: string }) => {
  return testEnv.authenticatedContext(auth?.uid || 'anon', auth?.email ? { email: auth.email } : undefined).firestore();
};

const getUnauthDb = () => {
  return testEnv.unauthenticatedContext().firestore();
};

// Test setup helpers
async function setupUser(uid: string, role: string, tenantId: string | null = null, siteIds: string[] = [], accountStatus = 'ACTIVE') {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', uid), {
      uid,
      role,
      tenantId,
      siteIds,
      accountStatus,
      email: `${uid}@example.com`
    });
  });
}

describe('Firestore Security Rules', () => {
  // 1. Unauthenticated users denied
  it('1. Unauthenticated users denied', async () => {
    const db = getUnauthDb();
    await assertFails(getDoc(doc(db, 'users', 'some_user')));
    await assertFails(getDoc(doc(db, 'priorities', 'some_prio')));
  });

  // 2. Viewer can read permitted tenant/site data
  it('2. Viewer can read permitted tenant/site data', async () => {
    await setupUser('viewer1', 'VIEWER', 'tenant1', ['site1']);
    
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'locations', 'loc1'), { tenantId: 'tenant1', siteId: 'site1' });
    });

    const db = getDb({ uid: 'viewer1' });
    await assertSucceeds(getDoc(doc(db, 'locations', 'loc1')));
  });

  // 3. Viewer cannot write
  it('3. Viewer cannot write', async () => {
    await setupUser('viewer1', 'VIEWER', 'tenant1', ['site1']);
    const db = getDb({ uid: 'viewer1' });
    await assertFails(setDoc(doc(db, 'locations', 'loc2'), { tenantId: 'tenant1', siteId: 'site1' }));
  });

  // 4. Planner can write planning data in assigned site
  it('4. Planner can write planning data in assigned site', async () => {
    await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
    const db = getDb({ uid: 'planner1' });
    await assertSucceeds(setDoc(doc(db, 'productionPlanEntries', 'entry1'), { tenantId: 'tenant1', siteId: 'site1' }));
  });

  // 5. Planner cannot access another tenant
  it('5. Planner cannot access another tenant', async () => {
    await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
    const db = getDb({ uid: 'planner1' });
    await assertFails(setDoc(doc(db, 'productionPlanEntries', 'entry2'), { tenantId: 'tenant2', siteId: 'site1' }));
  });

  // 6. Planner cannot access an unassigned site
  it('6. Planner cannot access an unassigned site', async () => {
    await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
    const db = getDb({ uid: 'planner1' });
    await assertFails(setDoc(doc(db, 'productionPlanEntries', 'entry3'), { tenantId: 'tenant1', siteId: 'site2' }));
  });

  // 7. Warehouse operator can update execution fields only
  it('7. Warehouse operator can update execution fields only', async () => {
    await setupUser('wh_op', 'WAREHOUSE_OPERATOR', 'tenant1', ['site1']);
    
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'priorities', 'prio1'), { 
        tenantId: 'tenant1', 
        siteId: 'site1', 
        status: 'PENDING',
        priorityCode: 'URGENT'
      });
    });

    const db = getDb({ uid: 'wh_op' });
    await assertSucceeds(updateDoc(doc(db, 'priorities', 'prio1'), { 
      status: 'IN_PROGRESS',
      warehouseProgress: 'Started picking',
      modifiedDate: serverTimestamp()
    }));
  });

  // 8. Warehouse operator cannot change priority instructions
  it('8. Warehouse operator cannot change priority instructions', async () => {
    await setupUser('wh_op', 'WAREHOUSE_OPERATOR', 'tenant1', ['site1']);
    
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'priorities', 'prio2'), { 
        tenantId: 'tenant1', 
        siteId: 'site1', 
        status: 'PENDING',
        priorityCode: 'URGENT',
        instructedQuantity: 100
      });
    });

    const db = getDb({ uid: 'wh_op' });
    await assertFails(updateDoc(doc(db, 'priorities', 'prio2'), { 
      priorityCode: 'LOW'
    }));
  });

  // 9. Display user reading assigned site dashboard data
  it('9. Display user reading assigned site dashboard data succeeds', async () => {
    await setupUser('disp1', 'DISPLAY', 'tenant1', ['site1']);
    
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'priorities', 'prio_disp'), { tenantId: 'tenant1', siteId: 'site1' });
      await setDoc(doc(db, 'announcements', 'ann_disp'), { tenantId: 'tenant1', siteId: 'site1' });
    });

    const db = getDb({ uid: 'disp1' });
    await assertSucceeds(getDoc(doc(db, 'priorities', 'prio_disp')));
    await assertSucceeds(getDoc(doc(db, 'announcements', 'ann_disp')));
  });

  // 10. Display user reading another site is denied
  it('10. Display user reading another site is denied', async () => {
    await setupUser('disp1', 'DISPLAY', 'tenant1', ['site1']);
    
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'priorities', 'prio_site2'), { tenantId: 'tenant1', siteId: 'site2' });
    });

    const db = getDb({ uid: 'disp1' });
    await assertFails(getDoc(doc(db, 'priorities', 'prio_site2')));
  });

  // 11. Display user writing any record is denied
  it('11. Display user writing any record is denied', async () => {
    await setupUser('disp1', 'DISPLAY', 'tenant1', ['site1']);
    const db = getDb({ uid: 'disp1' });

    await assertFails(setDoc(doc(db, 'priorities', 'new_prio'), { tenantId: 'tenant1', siteId: 'site1' }));
    await assertFails(setDoc(doc(db, 'announcements', 'new_ann'), { tenantId: 'tenant1', siteId: 'site1' }));
    await assertFails(setDoc(doc(db, 'exceptions', 'new_ex'), { tenantId: 'tenant1', siteId: 'site1' }));
  });

  // 12. Display user reading forbidden collections (users, audit logs, import source rows) is denied
  it('12. Display user reading forbidden collections is denied', async () => {
    await setupUser('disp1', 'DISPLAY', 'tenant1', ['site1']);
    await setupUser('other_user', 'PLANNER', 'tenant1', ['site1']);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'auditLogs', 'log_disp'), { tenantId: 'tenant1', siteId: 'site1' });
      await setDoc(doc(db, 'productionPlanImports', 'imp_disp'), { tenantId: 'tenant1', siteId: 'site1' });
    });

    const db = getDb({ uid: 'disp1' });
    await assertFails(getDoc(doc(db, 'users', 'other_user')));
    await assertFails(getDoc(doc(db, 'auditLogs', 'log_disp')));
    await assertFails(getDoc(doc(db, 'productionPlanImports', 'imp_disp')));
  });

  // 13. Platform Superuser has access to all tenants and sites
  it('13. Superuser access across tenants succeeds', async () => {
    await setupUser('super1', 'PLATFORM_SUPERUSER', null);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'locations', 'loc_t1'), { tenantId: 'tenant1', siteId: 'site1' });
      await setDoc(doc(db, 'locations', 'loc_t2'), { tenantId: 'tenant2', siteId: 'site2' });
    });

    const db = getDb({ uid: 'super1' });
    await assertSucceeds(getDoc(doc(db, 'locations', 'loc_t1')));
    await assertSucceeds(getDoc(doc(db, 'locations', 'loc_t2')));
    await assertSucceeds(setDoc(doc(db, 'tenants', 'new_tenant'), { tenantName: 'Tenant 3' }));
  });

  // 14. Tenant admin tenant isolation
  it('14. Tenant admin tenant isolation enforces bounds', async () => {
    await setupUser('admin1', 'TENANT_ADMIN', 'tenant1');

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'siteSettings', 'set_t2'), { tenantId: 'tenant2', siteId: 'site2' });
    });

    const db = getDb({ uid: 'admin1' });
    await assertFails(updateDoc(doc(db, 'siteSettings', 'set_t2'), { settingValue: 'hacked' }));
  });

  // 15. Committed production import rows cannot be edited
  it('15. Committed production import rows cannot be edited', async () => {
    await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
    
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'productionPlanImports', 'import1'), { 
        tenantId: 'tenant1', siteId: 'site1', status: 'COMMITTED' 
      });
      await setDoc(doc(db, 'productionPlanImports', 'import1', 'rows', 'row1'), {
        tenantId: 'tenant1', siteId: 'site1'
      });
    });

    const db = getDb({ uid: 'planner1' });
    await assertFails(updateDoc(doc(db, 'productionPlanImports', 'import1', 'rows', 'row1'), {
      someField: 'changed'
    }));
  });
});
