
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cozklbnjwqqtwibwzszg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvemtsYm5qd3FxdHdpYnd6c3pnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMDE4MTAsImV4cCI6MjA4NTU3NzgxMH0.F__im2m0cbt5dGrDRJ_vWSVDfogSGj0V07vxyIGwMXY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Analyzing query performance...');
  const { data, error } = await supabase.rpc('analyze_rpc_perf');

  if (error) {
    console.error('Error:', error);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

main();
