import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')
const DISCORD_GUILD_ID = Deno.env.get('DISCORD_GUILD_ID')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RoleChangePayload {
  // Manual sync from frontend
  userId?: string
  
  // Database webhook format
  type?: string
  table?: string
  record?: {
    user_id?: string
    role_id?: string
  }
  old_record?: {
    role_id?: string
  }
}

// Get Discord role ID from roles table
async function getDiscordRoleId(supabase: any, roleId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('roles')
    .select('discord_role_id, name')
    .eq('id', roleId)
    .single()
  
  if (error) {
    console.error('Error fetching role:', error)
    return null
  }
  
  return data?.discord_role_id || null
}

// Get user's current role
async function getUserRole(supabase: any, userId: string): Promise<{ roleId: string; roleName: string } | null> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role_id, roles(name, discord_role_id)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single()
  
  if (error) {
    console.error('Error fetching user role:', error)
    return null
  }
  
  return {
    roleId: data?.role_id,
    roleName: data?.roles?.name
  }
}

// Validate Discord user exists in guild
async function validateDiscordUser(discordId: string): Promise<boolean> {
  try {
    console.log('Validating Discord user:', discordId)
    console.log('Using Guild ID:', DISCORD_GUILD_ID)
    console.log('Bot token configured:', !!DISCORD_BOT_TOKEN)
    
    // Check token format (safely)
    if (DISCORD_BOT_TOKEN) {
      const tokenStart = DISCORD_BOT_TOKEN.substring(0, 10)
      console.log('Token starts with:', tokenStart)
      console.log('Token length:', DISCORD_BOT_TOKEN.length)
      console.log('Token has "Bot " prefix:', DISCORD_BOT_TOKEN.startsWith('Bot '))
    }
    
    const url = `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${discordId}`
    console.log('Discord API URL:', url)
    
    // Ensure proper Bot prefix (don't double it if already present)
    const authHeader = DISCORD_BOT_TOKEN?.startsWith('Bot ') 
      ? DISCORD_BOT_TOKEN 
      : `Bot ${DISCORD_BOT_TOKEN}`
    
    const response = await fetch(url, {
      headers: {
        'Authorization': authHeader,
      },
    })
    
    console.log('Discord API response status:', response.status)
    if (!response.ok) {
      const errorText = await response.text()
      console.log('Discord API error:', errorText)
    }
    
    return response.ok
  } catch (error) {
    console.error('Error validating Discord user:', error)
    return false
  }
}

