#!/usr/bin/env node

/**
 * Admin Management Script for TradingGoose
 * 
 * Usage:
 *   node scripts/manage-admins.js add email@example.com [role]
 *   node scripts/manage-admins.js remove email@example.com
 *   node scripts/manage-admins.js list
 * 
 * Roles: super_admin, admin (default: admin)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables.');
  console.error('Make sure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

// Create Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function addAdmin(email, role = 'admin') {
  try {
    // Get user by email
    const { data: users, error: userError } = await supabase
      .from('auth.users')
      .select('id')
      .eq('email', email)
      .single();

    if (userError || !users) {
      // Try using auth.admin API
      const { data: { users: authUsers }, error: authError } = await supabase.auth.admin.listUsers();
      
      if (authError) {
        console.error('❌ Error finding user:', authError.message);
        return;
      }

      const user = authUsers.find(u => u.email === email);
      if (!user) {
        console.error(`❌ User with email ${email} not found. They must sign up first.`);
        return;
      }

      // Add admin role
      const { error: insertError } = await supabase
        .from('admin_roles')
        .insert({
          user_id: user.id,
          role: role,
          created_by: user.id, // Self-created for initial setup
        });

      if (insertError) {
        if (insertError.code === '23505') {
          console.log(`ℹ️  User ${email} already has an admin role.`);
        } else {
          console.error('❌ Error adding admin role:', insertError.message);
        }
        return;
      }

      console.log(`✅ Successfully added ${role} role to ${email}`);
      return;
    }

    // Add admin role
    const { error: insertError } = await supabase
      .from('admin_roles')
      .insert({
        user_id: users.id,
        role: role,
        created_by: users.id,
      });

    if (insertError) {
      if (insertError.code === '23505') {
        console.log(`ℹ️  User ${email} already has an admin role.`);
      } else {
        console.error('❌ Error adding admin role:', insertError.message);
      }
      return;
    }

    console.log(`✅ Successfully added ${role} role to ${email}`);
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

async function removeAdmin(email) {
  try {
    // Get user by email
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('❌ Error finding user:', authError.message);
      return;
    }

    const user = users.find(u => u.email === email);
    if (!user) {
      console.error(`❌ User with email ${email} not found.`);
      return;
    }

    // Deactivate admin role
    const { error: updateError } = await supabase
      .from('admin_roles')
      .update({ is_active: false })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('❌ Error removing admin role:', updateError.message);
      return;
    }

    console.log(`✅ Successfully removed admin role from ${email}`);
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

async function listAdmins() {
  try {
    const { data: admins, error } = await supabase
      .from('admin_roles')
      .select('*, user:auth.users(email)')
      .eq('is_active', true);

    if (error) {
      // Fallback: try to get admin roles without join
      const { data: adminRoles, error: rolesError } = await supabase
        .from('admin_roles')
        .select('*')
        .eq('is_active', true);

      if (rolesError) {
        console.error('❌ Error listing admins:', rolesError.message);
        return;
      }

      console.log('\n📋 Active Admins:');
      console.log('================');
      for (const admin of adminRoles || []) {
        console.log(`- User ID: ${admin.user_id}`);
        console.log(`  Role: ${admin.role}`);
        console.log(`  Added: ${new Date(admin.created_at).toLocaleDateString()}`);
        console.log('');
      }
      return;
    }

    console.log('\n📋 Active Admins:');
    console.log('================');
    for (const admin of admins || []) {
      console.log(`- ${admin.user?.email || 'Unknown'}`);
      console.log(`  Role: ${admin.role}`);
      console.log(`  Added: ${new Date(admin.created_at).toLocaleDateString()}`);
      console.log('');
    }

    if (!admins || admins.length === 0) {
      console.log('No admins configured.');
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

// Parse command line arguments
const [,, command, ...args] = process.argv;

switch (command) {
  case 'add':
    if (args.length < 1) {
      console.error('Usage: node manage-admins.js add email@example.com [role]');
      process.exit(1);
    }
    addAdmin(args[0], args[1]);
    break;

  case 'remove':
    if (args.length < 1) {
      console.error('Usage: node manage-admins.js remove email@example.com');
      process.exit(1);
    }
    removeAdmin(args[0]);
    break;

  case 'list':
    listAdmins();
    break;

  default:
    console.log(`
Admin Management Script

Usage:
  node scripts/manage-admins.js add email@example.com [role]    - Add admin (roles: super_admin, admin)
  node scripts/manage-admins.js remove email@example.com        - Remove admin
  node scripts/manage-admins.js list                            - List all admins

Examples:
  node scripts/manage-admins.js add brucewj2310@gmail.com super_admin
  node scripts/manage-admins.js add team@example.com admin
  node scripts/manage-admins.js list
    `);
    break;
}