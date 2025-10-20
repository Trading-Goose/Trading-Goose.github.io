// Use consistent versions across functions
import { serve } from "https://deno.land/std@0.210.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14?target=denonext"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Check for required environment variables
const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!stripeKey) {
  console.error('STRIPE_SECRET_KEY is not configured')
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Supabase environment variables are not configured')
}

// Create crypto provider for webhook verification in Deno
const cryptoProvider = Stripe.createSubtleCryptoProvider()

const stripe = stripeKey ? new Stripe(stripeKey, {
  apiVersion: '2023-10-16', // Match the API version used in create-smart-session
  httpClient: Stripe.createFetchHttpClient(),
}) : null

const supabaseAdmin = (supabaseUrl && supabaseServiceKey) ? createClient(
  supabaseUrl,
  supabaseServiceKey // Service role to bypass RLS
) : null

serve(async (req) => {
  // Health check endpoint for debugging
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      status: 'healthy',
      configured: {
        stripe: !!stripe,
        supabase: !!supabaseAdmin,
        webhookSecret: !!Deno.env.get('STRIPE_WEBHOOK_SECRET')
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Check if stripe is initialized
  if (!stripe || !supabaseAdmin) {
    console.error('Missing required configuration:', {
      stripe: !!stripe,
      supabase: !!supabaseAdmin
    })
    return new Response(JSON.stringify({ 
      error: 'Service not configured',
      missing: {
        stripe: !stripe,
        supabase: !supabaseAdmin
      }
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const signature = req.headers.get('stripe-signature')
  
  if (!signature) {
    console.error('No stripe-signature header found')
    return new Response(JSON.stringify({ error: 'No signature header' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  console.log('Webhook received with signature:', signature.substring(0, 20) + '...')

  try {
    const body = await req.text()
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    
    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured')
      return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    console.log('Using webhook secret:', webhookSecret.substring(0, 10) + '...')
    
    // Parse the signature header to check the timestamp
    const elements = signature.split(',')
    let timestamp = null
    for (const element of elements) {
      const [key, value] = element.split('=')
      if (key === 't') {
        timestamp = value
        break
      }
    }
    
    console.log('Webhook timestamp from signature:', timestamp)
    
    // Verify webhook is from Stripe (must use async version with crypto provider in Deno)
    let event
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret,
        undefined,
        cryptoProvider
      )
    } catch (verifyErr: any) {
      console.error('Webhook verification error:', verifyErr.message)
      console.error('Signature:', signature)
      console.error('Timestamp:', timestamp)
      
      // If it's a time-related error, provide more context
      if (verifyErr.message.includes('time') || verifyErr.message.includes('timestamp')) {
        console.error('Current time:', new Date().toISOString())
        console.error('Webhook timestamp (parsed):', timestamp ? new Date(parseInt(timestamp) * 1000).toISOString() : 'N/A')
      }
      
      return new Response(JSON.stringify({ 
        error: 'Webhook verification failed', 
        details: verifyErr.message 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    console.log(`Processing event: ${event.type}`)
    
    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        
        if (session.mode === 'subscription' && session.subscription) {
          const userId = session.metadata?.user_id || session.client_reference_id
          
          if (!userId) {
            console.error('No user_id found in session metadata')
            throw new Error('No user_id found in session metadata')
          }
          
          // Get subscription details
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string,
            { expand: ['items.data.price.product'] }
          )
          
          const priceItem = subscription.items.data[0]
          const product = priceItem?.price.product as Stripe.Product
          
          // Update database via simplified function
          const { data, error: dbError } = await supabaseAdmin
            .rpc('handle_stripe_subscription_update', {
              p_customer_id: subscription.customer as string,
              p_subscription_id: subscription.id,
              p_price_id: priceItem?.price.id,
              p_product_id: product?.id || priceItem?.price.product as string,
              p_status: subscription.status,
              p_current_period_end: subscription.current_period_end 
                ? new Date(subscription.current_period_end * 1000).toISOString()
                : null,
              p_cancel_at_period_end: subscription.cancel_at_period_end,
              p_metadata: { user_id: userId }
            })
          
          if (dbError) {
            console.error('Database update error:', dbError)
            throw dbError
          }
          
          console.log(`Subscription created for user ${userId}:`, data)
        }
        break
      }
      
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const priceItem = subscription.items.data[0]
        
        // Cast event to get previous_attributes for tracking changes
        const updateEvent = event as any
        const previousAttributes = updateEvent.data?.previous_attributes || {}
        
        // Detect if this is a plan change by checking if price/product changed
        const previousPriceId = previousAttributes.items?.data?.[0]?.price?.id
        const currentPriceId = priceItem?.price.id
        const isPlanChange = previousPriceId && previousPriceId !== currentPriceId
        
        // Get user_id first to ensure proper tracking
        const userId = await supabaseAdmin
          .rpc('get_user_by_stripe_customer', {
            p_customer_id: subscription.customer as string
          })
          .then((res: any) => res.data)
        
        console.log(`Subscription update for customer ${subscription.customer}:`, {
          user_id: userId,
          isPlanChange,
          previousPriceId,
          currentPriceId,
          status: subscription.status,
          previousStatus: previousAttributes.status
        })
        
        // Build metadata with tracking information
        const metadata: any = {
          user_id: userId,
          event_type: 'subscription.updated'
        }
        
        // Add plan change tracking if applicable
        if (isPlanChange) {
          metadata.plan_change = {
            from_price_id: previousPriceId,
            to_price_id: currentPriceId,
            from_product_id: previousAttributes.items?.data?.[0]?.price?.product,
            to_product_id: priceItem?.price.product
          }
          
          console.log('Plan change detected:', metadata.plan_change)
        }
        
        // Track status changes
        if (previousAttributes.status && previousAttributes.status !== subscription.status) {
          metadata.status_change = {
            from: previousAttributes.status,
            to: subscription.status
          }
        }
        
        // Track cancellation changes
        if (previousAttributes.cancel_at_period_end !== undefined && 
            previousAttributes.cancel_at_period_end !== subscription.cancel_at_period_end) {
          metadata.cancellation_change = {
            from: previousAttributes.cancel_at_period_end,
            to: subscription.cancel_at_period_end
          }
        }
        
        // Update subscription with enhanced tracking
        const { data, error: dbError } = await supabaseAdmin
          .rpc('handle_stripe_subscription_update', {
            p_customer_id: subscription.customer as string,
            p_subscription_id: subscription.id,
            p_price_id: priceItem?.price.id,
            p_product_id: priceItem?.price.product as string,
            p_status: subscription.status,
            p_current_period_end: subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000).toISOString()
              : null,
            p_cancel_at_period_end: subscription.cancel_at_period_end,
            p_metadata: metadata
          })
        
        if (dbError) {
          console.error('Database update error:', dbError)
          throw dbError
        }
        
        if (!data?.success) {
          console.error('Subscription update failed:', data)
          // Still process but log the issue
        }
        
        // If plan changed, ensure proper role transition
        if (isPlanChange && data?.success) {
          console.log('Processing role transition for plan change:', {
            user_id: data.user_id,
            new_role_id: data.role_id,
            action: data.action
          })
          
          // The RPC function handles role transitions, but we log for monitoring
          // Additional actions could be triggered here if needed (e.g., email notifications)
        }
        
        console.log(`Subscription updated processed:`, {
          ...data,
          changes_detected: {
            plan_change: isPlanChange,
            status_change: !!metadata.status_change,
            cancellation_change: !!metadata.cancellation_change
          }
        })
        break
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const priceItem = subscription.items.data[0]
        
        // Get user_id for proper tracking
        const userId = await supabaseAdmin
          .rpc('get_user_by_stripe_customer', {
            p_customer_id: subscription.customer as string
          })
          .then((res: any) => res.data)
        
        console.log(`Subscription deletion for customer ${subscription.customer}:`, {
          user_id: userId,
          subscription_id: subscription.id,
          final_status: subscription.status
        })
        
        // Update subscription with deletion metadata
        const { data, error: dbError } = await supabaseAdmin
          .rpc('handle_stripe_subscription_update', {
            p_customer_id: subscription.customer as string,
            p_subscription_id: subscription.id,
            p_price_id: priceItem?.price.id,
            p_product_id: priceItem?.price.product as string,
            p_status: subscription.status, // Will be 'canceled'
            p_current_period_end: subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000).toISOString()
              : null,
            p_cancel_at_period_end: subscription.cancel_at_period_end,
            p_metadata: {
              user_id: userId,
              event_type: 'subscription.deleted',
              deleted_at: new Date().toISOString()
            }
          })
        
        if (dbError) {
          console.error('Database update error:', dbError)
          throw dbError
        }
        
        if (!data?.success) {
          console.error('Subscription deletion update failed:', data)
        }
        
        console.log(`Subscription deletion processed:`, data)
        break
      }
      
      case 'invoice.payment_succeeded': {
        // Renewal payment succeeded
        const invoice = event.data.object as Stripe.Invoice
        
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            invoice.subscription as string
          )
          
          const priceItem = subscription.items.data[0]
          
          // Update subscription status
          const { data, error } = await supabaseAdmin
            .rpc('handle_stripe_subscription_update', {
              p_customer_id: subscription.customer as string,
              p_subscription_id: subscription.id,
              p_price_id: priceItem?.price.id,
              p_product_id: priceItem?.price.product as string,
              p_status: 'active',
              p_current_period_end: subscription.current_period_end
                ? new Date(subscription.current_period_end * 1000).toISOString()
                : null,
              p_cancel_at_period_end: false,
              p_metadata: {}
            })
          
          if (error) {
            console.error('Payment update error:', error)
          }
          
          console.log(`Payment succeeded, subscription renewed:`, data)
        }
        break
      }
      
      case 'invoice.payment_failed': {
        // Payment failed (card declined, etc.)
        const invoice = event.data.object as Stripe.Invoice
        
        if (invoice.subscription) {
          // Update status to past_due
          const { data, error } = await supabaseAdmin
            .rpc('handle_stripe_subscription_update', {
              p_customer_id: invoice.customer as string,
              p_subscription_id: invoice.subscription as string,
              p_price_id: null,
              p_product_id: null,
              p_status: 'past_due',
              p_current_period_end: null,
              p_cancel_at_period_end: null,
              p_metadata: {}
            })
          
          if (error) {
            console.error('Payment failed update error:', error)
          }
          
          console.log(`Payment failed for subscription:`, data)
        }
        break
      }
      
      case 'customer.deleted': {
        // Customer deleted from Stripe - clean up user data
        const customer = event.data.object as Stripe.Customer
        
        console.log(`Processing customer deletion for: ${customer.id}`)
        
        // Get user_id for the customer
        const userId = await supabaseAdmin
          .rpc('get_user_by_stripe_customer', {
            p_customer_id: customer.id
          })
          .then((res: any) => res.data)
        
        if (!userId) {
          console.log(`No user found for deleted customer ${customer.id}`)
          break
        }
        
        console.log(`Removing Stripe data for user ${userId} after customer deletion`)
        
        // Clear all Stripe-related data from user_roles
        const { error } = await supabaseAdmin
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
          .eq('user_id', userId)
        
        if (error) {
          console.error('Error clearing Stripe customer data:', error)
          throw error
        }
        
        console.log(`Successfully cleared Stripe data for user ${userId}`)
        
        // Log the cleanup in metadata for audit purposes
        const { error: auditError } = await supabaseAdmin
          .from('user_activity_logs')
          .insert({
            user_id: userId,
            action: 'stripe_customer_deleted',
            metadata: {
              customer_id: customer.id,
              deleted_at: new Date().toISOString(),
              ...(customer.email ? { customer_email: customer.email } : {})
            }
          })
          .select()
          .single()
        
        if (auditError) {
          // Non-critical - just log the error
          console.error('Failed to log customer deletion audit:', auditError)
        }
        
        break
      }
      
      default:
        console.log(`Unhandled event type: ${event.type}`)
    }
    
    // Always return 200 to acknowledge receipt
    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
    
  } catch (err: any) {
    console.error('Webhook processing error:', err.message)
    
    // More specific error handling
    if (err.message.includes('No signatures found matching')) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid signature', 
          message: 'Webhook secret mismatch - check STRIPE_WEBHOOK_SECRET',
          details: err.message 
        }),
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
    
    return new Response(
      JSON.stringify({ 
        error: 'Webhook processing failed',
        message: err.message 
      }),
      { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
})