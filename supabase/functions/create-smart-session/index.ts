import Stripe from "https://esm.sh/stripe@14?target=denonext"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { verifyAndExtractUser } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Check for required environment variables
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!stripeKey || !supabaseUrl || !supabaseServiceKey) {
      console.error('Missing required environment variables')
      return new Response(
        JSON.stringify({ 
          error: 'Server configuration error',
          missing: {
            stripe: !stripeKey,
            url: !supabaseUrl,
            key: !supabaseServiceKey
          }
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Initialize clients with verified environment variables
    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const supabase = createClient(
      supabaseUrl,
      supabaseServiceKey // Service role to bypass RLS
    )
    // Get user ID from JWT - Supabase functions.invoke() passes JWT in Authorization header
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization')

    if (!authHeader) {
      console.error('No Authorization header found')
      return new Response(
        JSON.stringify({ 
          error: 'Authentication required',
          message: 'Missing authorization header'
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const { userId, error: authError } = await verifyAndExtractUser(authHeader);

    if (authError || !userId) {
      console.error('Authentication failed for create-smart-session:', authError)
      return new Response(
        JSON.stringify({ 
          error: authError || 'Authentication failed',
          message: 'Invalid or expired authentication token'
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log('User ID extracted:', userId)

    const user = {
      id: userId
    }

    const {
      price_id,
      success_url,
      cancel_url,
      action
    } = await req.json()

    console.log(`Smart session for user ${user.id}, price_id: ${price_id}, action: ${action}`)

    // Get user's current subscription status from user_roles
    // Look for ANY active role that might have subscription data
    // Use service role client to bypass RLS
    const { data: subscriptionRows, error: subError } = await supabase
      .from('user_roles')
      .select('stripe_customer_id, stripe_subscription_id, subscription_status, role_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .or('stripe_subscription_id.not.is.null,stripe_customer_id.not.is.null')
    
    if (subError && subError.code !== 'PGRST116') { // PGRST116 is "no rows found"
      console.error('Error fetching subscription:', subError)
    }
    
    // Get the first subscription if multiple exist (shouldn't happen, but just in case)
    const subscription = subscriptionRows && subscriptionRows.length > 0 ? subscriptionRows[0] : null
    
    console.log(`Found ${subscriptionRows?.length || 0} subscription rows for user ${user.id}`)
    if (subscriptionRows && subscriptionRows.length > 0) {
      console.log('All subscription rows:', subscriptionRows)
    }
    if (subscription) {
      console.log('Selected subscription data:', {
        has_customer: !!subscription.stripe_customer_id,
        has_subscription: !!subscription.stripe_subscription_id,
        status: subscription.subscription_status,
        role_id: subscription.role_id
      })
    } else {
      console.log('No subscription found for action:', action)
    }

    // Case 1: Direct portal access for management
    if (action === 'manage' || action === 'portal') {
      // First try to find a customer ID from any of the user's roles
      let customerIdToUse = subscription?.stripe_customer_id
      
      // If no customer ID in subscription, try to create/retrieve one
      if (!customerIdToUse) {
        console.log('No customer ID found in subscription data, checking for any customer ID...')
        
        // Query again specifically for any stripe_customer_id
        const { data: customerRows } = await supabase
          .from('user_roles')
          .select('stripe_customer_id')
          .eq('user_id', user.id)
          .not('stripe_customer_id', 'is', null)
          .limit(1)
        
        if (customerRows && customerRows.length > 0) {
          customerIdToUse = customerRows[0].stripe_customer_id
          console.log('Found customer ID from user_roles:', customerIdToUse)
        }
      }
      
      // If still no customer ID, create one using user_id
      if (!customerIdToUse) {
        console.log('No customer ID found, creating new customer for user:', user.id)
        
        // Create a new customer with user_id as primary identifier
        const customer = await stripe.customers.create({
          metadata: {
            user_id: user.id,
            created_from: 'portal_access'
          },
          description: `TradingGoose User: ${user.id}`
        })
        customerIdToUse = customer.id
        console.log('Created new Stripe customer:', customerIdToUse)
        
        // Store the customer ID for future use
        const { error: updateError } = await supabase
          .from('user_roles')
          .update({ stripe_customer_id: customerIdToUse })
          .eq('user_id', user.id)
          .eq('is_active', true)
        
        if (updateError) {
          console.error('Error saving customer ID:', updateError)
        }
      }
      
      if (customerIdToUse) {
        // Verify the customer still exists in Stripe before creating portal session
        try {
          console.log('Verifying customer for portal:', customerIdToUse)
          await stripe.customers.retrieve(customerIdToUse)
          console.log('Customer verified for portal access')
        } catch (error: any) {
          console.error('Customer not found in Stripe for portal:', error.message)
          console.log('Clearing invalid customer ID from database')
          
          // Customer was deleted from Stripe, clear it from database
          const { error: clearError } = await supabase
            .from('user_roles')
            .update({
              stripe_customer_id: null,
              stripe_subscription_id: null,
              stripe_price_id: null,
              stripe_product_id: null,
              subscription_status: 'inactive',
              current_period_end: null,
              cancel_at_period_end: false
            })
            .eq('user_id', user.id)
            .eq('stripe_customer_id', customerIdToUse)
          
          if (clearError) {
            console.error('Error clearing invalid customer data:', clearError)
          }
          
          // Create a new customer using user_id
          console.log('Creating new customer for portal access after deletion')
          
          const newCustomer = await stripe.customers.create({
            metadata: {
              user_id: user.id,
              created_from: 'portal_access_recovery'
            },
            description: `TradingGoose User: ${user.id}`
          })
          customerIdToUse = newCustomer.id
          
          // Save the new customer ID
          const { error: updateError } = await supabase
            .from('user_roles')
            .update({ stripe_customer_id: customerIdToUse })
            .eq('user_id', user.id)
            .eq('is_active', true)
          
          if (updateError) {
            console.error('Error saving new customer ID:', updateError)
          }
        }
      }
      
      if (customerIdToUse) {
        console.log('Creating portal session for customer:', customerIdToUse)

        const session = await stripe.billingPortal.sessions.create({
          customer: customerIdToUse,
          return_url: cancel_url || `${Deno.env.get('APP_URL')}/profile`,
          configuration: Deno.env.get('STRIPE_PORTAL_CONFIG_ID')
        })

        return new Response(
          JSON.stringify({ url: session.url }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
          }
        )
      } else {
        console.log('Failed to get/create customer ID for user:', user.id)
        return new Response(
          JSON.stringify({ error: 'Unable to access billing portal. Please contact support.', redirect_to: '/pricing' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
          }
        )
      }
    }

    // Case 2: Explicit cancellation or switching to free  
    if (action === 'cancel' || action === 'downgrade_to_free' || (!price_id && action !== 'manage' && action !== 'portal')) {
      if (subscription?.stripe_customer_id) {
        console.log('Creating portal session for cancellation')

        const session = await stripe.billingPortal.sessions.create({
          customer: subscription.stripe_customer_id,
          return_url: cancel_url || `${Deno.env.get('APP_URL')}/pricing`,
          configuration: Deno.env.get('STRIPE_PORTAL_CONFIG_ID'),
          flow_data: {
            type: 'subscription_cancel',
            subscription_cancel: {
              subscription: subscription.stripe_subscription_id
            }
          }
        })

        return new Response(
          JSON.stringify({ url: session.url }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
          }
        )
      } else {
        return new Response(
          JSON.stringify({ error: 'No subscription to cancel' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
          }
        )
      }
    }

    // Case 3: Plan switching for existing subscribers
    // Allow switching for active subscriptions AND cancelled subscriptions still in grace period
    if ((action === 'switch_plan' || price_id) && 
        subscription?.stripe_customer_id &&
        (subscription?.subscription_status === 'active' || 
         subscription?.subscription_status === 'active_pending_downgrade' ||
         subscription?.subscription_status === 'trialing') &&
        subscription?.stripe_subscription_id) {

      console.log('Creating portal session for plan switch')
      console.log('Current subscription:', subscription.stripe_subscription_id)
      console.log('Target price:', price_id)

      // Get the current subscription details to find the item ID
      let currentSubscription
      try {
        currentSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id)
      } catch (error: any) {
        console.error('Error retrieving subscription:', error)
        // If subscription not found, fall through to new subscription creation
        console.log('Subscription not found in Stripe, will create new subscription')
        currentSubscription = null
      }

      if (currentSubscription) {
        const currentItem = currentSubscription.items.data[0]
        
        if (!currentItem) {
          throw new Error('No subscription items found')
        }

        // Use subscription_update_confirm to go directly to the confirmation page
        // This shows the plan change and lets the user confirm it
        const session = await stripe.billingPortal.sessions.create({
          customer: subscription.stripe_customer_id,
          return_url: success_url || cancel_url || `${Deno.env.get('APP_URL')}/pricing`,
          configuration: Deno.env.get('STRIPE_PORTAL_CONFIG_ID'),
          flow_data: price_id ? {
            type: 'subscription_update_confirm',
            subscription_update_confirm: {
              subscription: subscription.stripe_subscription_id,
              items: [{
                id: currentItem.id,  // Use the actual item ID
                price: price_id,     // The new price they want
                quantity: 1
              }]
            }
          } : {
            // If no price_id, just open the update page
            type: 'subscription_update',
            subscription_update: {
              subscription: subscription.stripe_subscription_id
            }
          }
        })

        return new Response(
          JSON.stringify({ url: session.url }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
          }
        )
      }
    }

    // Case 4: New subscription or reactivation
    console.log('Creating checkout session for new subscription')

    // Before using the customer ID, verify it still exists in Stripe
    let validCustomerId = subscription?.stripe_customer_id
    if (validCustomerId) {
      try {
        console.log('Verifying customer exists in Stripe:', validCustomerId)
        await stripe.customers.retrieve(validCustomerId)
        console.log('Customer verified successfully')
      } catch (error: any) {
        console.error('Customer not found in Stripe:', error.message)
        console.log('Clearing invalid customer ID from database')
        
        // Customer was deleted from Stripe, clear it from database
        const { error: clearError } = await supabase
          .from('user_roles')
          .update({
            stripe_customer_id: null,
            stripe_subscription_id: null,
            stripe_price_id: null,
            stripe_product_id: null,
            subscription_status: 'inactive',
            current_period_end: null,
            cancel_at_period_end: false
          })
          .eq('user_id', user.id)
          .eq('stripe_customer_id', validCustomerId)
        
        if (clearError) {
          console.error('Error clearing invalid customer data:', clearError)
        } else {
          console.log('Successfully cleared invalid customer data')
        }
        
        // Reset to null so a new customer will be created
        validCustomerId = null
      }
    }

    // If no valid customer exists, create one using user_id
    if (!validCustomerId) {
      console.log('Creating new Stripe customer for user:', user.id)
      
      // Create customer with user_id in metadata
      const newCustomer = await stripe.customers.create({
        metadata: {
          user_id: user.id,
          created_from: 'checkout_session'
        },
        description: `TradingGoose User: ${user.id}`
      })
      validCustomerId = newCustomer.id
      console.log('Created new Stripe customer:', validCustomerId)
      
      // Save the new customer ID to database
      const { error: saveError } = await supabase
        .from('user_roles')
        .update({ stripe_customer_id: validCustomerId })
        .eq('user_id', user.id)
        .eq('is_active', true)
      
      if (saveError) {
        console.error('Error saving new customer ID:', saveError)
        // Continue anyway - webhook will update it
      }
    }

    // Check if user has ever had a subscription before (to determine trial eligibility)
    const { data: previousSubscriptions } = await supabase
      .from('user_roles')
      .select('stripe_subscription_id, subscription_status')
      .eq('user_id', user.id)
      .not('stripe_subscription_id', 'is', null)
      .limit(1)
    
    const hasHadSubscriptionBefore = previousSubscriptions && previousSubscriptions.length > 0
    console.log('User has had subscription before:', hasHadSubscriptionBefore)

    // Build line items
    const lineItems = price_id ? [{
      price: price_id,
      quantity: 1
    }] : []

    // Determine trial period: only offer trial if user has never had a subscription
    const trialDays = hasHadSubscriptionBefore ? null : 
      (Deno.env.get('STRIPE_TRIAL_DAYS') ? parseInt(Deno.env.get('STRIPE_TRIAL_DAYS')!) : 30)
    
    console.log('Trial days for checkout:', trialDays || 'no trial')

    // Build subscription data conditionally
    const subscriptionData: any = {
      metadata: {
        user_id: user.id
      }
    }
    
    // Only add trial_period_days if it's a valid number greater than 0
    if (trialDays && trialDays > 0) {
      subscriptionData.trial_period_days = trialDays
    }

    // Create checkout session with guaranteed customer
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: success_url || `${Deno.env.get('APP_URL')}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${Deno.env.get('APP_URL')}/pricing`,

      // Always use the valid customer ID we just created/verified
      customer: validCustomerId,

      // Always include user_id in metadata for webhook processing
      metadata: {
        user_id: user.id,
        environment: Deno.env.get('ENVIRONMENT') || 'production'
      },

      // Configure subscription data (trial only if applicable)
      subscription_data: subscriptionData,

      // Optional: Allow promo codes
      allow_promotion_codes: Deno.env.get('STRIPE_ALLOW_PROMO_CODES') === 'true',

      // Optional: Collect billing address
      billing_address_collection: 'auto',

      // Optional: Configure tax collection
      automatic_tax: {
        enabled: Deno.env.get('STRIPE_AUTOMATIC_TAX') === 'true'
      },

      // Optional: Consent collection for marketing
      consent_collection: {
        terms_of_service: 'required',
        promotions: 'auto'
      }
    })

    console.log(`Checkout session created: ${session.id}`)

    return new Response(
      JSON.stringify({
        url: session.url,
        session_id: session.id
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error: any) {
    console.error('Smart session error:', error)

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
        type: error.type || 'unknown_error'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: error.statusCode || 500
      }
    )
  }
})
