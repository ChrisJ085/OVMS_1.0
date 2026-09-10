
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

async function checkUser() {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', 'chris.jeal@gxo.com');
    
    console.log('User check:', data, error);
}

async function checkSchema() {
    const { data, error } = await supabase
        .from('information_schema.columns')
        .select('column_name')
        .eq('table_name', 'tenants')
        .eq('table_schema', 'public');
    
    console.log('Tenants schema:', data, error);
}

checkUser();
checkSchema();
