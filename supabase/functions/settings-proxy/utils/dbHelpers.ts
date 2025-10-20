import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export async function getUserSettings(supabase: SupabaseClient, userId: string) {
  const { data: settings, error } = await supabase
    .from('api_settings')
    .select('*')
    .eq('user_id', userId)
    .single();
    
  return { settings, error };
}

export async function getUserProviderConfigurations(supabase: SupabaseClient, userId: string) {
  const { data: configurations, error } = await supabase
    .from('provider_configurations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
    
  return { configurations: configurations || [], error };
}

export async function upsertUserSettings(supabase: SupabaseClient, userId: string, settings: Record<string, any>) {
  const { data, error } = await supabase
    .from('api_settings')
    .upsert({
      ...settings,
      user_id: userId,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    })
    .select()
    .single();
    
  return { data, error };
}