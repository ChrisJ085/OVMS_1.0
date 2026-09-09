const fs = require('fs');
let content = fs.readFileSync('src/server/apiApp.ts', 'utf8');
const target = `    currentStage = "SUPABASE_AUTH_CREATE";
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: cleanEmail,
      password: temporaryPassword || 'TempPass123!',
      options: {
        data: { display_name: displayName.trim() }
      }
    });

    if (authErr && !authData?.user) {
      return res.status(400).json({ success: false, error: authErr.message, stage: currentStage });
    }

    const newUserId = authData.user?.id || crypto.randomUUID();

    currentStage = "USER_PROFILE_CREATE";
    const { error: profileErr } = await supabase.from('users').upsert({`;

const replacement = `    currentStage = "SUPABASE_AUTH_CREATE";
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: cleanEmail,
      password: temporaryPassword || 'TempPass123!',
      options: {
        data: { display_name: displayName.trim() }
      }
    });

    if (authErr && !authData?.user) {
      return res.status(400).json({ success: false, error: authErr.message, stage: currentStage });
    }

    const newUserId = authData.user?.id || crypto.randomUUID();

    // Create a scoped client acting as the admin caller
    const { createClient } = await import('@supabase/supabase-js');
    const { supabaseUrl, supabaseAnonKey } = await import('../config/supabase');
    const adminClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: \`Bearer \${callerToken}\` } },
      auth: { persistSession: false }
    });

    currentStage = "USER_PROFILE_CREATE";
    const { error: profileErr } = await adminClient.from('users').upsert({`;

content = content.replace(target, replacement);
content = content.replace(/await supabase\.from\('user_sites'\)\.insert\(userSiteRows\);/g, `await adminClient.from('user_sites').insert(userSiteRows);`);
content = content.replace(/await supabase\.from\('audit_logs'\)\.insert\(\{/g, `await adminClient.from('audit_logs').insert({`);

fs.writeFileSync('src/server/apiApp.ts', content);
