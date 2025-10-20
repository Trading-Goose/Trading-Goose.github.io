import { serve } from "https://deno.land/std@0.210.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from '../_shared/cors.ts'

interface InvitationRequest {
  email: string
  name?: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Use environment variables that are automatically provided by Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ 
          error: 'Server configuration error',
          details: 'Environment variables not configured'
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // First, verify the user is an admin using anon key
    const token = authHeader.replace('Bearer ', '')
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: authHeader
          }
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Get current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    
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

    // Check if user is admin - simplified query
    const { data: userRoles, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('role_id')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (roleError) {
      console.error('Error checking user roles:', roleError)
    }

    // Get admin role ID
    const { data: adminRole } = await supabaseClient
      .from('roles')
      .select('id')
      .eq('name', 'admin')
      .single()

    const isAdmin = userRoles?.some(ur => ur.role_id === adminRole?.id)
    
    // Also check if user is the first user (fallback admin)
    let isFirstUser = false
    if (!isAdmin) {
      const { data: firstUser } = await supabaseClient
        .from('profiles')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .single()
      
      isFirstUser = firstUser?.id === user.id
    }

    if (!isAdmin && !isFirstUser) {
      return new Response(
        JSON.stringify({ error: 'Access denied. Admin privileges required.' }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Parse request body
    const body: InvitationRequest = await req.json()
    const { email, name } = body

    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'Valid email address is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // We've already checked auth.users above, no need to check profiles again
    // The auth.users check with profile verification is sufficient

    // Check if ANY invitation exists for this email (not just pending/sent)
    // This prevents creating duplicates
    const { data: existingInvitation } = await supabaseClient
      .from('invitations')
      .select('id, status, created_at, confirmed_user_id')
      .ilike('email', email)  // Case-insensitive match
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    let invitation = existingInvitation
    let isResend = false

    if (existingInvitation) {
      // Check if invitation is confirmed (user has signed in)
      if (existingInvitation.status === 'confirmed' && existingInvitation.confirmed_user_id) {
        // This invitation is for a confirmed user, check if they've actually signed in
        // This will be handled in the auth.users check below
        console.log(`Found existing confirmed invitation for ${email}`)
      }
      
      // Allow resend if invitation is older than 1 minute
      const invitationAge = Date.now() - new Date(existingInvitation.created_at).getTime()
      if (invitationAge < 60000) { // Less than 1 minute
        return new Response(
          JSON.stringify({ 
            error: 'Invitation recently sent', 
            details: `Please wait a moment before resending the invitation to ${email}`
          }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      
      // Always use the existing invitation - just update it
      isResend = true
      const { data: updatedInvitation, error: updateError } = await supabaseClient
        .from('invitations')
        .update({
          invited_by: user.id,
          status: 'pending',
          updated_at: new Date().toISOString()
        })
        .eq('id', existingInvitation.id)
        .select()
        .single()
      
      if (updateError) {
        console.error('Failed to update invitation for resend:', updateError)
        return new Response(
          JSON.stringify({ 
            error: 'Failed to resend invitation', 
            details: updateError.message
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      
      invitation = updatedInvitation
    } else {
      // Create new invitation
      const { data: newInvitation, error: invitationError } = await supabaseClient
        .from('invitations')
        .insert({
          email: email,
          name: name || null,
          invited_by: user.id,
          status: 'pending'
        })
        .select()
        .single()

      if (invitationError) {
        console.error('Failed to create invitation:', invitationError)
        return new Response(
          JSON.stringify({ 
            error: 'Failed to create invitation', 
            details: invitationError.message
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      
      invitation = newInvitation
    }

    // Try to send invitation through Supabase Auth
    let emailSent = false
    let inviteData = null
    let authError = null
    
    // Use service role key if available for sending invitations
    if (supabaseServiceKey) {
      try {
        const supabaseAdmin = createClient(
          supabaseUrl,
          supabaseServiceKey,
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          }
        )

        // First, check if user already exists in auth.users
        console.log(`Checking for existing user with email: ${email}`)
        
        // Use a more robust approach to find users
        const { data: allUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers()
        
        if (listError) {
          console.error('Error listing users:', listError)
        }
        
        // Filter users manually to ensure exact email match
        const existingAuthUser = allUsers ? {
          users: allUsers.users.filter(u => u.email?.toLowerCase() === email.toLowerCase())
        } : null
        
        console.log(`Found ${existingAuthUser?.users?.length || 0} users with email ${email}`)

        if (existingAuthUser && existingAuthUser.users && existingAuthUser.users.length > 0) {
          const authUser = existingAuthUser.users[0]
          
          // Log user object for debugging
          console.log('Auth user object:', JSON.stringify({
            id: authUser.id,
            email: authUser.email,
            email_confirmed_at: authUser.email_confirmed_at,
            last_sign_in_at: authUser.last_sign_in_at,
            confirmed_at: authUser.confirmed_at,
            created_at: authUser.created_at
          }, null, 2))
          
          // Check if user has a profile (meaning they're fully set up)
          const { data: userProfile } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('id', authUser.id)
            .single()
          
          // Check if user has confirmed their email AND signed in
          // email_confirmed_at indicates they clicked the confirmation link
          // last_sign_in_at indicates they've actually logged in
          if (authUser.email_confirmed_at && authUser.last_sign_in_at) {
            // User has signed in before - they're truly confirmed
            console.log(`User ${authUser.id} with email ${authUser.email} has signed in before (confirmed)`)
            
            // For users who have signed in, they should use password reset flow instead
            console.log(`User has signed in before - using resetPasswordForEmail`)
            
            const resetPasswordUrl = `${req.headers.get('origin') || 'http://localhost:3000'}/reset-password`
            
            const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(
              email,
              {
                redirectTo: resetPasswordUrl
              }
            )
            
            if (!resetError) {
              console.log(`Sent password reset email to ${email}`)
              
              // Update invitation to reflect confirmed status
              await supabaseClient
                .from('invitations')
                .update({ 
                  status: 'confirmed',
                  confirmed_at: authUser.last_sign_in_at,
                  confirmed_user_id: authUser.id
                })
                .eq('id', invitation.id)
              
              return new Response(
                JSON.stringify({
                  success: true,
                  message: `Password reset email sent to ${email}`,
                  details: `User has already confirmed their account. A password reset email has been sent.`,
                  userExists: true,
                  hasSignedIn: true,
                  authUserId: authUser.id
                }),
                { 
                  status: 200, 
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
                }
              )
            } else {
              console.error('Failed to send password reset email:', resetError)
              return new Response(
                JSON.stringify({
                  success: false,
                  error: 'Failed to send password reset',
                  details: `User ${email} has already confirmed their account but password reset failed. They should use the login page.`,
                  userExists: true,
                  hasSignedIn: true,
                  authUserId: authUser.id
                }),
                { 
                  status: 400, 
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
                }
              )
            }
          } else {
            // User exists but hasn't confirmed email or never signed in - they need a proper invitation
            console.log(`User ${authUser.id} exists but email_confirmed_at: ${authUser.email_confirmed_at}, last_sign_in_at: ${authUser.last_sign_in_at} - will use inviteUserByEmail to resend invitation`)
            
            // Don't return here - let the function continue to inviteUserByEmail below
            // This ensures the user gets a proper invitation email
          }
        }

        // For truly new users (not found in auth.users), use inviteUserByEmail
        console.log('Sending invitation email to new user via Supabase Auth...')
        
        const origin = req.headers.get('origin') || 'https://trading-goose.github.io'
        const registrationUrl = `${origin}/invitation-setup?invitation=${invitation.id}`
        console.log(`Constructing registration URL: ${registrationUrl}`)
        console.log(`Origin header: ${req.headers.get('origin')}`)
        
        try {
          const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
            email,
            {
              redirectTo: registrationUrl,
              data: {
                invitation_id: invitation.id,
                invited_at: new Date().toISOString()
              }
            }
          )
          
          if (inviteError) throw inviteError
          
          if (inviteData?.user) {
            console.log(`Invitation sent via Supabase Auth to ${email}`)
            console.log(`Created user ${inviteData.user.id} - will track confirmation via last_sign_in_at`)
            
            // Update invitation with the created user ID
            // Keep status as 'sent' - we'll check last_sign_in_at to determine if truly confirmed
            await supabaseClient
              .from('invitations')
              .update({ 
                status: 'sent',
                confirmed_user_id: inviteData.user.id 
              })
              .eq('id', invitation.id)
            
            emailSent = true
          }
        } catch (error) {
          console.error('Error sending invitation via Supabase:', error)
          console.log('Invitation created as pending, share URL manually:', registrationUrl)
          emailSent = false
        }
      } catch (error) {
        console.error('Error in invitation process:', error)
        authError = error
        emailSent = false
      }
    } else {
      console.log('No service role key available, invitation created but email not sent')
      console.log('Please set SUPABASE_SERVICE_ROLE_KEY environment variable')
    }

    console.log(`Invitation ${isResend ? 'resent' : 'created'} for ${email}. Email sent: ${emailSent}`)

    // Prepare response with detailed information
    const registrationUrl = `${req.headers.get('origin') || 'http://localhost:3000'}/invitation-setup?invitation=${invitation.id}`
    
    const responseData = {
      success: !authError || invitation != null,
      message: emailSent 
        ? `Invitation ${isResend ? 'resent' : 'sent'} successfully to ${email}`
        : authError?.message?.includes('Database error')
          ? `Invitation created but email could not be sent due to system configuration. Share this link with the user: ${registrationUrl}`
          : `Invitation ${isResend ? 'updated' : 'created'} for ${email}. Manual registration link: ${registrationUrl}`,
      invitation: {
        id: invitation.id,
        email: email,
        status: emailSent ? 'sent' : 'pending',
        registrationUrl: registrationUrl,
        isResend: isResend
      },
      emailSent: emailSent,
      ...(authError && { 
        debug: {
          error: authError.message,
          hint: 'Run the database migration 20240105_fix_auth_trigger_completely.sql to fix this issue'
        }
      })
    }

    return new Response(
      JSON.stringify(responseData),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})