// Update Discord role
async function updateDiscordRole(discordUserId: string, newRoleId: string | null, oldRoleId: string | null) {
  const baseUrl = `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${discordUserId}`
  
  // Ensure proper Bot prefix (don't double it if already present)
  const authHeader = DISCORD_BOT_TOKEN?.startsWith('Bot ') 
    ? DISCORD_BOT_TOKEN 
    : `Bot ${DISCORD_BOT_TOKEN}`
  
  const headers = {
    'Authorization': authHeader,
    'Content-Type': 'application/json',
  }

  // Remove old role if exists
  if (oldRoleId) {
    try {
      await fetch(`${baseUrl}/roles/${oldRoleId}`, {
        method: 'DELETE',
        headers,
      })
    } catch (error) {
      console.error('Error removing old role:', error)
    }
  }

  // Add new role if exists
  if (newRoleId) {
    try {
      await fetch(`${baseUrl}/roles/${newRoleId}`, {
        method: 'PUT',
        headers,
      })
    } catch (error) {
      console.error('Error adding new role:', error)
    }
  }

  return { success: true }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Check if required environment variables are set
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('Missing required Supabase environment variables')
      return new Response(
        JSON.stringify({ 
          error: 'Server configuration error',
          details: 'Required environment variables are not configured' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      )
    }

    // Check if Discord bot is configured
    if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
      return new Response(
        JSON.stringify({ 
          error: 'Discord bot not configured',
          details: 'DISCORD_BOT_TOKEN or DISCORD_GUILD_ID environment variables are missing' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 503 
        }
      )
    }

    // Get the authorization header for user authentication
    const authHeader = req.headers.get('Authorization')
    
    // Parse the request body
    const payload: RoleChangePayload = await req.json()
    
    console.log('Discord role sync request (v7 - Bot token fix):', payload)
    
    // For webhook calls (from database), use service key and skip user auth
    const isWebhook = payload.type === 'UPDATE' && payload.table === 'user_roles'
    
    let authenticatedUserId: string | undefined
    
    if (!isWebhook) {
      // For manual sync from frontend, verify the user is authenticated
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'No authorization header' }),
          { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      
      // Verify the user token using service key
      const token = authHeader.replace('Bearer ', '')
      
      // Use service key to validate the user token
      const supabaseAdmin = createClient(
        SUPABASE_URL || '',
        SUPABASE_SERVICE_KEY || '',
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      )
      
      // Get current user using the token
      const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
      
      if (userError || !user) {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid token', 
            details: userError?.message || 'User not found'
          }),
          { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      
      authenticatedUserId = user.id
      console.log('Authenticated user:', authenticatedUserId)
      
      // Users can sync their own Discord role
      // Override the payload userId with the authenticated user's ID for security
      if (!isWebhook) {
        payload.userId = authenticatedUserId
      }
    }
    
    // Now use service key for database operations
    const supabase = createClient(
      SUPABASE_URL || '',
      SUPABASE_SERVICE_KEY || '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
    
    let userId: string | undefined
    let oldRoleId: string | undefined
    let newRoleId: string | undefined
    
    // Handle different payload formats
    if (payload.userId) {
      // Manual sync from frontend
      userId = payload.userId
      const userRole = await getUserRole(supabase, userId)
      if (userRole) {
        newRoleId = userRole.roleId
      }
    } else if (isWebhook) {
      // Database webhook
      userId = payload.record?.user_id
      oldRoleId = payload.old_record?.role_id
      newRoleId = payload.record?.role_id
    } else {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid payload format',
          details: 'Missing userId or webhook data' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ 
          error: 'User ID not provided' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // Get user's Discord ID from profile
    console.log('Fetching Discord ID for user:', userId)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('discord_id')
      .eq('id', userId)
      .single()

    console.log('Profile fetch result:', { profile, profileError })

    if (profileError) {
      console.error('Error fetching profile:', profileError)
      return new Response(
        JSON.stringify({ 
          error: 'Error fetching user profile',
          details: profileError.message,
          userId: userId
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      )
    }

    if (!profile?.discord_id) {
      console.log('No Discord ID found in profile:', profile)
      return new Response(
        JSON.stringify({ 
          error: 'Discord ID not found for this user',
          details: 'User needs to link their Discord account first',
          profile: profile
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404 
        }
      )
    }

    console.log('Discord ID found:', profile.discord_id)

    // Validate user exists in Discord server
    const isValidUser = await validateDiscordUser(profile.discord_id)
    if (!isValidUser) {
      return new Response(
        JSON.stringify({ 
          error: 'User not found in Discord server',
          details: 'User must join the Discord server first' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404 
        }
      )
    }

    // Get Discord role IDs from database
    let oldDiscordRoleId: string | null = null
    let newDiscordRoleId: string | null = null
    
    if (oldRoleId) {
      oldDiscordRoleId = await getDiscordRoleId(supabase, oldRoleId)
    }
    
    if (newRoleId) {
      newDiscordRoleId = await getDiscordRoleId(supabase, newRoleId)
    }

    // Update Discord roles
    await updateDiscordRole(profile.discord_id, newDiscordRoleId, oldDiscordRoleId)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Discord role updated successfully`,
        discordUserId: profile.discord_id,
        oldRole: oldDiscordRoleId,
        newRole: newDiscordRoleId
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error syncing Discord role:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Failed to sync Discord role',
        details: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})