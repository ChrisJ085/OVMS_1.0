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
  if (testEnv) {
    await testEnv.clearFirestore();
  }
});

afterAll(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
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

  // 16. Planner changes another tenant’s product tenantId to their own tenant
  it('16. Planner changes another tenant’s product tenantId to their own tenant', async () => {
    await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
    
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'products', 'prod_t2'), {
        tenantId: 'tenant2',
        siteId: 'site1',
        productName: 'Other Product'
      });
    });

    const db = getDb({ uid: 'planner1' });
    await assertFails(updateDoc(doc(db, 'products', 'prod_t2'), {
      tenantId: 'tenant1'
    }));
  });

  // 17. Planner changes a product siteId to an assigned site
  it('17. Planner changes a product siteId to an assigned site', async () => {
    await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'products', 'prod_s2'), {
        tenantId: 'tenant1',
        siteId: 'site2',
        productName: 'S2 Product'
      });
    });

    const db = getDb({ uid: 'planner1' });
    await assertFails(updateDoc(doc(db, 'products', 'prod_s2'), {
      siteId: 'site1'
    }));
  });

  // 18. Planner changes an assigned-site document to another assigned site
  it('18. Planner changes an assigned-site document to another assigned site', async () => {
    await setupUser('planner_multi', 'PLANNER', 'tenant1', ['site1', 'site2']);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'products', 'prod_multi'), {
        tenantId: 'tenant1',
        siteId: 'site1',
        productName: 'Multi Product'
      });
    });

    const db = getDb({ uid: 'planner_multi' });
    await assertFails(updateDoc(doc(db, 'products', 'prod_multi'), {
      siteId: 'site2'
    }));
  });

  // 19. Tenant admin changes another tenant document ownership
  it('19. Tenant admin changes another tenant document ownership', async () => {
    await setupUser('admin1', 'TENANT_ADMIN', 'tenant1');

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'siteSettings', 'set_t2'), {
        tenantId: 'tenant2',
        siteId: 'site2',
        settingValue: 'original'
      });
    });

    const db = getDb({ uid: 'admin1' });
    await assertFails(updateDoc(doc(db, 'siteSettings', 'set_t2'), {
      tenantId: 'tenant1'
    }));
  });

  // 20. Warehouse operator changes tenantId during progress update
  it('20. Warehouse operator changes tenantId during progress update', async () => {
    await setupUser('wh_op', 'WAREHOUSE_OPERATOR', 'tenant1', ['site1']);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'priorities', 'prio_wh_tenant'), {
        tenantId: 'tenant1',
        siteId: 'site1',
        status: 'PENDING'
      });
    });

    const db = getDb({ uid: 'wh_op' });
    await assertFails(updateDoc(doc(db, 'priorities', 'prio_wh_tenant'), {
      tenantId: 'tenant2',
      status: 'IN_PROGRESS',
      warehouseProgress: 'Started'
    }));
  });

  // 21. Warehouse operator changes siteId during progress update
  it('21. Warehouse operator changes siteId during progress update', async () => {
    await setupUser('wh_op', 'WAREHOUSE_OPERATOR', 'tenant1', ['site1']);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'priorities', 'prio_wh_site'), {
        tenantId: 'tenant1',
        siteId: 'site1',
        status: 'PENDING'
      });
    });

    const db = getDb({ uid: 'wh_op' });
    await assertFails(updateDoc(doc(db, 'priorities', 'prio_wh_site'), {
      siteId: 'site2',
      status: 'IN_PROGRESS',
      warehouseProgress: 'Started'
    }));
  });

  // 22. Planner updates a legitimate field while ownership remains unchanged
  it('22. Planner updates a legitimate field while ownership remains unchanged', async () => {
    await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'promotions', 'promo1'), {
        tenantId: 'tenant1',
        siteId: 'site1',
        promoName: 'Old Promo'
      });
    });

    const db = getDb({ uid: 'planner1' });
    await assertSucceeds(updateDoc(doc(db, 'promotions', 'promo1'), {
      tenantId: 'tenant1',
      siteId: 'site1',
      promoName: 'New Promo'
    }));
  });

  // 23. Superuser updates a record without changing ownership
  it('23. Superuser updates a record without changing ownership', async () => {
    await setupUser('super1', 'PLATFORM_SUPERUSER', null);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'promotions', 'promo2'), {
        tenantId: 'tenant1',
        siteId: 'site1',
        promoName: 'Old Promo'
      });
    });

    const db = getDb({ uid: 'super1' });
    await assertSucceeds(updateDoc(doc(db, 'promotions', 'promo2'), {
      tenantId: 'tenant1',
      siteId: 'site1',
      promoName: 'Super Updated Promo'
    }));
  });

  // 24. Committed production import ownership cannot change
  it('24. Committed production import ownership cannot change', async () => {
    await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'productionPlanImports', 'import_comm'), {
        tenantId: 'tenant1',
        siteId: 'site1',
        status: 'COMMITTED'
      });
    });

    const db = getDb({ uid: 'planner1' });
    await assertFails(updateDoc(doc(db, 'productionPlanImports', 'import_comm'), {
      tenantId: 'tenant2'
    }));
  });

  // 25. Production import row ownership cannot change
  it('25. Production import row ownership cannot change', async () => {
    await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'productionPlanImports', 'import_row', 'rows', 'row1'), {
        tenantId: 'tenant1',
        siteId: 'site1',
        importId: 'import_row'
      });
    });

    const db = getDb({ uid: 'planner1' });
    await assertFails(updateDoc(doc(db, 'productionPlanImports', 'import_row', 'rows', 'row1'), {
      tenantId: 'tenant2'
    }));
  });

  // 26. Announcement ownership cannot change
  it('26. Announcement ownership cannot change', async () => {
    await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'announcements', 'ann1'), {
        tenantId: 'tenant1',
        siteId: 'site1',
        title: 'Original Title'
      });
    });

    const db = getDb({ uid: 'planner1' });
    await assertFails(updateDoc(doc(db, 'announcements', 'ann1'), {
      tenantId: 'tenant2'
    }));
  });

  // 27. Priority ownership cannot change
  it('27. Priority ownership cannot change', async () => {
    await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'priorities', 'prio1'), {
        tenantId: 'tenant1',
        siteId: 'site1',
        priorityCode: 'URGENT'
      });
    });

    const db = getDb({ uid: 'planner1' });
    await assertFails(updateDoc(doc(db, 'priorities', 'prio1'), {
      tenantId: 'tenant2'
    }));
  });

  // --- New User Profile Access Hardening Tests ---

  // 1. User reads own profile.
  it('User reads own profile', async () => {
    await setupUser('planner_user', 'PLANNER', 'tenant1', ['site1']);
    const db = getDb({ uid: 'planner_user' });
    await assertSucceeds(getDoc(doc(db, 'users', 'planner_user')));
  });

  // 2. Viewer cannot read another viewer.
  it('Viewer cannot read another viewer', async () => {
    await setupUser('viewer_a', 'VIEWER', 'tenant1', ['site1']);
    await setupUser('viewer_b', 'VIEWER', 'tenant1', ['site1']);
    const db = getDb({ uid: 'viewer_a' });
    await assertFails(getDoc(doc(db, 'users', 'viewer_b')));
  });

  // 3. Planner cannot read warehouse operator profile.
  it('Planner cannot read warehouse operator profile', async () => {
    await setupUser('planner_u', 'PLANNER', 'tenant1', ['site1']);
    await setupUser('wh_op_u', 'WAREHOUSE_OPERATOR', 'tenant1', ['site1']);
    const db = getDb({ uid: 'planner_u' });
    await assertFails(getDoc(doc(db, 'users', 'wh_op_u')));
  });

  // 4. Warehouse operator cannot read planner profile.
  it('Warehouse operator cannot read planner profile', async () => {
    await setupUser('planner_u', 'PLANNER', 'tenant1', ['site1']);
    await setupUser('wh_op_u', 'WAREHOUSE_OPERATOR', 'tenant1', ['site1']);
    const db = getDb({ uid: 'wh_op_u' });
    await assertFails(getDoc(doc(db, 'users', 'planner_u')));
  });

  // 5. Display cannot read another user.
  it('Display cannot read another user', async () => {
    await setupUser('display_u', 'DISPLAY', 'tenant1', ['site1']);
    await setupUser('planner_u', 'PLANNER', 'tenant1', ['site1']);
    const db = getDb({ uid: 'display_u' });
    await assertFails(getDoc(doc(db, 'users', 'planner_u')));
  });

  // 6. Tenant admin reads user in same tenant.
  it('Tenant admin reads user in same tenant', async () => {
    await setupUser('admin_t1', 'TENANT_ADMIN', 'tenant1');
    await setupUser('planner_t1', 'PLANNER', 'tenant1', ['site1']);
    const db = getDb({ uid: 'admin_t1' });
    await assertSucceeds(getDoc(doc(db, 'users', 'planner_t1')));
  });

  // 7. Tenant admin cannot read user in another tenant.
  it('Tenant admin cannot read user in another tenant', async () => {
    await setupUser('admin_t1', 'TENANT_ADMIN', 'tenant1');
    await setupUser('planner_t2', 'PLANNER', 'tenant2', ['site2']);
    const db = getDb({ uid: 'admin_t1' });
    await assertFails(getDoc(doc(db, 'users', 'planner_t2')));
  });

  // 8. Tenant admin cannot read platform superuser.
  it('Tenant admin cannot read platform superuser', async () => {
    await setupUser('admin_t1', 'TENANT_ADMIN', 'tenant1');
    await setupUser('super_u', 'PLATFORM_SUPERUSER', null);
    const db = getDb({ uid: 'admin_t1' });
    await assertFails(getDoc(doc(db, 'users', 'super_u')));
  });

  // 9. Platform superuser reads all users.
  it('Platform superuser reads all users', async () => {
    await setupUser('super_u', 'PLATFORM_SUPERUSER', null);
    await setupUser('planner_t1', 'PLANNER', 'tenant1', ['site1']);
    await setupUser('planner_t2', 'PLANNER', 'tenant2', ['site2']);
    const db = getDb({ uid: 'super_u' });
    await assertSucceeds(getDoc(doc(db, 'users', 'planner_t1')));
    await assertSucceeds(getDoc(doc(db, 'users', 'planner_t2')));
  });

  // 10. Unauthenticated user denied.
  it('Unauthenticated user denied reading profiles', async () => {
    await setupUser('planner_t1', 'PLANNER', 'tenant1', ['site1']);
    const db = getUnauthDb();
    await assertFails(getDoc(doc(db, 'users', 'planner_t1')));
  });

  // 11. Tenant-admin list query succeeds only with tenant filter.
  it('Tenant-admin list query succeeds only with tenant filter', async () => {
    await setupUser('admin_t1', 'TENANT_ADMIN', 'tenant1');
    await setupUser('planner_t1', 'PLANNER', 'tenant1', ['site1']);
    const db = getDb({ uid: 'admin_t1' });
    const q = query(collection(db, 'users'), where('tenantId', '==', 'tenant1'), where('role', '!=', 'PLATFORM_SUPERUSER'));
    await assertSucceeds(getDocs(q));
  });

  // 12. Unfiltered tenant-admin users query fails where appropriate.
  it('Unfiltered tenant-admin users query fails where appropriate', async () => {
    await setupUser('admin_t1', 'TENANT_ADMIN', 'tenant1');
    const db = getDb({ uid: 'admin_t1' });
    const q = collection(db, 'users');
    await assertFails(getDocs(q));
  });

  describe('Adversarial and Exploit-Oriented Security Tests', () => {
    // --- OWNERSHIP MUTATION TESTS ---
    it('1. Planner changes another tenant’s product tenantId to their own tenant', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'products', 'prod_p1'), { tenantId: 'tenant2', siteId: 'site1', productName: 'T2 Product' });
      });
      const db = getDb({ uid: 'planner1' });
      await assertFails(updateDoc(doc(db, 'products', 'prod_p1'), { tenantId: 'tenant1' }));
    });

    it('2. Planner changes siteId of an existing record', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'products', 'prod_p2'), { tenantId: 'tenant1', siteId: 'site1', productName: 'T1 Product' });
      });
      const db = getDb({ uid: 'planner1' });
      await assertFails(updateDoc(doc(db, 'products', 'prod_p2'), { siteId: 'site2' }));
    });

    it('3. Warehouse operator changes tenantId during execution update', async () => {
      await setupUser('operator1', 'WAREHOUSE_OPERATOR', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'priorities', 'prio_op1'), { tenantId: 'tenant1', siteId: 'site1', status: 'PENDING' });
      });
      const db = getDb({ uid: 'operator1' });
      await assertFails(updateDoc(doc(db, 'priorities', 'prio_op1'), { tenantId: 'tenant2', status: 'IN_PROGRESS' }));
    });

    it('4. Warehouse operator changes siteId during execution update', async () => {
      await setupUser('operator1', 'WAREHOUSE_OPERATOR', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'priorities', 'prio_op2'), { tenantId: 'tenant1', siteId: 'site1', status: 'PENDING' });
      });
      const db = getDb({ uid: 'operator1' });
      await assertFails(updateDoc(doc(db, 'priorities', 'prio_op2'), { siteId: 'site2', status: 'IN_PROGRESS' }));
    });

    it('5. Tenant admin moves a user profile into their tenant', async () => {
      await setupUser('admin1', 'TENANT_ADMIN', 'tenant1');
      await setupUser('planner_t2', 'PLANNER', 'tenant2', ['site2']);
      const db = getDb({ uid: 'admin1' });
      await assertFails(updateDoc(doc(db, 'users', 'planner_t2'), { tenantId: 'tenant1' }));
    });

    it('6. Planner changes a production import tenant', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'productionPlanImports', 'imp_p1'), { tenantId: 'tenant1', siteId: 'site1', status: 'PENDING' });
      });
      const db = getDb({ uid: 'planner1' });
      await assertFails(updateDoc(doc(db, 'productionPlanImports', 'imp_p1'), { tenantId: 'tenant2' }));
    });

    it('7. Planner changes a committed import row site', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'productionPlanImports', 'imp_p2'), { tenantId: 'tenant1', siteId: 'site1', status: 'COMMITTED' });
        await setDoc(doc(db, 'productionPlanImports', 'imp_p2', 'rows', 'row1'), { tenantId: 'tenant1', siteId: 'site1', importId: 'imp_p2' });
      });
      const db = getDb({ uid: 'planner1' });
      await assertFails(updateDoc(doc(db, 'productionPlanImports', 'imp_p2', 'rows', 'row1'), { siteId: 'site2' }));
    });

    it('8. Viewer attempts to convert a read-only record into their tenant', async () => {
      await setupUser('viewer1', 'VIEWER', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'products', 'prod_v1'), { tenantId: 'tenant2', siteId: 'site1', productName: 'T2 Product' });
      });
      const db = getDb({ uid: 'viewer1' });
      await assertFails(updateDoc(doc(db, 'products', 'prod_v1'), { tenantId: 'tenant1' }));
    });

    // --- USER SECURITY TESTS ---
    it('9. User attempts to change own role', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'planner1' });
      await assertFails(updateDoc(doc(db, 'users', 'planner1'), { role: 'PLATFORM_SUPERUSER' }));
    });

    it('10. User attempts to change own tenantId', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'planner1' });
      await assertFails(updateDoc(doc(db, 'users', 'planner1'), { tenantId: 'tenant2' }));
    });

    it('11. User attempts to change own siteIds', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'planner1' });
      await assertFails(updateDoc(doc(db, 'users', 'planner1'), { siteIds: ['site1', 'site2'] }));
    });

    it('12. User attempts to reactivate a disabled account', async () => {
      await setupUser('disabled1', 'PLANNER', 'tenant1', ['site1'], 'DISABLED');
      const db = getDb({ uid: 'disabled1' });
      await assertFails(updateDoc(doc(db, 'users', 'disabled1'), { accountStatus: 'ACTIVE' }));
    });

    it('13. Tenant admin attempts to promote a user to PLATFORM_SUPERUSER', async () => {
      await setupUser('admin1', 'TENANT_ADMIN', 'tenant1');
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'admin1' });
      await assertFails(updateDoc(doc(db, 'users', 'planner1'), { role: 'PLATFORM_SUPERUSER' }));
    });

    it('14. Tenant admin attempts to modify an existing PLATFORM_SUPERUSER', async () => {
      await setupUser('admin1', 'TENANT_ADMIN', 'tenant1');
      await setupUser('super1', 'PLATFORM_SUPERUSER', null);
      const db = getDb({ uid: 'admin1' });
      await assertFails(updateDoc(doc(db, 'users', 'super1'), { displayName: 'Hacked' }));
    });

    it('15. Planner attempts to read another user profile', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      await setupUser('planner2', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'planner1' });
      await assertFails(getDoc(doc(db, 'users', 'planner2')));
    });

    it('16. Display attempts to read another user profile', async () => {
      await setupUser('display1', 'DISPLAY', 'tenant1', ['site1']);
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'display1' });
      await assertFails(getDoc(doc(db, 'users', 'planner1')));
    });

    it('17. Client attempts direct users document creation', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'planner1' });
      await assertFails(setDoc(doc(db, 'users', 'direct_create'), { uid: 'direct_create', role: 'PLANNER', tenantId: 'tenant1' }));
    });

    // --- SESSION TESTS ---
    it('18. User creates a session for another UID', async () => {
      await setupUser('user1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'user1' });
      await assertFails(setDoc(doc(db, 'sessions', 'sess1'), { userId: 'user2', tenantId: 'tenant1' }));
    });

    it('19. User changes session userId', async () => {
      await setupUser('user1', 'PLANNER', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'sessions', 'sess1'), { userId: 'user1', tenantId: 'tenant1' });
      });
      const db = getDb({ uid: 'user1' });
      await assertFails(updateDoc(doc(db, 'sessions', 'sess1'), { userId: 'user2' }));
    });

    it('20. User changes session tenantId', async () => {
      await setupUser('user1', 'PLANNER', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'sessions', 'sess1'), { userId: 'user1', tenantId: 'tenant1' });
      });
      const db = getDb({ uid: 'user1' });
      await assertFails(updateDoc(doc(db, 'sessions', 'sess1'), { tenantId: 'tenant2' }));
    });

    it('21. User changes session to an unassigned site', async () => {
      await setupUser('user1', 'PLANNER', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'sessions', 'sess1'), { userId: 'user1', tenantId: 'tenant1', siteId: 'site1' });
      });
      const db = getDb({ uid: 'user1' });
      await assertFails(updateDoc(doc(db, 'sessions', 'sess1'), { siteId: 'site2' }));
    });

    it('22. User updates another user’s session', async () => {
      await setupUser('user1', 'PLANNER', 'tenant1', ['site1']);
      await setupUser('user2', 'PLANNER', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'sessions', 'sess2'), { userId: 'user2', tenantId: 'tenant1' });
      });
      const db = getDb({ uid: 'user1' });
      await assertFails(updateDoc(doc(db, 'sessions', 'sess2'), { lastActivityAt: serverTimestamp() }));
    });

    it('23. Tenant admin reads another tenant’s session', async () => {
      await setupUser('admin1', 'TENANT_ADMIN', 'tenant1');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'sessions', 'sess2'), { userId: 'user2', tenantId: 'tenant2' });
      });
      const db = getDb({ uid: 'admin1' });
      await assertFails(getDoc(doc(db, 'sessions', 'sess2')));
    });

    // --- AUDIT TESTS ---
    it('24. User forges performedBy', async () => {
      await setupUser('user1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'user1' });
      await assertFails(setDoc(doc(db, 'auditLogs', 'log1'), { userId: 'user1', performedBy: 'user2', tenantId: 'tenant1', siteId: 'site1', createdDate: serverTimestamp() }));
    });

    it('25. User forges userId', async () => {
      await setupUser('user1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'user1' });
      await assertFails(setDoc(doc(db, 'auditLogs', 'log1'), { userId: 'user2', performedBy: 'user1', tenantId: 'tenant1', siteId: 'site1', createdDate: serverTimestamp() }));
    });

    it('26. User writes audit log for another tenant', async () => {
      await setupUser('user1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'user1' });
      await assertFails(setDoc(doc(db, 'auditLogs', 'log1'), { userId: 'user1', performedBy: 'user1', tenantId: 'tenant2', siteId: 'site1', createdDate: serverTimestamp() }));
    });

    it('27. User writes audit log for unassigned site', async () => {
      await setupUser('user1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'user1' });
      await assertFails(setDoc(doc(db, 'auditLogs', 'log1'), { userId: 'user1', performedBy: 'user1', tenantId: 'tenant1', siteId: 'site2', createdDate: serverTimestamp() }));
    });

    it('28. User writes invalid createdDate', async () => {
      await setupUser('user1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'user1' });
      await assertFails(setDoc(doc(db, 'auditLogs', 'log1'), { userId: 'user1', performedBy: 'user1', tenantId: 'tenant1', siteId: 'site1', createdDate: 'invalid-date' }));
    });

    it('29. Ordinary user updates audit log', async () => {
      await setupUser('user1', 'PLANNER', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'auditLogs', 'log1'), { userId: 'user1', performedBy: 'user1', tenantId: 'tenant1', siteId: 'site1', createdDate: serverTimestamp() });
      });
      const db = getDb({ uid: 'user1' });
      await assertFails(updateDoc(doc(db, 'auditLogs', 'log1'), { summary: 'Hacked' }));
    });

    it('30. Ordinary user deletes audit log', async () => {
      await setupUser('user1', 'PLANNER', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'auditLogs', 'log1'), { userId: 'user1', performedBy: 'user1', tenantId: 'tenant1', siteId: 'site1', createdDate: serverTimestamp() });
      });
      const db = getDb({ uid: 'user1' });
      await assertFails(deleteDoc(doc(db, 'auditLogs', 'log1')));
    });

    // --- DISPLAY TESTS ---
    it('31. Display reading full priorities is denied, reading displayPriorities succeeds', async () => {
      await setupUser('display1', 'DISPLAY', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'priorities', 'prio1'), { tenantId: 'tenant1', siteId: 'site1' });
        await setDoc(doc(db, 'displayPriorities', 'prio_disp'), { tenantId: 'tenant1', siteId: 'site1', priorityCode: 'SKU1' });
      });
      const db = getDb({ uid: 'display1' });
      await assertFails(getDoc(doc(db, 'priorities', 'prio1')));
      await assertSucceeds(getDoc(doc(db, 'displayPriorities', 'prio_disp')));
    });

    it('32. Display reads another site’s priorities', async () => {
      await setupUser('display1', 'DISPLAY', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'priorities', 'prio2'), { tenantId: 'tenant1', siteId: 'site2' });
      });
      const db = getDb({ uid: 'display1' });
      await assertFails(getDoc(doc(db, 'priorities', 'prio2')));
    });

    it('33. Display writes priority', async () => {
      await setupUser('display1', 'DISPLAY', 'tenant1', ['site1']);
      const db = getDb({ uid: 'display1' });
      await assertFails(setDoc(doc(db, 'priorities', 'prio1'), { tenantId: 'tenant1', siteId: 'site1' }));
    });

    it('34. Display reads import rows', async () => {
      await setupUser('display1', 'DISPLAY', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'productionPlanImports', 'imp1'), { tenantId: 'tenant1', siteId: 'site1', status: 'PENDING' });
        await setDoc(doc(db, 'productionPlanImports', 'imp1', 'rows', 'row1'), { tenantId: 'tenant1', siteId: 'site1', importId: 'imp1' });
      });
      const db = getDb({ uid: 'display1' });
      await assertFails(getDoc(doc(db, 'productionPlanImports', 'imp1', 'rows', 'row1')));
    });

    it('35. Display reads audit logs', async () => {
      await setupUser('display1', 'DISPLAY', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'auditLogs', 'log1'), { tenantId: 'tenant1', siteId: 'site1', userId: 'user1' });
      });
      const db = getDb({ uid: 'display1' });
      await assertFails(getDoc(doc(db, 'auditLogs', 'log1')));
    });

    it('36. Display reads users', async () => {
      await setupUser('display1', 'DISPLAY', 'tenant1', ['site1']);
      await setupUser('user2', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'display1' });
      await assertFails(getDoc(doc(db, 'users', 'user2')));
    });

    it('37. Display reads dashboard-safe site settings', async () => {
      await setupUser('display1', 'DISPLAY', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'siteSettings', 'set1'), { tenantId: 'tenant1', siteId: 'site1', isSensitive: false });
      });
      const db = getDb({ uid: 'display1' });
      await assertSucceeds(getDoc(doc(db, 'siteSettings', 'set1')));
    });

    it('38. Display cannot read sensitive site configuration', async () => {
      await setupUser('display1', 'DISPLAY', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'siteSettings', 'set2'), { tenantId: 'tenant1', siteId: 'site1', isSensitive: true });
      });
      const db = getDb({ uid: 'display1' });
      await assertFails(getDoc(doc(db, 'siteSettings', 'set2')));
    });

    // --- PRODUCTION IMPORT TESTS ---
    it('39. Planner creates import in assigned site', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'planner1' });
      await assertSucceeds(setDoc(doc(db, 'productionPlanImports', 'imp1'), { tenantId: 'tenant1', siteId: 'site1', status: 'PENDING' }));
    });

    it('40. Planner creates import in unassigned site', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'planner1' });
      await assertFails(setDoc(doc(db, 'productionPlanImports', 'imp1'), { tenantId: 'tenant1', siteId: 'site2', status: 'PENDING' }));
    });

    it('41. Planner updates uncommitted import', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'productionPlanImports', 'imp1'), { tenantId: 'tenant1', siteId: 'site1', status: 'PENDING' });
      });
      const db = getDb({ uid: 'planner1' });
      await assertSucceeds(updateDoc(doc(db, 'productionPlanImports', 'imp1'), { fileName: 'new_file.csv' }));
    });

    it('42. Planner edits committed import', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'productionPlanImports', 'imp1'), { tenantId: 'tenant1', siteId: 'site1', status: 'COMMITTED' });
      });
      const db = getDb({ uid: 'planner1' });
      await assertFails(updateDoc(doc(db, 'productionPlanImports', 'imp1'), { fileName: 'edited.csv' }));
    });

    it('43. Planner edits row under committed import', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'productionPlanImports', 'imp1'), { tenantId: 'tenant1', siteId: 'site1', status: 'COMMITTED' });
        await setDoc(doc(db, 'productionPlanImports', 'imp1', 'rows', 'row1'), { tenantId: 'tenant1', siteId: 'site1', importId: 'imp1' });
      });
      const db = getDb({ uid: 'planner1' });
      await assertFails(updateDoc(doc(db, 'productionPlanImports', 'imp1', 'rows', 'row1'), { productName: 'different' }));
    });

    it('44. Planner deletes committed import', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'productionPlanImports', 'imp1'), { tenantId: 'tenant1', siteId: 'site1', status: 'COMMITTED' });
      });
      const db = getDb({ uid: 'planner1' });
      await assertFails(deleteDoc(doc(db, 'productionPlanImports', 'imp1')));
    });

    it('45. Planner changes import ownership', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'productionPlanImports', 'imp1'), { tenantId: 'tenant1', siteId: 'site1', status: 'PENDING' });
      });
      const db = getDb({ uid: 'planner1' });
      await assertFails(updateDoc(doc(db, 'productionPlanImports', 'imp1'), { tenantId: 'tenant2' }));
    });

    it('46. Superuser reads historic imports', async () => {
      await setupUser('super1', 'PLATFORM_SUPERUSER', null);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'productionPlanImports', 'imp1'), { tenantId: 'tenant1', siteId: 'site1', status: 'COMMITTED' });
      });
      const db = getDb({ uid: 'super1' });
      await assertSucceeds(getDoc(doc(db, 'productionPlanImports', 'imp1')));
    });

    it('47. Display denied import history', async () => {
      await setupUser('display1', 'DISPLAY', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'productionPlanImports', 'imp1'), { tenantId: 'tenant1', siteId: 'site1', status: 'COMMITTED' });
      });
      const db = getDb({ uid: 'display1' });
      await assertFails(getDoc(doc(db, 'productionPlanImports', 'imp1')));
    });

    // --- QUERY TESTS ---
    it('48. Correctly filtered tenant query succeeds', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'planner1' });
      const q = query(collection(db, 'products'), where('tenantId', '==', 'tenant1'));
      await assertSucceeds(getDocs(q));
    });

    it('49. Unfiltered cross-tenant query fails', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'planner1' });
      const q = collection(db, 'products');
      await assertFails(getDocs(q));
    });

    it('50. Correct site query succeeds', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'planner1' });
      const q = query(collection(db, 'inventoryBalances'), where('tenantId', '==', 'tenant1'), where('siteId', '==', 'site1'));
      await assertSucceeds(getDocs(q));
    });

    it('51. Query spanning unassigned sites fails', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'planner1' });
      const q = query(collection(db, 'inventoryBalances'), where('tenantId', '==', 'tenant1'), where('siteId', '==', 'site2'));
      await assertFails(getDocs(q));
    });

    it('52. Tenant admin user query with tenant filter succeeds', async () => {
      await setupUser('admin1', 'TENANT_ADMIN', 'tenant1');
      const db = getDb({ uid: 'admin1' });
      const q = query(collection(db, 'users'), where('tenantId', '==', 'tenant1'), where('role', '!=', 'PLATFORM_SUPERUSER'));
      await assertSucceeds(getDocs(q));
    });

    it('53. Tenant admin unfiltered users query fails where required', async () => {
      await setupUser('admin1', 'TENANT_ADMIN', 'tenant1');
      const db = getDb({ uid: 'admin1' });
      const q = collection(db, 'users');
      await assertFails(getDocs(q));
    });

    // --- FIELD ALLOW-LIST TESTS ---
    it('54. Warehouse updates every individually allowed execution field', async () => {
      await setupUser('operator1', 'WAREHOUSE_OPERATOR', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'priorities', 'prio1'), { tenantId: 'tenant1', siteId: 'site1', status: 'PENDING' });
      });
      const db = getDb({ uid: 'operator1' });
      const fields = [
        { priorityStatus: 'IN_PROGRESS' },
        { progressQuantity: 10 },
        { remainingQuantity: 90 },
        { progressPercent: 10 },
        { completedAt: serverTimestamp() },
        { latestProgressNote: 'Picking notes' },
        { modifiedBy: 'operator1' },
        { modifiedDate: serverTimestamp() }
      ];
      for (const field of fields) {
        await assertSucceeds(updateDoc(doc(db, 'priorities', 'prio1'), field));
      }
    });

    it('55. Warehouse attempts to update each forbidden planning field', async () => {
      await setupUser('operator1', 'WAREHOUSE_OPERATOR', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'priorities', 'prio1'), { tenantId: 'tenant1', siteId: 'site1', priorityCode: 'URGENT', instructedQuantity: 100 });
      });
      const db = getDb({ uid: 'operator1' });
      const forbidden = [
        { priorityCode: 'LOW' },
        { instructedQuantity: 200 },
        { productName: 'Hacked Product' }
      ];
      for (const field of forbidden) {
        await assertFails(updateDoc(doc(db, 'priorities', 'prio1'), field));
      }
    });

    it('56. User self-service updates each allowed field', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'planner1' });
      const fields = [
        { displayName: 'New Name' },
        { jobTitle: 'New Title' },
        { passwordChangedAt: serverTimestamp() },
        { requiresPasswordChange: true },
        { lastLoginAt: serverTimestamp() },
        { modifiedDate: serverTimestamp() },
        { modifiedBy: 'planner1' }
      ];
      for (const field of fields) {
        await assertSucceeds(updateDoc(doc(db, 'users', 'planner1'), field));
      }
    });

    it('57. User self-service updates each forbidden account field', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'planner1' });
      const forbidden = [
        { role: 'PLATFORM_SUPERUSER' },
        { tenantId: 'tenant2' },
        { siteIds: ['site1', 'site2'] },
        { accountStatus: 'DISABLED' }
      ];
      for (const field of forbidden) {
        await assertFails(updateDoc(doc(db, 'users', 'planner1'), field));
      }
    });

    // --- EXPLICIT SITE ASSIGNMENT & SUPERUSER ACCOUNT STATUS TESTS ---
    it('58. User with missing, null, or empty siteIds is denied site access by default', async () => {
      await setupUser('planner_nosite', 'PLANNER', 'tenant1', []);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'productionPlanEntries', 'e1'), { tenantId: 'tenant1', siteId: 'site1' });
      });
      const db = getDb({ uid: 'planner_nosite' });
      await assertFails(getDoc(doc(db, 'productionPlanEntries', 'e1')));
      await assertFails(setDoc(doc(db, 'productionPlanEntries', 'e2'), { tenantId: 'tenant1', siteId: 'site1' }));
    });

    it('59. Inactive platform superuser fails superuser permissions instantly', async () => {
      await setupUser('super_inactive', 'PLATFORM_SUPERUSER', null, [], 'DISABLED');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'tenants', 't1'), { tenantName: 'Tenant 1' });
      });
      const db = getDb({ uid: 'super_inactive' });
      await assertFails(getDoc(doc(db, 'tenants', 't1')));
      await assertFails(setDoc(doc(db, 'tenants', 't2'), { tenantName: 'Tenant 2' }));
    });

    // --- REMEDIATION SECURITY TESTS ---
    it('60. Warehouse operator writing displayPriorities directly is denied', async () => {
      await setupUser('wh_op1', 'WAREHOUSE_OPERATOR', 'tenant1', ['site1']);
      const db = getDb({ uid: 'wh_op1' });
      await assertFails(setDoc(doc(db, 'displayPriorities', 'disp1'), {
        tenantId: 'tenant1',
        siteId: 'site1',
        sourcePriorityId: 'disp1',
        priorityCode: 'SKU1',
        title: 'Title',
        priorityStatus: 'ACTIVE'
      }));
    });

    it('61. Planner writing displayPriorities with display-safe fields succeeds', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'planner1' });
      await assertSucceeds(setDoc(doc(db, 'displayPriorities', 'disp1'), {
        tenantId: 'tenant1',
        siteId: 'site1',
        sourcePriorityId: 'disp1',
        priorityCode: 'SKU1',
        title: 'Title',
        priorityStatus: 'ACTIVE'
      }));
    });

    it('62. Planner writing displayPriorities with sensitive fields is denied', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'planner1' });
      await assertFails(setDoc(doc(db, 'displayPriorities', 'disp1'), {
        tenantId: 'tenant1',
        siteId: 'site1',
        sourcePriorityId: 'disp1',
        priorityCode: 'SKU1',
        title: 'Title',
        priorityStatus: 'ACTIVE',
        planningContextSnapshot: { qoh: 50 }
      }));
    });

    it('63. Direct site read restricted to assigned sites for non-Admin users', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'sites', 'site1'), { tenantId: 'tenant1', siteName: 'Site 1' });
        await setDoc(doc(db, 'sites', 'site2'), { tenantId: 'tenant1', siteName: 'Site 2' });
      });
      const db = getDb({ uid: 'planner1' });
      await assertSucceeds(getDoc(doc(db, 'sites', 'site1')));
      await assertFails(getDoc(doc(db, 'sites', 'site2')));
    });

    it('64. Announcement creation requires createdBy == request.auth.uid', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      const db = getDb({ uid: 'planner1', email: 'planner1@example.com' });
      // Spoofed createdBy
      await assertFails(setDoc(doc(db, 'announcements', 'ann1'), {
        tenantId: 'tenant1',
        siteId: 'site1',
        message: 'Hello',
        createdBy: 'impersonated_user',
        modifiedBy: 'planner1',
        createdDate: serverTimestamp(),
        modifiedDate: serverTimestamp()
      }));

      // Valid createdBy
      await assertSucceeds(setDoc(doc(db, 'announcements', 'ann2'), {
        tenantId: 'tenant1',
        siteId: 'site1',
        message: 'Hello',
        createdBy: 'planner1',
        modifiedBy: 'planner1',
        createdDate: serverTimestamp(),
        modifiedDate: serverTimestamp()
      }));
    });

    it('65. Announcement update altering createdBy is denied', async () => {
      await setupUser('planner1', 'PLANNER', 'tenant1', ['site1']);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'announcements', 'ann1'), {
          tenantId: 'tenant1',
          siteId: 'site1',
          message: 'Original',
          createdBy: 'planner1',
          createdByName: 'Planner One',
          modifiedBy: 'planner1',
          createdDate: new Date(),
          modifiedDate: new Date()
        });
      });
      const db = getDb({ uid: 'planner1' });
      await assertFails(updateDoc(doc(db, 'announcements', 'ann1'), {
        createdBy: 'other_user',
        modifiedBy: 'planner1'
      }));
    });
  });

  describe('Tenant Deletion Protection', () => {
    it('prevents normal writes when tenant is DELETION_PENDING', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'tenants', 'tenant1'), {
          tenantName: 'Tenant 1',
          status: 'DELETION_PENDING'
        });
      });
      const db = getDb({ uid: 'admin1' });
      await assertFails(setDoc(doc(db, 'products', 'new_prod'), {
        tenantId: 'tenant1',
        siteId: 'site1',
        status: 'active'
      }));
    });

    it('prevents normal writes when tenant is inactive', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'tenants', 'tenant1'), {
          tenantName: 'Tenant 1',
          status: 'inactive'
        });
      });
      const db = getDb({ uid: 'admin1' });
      await assertFails(setDoc(doc(db, 'products', 'new_prod2'), {
        tenantId: 'tenant1',
        siteId: 'site1',
        status: 'active'
      }));
    });

    it('allows superusers to read deletion jobs', async () => {
      const db = getDb({ uid: 'super1' });
      await assertSucceeds(getDoc(doc(db, 'tenantDeletionJobs', 'job1')));
    });

    it('denies admins from reading deletion jobs', async () => {
      const db = getDb({ uid: 'admin1' });
      await assertFails(getDoc(doc(db, 'tenantDeletionJobs', 'job1')));
    });

    it('denies superusers from writing deletion jobs (backend only)', async () => {
      const db = getDb({ uid: 'super1' });
      await assertFails(setDoc(doc(db, 'tenantDeletionJobs', 'job1'), { status: 'PREVIEW' }));
    });
  });
});
