

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "cron";






COMMENT ON SCHEMA "public" IS 'TradingGoose public schema - Status simplification applied 2025-08-28:
1. Removed AWAITING_APPROVAL status from all tables
2. Analyses and rebalances now complete directly with COMPLETED status
3. Trade orders maintain independent PENDING/APPROVED/REJECTED status
4. Simplified workflow: analysis/rebalance work completes, trade orders await approval separately';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "wrappers" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."activate_pending_downgrades"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_processed_count INTEGER := 0;
    v_record RECORD;
BEGIN
    -- Find all expired higher-tier roles with pending downgrades
    FOR v_record IN
        SELECT 
            ur_current.user_id,
            ur_current.role_id as old_role_id,
            ur_pending.role_id as new_role_id,
            ur_pending.stripe_subscription_id,
            ur_pending.stripe_customer_id,
            ur_pending.stripe_price_id,
            ur_current.expires_at
        FROM public.user_roles ur_current
        JOIN public.user_roles ur_pending ON ur_pending.user_id = ur_current.user_id
        WHERE ur_current.is_active = true
          AND ur_current.subscription_status = 'active_pending_downgrade'
          AND ur_current.expires_at <= NOW()
          AND ur_pending.is_active = false
          AND ur_pending.subscription_status = 'pending_activation'
    LOOP
        -- Deactivate the old (higher) role
        UPDATE public.user_roles
        SET is_active = false,
            subscription_status = 'downgraded',
            updated_at = NOW()
        WHERE user_id = v_record.user_id
          AND role_id = v_record.old_role_id;
        
        -- Activate the new (lower) role
        UPDATE public.user_roles
        SET is_active = true,
            subscription_status = 'active',
            expires_at = NULL, -- Clear expiration as it's now active
            updated_at = NOW()
        WHERE user_id = v_record.user_id
          AND role_id = v_record.new_role_id;
        
        -- Log the activation
        INSERT INTO public.role_audit_log (
            user_id, target_user_id, action, role_id, details
        ) VALUES (
            v_record.user_id, v_record.user_id,
            'downgrade_activated',
            v_record.new_role_id,
            jsonb_build_object(
                'from_role_id', v_record.old_role_id,
                'to_role_id', v_record.new_role_id,
                'subscription_id', v_record.stripe_subscription_id,
                'activated_at', NOW()
            )
        );
        
        v_processed_count := v_processed_count + 1;
        RAISE NOTICE 'Activated downgrade for user % from role % to %', 
            v_record.user_id, v_record.old_role_id, v_record.new_role_id;
    END LOOP;
    
    RETURN v_processed_count;
END;
$$;


ALTER FUNCTION "public"."activate_pending_downgrades"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."activate_pending_downgrades"() IS 'Activates pending subscription downgrades when their billing period expires.
Should be run hourly via pg_cron to ensure timely role transitions.';



CREATE OR REPLACE FUNCTION "public"."admin_delete_user"("p_target_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_current_user_id UUID;
    v_is_admin BOOLEAN := false;
    v_target_email TEXT;
BEGIN
    -- Get current user
    v_current_user_id := auth.uid();
    
    IF v_current_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Not authenticated'
        );
    END IF;
    
    -- Check if current user has admin role
    SELECT EXISTS(
        SELECT 1 
        FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = v_current_user_id
        AND ur.is_active = true
        AND r.name = 'admin'
    ) INTO v_is_admin;
    
    -- If not admin by role, check if first user (fallback admin)
    IF NOT v_is_admin THEN
        SELECT v_current_user_id = (
            SELECT id FROM auth.users 
            ORDER BY created_at ASC 
            LIMIT 1
        ) INTO v_is_admin;
    END IF;
    
    IF NOT v_is_admin THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unauthorized: Only admins can delete users'
        );
    END IF;
    
    -- Prevent self-deletion
    IF p_target_user_id = v_current_user_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot delete your own account'
        );
    END IF;
    
    -- Check if target user exists
    SELECT email INTO v_target_email 
    FROM auth.users 
    WHERE id = p_target_user_id;
    
    IF v_target_email IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found'
        );
    END IF;
    
    -- Perform the deletion
    BEGIN
        -- Delete from role_audit_log (using parameter name with prefix)
        DELETE FROM public.role_audit_log ral
        WHERE ral.user_id = p_target_user_id 
           OR ral.target_user_id = p_target_user_id;
        
        -- Delete from user_roles (using parameter name with prefix)
        DELETE FROM public.user_roles ur
        WHERE ur.user_id = p_target_user_id 
           OR ur.granted_by = p_target_user_id;
        
        -- Delete from other tables that might not have CASCADE set
        DELETE FROM public.user_usage WHERE user_id = p_target_user_id;
        DELETE FROM public.invitations WHERE invited_by = p_target_user_id OR confirmed_user_id = p_target_user_id;
        
        -- Now delete from auth.users (this will cascade to all other tables)
        DELETE FROM auth.users WHERE id = p_target_user_id;
        
        RETURN jsonb_build_object(
            'success', true,
            'message', 'User deleted successfully'
        );
        
    EXCEPTION
        WHEN OTHERS THEN
            -- Return the actual error for debugging
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Failed to delete user: ' || SQLERRM
            );
    END;
END;
$$;


ALTER FUNCTION "public"."admin_delete_user"("p_target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_default_role_to_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
    v_user_count integer;
    v_role_id uuid;
    v_role_name text;
    v_expires_at timestamptz := null;
begin
    -- Count existing users (excluding the new row) to determine if this is the very first signup
    select count(*) into v_user_count
    from auth.users
    where created_at < new.created_at
       or (created_at = new.created_at and id < new.id);

    if v_user_count = 0 then
        -- First user gets admin role
        v_role_name := 'admin';
        select id into v_role_id from public.roles where name = v_role_name;
        v_expires_at := null;
    else
        -- Everyone else receives the default role
        v_role_name := 'default';
        select id into v_role_id from public.roles where name = v_role_name;
        v_expires_at := null;
    end if;

    -- Create or update the profile entry
    insert into public.profiles (id, email, created_at)
    values (new.id, new.email, new.created_at)
    on conflict (id) do update
        set email = excluded.email,
            updated_at = now();

    -- Assign role if we found one; split insert/update to avoid "ON CONFLICT" double-update errors
    if v_role_id is not null then
        insert into public.user_roles (user_id, role_id, is_active, granted_by, expires_at)
        values (new.id, v_role_id, true, new.id, v_expires_at)
        on conflict (user_id, role_id) do nothing;

        update public.user_roles
        set is_active = true,
            granted_by = coalesce(granted_by, new.id),
            expires_at = v_expires_at,
            updated_at = now()
        where user_id = new.id
          and role_id = v_role_id;
    else
        raise warning 'No role could be assigned to user % because role % is missing', new.email, v_role_name;
    end if;

    return new;
end;
$$;


ALTER FUNCTION "public"."assign_default_role_to_new_user"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."assign_default_role_to_new_user"() IS 'Assigns roles to new users on signup. First user gets admin role, all subsequent users get default role without expiration. Updated 2025-09-21 to remove max role with trial period.';



CREATE OR REPLACE FUNCTION "public"."assign_user_role"("p_user_id" "uuid", "p_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_role_id UUID;
    v_is_first_user BOOLEAN;
BEGIN
    -- Check if this is the first user
    SELECT COUNT(*) = 0 INTO v_is_first_user
    FROM auth.users
    WHERE id != p_user_id;
    
    -- Get appropriate role
    IF v_is_first_user THEN
        SELECT id INTO v_role_id FROM public.roles WHERE name = 'admin';
    ELSE
        SELECT id INTO v_role_id FROM public.roles WHERE name = 'default';
    END IF;
    
    -- Assign role if found
    IF v_role_id IS NOT NULL THEN
        INSERT INTO public.user_roles (user_id, role_id, is_active, granted_by)
        VALUES (p_user_id, v_role_id, true, p_user_id)
        ON CONFLICT DO NOTHING;
    END IF;
    
    -- Update invitation if exists
    UPDATE public.invitations
    SET 
        status = 'confirmed',
        confirmed_at = NOW(),
        confirmed_user_id = p_user_id
    WHERE LOWER(email) = LOWER(p_email)
    AND status IN ('pending', 'sent');
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Role assignment error for user %: %', p_user_id, SQLERRM;
END;
$$;


ALTER FUNCTION "public"."assign_user_role"("p_user_id" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_user_role_with_expiration"("p_user_id" "uuid", "p_role_id" "uuid", "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_current_user_id UUID;
    v_role_name TEXT;
    v_is_admin BOOLEAN := false;
    v_can_assign BOOLEAN := false;
BEGIN
    -- Get current user
    v_current_user_id := auth.uid();
    
    IF v_current_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Not authenticated'
        );
    END IF;
    
    -- Check if current user has admin role or roles.assign permission
    SELECT EXISTS(
        SELECT 1 
        FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = v_current_user_id
        AND ur.is_active = true
        AND r.name = 'admin'
    ) INTO v_is_admin;

    -- Get the role name
    SELECT name INTO v_role_name
    FROM public.roles
    WHERE id = p_role_id;

    -- Prevent expiration dates on admin and default roles
    IF v_role_name IN ('admin', 'default') AND p_expires_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot set expiration on admin or default roles'
        );
    END IF;

    -- Check permissions
    IF NOT v_is_admin THEN
        -- Check if user has role assignment permission
        SELECT EXISTS(
            SELECT 1
            FROM public.role_permissions rp
            JOIN public.user_roles ur ON ur.role_id = rp.role_id
            WHERE ur.user_id = v_current_user_id
            AND ur.is_active = true
            AND rp.permission_name = 'roles.assign'
        ) INTO v_can_assign;
        
        IF NOT v_can_assign THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Insufficient permissions to assign roles'
            );
        END IF;
    END IF;

    -- Deactivate any existing active roles for the user
    UPDATE public.user_roles
    SET is_active = false,
        updated_at = NOW()
    WHERE user_id = p_user_id
    AND is_active = true;

    -- Insert or update the new role assignment with expiration
    INSERT INTO public.user_roles (
        user_id, 
        role_id, 
        granted_by, 
        is_active, 
        expires_at,
        created_at, 
        updated_at
    )
    VALUES (
        p_user_id, 
        p_role_id, 
        v_current_user_id, 
        true, 
        p_expires_at,
        NOW(), 
        NOW()
    )
    ON CONFLICT (user_id, role_id) 
    DO UPDATE SET 
        is_active = true,
        expires_at = p_expires_at,
        granted_by = v_current_user_id,
        updated_at = NOW();

    -- Add to role audit log (using 'details' column, not 'metadata')
    INSERT INTO public.role_audit_log (
        user_id,
        target_user_id,
        action,
        role_id,
        details
    )
    VALUES (
        v_current_user_id,
        p_user_id,
        'role_assigned',
        p_role_id,
        jsonb_build_object(
            'expires_at', p_expires_at,
            'role_name', v_role_name
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Role assigned successfully',
        'expires_at', p_expires_at
    );
END;
$$;


ALTER FUNCTION "public"."assign_user_role_with_expiration"("p_user_id" "uuid", "p_role_id" "uuid", "p_expires_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_assign_first_admin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_user_count INTEGER;
    v_admin_role_id UUID;
BEGIN
    -- Count existing users in profiles
    SELECT COUNT(*) INTO v_user_count FROM public.profiles;
    
    -- If this is the first user, make them admin
    IF v_user_count = 1 THEN
        -- Get admin role ID
        SELECT id INTO v_admin_role_id FROM public.roles WHERE name = 'admin';
        
        -- Assign admin role to the new user
        INSERT INTO public.user_roles (user_id, role_id, is_active)
        VALUES (NEW.id, v_admin_role_id, true)
        ON CONFLICT (user_id, role_id) DO NOTHING;
        
        -- Log the auto-assignment
        INSERT INTO public.role_audit_log (user_id, target_user_id, action, role_id, details)
        VALUES (NEW.id, NEW.id, 'auto_grant', v_admin_role_id, 
                jsonb_build_object('reason', 'First user auto-admin assignment'));
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_assign_first_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_refresh_admin_users"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Refresh the materialized view asynchronously
    PERFORM public.refresh_admin_users();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_refresh_admin_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_rebalance_request"("p_request_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_id UUID;
    v_current_status TEXT;
BEGIN
    -- Get the user_id and current status of the request
    SELECT user_id, status INTO v_user_id, v_current_status
    FROM public.rebalance_requests
    WHERE id = p_request_id;
    
    -- Check if request exists
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rebalance request not found';
    END IF;
    
    -- Check if the user owns this request
    IF v_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: You can only cancel your own rebalance requests';
    END IF;
    
    -- Check if already in terminal state (using unified status)
    IF v_current_status IN ('completed', 'cancelled', 'error') THEN
        RAISE NOTICE 'Rebalance is already %', v_current_status;
        RETURN FALSE;
    END IF;
    
    -- Update the request to cancelled
    UPDATE public.rebalance_requests
    SET 
        status = 'cancelled',
        is_canceled = true,
        updated_at = NOW()
    WHERE id = p_request_id;
    
    -- Also cancel any related analyses that are still running or pending (using unified status)
    -- This fixes the issue where pending analyses were not being cancelled
    UPDATE public.analysis_history
    SET 
        is_canceled = true,
        analysis_status = 'cancelled',
        updated_at = NOW()
    WHERE 
        rebalance_request_id = p_request_id
        AND analysis_status IN ('running', 'pending');  -- Now includes 'pending' status
    
    -- Log the cancellation
    RAISE NOTICE 'Cancelled rebalance request % and its running/pending analyses', p_request_id;
    
    RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."cancel_rebalance_request"("p_request_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cancel_rebalance_request"("p_request_id" "uuid") IS 'Safely cancels a rebalance request and its associated analyses. 
Cancels both running and pending analyses (fixed to include pending).
Only the owner can cancel their own requests.
Returns TRUE if successfully cancelled, FALSE if already in terminal state.';



CREATE OR REPLACE FUNCTION "public"."check_admin_exists"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE r.name IN ('admin', 'super_admin')
          AND ur.is_active = true
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    );
END;
$$;


ALTER FUNCTION "public"."check_admin_exists"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_analysis_exists"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only check for individual_analysis source type
  IF NEW.source_type = 'individual_analysis' AND NEW.analysis_id IS NOT NULL THEN
    -- Verify the analysis exists
    IF NOT EXISTS (
      SELECT 1 FROM public.analysis_history 
      WHERE id = NEW.analysis_id
    ) THEN
      RAISE EXCEPTION 'Analysis with ID % does not exist', NEW.analysis_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_analysis_exists"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_and_expire_roles"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_default_role_id UUID;
    v_expired_count INT := 0;
BEGIN
    -- Get the default role ID (it should already exist from database initialization)
    SELECT id INTO v_default_role_id 
    FROM public.roles 
    WHERE name = 'default' 
    LIMIT 1;

    -- If no default role exists, log error and exit
    IF v_default_role_id IS NULL THEN
        RAISE WARNING 'Default role not found. Cannot expire roles without a default role.';
        RETURN;
    END IF;

    -- Deactivate expired roles (except admin and default roles)
    WITH expired_roles AS (
        UPDATE public.user_roles ur
        SET is_active = false,
            updated_at = NOW()
        FROM public.roles r
        WHERE ur.role_id = r.id
          AND ur.is_active = true
          AND ur.expires_at IS NOT NULL
          AND ur.expires_at <= NOW()
          AND r.name NOT IN ('admin', 'default')
        RETURNING ur.user_id
    )
    SELECT COUNT(*) INTO v_expired_count FROM expired_roles;

    -- Assign default role to users who just had their roles expired
    IF v_expired_count > 0 THEN
        INSERT INTO public.user_roles (user_id, role_id, is_active, created_at, updated_at)
        SELECT DISTINCT user_id, v_default_role_id, true, NOW(), NOW()
        FROM (
            SELECT ur.user_id
            FROM public.user_roles ur
            WHERE ur.is_active = false
              AND ur.updated_at >= NOW() - INTERVAL '1 minute'
              AND NOT EXISTS (
                  -- Check if user has any other active role
                  SELECT 1
                  FROM public.user_roles ur2
                  WHERE ur2.user_id = ur.user_id
                    AND ur2.is_active = true
              )
        ) AS users_needing_default
        ON CONFLICT (user_id, role_id) 
        DO UPDATE SET 
            is_active = true,
            updated_at = NOW();
    END IF;

    -- Log the expiration activity
    IF v_expired_count > 0 THEN
        RAISE NOTICE 'Expired % role(s) and assigned default roles', v_expired_count;
    END IF;
END;
$$;


ALTER FUNCTION "public"."check_and_expire_roles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_role_and_update_access_settings"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_schedule RECORD;
    v_user_resolution TEXT;
    v_paused_count INT := 0;
    v_resolution_allowed BOOLEAN;
    v_schedule_resolution TEXT;
    v_near_limit_access BOOLEAN;
    v_auto_disabled_count INT := 0;
    v_user_with_auto RECORD;
BEGIN
    -- Loop through all enabled schedules
    FOR v_schedule IN
        SELECT
            rs.id,
            rs.user_id,
            rs.interval_unit,
            rs.interval_value,
            rs.enabled
        FROM public.rebalance_schedules rs
        WHERE rs.enabled = true
    LOOP
        -- Get role-based schedule resolution and near limit access for this user
        v_near_limit_access := false;

        SELECT schedule_resolution, near_limit_analysis_access
        INTO v_user_resolution, v_near_limit_access
        FROM public.role_limits rl
        JOIN public.user_roles ur ON rl.role_id = ur.role_id
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = v_schedule.user_id
          AND ur.is_active = true
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        ORDER BY r.priority DESC
        LIMIT 1;

        IF v_user_resolution IS NULL THEN
            v_user_resolution := 'Month';
        END IF;

        IF v_near_limit_access IS NULL THEN
            v_near_limit_access := false;
        END IF;

        -- Map interval unit to schedule resolution bucket
        v_schedule_resolution := CASE
            WHEN v_schedule.interval_unit = 'days' THEN 'Day'
            WHEN v_schedule.interval_unit = 'weeks' THEN 'Week'
            WHEN v_schedule.interval_unit = 'months' THEN 'Month'
            ELSE 'unknown'
        END;

        v_resolution_allowed := false;
        IF v_user_resolution LIKE '%' || v_schedule_resolution || '%' THEN
            v_resolution_allowed := true;
        END IF;

        -- Pause schedules that exceed role resolution
        IF NOT v_resolution_allowed THEN
            UPDATE public.rebalance_schedules
            SET
                enabled = false,
                updated_at = NOW()
            WHERE id = v_schedule.id;

            v_paused_count := v_paused_count + 1;

            RAISE NOTICE 'Paused schedule % for user % - role resolution "%" does not allow "%" resolution (% %)',
                v_schedule.id, v_schedule.user_id, v_user_resolution,
                v_schedule_resolution, v_schedule.interval_value, v_schedule.interval_unit;
        END IF;

        -- Enforce auto_near_limit_analysis access on the fly
        IF NOT v_near_limit_access THEN
            UPDATE public.api_settings
            SET
                auto_near_limit_analysis = false,
                updated_at = NOW()
            WHERE user_id = v_schedule.user_id
              AND auto_near_limit_analysis = true;

            IF FOUND THEN
                v_auto_disabled_count := v_auto_disabled_count + 1;
                RAISE NOTICE 'Disabled auto_near_limit_analysis for user % due to role access restrictions (schedule loop)', v_schedule.user_id;
            END IF;
        END IF;
    END LOOP;

    IF v_paused_count > 0 THEN
        RAISE NOTICE 'Paused % schedule(s) due to role resolution restrictions', v_paused_count;
    END IF;

    -- Sweep users without active schedules who still have auto_near_limit_analysis enabled
    FOR v_user_with_auto IN
        SELECT aps.user_id
        FROM public.api_settings aps
        WHERE aps.auto_near_limit_analysis = true
          AND NOT EXISTS (
              SELECT 1
              FROM public.rebalance_schedules rs
              WHERE rs.user_id = aps.user_id
                AND rs.enabled = true
          )
    LOOP
        v_near_limit_access := false;

        SELECT near_limit_analysis_access
        INTO v_near_limit_access
        FROM public.role_limits rl
        JOIN public.user_roles ur ON rl.role_id = ur.role_id
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = v_user_with_auto.user_id
          AND ur.is_active = true
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        ORDER BY r.priority DESC
        LIMIT 1;

        IF v_near_limit_access IS NULL THEN
            v_near_limit_access := false;
        END IF;

        IF NOT v_near_limit_access THEN
            UPDATE public.api_settings
            SET
                auto_near_limit_analysis = false,
                updated_at = NOW()
            WHERE user_id = v_user_with_auto.user_id
              AND auto_near_limit_analysis = true;

            IF FOUND THEN
                v_auto_disabled_count := v_auto_disabled_count + 1;
                RAISE NOTICE 'Disabled auto_near_limit_analysis for user % due to role access restrictions (settings sweep)', v_user_with_auto.user_id;
            END IF;
        END IF;
    END LOOP;

    IF v_auto_disabled_count > 0 THEN
        RAISE NOTICE 'Disabled auto_near_limit_analysis for % user(s) lacking role access', v_auto_disabled_count;
    END IF;
END;
$$;


ALTER FUNCTION "public"."check_role_and_update_access_settings"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_role_and_update_access_settings"() IS 'Checks all rebalance schedules against user role-based schedule resolution limits, pauses incompatible schedules, and disables auto_near_limit_analysis for users whose roles lack access.
Strict resolution mapping:
- Schedule with interval_unit="days" requires role resolution containing "Day"
- Schedule with interval_unit="weeks" requires role resolution containing "Week"
- Schedule with interval_unit="months" requires role resolution containing "Month"
Role resolutions can be comma-separated (e.g., "Day,Week,Month" allows all three types).';



CREATE OR REPLACE FUNCTION "public"."cleanup_multiple_active_roles"() RETURNS TABLE("user_id" "uuid", "kept_role" "text", "deactivated_roles" "text"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_user RECORD;
    v_deactivated TEXT[];
BEGIN
    -- Find users with multiple active roles
    FOR v_user IN 
        SELECT ur.user_id, COUNT(*) as role_count
        FROM public.user_roles ur
        WHERE ur.is_active = true
        GROUP BY ur.user_id
        HAVING COUNT(*) > 1
    LOOP
        -- Get all active roles for this user except the highest priority one
        WITH highest_priority AS (
            SELECT ur.role_id
            FROM public.user_roles ur
            JOIN public.roles r ON r.id = ur.role_id
            WHERE ur.user_id = v_user.user_id
            AND ur.is_active = true
            ORDER BY r.priority DESC
            LIMIT 1
        ),
        roles_to_deactivate AS (
            UPDATE public.user_roles ur
            SET is_active = false,
                updated_at = NOW()
            WHERE ur.user_id = v_user.user_id
            AND ur.is_active = true
            AND ur.role_id NOT IN (SELECT role_id FROM highest_priority)
            RETURNING (SELECT name FROM public.roles WHERE id = ur.role_id)
        )
        SELECT ARRAY_AGG(name) INTO v_deactivated FROM roles_to_deactivate;
        
        -- Return the result for this user
        RETURN QUERY
        SELECT 
            v_user.user_id,
            (SELECT r.name::TEXT FROM public.user_roles ur 
             JOIN public.roles r ON r.id = ur.role_id 
             WHERE ur.user_id = v_user.user_id 
             AND ur.is_active = true 
             LIMIT 1) as kept_role,
            v_deactivated as deactivated_roles;
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."cleanup_multiple_active_roles"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_multiple_active_roles"() IS 'Cleans up users with multiple active roles, keeping only the highest priority role active';



CREATE OR REPLACE FUNCTION "public"."confirm_invitation_on_signup"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Update invitation status when a new user confirms their email
  UPDATE public.invitations
  SET 
    confirmed_at = NOW(),
    confirmed_user_id = NEW.id,
    status = 'confirmed'
  WHERE email = NEW.email
  AND status = 'pending';
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."confirm_invitation_on_signup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_role_safely"("p_role_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_role_name TEXT;
    v_is_built_in BOOLEAN;
BEGIN
    -- Get role info
    SELECT name, is_built_in INTO v_role_name, v_is_built_in
    FROM public.roles
    WHERE id = p_role_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role not found';
    END IF;
    
    IF v_is_built_in THEN
        RAISE EXCEPTION 'Cannot delete built-in role %', v_role_name;
    END IF;
    
    -- Delete in correct order to avoid foreign key violations
    
    -- 1. Delete user_roles assignments
    DELETE FROM public.user_roles WHERE role_id = p_role_id;
    
    -- 2. Delete role_permissions
    DELETE FROM public.role_permissions WHERE role_id = p_role_id;
    
    -- 3. Delete role_limits
    DELETE FROM public.role_limits WHERE role_id = p_role_id;
    
    -- 4. Delete from role_audit_log
    DELETE FROM public.role_audit_log WHERE role_id = p_role_id;
    
    -- 5. Finally delete the role
    DELETE FROM public.roles WHERE id = p_role_id;
    
    RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."delete_role_safely"("p_role_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_admin_exists"() RETURNS TABLE("admin_exists" boolean, "admin_assigned" boolean, "assigned_user_id" "uuid", "assigned_user_email" "text", "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_admin_exists BOOLEAN;
    v_user_count INTEGER;
    v_earliest_user_id UUID;
    v_earliest_user_email TEXT;
    v_admin_role_id UUID;
BEGIN
    -- Check if admin exists
    v_admin_exists := public.check_admin_exists();
    
    -- If admin exists, return immediately
    IF v_admin_exists THEN
        RETURN QUERY
        SELECT 
            true AS admin_exists,
            false AS admin_assigned,
            NULL::UUID AS assigned_user_id,
            NULL::TEXT AS assigned_user_email,
            'Admin already exists'::TEXT AS message;
        RETURN;
    END IF;
    
    -- No admin exists, check if there are any users
    SELECT COUNT(*) INTO v_user_count FROM auth.users;
    
    -- If no users, return
    IF v_user_count = 0 THEN
        RETURN QUERY
        SELECT 
            false AS admin_exists,
            false AS admin_assigned,
            NULL::UUID AS assigned_user_id,
            NULL::TEXT AS assigned_user_email,
            'No users exist in the system'::TEXT AS message;
        RETURN;
    END IF;
    
    -- Get the earliest user
    v_earliest_user_id := public.get_earliest_user();
    
    -- Get user email
    SELECT email INTO v_earliest_user_email
    FROM auth.users
    WHERE id = v_earliest_user_id;
    
    -- Get or create admin role
    SELECT id INTO v_admin_role_id
    FROM public.roles
    WHERE name = 'admin';
    
    -- If admin role doesn't exist, create it
    IF v_admin_role_id IS NULL THEN
        INSERT INTO public.roles (name, display_name, description, priority)
        VALUES ('admin', 'Administrator', 'Administrative access with user management', 80)
        RETURNING id INTO v_admin_role_id;
        
        -- Create default permissions if they don't exist
        INSERT INTO public.permissions (name, description, category)
        VALUES 
            ('users.create', 'Create new users', 'users'),
            ('users.read', 'Read user data', 'users'),
            ('users.update', 'Update user data', 'users'),
            ('roles.assign', 'Assign roles to users', 'roles'),
            ('roles.manage', 'Manage role definitions', 'roles')
        ON CONFLICT (name) DO NOTHING;
        
        -- Assign permissions to admin role
        INSERT INTO public.role_permissions (role_id, permission_id)
        SELECT v_admin_role_id, id FROM public.permissions 
        WHERE name IN (
            'users.create', 'users.read', 'users.update',
            'roles.assign', 'roles.manage'
        )
        ON CONFLICT DO NOTHING;
        
        -- Create default limits for admin role
        INSERT INTO public.role_limits (
            role_id,
            max_analysis_per_day,
            max_rebalance_per_day,
            max_watchlist_stocks,
            max_rebalance_stocks,
            max_scheduled_rebalances,
            rebalance_access,
            opportunity_agent_access,
            additional_provider_access
        ) VALUES (
            v_admin_role_id,
            100,
            50,
            100,
            50,
            20,
            true,
            true,
            true
        )
        ON CONFLICT (role_id) DO NOTHING;
    END IF;
    
    -- Assign admin role to the earliest user
    INSERT INTO public.user_roles (user_id, role_id, is_active, granted_by)
    VALUES (v_earliest_user_id, v_admin_role_id, true, v_earliest_user_id)
    ON CONFLICT (user_id, role_id) 
    DO UPDATE SET 
        is_active = true,
        updated_at = NOW();
    
    -- Log the auto-assignment
    INSERT INTO public.role_audit_log (user_id, target_user_id, action, role_id, details)
    VALUES (
        v_earliest_user_id, 
        v_earliest_user_id, 
        'auto_grant', 
        v_admin_role_id,
        jsonb_build_object(
            'reason', 'Auto-assigned as first user when no admin existed',
            'timestamp', NOW()
        )
    );
    
    RETURN QUERY
    SELECT 
        false AS admin_exists,
        true AS admin_assigned,
        v_earliest_user_id AS assigned_user_id,
        v_earliest_user_email AS assigned_user_email,
        format('Admin role assigned to earliest user: %s', v_earliest_user_email)::TEXT AS message;
END;
$$;


ALTER FUNCTION "public"."ensure_admin_exists"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_single_active_role"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- If setting a role to active, deactivate all other roles for this user
    IF NEW.is_active = true THEN
        UPDATE public.user_roles
        SET is_active = false,
            updated_at = NOW()
        WHERE user_id = NEW.user_id
        AND id != NEW.id
        AND is_active = true;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ensure_single_active_role"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."ensure_single_active_role"() IS 'Ensures only one role can be active per user at any time';



CREATE OR REPLACE FUNCTION "public"."ensure_single_active_role_for_user"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_active_count INTEGER;
    v_highest_priority_role_id UUID;
BEGIN
    -- Count active roles
    SELECT COUNT(*) INTO v_active_count
    FROM public.user_roles
    WHERE user_id = p_user_id AND is_active = true;
    
    -- If more than one active role, keep only the highest priority
    IF v_active_count > 1 THEN
        -- Find the highest priority active role
        SELECT ur.role_id INTO v_highest_priority_role_id
        FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = p_user_id
          AND ur.is_active = true
        ORDER BY r.priority DESC
        LIMIT 1;
        
        -- Deactivate all other roles
        UPDATE public.user_roles
        SET is_active = false,
            updated_at = NOW()
        WHERE user_id = p_user_id
          AND is_active = true
          AND role_id != v_highest_priority_role_id;
    END IF;
END;
$$;


ALTER FUNCTION "public"."ensure_single_active_role_for_user"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."ensure_single_active_role_for_user"("p_user_id" "uuid") IS 'Utility function to ensure a user has only one active role.
Keeps the highest priority role active and deactivates all others.';



CREATE OR REPLACE FUNCTION "public"."extract_discord_id_from_identity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- When a Discord identity is linked, extract the Discord user ID
  IF NEW.provider = 'discord' THEN
    UPDATE public.profiles
    SET discord_id = NEW.provider_id
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."extract_discord_id_from_identity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."force_assign_admin_to_first_user"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_admin_role_id UUID;
    v_is_first_user BOOLEAN;
    v_admin_exists BOOLEAN;
BEGIN
    -- Get current user
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Not authenticated'
        );
    END IF;
    
    -- Get user email
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
    
    -- Check if user is first user
    v_is_first_user := v_user_id = (
        SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1
    );
    
    -- Check if admin exists
    v_admin_exists := EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE r.name = 'admin'
          AND ur.is_active = true
    );
    
    -- Only proceed if user is first user or no admin exists
    IF NOT v_is_first_user AND v_admin_exists THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'You are not the first user and an admin already exists',
            'isFirstUser', v_is_first_user,
            'adminExists', v_admin_exists
        );
    END IF;
    
    -- Get or create admin role
    SELECT id INTO v_admin_role_id FROM public.roles WHERE name = 'admin';
    
    IF v_admin_role_id IS NULL THEN
        INSERT INTO public.roles (name, display_name, description, priority)
        VALUES ('admin', 'Administrator', 'Full administrative access', 100)
        RETURNING id INTO v_admin_role_id;
        
        -- Create basic permissions
        INSERT INTO public.permissions (name, description, category)
        VALUES 
            ('admin.access', 'Access admin pages', 'admin'),
            ('users.manage', 'Manage users', 'users'),
            ('roles.manage', 'Manage roles', 'roles')
        ON CONFLICT (name) DO NOTHING;
        
        -- Assign permissions
        INSERT INTO public.role_permissions (role_id, permission_id)
        SELECT v_admin_role_id, id FROM public.permissions
        ON CONFLICT DO NOTHING;
        
        -- Create role limits
        INSERT INTO public.role_limits (
            role_id,
            max_analysis_per_day,
            max_rebalance_per_day,
            max_watchlist_stocks,
            max_rebalance_stocks,
            max_scheduled_rebalances,
            rebalance_access,
            opportunity_agent_access,
            additional_provider_access
        ) VALUES (
            v_admin_role_id,
            100, 50, 100, 50, 20, true, true, true
        )
        ON CONFLICT (role_id) DO NOTHING;
    END IF;
    
    -- Assign admin role (SECURITY DEFINER bypasses RLS)
    INSERT INTO public.user_roles (user_id, role_id, is_active, granted_by)
    VALUES (v_user_id, v_admin_role_id, true, v_user_id)
    ON CONFLICT (user_id, role_id)
    DO UPDATE SET
        is_active = true,
        updated_at = NOW();
    
    -- Log the assignment
    INSERT INTO public.role_audit_log (user_id, target_user_id, action, role_id, details)
    VALUES (
        v_user_id,
        v_user_id,
        'force_assign',
        v_admin_role_id,
        jsonb_build_object(
            'reason', 'Force assigned via admin quick fix',
            'is_first_user', v_is_first_user,
            'admin_existed', v_admin_exists
        )
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Admin role successfully assigned',
        'userId', v_user_id,
        'userEmail', v_user_email,
        'roleId', v_admin_role_id,
        'isFirstUser', v_is_first_user
    );
END;
$$;


ALTER FUNCTION "public"."force_assign_admin_to_first_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_role"("user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
    user_role VARCHAR(50);
BEGIN
    SELECT role INTO user_role
    FROM public.admin_roles
    WHERE admin_roles.user_id = $1
    AND is_active = true
    LIMIT 1;
    
    RETURN user_role;
END;
$_$;


ALTER FUNCTION "public"."get_admin_role"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_earliest_user"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- First try to get from profiles table
    SELECT id INTO v_user_id
    FROM public.profiles
    WHERE id IS NOT NULL
    ORDER BY created_at ASC
    LIMIT 1;
    
    -- If no profiles exist, get from auth.users
    IF v_user_id IS NULL THEN
        SELECT id INTO v_user_id
        FROM auth.users
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;
    
    RETURN v_user_id;
END;
$$;


ALTER FUNCTION "public"."get_earliest_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_invitations_with_confirmation_status"() RETURNS TABLE("id" "uuid", "email" "text", "name" "text", "invited_at" timestamp with time zone, "confirmed_at" timestamp with time zone, "status" "text", "invited_by" "uuid", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "confirmed_user_id" "uuid", "is_truly_confirmed" boolean, "user_last_sign_in" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.id,
        i.email,
        i.name,
        i.invited_at,
        i.confirmed_at,
        i.status,
        i.invited_by,
        i.created_at,
        i.updated_at,
        i.confirmed_user_id,
        -- User is only truly confirmed if they have signed in at least once
        CASE 
            WHEN i.confirmed_user_id IS NULL THEN false
            WHEN au.last_sign_in_at IS NOT NULL THEN true
            ELSE false
        END AS is_truly_confirmed,
        au.last_sign_in_at AS user_last_sign_in
    FROM public.invitations i
    LEFT JOIN auth.users au ON au.id = i.confirmed_user_id
    ORDER BY i.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_invitations_with_confirmation_status"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_invitations_with_confirmation_status"() IS 'Returns invitations with true confirmation status based on whether the user has ever signed in';



CREATE OR REPLACE FUNCTION "public"."get_ny_current_date"() RETURNS "date"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT (NOW() AT TIME ZONE 'America/New_York')::DATE;
$$;


ALTER FUNCTION "public"."get_ny_current_date"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_premium_roles"() RETURNS TABLE("id" "uuid", "name" character varying, "display_name" character varying, "description" "text", "color" character varying, "icon_url" "text", "monthly_price" numeric, "yearly_price" numeric, "features" "jsonb", "monthly_price_id" "text", "yearly_price_id" "text", "product_id" "text", "is_most_popular" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.name,
        r.display_name,
        r.description,
        r.color,
        r.icon_url,
        r.price_monthly,
        r.price_yearly,
        r.features,
        r.stripe_price_id_monthly,
        r.stripe_price_id_yearly,
        r.stripe_product_id,
        r.name = 'pro' as is_most_popular
    FROM public.roles r
    WHERE r.price_monthly > 0
    ORDER BY r.priority ASC;
END;
$$;


ALTER FUNCTION "public"."get_premium_roles"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_premium_roles"() IS 'Get available premium roles with Stripe pricing';



CREATE OR REPLACE FUNCTION "public"."get_role_pricing"("p_role_name" "text") RETURNS TABLE("role_name" character varying, "display_name" character varying, "monthly_price" numeric, "yearly_price" numeric, "monthly_price_id" "text", "yearly_price_id" "text", "savings_amount" numeric, "savings_percentage" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.name,
        r.display_name,
        r.price_monthly,
        r.price_yearly,
        r.stripe_price_id_monthly,
        r.stripe_price_id_yearly,
        CASE 
            WHEN r.price_yearly > 0 AND r.price_monthly > 0 THEN 
                (r.price_monthly * 12) - r.price_yearly
            ELSE 0::DECIMAL(10, 2)
        END as savings_amount,
        CASE 
            WHEN r.price_yearly > 0 AND r.price_monthly > 0 THEN 
                ROUND((1 - (r.price_yearly / 12) / r.price_monthly) * 100, 0)::INTEGER
            ELSE 0
        END as savings_percentage
    FROM public.roles r
    WHERE LOWER(r.name) = LOWER(p_role_name);
END;
$$;


ALTER FUNCTION "public"."get_role_pricing"("p_role_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_upcoming_schedules"("p_minutes_ahead" integer DEFAULT 35) RETURNS TABLE("schedule_id" "uuid", "user_id" "uuid", "selected_tickers" "text"[], "include_watchlist" boolean, "interval_value" integer, "interval_unit" "text", "time_of_day" time without time zone, "timezone" "text", "last_executed_at" timestamp with time zone, "next_scheduled_at" timestamp with time zone, "rebalance_threshold" numeric, "skip_threshold_check" boolean, "skip_opportunity_agent" boolean, "resolved_tickers" "text"[], "resolved_constraints" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
    v_schedule record;
    v_next_run timestamptz;
    v_watchlist_tickers text[];
    v_final_tickers text[];
    v_schedule_date date;
    v_schedule_local_time timestamp without time zone;
    v_now timestamptz := now();
    v_window_start timestamptz;
    v_window_end timestamptz;
    v_grace_interval interval := interval '5 minutes';
    v_now_local timestamp without time zone;
    v_anchor_source timestamptz;
    v_anchor_local timestamp without time zone;
    v_anchor_dow integer;
    v_anchor_week_start_date date;
    v_applicable_interval integer;
    v_distinct_days integer[];
    v_max_days_to_check integer;
    v_day_offset integer;
    v_candidate_local_date date;
    v_candidate_dow integer;
    v_candidate_local timestamp without time zone;
    v_candidate_week_start_date date;
    v_candidate_utc timestamptz;
    v_days_diff integer;
begin
    v_window_start := v_now - v_grace_interval;
    v_window_end := v_now + (p_minutes_ahead * interval '1 minute');

    for v_schedule in
        select
            s.id as schedule_id,
            s.user_id,
            s.selected_tickers,
            s.include_watchlist,
            s.interval_value,
            s.interval_unit,
            s.time_of_day,
            s.timezone,
            s.last_executed_at,
            s.day_of_week,
            s.day_of_month,
            s.created_at,
            s.rebalance_threshold,
            s.skip_threshold_check,
            s.skip_opportunity_agent,
            s.resolved_tickers,
            s.resolved_constraints
        from rebalance_schedules s
        where s.enabled = true
        order by s.created_at
    loop
        v_next_run := null;
        v_watchlist_tickers := null;
        v_final_tickers := null;

        if v_schedule.interval_unit = 'weeks'
           and v_schedule.day_of_week is not null
           and array_length(v_schedule.day_of_week, 1) is not null then

            v_distinct_days := array(
                select distinct d
                from unnest(v_schedule.day_of_week) as d
                where d between 0 and 6
                order by d
            );

            if array_length(v_distinct_days, 1) is not null then
                v_now_local := timezone(v_schedule.timezone, v_now);
                v_anchor_source := coalesce(v_schedule.last_executed_at, v_schedule.created_at);
                v_anchor_local := timezone(v_schedule.timezone, v_anchor_source);
                v_anchor_dow := coalesce(cast(extract(dow from v_anchor_local) as integer), 0);
                v_anchor_week_start_date := (v_anchor_local::date - v_anchor_dow);
                v_applicable_interval := greatest(1, v_schedule.interval_value);
                v_max_days_to_check := greatest(v_applicable_interval * 7 * 4, 28);

                for v_day_offset in 0..v_max_days_to_check loop
                    v_candidate_local_date := v_now_local::date + v_day_offset;
                    v_candidate_dow := cast(extract(dow from v_candidate_local_date) as integer);

                    if not v_candidate_dow = any (v_distinct_days) then
                        continue;
                    end if;

                    v_candidate_local := (v_candidate_local_date + v_schedule.time_of_day);
                    v_candidate_week_start_date := (v_candidate_local_date - v_candidate_dow);
                    v_days_diff := v_candidate_week_start_date - v_anchor_week_start_date;

                    if v_days_diff < 0 then
                        continue;
                    end if;

                    if (v_days_diff / 7) % v_applicable_interval <> 0 then
                        continue;
                    end if;

                    v_candidate_utc := (v_candidate_local at time zone v_schedule.timezone);

                    if v_candidate_utc < v_window_start then
                        continue;
                    end if;

                    if v_candidate_utc > v_window_end then
                        exit;
                    end if;

                    v_next_run := v_candidate_utc;
                    exit;
                end loop;
            end if;

        else
            if v_schedule.last_executed_at is null then
                v_schedule_date := (v_now at time zone v_schedule.timezone)::date;
                v_schedule_local_time := v_schedule_date + v_schedule.time_of_day;
                v_next_run := v_schedule_local_time at time zone v_schedule.timezone;

                if v_next_run < v_window_start then
                    case v_schedule.interval_unit
                        when 'days' then
                            v_schedule_date := (v_schedule_date + (v_schedule.interval_value || ' days')::interval)::date;
                        when 'weeks' then
                            v_schedule_date := (v_schedule_date + (v_schedule.interval_value || ' weeks')::interval)::date;
                        when 'months' then
                            v_schedule_date := (v_schedule_date + (v_schedule.interval_value || ' months')::interval)::date;
                        else
                            v_schedule_date := (v_schedule_date + interval '1 month')::date;
                    end case;

                    v_schedule_local_time := v_schedule_date + v_schedule.time_of_day;
                    v_next_run := v_schedule_local_time at time zone v_schedule.timezone;
                end if;
            else
                v_next_run := v_schedule.last_executed_at;

                case v_schedule.interval_unit
                    when 'days' then
                        v_next_run := v_next_run + (v_schedule.interval_value || ' days')::interval;
                    when 'weeks' then
                        v_next_run := v_next_run + (v_schedule.interval_value || ' weeks')::interval;
                    when 'months' then
                        v_next_run := v_next_run + (v_schedule.interval_value || ' months')::interval;
                    else
                        v_next_run := v_next_run + interval '1 day';
                end case;

                v_schedule_date := (v_next_run at time zone v_schedule.timezone)::date;
                v_schedule_local_time := v_schedule_date + v_schedule.time_of_day;
                v_next_run := v_schedule_local_time at time zone v_schedule.timezone;

                while v_next_run < v_window_start loop
                    case v_schedule.interval_unit
                        when 'days' then
                            v_schedule_date := (v_schedule_date + (v_schedule.interval_value || ' days')::interval)::date;
                        when 'weeks' then
                            v_schedule_date := (v_schedule_date + (v_schedule.interval_value || ' weeks')::interval)::date;
                        when 'months' then
                            v_schedule_date := (v_schedule_date + (v_schedule.interval_value || ' months')::interval)::date;
                        else
                            v_schedule_date := (v_schedule_date + interval '1 month')::date;
                    end case;

                    v_schedule_local_time := v_schedule_date + v_schedule.time_of_day;
                    v_next_run := v_schedule_local_time at time zone v_schedule.timezone;
                end loop;
            end if;
        end if;

        if v_next_run is null or v_next_run > v_window_end or v_next_run < v_window_start then
            continue;
        end if;

        v_final_tickers := coalesce(
            v_schedule.resolved_tickers,
            v_schedule.selected_tickers,
            '{}'
        );

        if (v_final_tickers is null or array_length(v_final_tickers, 1) is null)
           and v_schedule.include_watchlist then
            select coalesce(array_agg(distinct ticker), '{}')
            into v_watchlist_tickers
            from watchlist w
            where w.user_id = v_schedule.user_id;

            v_final_tickers := coalesce(v_watchlist_tickers, '{}');
        end if;

        v_final_tickers := array(select distinct unnest(v_final_tickers));

        return query
        select
            v_schedule.schedule_id,
            v_schedule.user_id,
            v_schedule.selected_tickers,
            v_schedule.include_watchlist,
            v_schedule.interval_value,
            v_schedule.interval_unit,
            v_schedule.time_of_day,
            v_schedule.timezone,
            v_schedule.last_executed_at,
            v_next_run,
            coalesce(v_schedule.rebalance_threshold, 10.0),
            v_schedule.skip_threshold_check,
            v_schedule.skip_opportunity_agent,
            v_final_tickers,
            coalesce(
                v_schedule.resolved_constraints,
                jsonb_build_object(
                    'rebalanceThreshold', coalesce(v_schedule.rebalance_threshold, 10.0),
                    'includeTickers', v_final_tickers,
                    'skipThresholdCheck', v_schedule.skip_threshold_check,
                    'skipOpportunityAgent', v_schedule.skip_opportunity_agent,
                    'scheduledExecution', true
                )
            );
    end loop;
end;
$$;


ALTER FUNCTION "public"."get_upcoming_schedules"("p_minutes_ahead" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_upcoming_schedules"("p_minutes_ahead" integer) IS 'Returns schedules due within the processing window. Updated to mirror UI next-run logic, including multi-day weekly schedules and a five-minute grace window.';



CREATE OR REPLACE FUNCTION "public"."get_user_by_stripe_customer"("p_customer_id" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.user_roles
    WHERE stripe_customer_id = p_customer_id
    AND is_active = true
    LIMIT 1;
    
    RETURN v_user_id;
END;
$$;


ALTER FUNCTION "public"."get_user_by_stripe_customer"("p_customer_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_max_debate_rounds"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
    v_max_rounds INTEGER;
BEGIN
    -- Get the highest max_debate_rounds from user's active roles
    SELECT COALESCE(MAX(rl.max_debate_rounds), 2)
    INTO v_max_rounds
    FROM public.user_roles ur
    JOIN public.role_limits rl ON rl.role_id = ur.role_id
    WHERE ur.user_id = p_user_id
    AND ur.is_active = true;
    
    -- Return at least 1 round as minimum (but default to 2)
    RETURN GREATEST(COALESCE(v_max_rounds, 2), 1);
END;
$$;


ALTER FUNCTION "public"."get_user_max_debate_rounds"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_max_debate_rounds"("p_user_id" "uuid") IS 'Returns the maximum number of debate rounds allowed for a user based on their active roles. Returns default of 2 if no active roles found.';



CREATE OR REPLACE FUNCTION "public"."get_user_role_limits"("p_user_id" "uuid") RETURNS TABLE("max_watchlist_stocks" integer, "max_rebalance_stocks" integer, "max_scheduled_rebalances" integer, "max_parallel_analysis" integer, "schedule_resolution" "text", "rebalance_access" boolean, "opportunity_agent_access" boolean, "additional_provider_access" boolean, "enable_live_trading" boolean, "enable_auto_trading" boolean, "near_limit_analysis_access" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    WITH user_roles_priority AS (
        SELECT ur.role_id, r.priority
        FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = p_user_id
          AND ur.is_active = true
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        ORDER BY r.priority DESC
        LIMIT 1
    ),
    role_limits_data AS (
        SELECT rl.*
        FROM public.role_limits rl
        JOIN user_roles_priority urp ON rl.role_id = urp.role_id
    )
    SELECT 
        COALESCE(rld.max_watchlist_stocks, 10),
        COALESCE(rld.max_rebalance_stocks, 5),
        COALESCE(rld.max_scheduled_rebalances, 2),
        COALESCE(rld.max_parallel_analysis, 1),
        COALESCE(rld.schedule_resolution, 'Month'),
        COALESCE(rld.rebalance_access, false),
        COALESCE(rld.opportunity_agent_access, false),
        COALESCE(rld.additional_provider_access, false),
        COALESCE(rld.enable_live_trading, false),
        COALESCE(rld.enable_auto_trading, false),
        COALESCE(rld.near_limit_analysis_access, false)
    FROM role_limits_data rld;
END;
$$;


ALTER FUNCTION "public"."get_user_role_limits"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_roles"("p_user_id" "uuid") RETURNS TABLE("role_id" "uuid", "role_name" character varying, "is_active" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ur.role_id,
        r.name as role_name,
        ur.is_active
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_user_id
    AND ur.is_active = true;
END;
$$;


ALTER FUNCTION "public"."get_user_roles"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_subscription_info"("p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS TABLE("has_subscription" boolean, "stripe_subscription_id" "text", "stripe_customer_id" "text", "subscription_status" "text", "current_period_end" timestamp with time zone, "cancel_at_period_end" boolean, "role_name" character varying, "role_display_name" character varying, "role_color" character varying, "role_icon_url" "text", "price_monthly" numeric, "price_yearly" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        -- Has subscription if there's stripe data OR if it's a premium role with pending downgrade
        (ur.stripe_subscription_id IS NOT NULL OR ur.subscription_status = 'active_pending_downgrade') as has_subscription,
        ur.stripe_subscription_id,
        ur.stripe_customer_id,
        -- Fix: Check cancel_at_period_end to determine actual status
        CASE 
            -- If subscription is cancelled but still in grace period
            WHEN ur.cancel_at_period_end = true AND ur.subscription_status = 'active' THEN 'cancelled'
            -- Use the stored subscription status if available
            WHEN ur.subscription_status IS NOT NULL THEN ur.subscription_status
            -- Otherwise derive from role state
            WHEN ur.expires_at IS NOT NULL THEN
                CASE
                    WHEN ur.expires_at > NOW() THEN 'active'
                    ELSE 'expired'
                END
            -- If it's a paid role (has price) but no stripe subscription
            WHEN r.price_monthly > 0 OR r.price_yearly > 0 THEN 'trialing'
            -- Default/admin roles
            ELSE 'active'
        END as subscription_status,
        ur.current_period_end,
        ur.cancel_at_period_end,
        r.name as role_name,
        r.display_name as role_display_name,
        r.color as role_color,
        r.icon_url as role_icon_url,
        r.price_monthly,
        r.price_yearly
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
    AND ur.is_active = true
    ORDER BY r.priority DESC
    LIMIT 1;
    
    -- If no active role found (shouldn't happen but safety check)
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT 
            FALSE as has_subscription,
            NULL::TEXT as stripe_subscription_id,
            NULL::TEXT as stripe_customer_id,
            'inactive'::TEXT as subscription_status,
            NULL::TIMESTAMPTZ as current_period_end,
            FALSE as cancel_at_period_end,
            'default'::VARCHAR as role_name,
            'Basic'::VARCHAR as role_display_name,
            NULL::VARCHAR as role_color,
            NULL::TEXT as role_icon_url,
            0::NUMERIC as price_monthly,
            0::NUMERIC as price_yearly;
    END IF;
END;
$$;


ALTER FUNCTION "public"."get_user_subscription_info"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_subscription_info"("p_user_id" "uuid") IS 'Get user subscription and role information. Returns "cancelled" status when cancel_at_period_end is true, even if subscription is technically still active.';



CREATE OR REPLACE FUNCTION "public"."get_user_subscription_info_with_role_details"("p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS TABLE("has_subscription" boolean, "subscription_status" "text", "variant_name" "text", "current_period_end" timestamp with time zone, "customer_portal_url" "text", "pending_variant_name" "text", "pending_change_type" "text", "pending_change_effective_at" timestamp with time zone, "role_color" character varying, "role_icon_url" "text", "role_display_name" character varying)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
    -- For Stripe, we'll get subscription info from user_roles table
    RETURN QUERY
    SELECT 
        ur.stripe_subscription_id IS NOT NULL as has_subscription,
        ur.subscription_status,
        r.name as variant_name,
        ur.current_period_end,
        NULL::TEXT as customer_portal_url, -- Portal URL generated dynamically
        NULL::TEXT as pending_variant_name,
        NULL::TEXT as pending_change_type,
        NULL::TIMESTAMPTZ as pending_change_effective_at,
        r.color as role_color,
        r.icon_url as role_icon_url,
        r.display_name as role_display_name
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
    AND ur.is_active = true
    ORDER BY r.priority DESC
    LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_user_subscription_info_with_role_details"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_users_with_auth_details"() RETURNS TABLE("id" "uuid", "email" "text", "name" "text", "provider" "text", "provider_type" "text", "last_sign_in_at" timestamp with time zone, "created_at" timestamp with time zone, "email_confirmed_at" timestamp with time zone, "phone" "text", "app_metadata" "jsonb", "user_metadata" "jsonb", "current_role_id" "uuid", "current_role_name" "text", "current_role_expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_current_user_id UUID;
    v_is_admin BOOLEAN := false;
BEGIN
    -- Get current user
    v_current_user_id := auth.uid();
    
    IF v_current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    
    -- Check if current user has admin role
    SELECT EXISTS(
        SELECT 1 
        FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = v_current_user_id
        AND ur.is_active = true
        AND r.name = 'admin'
    ) INTO v_is_admin;
    
    -- If not admin by role, check if first user (fallback admin)
    IF NOT v_is_admin THEN
        SELECT v_current_user_id = (
            SELECT id FROM auth.users 
            ORDER BY created_at ASC 
            LIMIT 1
        ) INTO v_is_admin;
    END IF;
    
    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can view user details';
    END IF;
    
    -- Return user details with auth information and role expiration
    RETURN QUERY
    SELECT 
        au.id,
        au.email::TEXT,
        COALESCE(au.raw_user_meta_data->>'name', '')::TEXT AS name,
        COALESCE(au.raw_app_meta_data->>'provider', 'email')::TEXT AS provider,
        CASE 
            WHEN au.raw_app_meta_data->>'provider' = 'email' THEN 'email'
            WHEN au.raw_app_meta_data->>'provider' = 'google' THEN 'oauth'
            WHEN au.raw_app_meta_data->>'provider' = 'github' THEN 'oauth'
            ELSE 'unknown'
        END::TEXT AS provider_type,
        au.last_sign_in_at,
        au.created_at,
        au.email_confirmed_at,
        au.phone::TEXT,
        au.raw_app_meta_data AS app_metadata,
        au.raw_user_meta_data AS user_metadata,
        ur.role_id AS current_role_id,
        r.name::TEXT AS current_role_name,
        ur.expires_at AS current_role_expires_at
    FROM auth.users au
    LEFT JOIN public.user_roles ur ON ur.user_id = au.id AND ur.is_active = true
    LEFT JOIN public.roles r ON r.id = ur.role_id
    ORDER BY au.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_users_with_auth_details"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_stripe_subscription_update"("p_customer_id" "text", "p_subscription_id" "text", "p_price_id" "text", "p_product_id" "text", "p_status" "text", "p_current_period_end" timestamp with time zone, "p_cancel_at_period_end" boolean, "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_user_id UUID;
    v_role_id UUID;
    v_default_role_id UUID;
    v_old_role_id UUID;
    v_old_price_id TEXT;
    v_old_status TEXT;
    v_old_role_priority INTEGER;
    v_new_role_priority INTEGER;
    v_result JSONB;
    v_is_plan_change BOOLEAN := false;
    v_is_downgrade BOOLEAN := false;
    v_audit_details JSONB;
    v_effective_period_end TIMESTAMPTZ;
BEGIN
    -- Get user_id from metadata or by customer lookup
    v_user_id := (p_metadata->>'user_id')::UUID;
    
    IF v_user_id IS NULL THEN
        v_user_id := get_user_by_stripe_customer(p_customer_id);
    END IF;
    
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found for customer ' || p_customer_id
        );
    END IF;
    
    -- Handle missing period_end
    IF p_status IN ('active', 'trialing') AND p_current_period_end IS NULL THEN
        v_effective_period_end := NOW() + INTERVAL '30 days';
        RAISE NOTICE 'No period_end provided for active subscription %, using default 30 days', p_subscription_id;
    ELSE
        v_effective_period_end := p_current_period_end;
    END IF;
    
    -- Get default role ID
    SELECT id INTO v_default_role_id
    FROM public.roles
    WHERE name = 'default'
    LIMIT 1;
    
    -- Get current active role and its priority (not just subscription-based)
    SELECT ur.role_id, ur.stripe_price_id, ur.subscription_status, r.priority
    INTO v_old_role_id, v_old_price_id, v_old_status, v_old_role_priority
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_user_id
      AND ur.is_active = true
    LIMIT 1;
    
    -- Find new role by product ID or price ID
    SELECT r.id, r.priority 
    INTO v_role_id, v_new_role_priority
    FROM public.roles r
    WHERE r.stripe_product_id = p_product_id
       OR r.stripe_price_id_monthly = p_price_id
       OR r.stripe_price_id_yearly = p_price_id
    LIMIT 1;
    
    IF v_role_id IS NULL AND p_status IN ('active', 'trialing') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Role not found for product ' || p_product_id || ' or price ' || p_price_id
        );
    END IF;
    
    -- Detect if this is a plan change and determine if it's a downgrade
    v_is_plan_change := (v_old_role_id IS NOT NULL AND v_role_id IS NOT NULL AND v_old_role_id != v_role_id);
    
    IF v_is_plan_change AND v_old_role_priority IS NOT NULL AND v_new_role_priority IS NOT NULL THEN
        v_is_downgrade := v_new_role_priority < v_old_role_priority;
    END IF;
    
    -- Build audit details
    v_audit_details := jsonb_build_object(
        'subscription_id', p_subscription_id,
        'customer_id', p_customer_id,
        'status', p_status,
        'price_id', p_price_id,
        'product_id', p_product_id,
        'period_end', v_effective_period_end,
        'cancel_at_period_end', p_cancel_at_period_end,
        'is_downgrade', v_is_downgrade,
        'event_metadata', p_metadata
    );
    
    IF v_is_plan_change THEN
        v_audit_details := v_audit_details || jsonb_build_object(
            'plan_change', jsonb_build_object(
                'from_role_id', v_old_role_id,
                'to_role_id', v_role_id,
                'from_price_id', v_old_price_id,
                'to_price_id', p_price_id,
                'from_priority', v_old_role_priority,
                'to_priority', v_new_role_priority,
                'type', CASE 
                    WHEN v_is_downgrade THEN 'downgrade'
                    WHEN v_new_role_priority > v_old_role_priority THEN 'upgrade'
                    ELSE 'lateral'
                END
            )
        );
    END IF;
    
    -- MAIN LOGIC: Handle based on subscription status and change type
    IF p_status IN ('active', 'trialing') THEN
        
        IF v_is_downgrade THEN
            -- DOWNGRADE: Keep current higher role active until period ends
            -- Store the pending downgrade information
            
            RAISE NOTICE 'Processing downgrade from % to % - user keeps current plan until %', 
                v_old_role_id, v_role_id, v_effective_period_end;
            
            -- Update the current role with new subscription details but keep it active
            UPDATE public.user_roles
            SET 
                -- Keep the role active
                is_active = true,
                -- Update subscription tracking
                stripe_subscription_id = p_subscription_id,
                stripe_customer_id = p_customer_id,
                -- Keep current role but note the pending change
                subscription_status = 'active_pending_downgrade',
                current_period_end = v_effective_period_end,
                expires_at = v_effective_period_end,
                cancel_at_period_end = false,
                updated_at = NOW()
            WHERE user_id = v_user_id
              AND role_id = v_old_role_id;
            
            -- Store the pending downgrade info in the new role (inactive)
            INSERT INTO public.user_roles (
                user_id, role_id, is_active, granted_by,
                stripe_subscription_id, stripe_customer_id, stripe_price_id,
                subscription_status, current_period_end, cancel_at_period_end, expires_at
            ) VALUES (
                v_user_id, v_role_id, false, v_user_id,
                p_subscription_id, p_customer_id, p_price_id,
                'pending_activation', v_effective_period_end, false, NULL
            )
            ON CONFLICT (user_id, role_id) 
            DO UPDATE SET 
                is_active = false,
                stripe_subscription_id = p_subscription_id,
                stripe_customer_id = p_customer_id,
                stripe_price_id = p_price_id,
                subscription_status = 'pending_activation',
                current_period_end = v_effective_period_end,
                expires_at = NULL,
                updated_at = NOW();
            
            v_result := jsonb_build_object(
                'success', true,
                'user_id', v_user_id,
                'current_role_id', v_old_role_id,
                'pending_role_id', v_role_id,
                'action', 'downgrade_scheduled',
                'effective_at', v_effective_period_end,
                'message', 'Downgrade scheduled - current plan remains active until period end'
            );
            
        ELSE
            -- UPGRADE or NEW SUBSCRIPTION: Switch immediately
            UPDATE public.user_roles
            SET is_active = false,
                updated_at = NOW()
            WHERE user_id = v_user_id
              AND is_active = true;
            
            -- Activate the new subscription role
            INSERT INTO public.user_roles (
                user_id, role_id, is_active, granted_by,
                stripe_subscription_id, stripe_customer_id, stripe_price_id,
                subscription_status, current_period_end, cancel_at_period_end, expires_at
            ) VALUES (
                v_user_id, v_role_id, true, v_user_id,
                p_subscription_id, p_customer_id, p_price_id,
                p_status, v_effective_period_end, p_cancel_at_period_end, v_effective_period_end
            )
            ON CONFLICT (user_id, role_id) 
            DO UPDATE SET 
                is_active = true,
                stripe_subscription_id = p_subscription_id,
                stripe_customer_id = p_customer_id,
                stripe_price_id = p_price_id,
                subscription_status = p_status,
                current_period_end = v_effective_period_end,
                cancel_at_period_end = p_cancel_at_period_end,
                expires_at = v_effective_period_end,
                updated_at = NOW();
                
            v_result := jsonb_build_object(
                'success', true,
                'user_id', v_user_id,
                'role_id', v_role_id,
                'action', CASE 
                    WHEN v_is_plan_change THEN 'upgraded'
                    ELSE 'activated'
                END,
                'immediate', true
            );
        END IF;
        
    ELSIF p_status IN ('canceled', 'unpaid', 'incomplete_expired') THEN
        -- Cancellation: Deactivate all, activate default
        UPDATE public.user_roles
        SET is_active = false,
            subscription_status = CASE 
                WHEN stripe_subscription_id = p_subscription_id THEN p_status
                ELSE subscription_status
            END,
            updated_at = NOW()
        WHERE user_id = v_user_id
          AND is_active = true;
        
        -- Activate default role
        INSERT INTO public.user_roles (
            user_id, role_id, is_active, granted_by
        ) VALUES (
            v_user_id, v_default_role_id, true, v_user_id
        )
        ON CONFLICT (user_id, role_id) 
        DO UPDATE SET 
            is_active = true,
            stripe_subscription_id = NULL,
            stripe_customer_id = NULL,
            stripe_price_id = NULL,
            subscription_status = NULL,
            current_period_end = NULL,
            cancel_at_period_end = NULL,
            expires_at = NULL,
            updated_at = NOW();
            
        v_result := jsonb_build_object(
            'success', true,
            'user_id', v_user_id,
            'role_id', v_default_role_id,
            'action', 'canceled',
            'subscription_status', p_status
        );
        
    ELSIF p_status = 'past_due' THEN
        -- Keep current role but mark as past_due
        IF v_old_role_id IS NOT NULL THEN
            UPDATE public.user_roles
            SET 
                subscription_status = p_status,
                current_period_end = v_effective_period_end,
                expires_at = v_effective_period_end,
                stripe_subscription_id = p_subscription_id,
                stripe_customer_id = p_customer_id,
                stripe_price_id = p_price_id,
                updated_at = NOW()
            WHERE user_id = v_user_id
              AND role_id = v_old_role_id
              AND is_active = true;
        END IF;
          
        v_result := jsonb_build_object(
            'success', true,
            'user_id', v_user_id,
            'role_id', v_old_role_id,
            'action', 'marked_past_due',
            'status', p_status
        );
        
    ELSE
        -- Other statuses: Just update metadata
        IF v_role_id IS NOT NULL THEN
            UPDATE public.user_roles
            SET 
                subscription_status = p_status,
                current_period_end = v_effective_period_end,
                expires_at = v_effective_period_end,
                stripe_subscription_id = p_subscription_id,
                stripe_customer_id = p_customer_id,
                stripe_price_id = p_price_id,
                updated_at = NOW()
            WHERE user_id = v_user_id
              AND role_id = v_role_id;
        END IF;
          
        v_result := jsonb_build_object(
            'success', true,
            'user_id', v_user_id,
            'role_id', v_role_id,
            'action', 'updated',
            'status', p_status
        );
    END IF;
    
    -- Enhanced audit logging
    INSERT INTO public.role_audit_log (
        user_id, target_user_id, action, role_id, details
    ) VALUES (
        v_user_id, v_user_id,
        CASE 
            WHEN v_is_downgrade THEN 'stripe_downgrade_scheduled'
            WHEN v_is_plan_change THEN 'stripe_plan_change'
            WHEN p_metadata->>'event_type' = 'subscription.deleted' THEN 'stripe_subscription_deleted'
            ELSE 'stripe_subscription_update'
        END,
        COALESCE(v_role_id, v_default_role_id),
        v_audit_details
    );
    
    RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."handle_stripe_subscription_update"("p_customer_id" "text", "p_subscription_id" "text", "p_price_id" "text", "p_product_id" "text", "p_status" "text", "p_current_period_end" timestamp with time zone, "p_cancel_at_period_end" boolean, "p_metadata" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."handle_stripe_subscription_update"("p_customer_id" "text", "p_subscription_id" "text", "p_price_id" "text", "p_product_id" "text", "p_status" "text", "p_current_period_end" timestamp with time zone, "p_cancel_at_period_end" boolean, "p_metadata" "jsonb") IS 'Smart subscription handler that properly delays downgrades until period end.
Upgrades happen immediately, downgrades wait until the paid period expires.
Users keep their higher tier access until they have received what they paid for.';



CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_registration_complete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- When a profile is created, mark the invitation as confirmed
    -- This ensures we only confirm when registration is truly complete
    UPDATE public.invitations
    SET 
        status = 'confirmed',
        confirmed_at = NOW(),
        confirmed_user_id = NEW.id
    WHERE LOWER(email) = (
        SELECT LOWER(email) 
        FROM auth.users 
        WHERE id = NEW.id
    )
    AND status IN ('pending', 'sent')
    AND confirmed_user_id IS NULL;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_user_registration_complete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_stocks_analyzed"("p_rebalance_id" "uuid") RETURNS TABLE("stocks_analyzed" integer, "total_stocks" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_stocks_analyzed INT;
    v_total_stocks INT;
BEGIN
    -- Use table alias to avoid ambiguity
    UPDATE rebalance_requests r
    SET stocks_analyzed = COALESCE(r.stocks_analyzed, 0) + 1
    WHERE r.id = p_rebalance_id
    RETURNING r.stocks_analyzed, r.total_stocks
    INTO v_stocks_analyzed, v_total_stocks;
    
    -- Return the updated values
    RETURN QUERY SELECT v_stocks_analyzed, v_total_stocks;
END;
$$;


ALTER FUNCTION "public"."increment_stocks_analyzed"("p_rebalance_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admin_roles
        WHERE admin_roles.user_id = $1
        AND is_active = true
    );
END;
$_$;


ALTER FUNCTION "public"."is_admin"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_user_admin"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    is_admin BOOLEAN;
BEGIN
    -- Return false if user_id is null
    IF user_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- Check if the user has an active admin role
    SELECT EXISTS (
        SELECT 1 
        FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = is_user_admin.user_id
        AND ur.is_active = true
        AND r.name = 'admin'
    ) INTO is_admin;
    
    RETURN COALESCE(is_admin, false);
END;
$$;


ALTER FUNCTION "public"."is_user_admin"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_schedule_executed"("p_schedule_id" "uuid", "p_success" boolean, "p_rebalance_request_id" "uuid" DEFAULT NULL::"uuid", "p_error_message" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    UPDATE rebalance_schedules
    SET 
        last_executed_at = NOW(),
        execution_count = COALESCE(execution_count, 0) + 1,
        last_execution_status = CASE 
            WHEN p_success THEN 'completed'  -- Use unified status instead of 'success'
            ELSE 'error'                     -- Use unified status instead of 'failed'
        END,
        last_execution_details = jsonb_build_object(
            'executed_at', NOW(),
            'success', p_success,
            'rebalance_request_id', p_rebalance_request_id,
            'error', p_error_message,
            'method', 'pg_cron'
        ),
        updated_at = NOW()
    WHERE id = p_schedule_id;
    
    RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."mark_schedule_executed"("p_schedule_id" "uuid", "p_success" boolean, "p_rebalance_request_id" "uuid", "p_error_message" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."mark_schedule_executed"("p_schedule_id" "uuid", "p_success" boolean, "p_rebalance_request_id" "uuid", "p_error_message" "text") IS 'Marks a schedule as executed and updates last_executed_at timestamp.
The next run time is calculated dynamically based on last_executed_at + frequency.';



CREATE OR REPLACE FUNCTION "public"."notify_discord_role_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Only notify if user has Discord linked
  IF EXISTS (SELECT 1 FROM profiles WHERE id = NEW.user_id AND discord_id IS NOT NULL) THEN
    -- This will be picked up by a database webhook or the application
    PERFORM pg_notify('discord_role_sync', json_build_object(
      'user_id', NEW.user_id,
      'old_role_id', OLD.role_id,
      'new_role_id', NEW.role_id
    )::text);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_discord_role_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_builtin_role_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Only check for DELETE and UPDATE operations on built-in roles
    IF OLD.is_built_in = true THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'Cannot delete built-in role %', OLD.name;
        ELSIF TG_OP = 'UPDATE' THEN
            -- Allow updating everything except the name of built-in roles
            IF NEW.name != OLD.name THEN
                RAISE EXCEPTION 'Cannot rename built-in role %', OLD.name;
            END IF;
            -- Allow other updates (display_name, description, etc.)
            RETURN NEW;
        END IF;
    END IF;
    
    -- For non-built-in roles, allow all operations
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;


ALTER FUNCTION "public"."prevent_builtin_role_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_new_users"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    r RECORD;
BEGIN
    -- Find users without roles and assign them
    FOR r IN 
        SELECT u.id, u.email
        FROM auth.users u
        LEFT JOIN public.user_roles ur ON ur.user_id = u.id
        WHERE ur.user_id IS NULL
    LOOP
        PERFORM public.assign_user_role(r.id, r.email);
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."process_new_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_admin_users"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    REFRESH MATERIALIZED VIEW public.admin_users;
END;
$$;


ALTER FUNCTION "public"."refresh_admin_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_admin_users_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Use the function to refresh the view
    PERFORM public.refresh_admin_users();
    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."refresh_admin_users_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_schedule_data"("p_schedule_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_schedule RECORD;
    v_resolved_tickers text[];
    v_resolved_constraints jsonb;
    v_api_settings RECORD;
    v_watchlist_tickers text[];
BEGIN
    -- Get the schedule
    SELECT * INTO v_schedule FROM rebalance_schedules WHERE id = p_schedule_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Schedule not found';
    END IF;
    
    -- Get user's API settings for position sizing defaults
    SELECT * INTO v_api_settings FROM api_settings WHERE user_id = v_schedule.user_id;
    
    -- Start with selected tickers (already contains user's final selection)
    v_resolved_tickers := COALESCE(v_schedule.selected_tickers, '{}');
    
    -- Note: We do NOT add all watchlist tickers here anymore
    -- include_watchlist is just a UI flag, selected_tickers already has the final selection
    
    -- Build resolved constraints using user's api_settings for position sizing
    v_resolved_constraints := jsonb_build_object(
        'rebalanceThreshold', COALESCE(v_schedule.rebalance_threshold, 10),
        'skipThresholdCheck', COALESCE(v_schedule.skip_threshold_check, false),
        'skipOpportunityAgent', COALESCE(v_schedule.skip_opportunity_agent, false),
        'autoExecute', COALESCE(v_api_settings.auto_execute_trades, false),
        'scheduledExecution', true
    );
    
    -- Update the schedule with resolved data
    UPDATE rebalance_schedules
    SET 
        resolved_tickers = v_resolved_tickers,
        resolved_constraints = v_resolved_constraints,
        updated_at = NOW()
    WHERE id = p_schedule_id;
END;
$$;


ALTER FUNCTION "public"."resolve_schedule_data"("p_schedule_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."should_schedule_run"("p_schedule_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_schedule RECORD;
    v_next_run_time TIMESTAMPTZ;
    v_schedule_date DATE;
    v_schedule_local_time TIMESTAMP;
BEGIN
    -- Get the schedule
    SELECT * INTO v_schedule FROM rebalance_schedules WHERE id = p_schedule_id;
    
    IF NOT FOUND OR NOT v_schedule.enabled THEN
        RETURN FALSE;
    END IF;
    
    -- If never executed, should run if current time is past the scheduled time of day
    IF v_schedule.last_executed_at IS NULL THEN
        -- Get today's date in the schedule's timezone
        v_schedule_date := (NOW() AT TIME ZONE v_schedule.timezone)::DATE;
        v_schedule_local_time := v_schedule_date + v_schedule.time_of_day;
        v_next_run_time := v_schedule_local_time AT TIME ZONE v_schedule.timezone;
        
        RETURN NOW() >= v_next_run_time;
    END IF;
    
    -- Calculate next run time based on last execution
    v_next_run_time := v_schedule.last_executed_at;
    
    -- Add the interval
    CASE v_schedule.interval_unit
        WHEN 'days' THEN
            v_next_run_time := v_next_run_time + (v_schedule.interval_value || ' days')::INTERVAL;
        WHEN 'weeks' THEN
            v_next_run_time := v_next_run_time + (v_schedule.interval_value || ' weeks')::INTERVAL;
        WHEN 'months' THEN
            v_next_run_time := v_next_run_time + (v_schedule.interval_value || ' months')::INTERVAL;
        ELSE
            v_next_run_time := v_next_run_time + INTERVAL '1 month';
    END CASE;
    
    -- Set the proper time of day
    v_schedule_date := (v_next_run_time AT TIME ZONE v_schedule.timezone)::DATE;
    v_schedule_local_time := v_schedule_date + v_schedule.time_of_day;
    v_next_run_time := v_schedule_local_time AT TIME ZONE v_schedule.timezone;
    
    -- Check if current time is past the next run time
    RETURN NOW() >= v_next_run_time;
END;
$$;


ALTER FUNCTION "public"."should_schedule_run"("p_schedule_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_discord_id_for_user"("user_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  discord_provider_id TEXT;
BEGIN
  -- Get Discord provider ID from auth.identities
  SELECT provider_id INTO discord_provider_id
  FROM auth.identities
  WHERE user_id = user_uuid
    AND provider = 'discord'
  LIMIT 1;
  
  IF discord_provider_id IS NOT NULL THEN
    -- Update the profile with Discord ID
    UPDATE public.profiles
    SET discord_id = discord_provider_id
    WHERE id = user_uuid;
    
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."sync_discord_id_for_user"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_user_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- This function runs AFTER user creation, so it can't block it
    -- We use a separate transaction context to avoid conflicts
    
    -- Create or update profile
    INSERT INTO public.profiles (id, email, name, created_at)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NEW.raw_user_meta_data->>'name',
            NEW.raw_user_meta_data->>'full_name',
            split_part(NEW.email, '@', 1)
        ),
        NEW.created_at
    )
    ON CONFLICT (id) 
    DO UPDATE SET 
        email = EXCLUDED.email,
        updated_at = NOW()
    WHERE profiles.id = EXCLUDED.id;
    
    -- Handle roles asynchronously to avoid blocking
    PERFORM pg_notify(
        'new_user_created',
        json_build_object(
            'user_id', NEW.id,
            'email', NEW.email
        )::text
    );
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Never fail - just log the error
        RAISE WARNING 'Profile sync error for user %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_user_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."test_schedule_timezone_calc"("p_timezone" "text" DEFAULT 'America/Denver'::"text", "p_time_of_day" time without time zone DEFAULT '11:00:00'::time without time zone) RETURNS TABLE("current_utc" timestamp with time zone, "current_in_tz" timestamp without time zone, "schedule_date" "date", "schedule_local_time" timestamp without time zone, "schedule_utc" timestamp with time zone, "minutes_until" numeric)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_schedule_date DATE;
    v_schedule_local_time TIMESTAMP;
    v_schedule_utc TIMESTAMPTZ;
BEGIN
    -- Get today's date in the target timezone
    v_schedule_date := (NOW() AT TIME ZONE p_timezone)::DATE;
    
    -- Combine date and time
    v_schedule_local_time := v_schedule_date + p_time_of_day;
    
    -- Convert to UTC
    v_schedule_utc := v_schedule_local_time AT TIME ZONE p_timezone;
    
    -- If in the past, add a day
    IF v_schedule_utc < NOW() THEN
        v_schedule_date := v_schedule_date + INTERVAL '1 day';
        v_schedule_local_time := v_schedule_date + p_time_of_day;
        v_schedule_utc := v_schedule_local_time AT TIME ZONE p_timezone;
    END IF;
    
    RETURN QUERY
    SELECT 
        NOW(),
        (NOW() AT TIME ZONE p_timezone)::TIMESTAMP,
        v_schedule_date,
        v_schedule_local_time,
        v_schedule_utc,
        EXTRACT(EPOCH FROM (v_schedule_utc - NOW())) / 60;
END;
$$;


ALTER FUNCTION "public"."test_schedule_timezone_calc"("p_timezone" "text", "p_time_of_day" time without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_resolve_schedule_data"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Resolve data whenever schedule is created or updated
    PERFORM resolve_schedule_data(NEW.id);
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_resolve_schedule_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_debate_round"("p_analysis_id" "uuid", "p_round" integer, "p_agent_type" "text", "p_response" "text", "p_points" "text"[]) RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    current_analysis JSONB;
    debate_rounds JSONB;
    round_data JSONB;
    messages JSONB;
BEGIN
    -- Get current full_analysis
    SELECT full_analysis INTO current_analysis 
    FROM analysis_history 
    WHERE id = p_analysis_id;
    
    IF current_analysis IS NULL THEN
        current_analysis := '{}'::JSONB;
    END IF;
    
    -- Get current debate rounds
    debate_rounds := COALESCE(current_analysis->'debateRounds', '[]'::JSONB);
    
    -- Get current messages
    messages := COALESCE(current_analysis->'messages', '[]'::JSONB);
    
    -- Add message
    messages := messages || jsonb_build_array(
        jsonb_build_object(
            'agent', p_agent_type || ' Researcher',
            'message', p_response,
            'timestamp', NOW()::TEXT,
            'type', 'research',
            'round', p_round
        )
    );
    
    -- Ensure we have enough rounds in the array
    WHILE jsonb_array_length(debate_rounds) < p_round LOOP
        debate_rounds := debate_rounds || jsonb_build_array(
            jsonb_build_object(
                'round', jsonb_array_length(debate_rounds) + 1,
                'timestamp', NOW()::TEXT
            )
        );
    END LOOP;
    
    -- Get the specific round (0-indexed)
    round_data := debate_rounds->((p_round - 1)::INT);
    
    -- Merge the new data with existing round data
    IF p_agent_type = 'bull' THEN
        round_data := round_data || jsonb_build_object(
            'bull', p_response,
            'bullPoints', to_jsonb(p_points)
        );
    ELSIF p_agent_type = 'bear' THEN
        round_data := round_data || jsonb_build_object(
            'bear', p_response,
            'bearPoints', to_jsonb(p_points)
        );
    END IF;
    
    -- Update the round in the array
    debate_rounds := jsonb_set(
        debate_rounds,
        ARRAY[(p_round - 1)::TEXT],
        round_data
    );
    
    -- Update the analysis
    UPDATE analysis_history 
    SET full_analysis = current_analysis || jsonb_build_object(
        'debateRounds', debate_rounds,
        'messages', messages,
        'lastUpdated', NOW()::TEXT
    )
    WHERE id = p_analysis_id;
    
    RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."update_debate_round"("p_analysis_id" "uuid", "p_round" integer, "p_agent_type" "text", "p_response" "text", "p_points" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_invitation_on_user_signup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Only update invitation if user email matches and invitation is pending/sent
    UPDATE public.invitations
    SET 
        status = 'confirmed',
        confirmed_at = NOW(),
        confirmed_user_id = NEW.id
    WHERE LOWER(email) = LOWER(NEW.email)
    AND status IN ('pending', 'sent')
    AND confirmed_user_id IS NULL;  -- Only update if not already confirmed
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_invitation_on_user_signup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_invitations_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_invitations_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_rebalance_schedule_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_rebalance_schedule_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_rebalance_workflow_step"("p_request_id" "uuid", "p_step_name" "text", "p_step_status" "text", "p_step_data" "jsonb" DEFAULT NULL::"jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_current_steps JSONB;
    v_step_key TEXT;
    v_new_step JSONB;
BEGIN
    -- Get current workflow steps
    SELECT workflow_steps INTO v_current_steps
    FROM public.rebalance_requests
    WHERE id = p_request_id;
    
    -- Initialize as object if null
    IF v_current_steps IS NULL THEN
        v_current_steps = '{}'::jsonb;
    END IF;
    
    -- Map step names to keys
    v_step_key := CASE p_step_name
        WHEN 'threshold_check' THEN 'threshold_check'
        WHEN 'opportunity_analysis' THEN 'opportunity_analysis'
        WHEN 'stock_analysis' THEN 'stock_analysis'
        WHEN 'rebalance_agent' THEN 'rebalance_agent'
        ELSE p_step_name
    END;
    
    -- Create new step entry
    v_new_step := jsonb_build_object(
        'status', p_step_status,
        'timestamp', NOW(),
        'data', p_step_data
    );
    
    -- Use jsonb_set to update/add the step in the object
    v_current_steps := jsonb_set(
        v_current_steps,
        ARRAY[v_step_key],
        v_new_step,
        true -- create if missing
    );
    
    -- Update the record
    UPDATE public.rebalance_requests
    SET 
        workflow_steps = v_current_steps,
        updated_at = NOW()
    WHERE id = p_request_id;
    
    -- Log the update for debugging
    RAISE NOTICE 'Updated workflow step % to % for request %', v_step_key, p_step_status, p_request_id;
    
    RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."update_rebalance_workflow_step"("p_request_id" "uuid", "p_step_name" "text", "p_step_status" "text", "p_step_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_role_details"("p_role_id" "uuid", "p_name" "text" DEFAULT NULL::"text", "p_display_name" "text" DEFAULT NULL::"text", "p_description" "text" DEFAULT NULL::"text", "p_priority" integer DEFAULT NULL::integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_is_built_in BOOLEAN;
    v_old_name TEXT;
BEGIN
    -- Get current role info
    SELECT is_built_in, name INTO v_is_built_in, v_old_name
    FROM public.roles
    WHERE id = p_role_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role not found';
    END IF;
    
    -- Check if trying to rename a built-in role
    IF v_is_built_in AND p_name IS NOT NULL AND p_name != v_old_name THEN
        RAISE EXCEPTION 'Cannot rename built-in role %', v_old_name;
    END IF;
    
    -- Update the role
    UPDATE public.roles
    SET 
        name = COALESCE(p_name, name),
        display_name = COALESCE(p_display_name, display_name),
        description = COALESCE(p_description, description),
        priority = COALESCE(p_priority, priority),
        updated_at = NOW()
    WHERE id = p_role_id;
    
    RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."update_role_details"("p_role_id" "uuid", "p_name" "text", "p_display_name" "text", "p_description" "text", "p_priority" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_workflow_step_status"("p_analysis_id" "uuid", "p_phase_id" "text", "p_agent_name" "text", "p_status" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    current_analysis JSONB;
    workflow_steps JSONB;
    step_data JSONB;
    agents JSONB;
    agent_data JSONB;
    step_index INT;
    agent_index INT;
BEGIN
    -- Get current full_analysis
    SELECT full_analysis INTO current_analysis 
    FROM analysis_history 
    WHERE id = p_analysis_id;
    
    IF current_analysis IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Get workflow steps
    workflow_steps := COALESCE(current_analysis->'workflowSteps', '[]'::JSONB);
    
    -- Find the step index
    SELECT idx - 1 INTO step_index
    FROM (
        SELECT ROW_NUMBER() OVER () as idx, value
        FROM jsonb_array_elements(workflow_steps)
    ) AS steps
    WHERE value->>'id' = p_phase_id;
    
    IF step_index IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Get the step data
    step_data := workflow_steps->step_index;
    agents := step_data->'agents';
    
    -- Find the agent index
    SELECT idx - 1 INTO agent_index
    FROM (
        SELECT ROW_NUMBER() OVER () as idx, value
        FROM jsonb_array_elements(agents)
    ) AS agent_list
    WHERE value->>'name' = p_agent_name;
    
    IF agent_index IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Get current agent data
    agent_data := agents->agent_index;
    
    -- Update agent status
    agent_data := agent_data || jsonb_build_object(
        'status', p_status,
        'progress', CASE WHEN p_status = 'completed' THEN 100 ELSE 50 END
    );
    
    -- Add completion timestamp if completed
    IF p_status = 'completed' THEN
        agent_data := agent_data || jsonb_build_object(
            'completedAt', NOW()::TEXT
        );
    END IF;
    
    -- Update the agent in the agents array
    agents := jsonb_set(
        agents,
        ARRAY[agent_index::TEXT],
        agent_data
    );
    
    -- Update the step with new agents array
    step_data := step_data || jsonb_build_object('agents', agents);
    
    -- Update the step in workflow_steps
    workflow_steps := jsonb_set(
        workflow_steps,
        ARRAY[step_index::TEXT],
        step_data
    );
    
    -- Update the analysis
    UPDATE analysis_history 
    SET full_analysis = current_analysis || jsonb_build_object(
        'workflowSteps', workflow_steps,
        'lastUpdated', NOW()::TEXT
    )
    WHERE id = p_analysis_id;
    
    RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."update_workflow_step_status"("p_analysis_id" "uuid", "p_phase_id" "text", "p_agent_name" "text", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_permission"("p_user_id" "uuid", "p_permission_name" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.role_permissions rp ON ur.role_id = rp.role_id
        JOIN public.permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = p_user_id
          AND ur.is_active = true
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
          AND p.name = p_permission_name
    );
END;
$$;


ALTER FUNCTION "public"."user_has_permission"("p_user_id" "uuid", "p_permission_name" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_trade_order"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Ensure either shares or dollar_amount is set, but not both
    IF NEW.action IN ('BUY', 'SELL') THEN
        IF (NEW.shares = 0 OR NEW.shares IS NULL) AND 
           (NEW.dollar_amount = 0 OR NEW.dollar_amount IS NULL) THEN
            RAISE EXCEPTION 'Trade order must specify either shares or dollar amount';
        END IF;
        
        IF NEW.shares > 0 AND NEW.dollar_amount > 0 THEN
            RAISE EXCEPTION 'Trade order cannot specify both shares and dollar amount';
        END IF;
    END IF;
    
    -- Validate metadata structure if provided
    IF NEW.metadata IS NOT NULL AND NEW.metadata != '{}'::jsonb THEN
        IF NOT (NEW.metadata ? 'beforePosition' AND 
                NEW.metadata ? 'afterPosition' AND 
                NEW.metadata ? 'changes') THEN
            RAISE EXCEPTION 'Invalid metadata structure - must include beforePosition, afterPosition, and changes';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_trade_order"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_admin_access"("p_user_id" "uuid") RETURNS TABLE("is_admin" boolean, "role_name" "text", "auto_assigned" boolean, "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_ensure_result RECORD;
    v_is_admin BOOLEAN;
    v_role_name TEXT;
BEGIN
    -- First ensure an admin exists
    SELECT * INTO v_ensure_result FROM public.ensure_admin_exists();
    
    -- Check if the current user is an admin
    SELECT 
        EXISTS (
            SELECT 1
            FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = p_user_id
              AND r.name IN ('admin', 'super_admin')
              AND ur.is_active = true
              AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        ) INTO v_is_admin;
    
    -- Get the user's role name
    SELECT r.name INTO v_role_name
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_user_id
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    ORDER BY r.priority DESC
    LIMIT 1;
    
    -- Return the result
    RETURN QUERY
    SELECT 
        v_is_admin AS is_admin,
        v_role_name AS role_name,
        (v_ensure_result.admin_assigned AND v_ensure_result.assigned_user_id = p_user_id) AS auto_assigned,
        CASE 
            WHEN v_is_admin THEN 'User has admin access'
            WHEN v_ensure_result.admin_assigned AND v_ensure_result.assigned_user_id = p_user_id THEN 'Admin role was just assigned to you'
            WHEN v_ensure_result.admin_assigned THEN format('Admin role was assigned to user %s', v_ensure_result.assigned_user_email)
            ELSE 'User does not have admin access'
        END::TEXT AS message;
END;
$$;


ALTER FUNCTION "public"."verify_admin_access"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_admin_with_auto_assignment"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_id UUID;
    v_result RECORD;
BEGIN
    -- Get the current user ID from auth context
    v_user_id := auth.uid();
    
    -- Debug logging
    RAISE LOG 'verify_admin_with_auto_assignment called for user: %', v_user_id;
    
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'isAdmin', false,
            'error', 'Not authenticated',
            'debug', 'auth.uid() returned NULL'
        );
    END IF;
    
    -- Verify admin access (will auto-assign if needed)
    SELECT * INTO v_result FROM public.verify_admin_access(v_user_id);
    
    -- Log the result
    RAISE LOG 'Admin verification result: isAdmin=%, role=%, autoAssigned=%', 
        v_result.is_admin, v_result.role_name, v_result.auto_assigned;
    
    RETURN jsonb_build_object(
        'isAdmin', v_result.is_admin,
        'role', v_result.role_name,
        'autoAssigned', v_result.auto_assigned,
        'message', v_result.message,
        'userId', v_user_id,
        'timestamp', NOW()
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in verify_admin_with_auto_assignment: %', SQLERRM;
        RETURN jsonb_build_object(
            'isAdmin', false,
            'error', SQLERRM,
            'debug', 'Exception caught in function'
        );
END;
$$;


ALTER FUNCTION "public"."verify_admin_with_auto_assignment"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(50) NOT NULL,
    "display_name" character varying(100) NOT NULL,
    "description" "text",
    "priority" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_built_in" boolean DEFAULT false,
    "color" character varying(50),
    "icon_url" "text",
    "price_monthly" numeric(10,2),
    "price_yearly" numeric(10,2),
    "features" "jsonb",
    "discord_role_id" "text",
    "stripe_price_id_monthly" "text",
    "stripe_price_id_yearly" "text",
    "stripe_product_id" "text"
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."roles"."color" IS 'Hex color code for role badge (e.g., "#FF5733")';



COMMENT ON COLUMN "public"."roles"."icon_url" IS 'Full URL to icon image (e.g., "https://example.com/icons/crown.svg" or "/icons/crown.png")';



COMMENT ON COLUMN "public"."roles"."price_monthly" IS 'Monthly subscription price in USD';



COMMENT ON COLUMN "public"."roles"."price_yearly" IS 'Yearly subscription price in USD';



COMMENT ON COLUMN "public"."roles"."features" IS 'JSON array of feature descriptions for this role';



COMMENT ON COLUMN "public"."roles"."stripe_price_id_monthly" IS 'Stripe price ID for monthly subscription';



COMMENT ON COLUMN "public"."roles"."stripe_price_id_yearly" IS 'Stripe price ID for yearly subscription';



COMMENT ON COLUMN "public"."roles"."stripe_product_id" IS 'Stripe product ID for this role';



CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "granted_by" "uuid",
    "is_active" boolean DEFAULT true,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "stripe_subscription_id" "text",
    "stripe_customer_id" "text",
    "stripe_price_id" "text",
    "subscription_status" "text",
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_roles" IS 'User role assignments. Fixed infinite recursion 2025-08-20: Removed policies that checked user_roles within user_roles policies. Safe policies preserved: user_roles_delete, user_roles_insert, user_roles_select, user_roles_update.';



COMMENT ON COLUMN "public"."user_roles"."stripe_subscription_id" IS 'Stripe subscription ID for this user role';



COMMENT ON COLUMN "public"."user_roles"."stripe_customer_id" IS 'Stripe customer ID for this user';



COMMENT ON COLUMN "public"."user_roles"."stripe_price_id" IS 'Current Stripe price ID';



COMMENT ON COLUMN "public"."user_roles"."subscription_status" IS 'Subscription status: active, trialing, past_due, canceled, expired, paused, pending_activation, active_pending_downgrade, downgraded, inactive. Can be set by Stripe webhook or derived from role type.';



COMMENT ON COLUMN "public"."user_roles"."current_period_end" IS 'When the current subscription period ends';



COMMENT ON COLUMN "public"."user_roles"."cancel_at_period_end" IS 'Whether subscription will cancel at period end';



CREATE MATERIALIZED VIEW "public"."admin_users" AS
 SELECT DISTINCT "ur"."user_id"
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."is_active" = true) AND (("r"."name")::"text" = 'admin'::"text"))
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."admin_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analysis_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "ticker" "text" NOT NULL,
    "analysis_date" "date" NOT NULL,
    "decision" "text" NOT NULL,
    "confidence" numeric(5,2) NOT NULL,
    "agent_insights" "jsonb",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "full_analysis" "jsonb",
    "is_canceled" boolean DEFAULT false,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "rebalance_request_id" "uuid",
    "analysis_context" "jsonb",
    "analysis_status" "text" DEFAULT 'pending'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "analysis_history_confidence_check" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (100)::numeric))),
    CONSTRAINT "analysis_history_decision_check" CHECK (("decision" = ANY (ARRAY['BUY'::"text", 'SELL'::"text", 'HOLD'::"text", 'PENDING'::"text"]))),
    CONSTRAINT "analysis_history_status_check" CHECK (("analysis_status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'completed'::"text", 'error'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."analysis_history" OWNER TO "postgres";


COMMENT ON COLUMN "public"."analysis_history"."is_canceled" IS 'TRUE if analysis was manually canceled by user';



COMMENT ON COLUMN "public"."analysis_history"."analysis_status" IS 'Analysis status: pending, running, completed, error, cancelled';



COMMENT ON COLUMN "public"."analysis_history"."metadata" IS 'Stores metadata about the analysis including reactivation attempts by the detect-stale-analysis function';



CREATE TABLE IF NOT EXISTS "public"."analysis_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "analysis_id" "uuid" NOT NULL,
    "agent_name" "text" NOT NULL,
    "message" "text" NOT NULL,
    "message_type" "text" DEFAULT 'analysis'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "processed" boolean DEFAULT false,
    "metadata" "jsonb"
);


ALTER TABLE "public"."analysis_messages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."analysis_messages"."metadata" IS 'Additional metadata for the message (e.g., debate round number)';



CREATE TABLE IF NOT EXISTS "public"."api_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "ai_provider" "text" NOT NULL,
    "ai_api_key" "text",
    "ai_model" "text",
    "alpaca_paper_api_key" "text",
    "alpaca_paper_secret_key" "text",
    "alpaca_live_api_key" "text",
    "alpaca_live_secret_key" "text",
    "alpaca_paper_trading" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "analysis_team_model" "text",
    "research_team_model" "text",
    "trading_team_model" "text",
    "risk_team_model" "text",
    "default_provider_id" "uuid",
    "analysis_team_provider_id" "uuid",
    "research_team_provider_id" "uuid",
    "trading_team_provider_id" "uuid",
    "risk_team_provider_id" "uuid",
    "research_debate_rounds" integer DEFAULT 2,
    "analysis_team_ai" "text",
    "research_team_ai" "text",
    "trading_team_ai" "text",
    "risk_team_ai" "text",
    "analysis_max_tokens" integer DEFAULT 2500,
    "research_max_tokens" integer DEFAULT 2500,
    "trading_max_tokens" integer DEFAULT 2500,
    "risk_max_tokens" integer DEFAULT 2500,
    "default_rebalance_threshold" numeric DEFAULT 5,
    "rebalance_schedule" "text" DEFAULT 'manual'::"text",
    "rebalance_enabled" boolean DEFAULT false,
    "last_rebalance_check" timestamp with time zone,
    "opportunity_market_range" "text" DEFAULT '1M'::"text",
    "target_stock_allocation" numeric DEFAULT 80,
    "target_cash_allocation" numeric DEFAULT 20,
    "opportunity_agent_ai" "text",
    "opportunity_agent_model" "text",
    "opportunity_max_tokens" integer DEFAULT 2500,
    "auto_execute_trades" boolean DEFAULT false,
    "default_position_size_dollars" numeric DEFAULT 1000,
    "user_risk_level" "text" DEFAULT 'moderate'::"text",
    "portfolio_manager_ai" "text",
    "portfolio_manager_model" "text",
    "portfolio_manager_max_tokens" integer DEFAULT 2500,
    "rebalance_threshold" numeric DEFAULT 10,
    "rebalance_min_position_size" numeric(5,2) DEFAULT 2.0,
    "rebalance_max_position_size" numeric(5,2) DEFAULT 25.0,
    "opportunity_agent_provider_id" "uuid",
    "rebalance_max_tokens" integer DEFAULT 2500,
    "analysis_history_days" "text" DEFAULT '1M'::"text",
    "analysis_optimization" character varying(20) DEFAULT 'speed'::character varying,
    "portfolio_manager_provider_id" "uuid",
    "analysis_search_sources" integer DEFAULT 5,
    "profit_target" integer DEFAULT 25,
    "stop_loss" integer DEFAULT 10,
    "near_limit_threshold" integer DEFAULT 20,
    "near_position_threshold" integer DEFAULT 20,
    "auto_near_limit_analysis" boolean DEFAULT false,
    CONSTRAINT "api_settings_ai_provider_check" CHECK (("ai_provider" = ANY (ARRAY['openai'::"text", 'anthropic'::"text", 'google'::"text", 'openrouter'::"text", 'deepseek'::"text"]))),
    CONSTRAINT "api_settings_analysis_history_days_check" CHECK (("analysis_history_days" = ANY (ARRAY['1M'::"text", '3M'::"text", '6M'::"text", '1Y'::"text"]))),
    CONSTRAINT "api_settings_analysis_max_tokens_check" CHECK ((("analysis_max_tokens" >= 500) AND ("analysis_max_tokens" <= 8000))),
    CONSTRAINT "api_settings_analysis_optimization_check" CHECK (((("analysis_optimization")::"text" = ANY ((ARRAY['speed'::character varying, 'balanced'::character varying])::"text"[])) OR ("analysis_optimization" IS NULL))),
    CONSTRAINT "api_settings_analysis_search_sources_check" CHECK ((("analysis_search_sources" >= 1) AND ("analysis_search_sources" <= 25))),
    CONSTRAINT "api_settings_opportunity_market_range_check" CHECK (("opportunity_market_range" = ANY (ARRAY['1D'::"text", '1W'::"text", '1M'::"text", '3M'::"text", '1Y'::"text"]))),
    CONSTRAINT "api_settings_opportunity_max_tokens_check" CHECK ((("opportunity_max_tokens" >= 500) AND ("opportunity_max_tokens" <= 8000))),
    CONSTRAINT "api_settings_portfolio_manager_max_tokens_check" CHECK ((("portfolio_manager_max_tokens" >= 500) AND ("portfolio_manager_max_tokens" <= 8000))),
    CONSTRAINT "api_settings_rebalance_max_tokens_check" CHECK ((("rebalance_max_tokens" >= 500) AND ("rebalance_max_tokens" <= 8000))),
    CONSTRAINT "api_settings_rebalance_schedule_check" CHECK (("rebalance_schedule" = ANY (ARRAY['manual'::"text", 'daily'::"text", 'weekly'::"text", 'monthly'::"text"]))),
    CONSTRAINT "api_settings_rebalance_threshold_check" CHECK ((("rebalance_threshold" >= (1)::numeric) AND ("rebalance_threshold" <= (100)::numeric))),
    CONSTRAINT "api_settings_research_debate_rounds_check" CHECK ((("research_debate_rounds" >= 1) AND ("research_debate_rounds" <= 10))),
    CONSTRAINT "api_settings_research_max_tokens_check" CHECK ((("research_max_tokens" >= 500) AND ("research_max_tokens" <= 8000))),
    CONSTRAINT "api_settings_risk_max_tokens_check" CHECK ((("risk_max_tokens" >= 500) AND ("risk_max_tokens" <= 8000))),
    CONSTRAINT "api_settings_target_cash_allocation_check" CHECK ((("target_cash_allocation" >= (0)::numeric) AND ("target_cash_allocation" <= (100)::numeric))),
    CONSTRAINT "api_settings_target_stock_allocation_check" CHECK ((("target_stock_allocation" >= (0)::numeric) AND ("target_stock_allocation" <= (100)::numeric))),
    CONSTRAINT "api_settings_trading_max_tokens_check" CHECK ((("trading_max_tokens" >= 500) AND ("trading_max_tokens" <= 8000))),
    CONSTRAINT "api_settings_user_risk_level_check" CHECK (("user_risk_level" = ANY (ARRAY['conservative'::"text", 'moderate'::"text", 'aggressive'::"text"]))),
    CONSTRAINT "check_allocation_total" CHECK ((("target_stock_allocation" + "target_cash_allocation") = (100)::numeric)),
    CONSTRAINT "check_rebalance_max_position_percent" CHECK ((("rebalance_max_position_size" > (0)::numeric) AND ("rebalance_max_position_size" <= (100)::numeric))),
    CONSTRAINT "check_rebalance_min_position_percent" CHECK ((("rebalance_min_position_size" > (0)::numeric) AND ("rebalance_min_position_size" <= (100)::numeric))),
    CONSTRAINT "check_rebalance_position_percent_order" CHECK (("rebalance_min_position_size" <= "rebalance_max_position_size"))
);


ALTER TABLE "public"."api_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."api_settings" IS 'User API settings - ai_api_key stores default provider key, additional providers in provider_configurations table';



COMMENT ON COLUMN "public"."api_settings"."analysis_team_model" IS 'Specific model for analysis team agents';



COMMENT ON COLUMN "public"."api_settings"."research_team_model" IS 'Specific model for research team agents';



COMMENT ON COLUMN "public"."api_settings"."trading_team_model" IS 'Specific model for trading decision agent';



COMMENT ON COLUMN "public"."api_settings"."risk_team_model" IS 'Specific model for risk management agents';



COMMENT ON COLUMN "public"."api_settings"."research_debate_rounds" IS 'Number of debate rounds for research team (bull vs bear)';



COMMENT ON COLUMN "public"."api_settings"."analysis_team_ai" IS 'AI provider for analysis team agents';



COMMENT ON COLUMN "public"."api_settings"."research_team_ai" IS 'AI provider for research team agents';



COMMENT ON COLUMN "public"."api_settings"."trading_team_ai" IS 'AI provider for trading decision agent';



COMMENT ON COLUMN "public"."api_settings"."risk_team_ai" IS 'AI provider for risk management agents';



COMMENT ON COLUMN "public"."api_settings"."analysis_max_tokens" IS 'Maximum response tokens for analysis agents (default: 2500, range: 500-8000)';



COMMENT ON COLUMN "public"."api_settings"."research_max_tokens" IS 'Maximum response tokens for research agents during debate (default: 2500, range: 500-8000)';



COMMENT ON COLUMN "public"."api_settings"."trading_max_tokens" IS 'Maximum response tokens for trading decision agent (default: 2500, range: 500-8000)';



COMMENT ON COLUMN "public"."api_settings"."risk_max_tokens" IS 'Maximum response tokens for risk management agents (default: 2500, range: 500-8000)';



COMMENT ON COLUMN "public"."api_settings"."opportunity_market_range" IS 'Time range for historical market data in opportunity agent: 1D (1 day), 1W (1 week), 1M (1 month), 3M (3 months), 1Y (1 year)';



COMMENT ON COLUMN "public"."api_settings"."target_stock_allocation" IS 'Target percentage of portfolio to allocate to stocks (0-100)';



COMMENT ON COLUMN "public"."api_settings"."target_cash_allocation" IS 'Target percentage of portfolio to maintain as cash (0-100)';



COMMENT ON COLUMN "public"."api_settings"."opportunity_agent_ai" IS 'AI provider for opportunity agent';



COMMENT ON COLUMN "public"."api_settings"."opportunity_agent_model" IS 'Model to use for opportunity agent';



COMMENT ON COLUMN "public"."api_settings"."opportunity_max_tokens" IS 'Maximum response tokens for opportunity agent (default: 2500, range: 500-8000)';



COMMENT ON COLUMN "public"."api_settings"."auto_execute_trades" IS 'When true, approved trade orders are automatically executed without manual confirmation';



COMMENT ON COLUMN "public"."api_settings"."default_position_size_dollars" IS 'Default position size in dollars when using dollar-based orders';



COMMENT ON COLUMN "public"."api_settings"."user_risk_level" IS 'User risk tolerance level: conservative, moderate, or aggressive';



COMMENT ON COLUMN "public"."api_settings"."portfolio_manager_ai" IS 'AI provider for portfolio manager agent (anthropic, openai, etc)';



COMMENT ON COLUMN "public"."api_settings"."portfolio_manager_model" IS 'Model to use for portfolio manager agent';



COMMENT ON COLUMN "public"."api_settings"."portfolio_manager_max_tokens" IS 'Maximum response tokens for portfolio manager agent (default: 2500, range: 500-8000)';



COMMENT ON COLUMN "public"."api_settings"."rebalance_threshold" IS 'Percentage threshold for triggering rebalance (1-100)';



COMMENT ON COLUMN "public"."api_settings"."rebalance_min_position_size" IS 'Minimum position size as percentage of total portfolio value (0-100)';



COMMENT ON COLUMN "public"."api_settings"."rebalance_max_position_size" IS 'Maximum position size as percentage of total portfolio value (0-100)';



COMMENT ON COLUMN "public"."api_settings"."opportunity_agent_provider_id" IS 'Provider configuration ID for opportunity agent';



COMMENT ON COLUMN "public"."api_settings"."rebalance_max_tokens" IS 'Maximum response tokens for rebalance agent (default: 2500, range: 500-8000)';



COMMENT ON COLUMN "public"."api_settings"."analysis_history_days" IS 'Historical data range for analysis agents (1M, 3M, 6M, 1Y)';



COMMENT ON COLUMN "public"."api_settings"."analysis_optimization" IS 'Optimization strategy for analysis. Values: speed (faster, less thorough) or balanced (slower, more thorough). Default: speed';



COMMENT ON COLUMN "public"."api_settings"."portfolio_manager_provider_id" IS 'Reference to provider_configurations for portfolio manager agent-specific AI provider';



COMMENT ON COLUMN "public"."api_settings"."analysis_search_sources" IS 'Number of search sources to use for analysis agents. Range: 1-25. Default: 5. Higher values provide more comprehensive data but may take longer. Works with analysis_optimization: speed mode typically uses fewer sources, balanced mode can utilize more sources effectively.';



COMMENT ON COLUMN "public"."api_settings"."profit_target" IS 'User preference for taking profits (percentage)';



COMMENT ON COLUMN "public"."api_settings"."stop_loss" IS 'User preference for cutting losses (percentage)';



COMMENT ON COLUMN "public"."api_settings"."near_limit_threshold" IS 'Percentage threshold for triggering near-limit analysis (e.g., 20% means trigger when position is within 20% of profit_target or stop_loss)';



COMMENT ON COLUMN "public"."api_settings"."near_position_threshold" IS 'Percentage of min/max position size to consider position "near" the limit (e.g., 20% means within 20% of max size)';



COMMENT ON COLUMN "public"."api_settings"."auto_near_limit_analysis" IS 'Enable automatic analysis when positions approach profit_target or stop_loss thresholds based on near_limit_threshold percentage';



CREATE OR REPLACE VIEW "public"."api_settings_unified" WITH ("security_invoker"='true') AS
 SELECT "user_id",
    "ai_provider",
    "ai_api_key",
    "ai_model",
    "analysis_optimization" AS "news_social_optimization",
    "analysis_history_days",
    "research_debate_rounds",
    "analysis_max_tokens",
    "research_max_tokens",
    "trading_max_tokens",
    "risk_max_tokens",
    "created_at",
    "updated_at"
   FROM "public"."api_settings";


ALTER VIEW "public"."api_settings_unified" OWNER TO "postgres";


COMMENT ON VIEW "public"."api_settings_unified" IS 'Unified API settings view. Uses SECURITY INVOKER to respect user permissions and RLS policies.';



CREATE TABLE IF NOT EXISTS "public"."invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "name" "text",
    "invited_by" "uuid",
    "invited_at" timestamp with time zone DEFAULT "now"(),
    "confirmed_at" timestamp with time zone,
    "confirmed_user_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."market_data_cache" (
    "ticker" "text" NOT NULL,
    "timeframe" "text" DEFAULT '1Y'::"text" NOT NULL,
    "historical_data" "jsonb" NOT NULL,
    "technical_indicators" "jsonb" NOT NULL,
    "data_points" integer NOT NULL,
    "analysis_range" "text" NOT NULL,
    "fetched_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."market_data_cache" OWNER TO "postgres";


COMMENT ON TABLE "public"."market_data_cache" IS 'Market data cache using New York timezone (America/New_York) for all date operations';



COMMENT ON COLUMN "public"."market_data_cache"."fetched_date" IS 'Date when data was fetched, in New York timezone (YYYY-MM-DD format)';



COMMENT ON COLUMN "public"."market_data_cache"."created_at" IS 'Timestamp when cache entry was created, stored in UTC but represents NY time operation';



COMMENT ON COLUMN "public"."market_data_cache"."updated_at" IS 'Timestamp when cache entry was last updated, stored in UTC but represents NY time operation';



CREATE OR REPLACE VIEW "public"."market_cache_status" WITH ("security_invoker"='true') AS
 SELECT "ticker",
    "timeframe",
    "fetched_date",
    "data_points",
    "created_at",
    "updated_at"
   FROM "public"."market_data_cache"
  ORDER BY "created_at" DESC;


ALTER VIEW "public"."market_cache_status" OWNER TO "postgres";


COMMENT ON VIEW "public"."market_cache_status" IS 'Market data cache status view. Converted to SECURITY INVOKER to respect user permissions and RLS policies.';



CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "resource" character varying(50) NOT NULL,
    "action" character varying(50) NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."portfolios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "total_value" numeric(15,2) DEFAULT 0,
    "cash_available" numeric(15,2) DEFAULT 100000,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."portfolios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "portfolio_id" "uuid" NOT NULL,
    "ticker" "text" NOT NULL,
    "shares" numeric(15,4) NOT NULL,
    "avg_cost" numeric(10,2) NOT NULL,
    "current_price" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "name" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "discord_id" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'User profiles with RLS enabled for data isolation';



CREATE TABLE IF NOT EXISTS "public"."provider_configurations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "nickname" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "api_key" "text" NOT NULL,
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provider_configurations_provider_check" CHECK (("provider" = ANY (ARRAY['openai'::"text", 'anthropic'::"text", 'google'::"text", 'deepseek'::"text", 'openrouter'::"text"])))
);


ALTER TABLE "public"."provider_configurations" OWNER TO "postgres";


COMMENT ON TABLE "public"."provider_configurations" IS 'Stores AI provider configurations with user-defined nicknames';



COMMENT ON COLUMN "public"."provider_configurations"."nickname" IS 'User-defined nickname for the provider configuration';



COMMENT ON COLUMN "public"."provider_configurations"."is_default" IS 'Whether this is the default provider for the user';



CREATE TABLE IF NOT EXISTS "public"."rebalance_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rebalance_request_id" "uuid",
    "user_id" "uuid",
    "portfolio_before" "jsonb",
    "portfolio_after" "jsonb",
    "allocations_before" "jsonb",
    "allocations_after" "jsonb",
    "rebalance_cost" numeric,
    "tax_implications" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."rebalance_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rebalance_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "target_allocations" "jsonb" NOT NULL,
    "rebalance_threshold" numeric DEFAULT 5,
    "max_position_size" numeric(5,2) DEFAULT 25,
    "min_position_size" numeric(5,2) DEFAULT 2,
    "portfolio_snapshot" "jsonb" NOT NULL,
    "market_snapshot" "jsonb",
    "total_portfolio_value" numeric NOT NULL,
    "opportunity_reasoning" "jsonb",
    "selected_stocks" "text"[],
    "threshold_exceeded" boolean DEFAULT false,
    "analysis_ids" "uuid"[],
    "rebalance_plan" "jsonb",
    "execution_summary" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "analyses_completed_at" timestamp with time zone,
    "plan_generated_at" timestamp with time zone,
    "approved_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_by" "text" DEFAULT 'user'::"text",
    "notes" "text",
    "target_cash_allocation" numeric(5,2) DEFAULT 0,
    "skip_threshold_check" boolean DEFAULT false,
    "skip_opportunity_agent" boolean DEFAULT false,
    "auto_execute_enabled" boolean DEFAULT false,
    "workflow_steps" "jsonb",
    "portfolio_manager_response" "jsonb",
    "portfolio_manager_completed_at" timestamp with time zone,
    "constraints" "jsonb" DEFAULT '{}'::"jsonb",
    "is_canceled" boolean DEFAULT false,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "total_stocks" integer DEFAULT 0,
    "stocks_analyzed" integer DEFAULT 0,
    "error_message" "text",
    "opportunity_evaluation" "jsonb",
    "opportunity_agent_insights" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "rebalance_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'completed'::"text", 'cancelled'::"text", 'error'::"text"]))),
    CONSTRAINT "rebalance_requests_target_cash_allocation_check" CHECK ((("target_cash_allocation" >= (0)::numeric) AND ("target_cash_allocation" <= (100)::numeric)))
);


ALTER TABLE "public"."rebalance_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."rebalance_requests" IS 'User rebalance requests with RLS enabled for data isolation';



COMMENT ON COLUMN "public"."rebalance_requests"."status" IS 'Rebalance status: pending, running, completed, cancelled, error';



COMMENT ON COLUMN "public"."rebalance_requests"."target_cash_allocation" IS 'Target percentage of portfolio to maintain as cash (0-100)';



COMMENT ON COLUMN "public"."rebalance_requests"."skip_threshold_check" IS 'When true, bypasses threshold check and forces rebalance';



COMMENT ON COLUMN "public"."rebalance_requests"."skip_opportunity_agent" IS 'When true, skips opportunity agent analysis';



COMMENT ON COLUMN "public"."rebalance_requests"."auto_execute_enabled" IS 'Whether trades should be auto-executed without user approval';



COMMENT ON COLUMN "public"."rebalance_requests"."workflow_steps" IS 'Detailed workflow progress tracking with timestamps for each step';



COMMENT ON COLUMN "public"."rebalance_requests"."portfolio_manager_response" IS 'Complete response from portfolio manager including trade orders with before/after details';



COMMENT ON COLUMN "public"."rebalance_requests"."portfolio_manager_completed_at" IS 'Timestamp when portfolio manager completed processing';



COMMENT ON COLUMN "public"."rebalance_requests"."constraints" IS 'Stores user-defined constraints for this rebalance operation including min/max position sizes, thresholds, and skip flags';



COMMENT ON COLUMN "public"."rebalance_requests"."is_canceled" IS 'TRUE if 
  rebalance was manually canceled by user';



COMMENT ON COLUMN "public"."rebalance_requests"."updated_at" IS 'Timestamp of the last update to this record';



COMMENT ON COLUMN "public"."rebalance_requests"."total_stocks" IS 'Total number of stocks to be analyzed for this rebalance request';



COMMENT ON COLUMN "public"."rebalance_requests"."stocks_analyzed" IS 'Number of stocks that have been analyzed so far';



COMMENT ON COLUMN "public"."rebalance_requests"."error_message" IS 'Error message when rebalance fails';



COMMENT ON COLUMN "public"."rebalance_requests"."opportunity_evaluation" IS 'Full opportunity agent evaluation results including recommended analysis, selected stocks, and market conditions';



COMMENT ON COLUMN "public"."rebalance_requests"."opportunity_agent_insights" IS 'Opportunity agent reasoning and insights in text format';



COMMENT ON COLUMN "public"."rebalance_requests"."metadata" IS 'Stores metadata about the rebalance including auto-trade execution results';



CREATE TABLE IF NOT EXISTS "public"."rebalance_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT true,
    "frequency" "text" DEFAULT 'custom'::"text" NOT NULL,
    "interval_value" integer DEFAULT 1,
    "interval_unit" "text" NOT NULL,
    "day_of_week" integer[],
    "day_of_month" integer[],
    "time_of_day" time without time zone NOT NULL,
    "timezone" "text" DEFAULT 'America/New_York'::"text" NOT NULL,
    "selected_tickers" "text"[] NOT NULL,
    "include_watchlist" boolean DEFAULT false,
    "last_executed_at" timestamp with time zone,
    "next_scheduled_at" timestamp with time zone,
    "execution_count" integer DEFAULT 0,
    "last_execution_status" "text",
    "last_execution_details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "rebalance_threshold" numeric(5,2),
    "skip_threshold_check" boolean DEFAULT false,
    "skip_opportunity_agent" boolean DEFAULT false,
    "resolved_tickers" "text"[] DEFAULT '{}'::"text"[],
    "resolved_constraints" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "check_time_of_day_minutes" CHECK (((EXTRACT(minute FROM "time_of_day") = ANY (ARRAY[(0)::numeric, (30)::numeric])) AND (EXTRACT(second FROM "time_of_day") = (0)::numeric))),
    CONSTRAINT "rebalance_schedules_frequency_check" CHECK (("frequency" = 'custom'::"text")),
    CONSTRAINT "rebalance_schedules_interval_unit_check" CHECK (("interval_unit" = ANY (ARRAY['days'::"text", 'weeks'::"text", 'months'::"text"]))),
    CONSTRAINT "rebalance_schedules_interval_value_check" CHECK (("interval_value" > 0)),
    CONSTRAINT "rebalance_schedules_last_execution_status_check" CHECK ((("last_execution_status" IS NULL) OR ("last_execution_status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'completed'::"text", 'cancelled'::"text", 'error'::"text"]))))
);


ALTER TABLE "public"."rebalance_schedules" OWNER TO "postgres";


COMMENT ON TABLE "public"."rebalance_schedules" IS 'Stores scheduled rebalance configurations. Position sizing and allocation settings removed on 2025-01-14 - schedules now use user api_settings for these values.';



COMMENT ON COLUMN "public"."rebalance_schedules"."include_watchlist" IS 'UI flag to show watchlist section when editing (selected_tickers contains final selection)';



COMMENT ON COLUMN "public"."rebalance_schedules"."last_executed_at" IS 'Timestamp of the last successful execution. Used to calculate next run time by adding the schedule frequency.';



COMMENT ON COLUMN "public"."rebalance_schedules"."next_scheduled_at" IS 'DEPRECATED - No longer used. Next run time is calculated dynamically based on last_executed_at + frequency.';



COMMENT ON COLUMN "public"."rebalance_schedules"."last_execution_status" IS 'Last rebalance execution status using unified system: pending, running, completed, cancelled, error';



COMMENT ON COLUMN "public"."rebalance_schedules"."rebalance_threshold" IS 'Rebalance threshold percentage for triggering analysis';



COMMENT ON COLUMN "public"."rebalance_schedules"."skip_threshold_check" IS 'When true, analyzes all stocks regardless of threshold';



COMMENT ON COLUMN "public"."rebalance_schedules"."skip_opportunity_agent" IS 'When true, skips opportunity agent evaluation';



COMMENT ON COLUMN "public"."rebalance_schedules"."resolved_tickers" IS 'Complete list of tickers to rebalance, resolved at schedule creation/update time';



COMMENT ON COLUMN "public"."rebalance_schedules"."resolved_constraints" IS 'Complete rebalance constraints including all settings, resolved at schedule creation/update time';



COMMENT ON CONSTRAINT "check_time_of_day_minutes" ON "public"."rebalance_schedules" IS 'Ensures schedules can only be set for :00 or :30 minutes past the hour 
to align with GitHub Actions running at :25 and :55';



CREATE TABLE IF NOT EXISTS "public"."trading_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "portfolio_id" "uuid",
    "ticker" "text" NOT NULL,
    "action" "text" NOT NULL,
    "shares" numeric(15,4) NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "agent" "text",
    "reasoning" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "executed_at" timestamp with time zone,
    "source_type" "text" DEFAULT 'individual_analysis'::"text",
    "rebalance_request_id" "uuid",
    "position_percentage" numeric,
    "target_value" numeric,
    "user_approved_at" timestamp with time zone,
    "auto_executed" boolean DEFAULT false,
    "analysis_id" "uuid",
    "dollar_amount" numeric(15,2) DEFAULT 0,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "alpaca_order_id" "text",
    "alpaca_order_status" "text",
    "alpaca_filled_qty" numeric(15,4),
    "alpaca_filled_price" numeric(10,2),
    CONSTRAINT "trading_actions_action_check" CHECK (("action" = ANY (ARRAY['BUY'::"text", 'SELL'::"text"]))),
    CONSTRAINT "trading_actions_order_validation" CHECK (((("shares" > (0)::numeric) AND ("dollar_amount" = (0)::numeric)) OR (("shares" = (0)::numeric) AND ("dollar_amount" > (0)::numeric)) OR (("shares" = (0)::numeric) AND ("dollar_amount" = (0)::numeric) AND ("action" = 'HOLD'::"text")))),
    CONSTRAINT "trading_actions_source_type_check" CHECK (("source_type" = ANY (ARRAY['individual_analysis'::"text", 'rebalance'::"text", 'manual'::"text"]))),
    CONSTRAINT "trading_actions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."trading_actions" OWNER TO "postgres";


COMMENT ON TABLE "public"."trading_actions" IS 'User trading actions with RLS enabled for data isolation';



COMMENT ON COLUMN "public"."trading_actions"."status" IS 'Trade order status: pending (awaiting user decision), approved (user approved), rejected (user rejected)';



COMMENT ON COLUMN "public"."trading_actions"."user_approved_at" IS 'Timestamp when user manually approved this trade';



COMMENT ON COLUMN "public"."trading_actions"."auto_executed" IS 'Whether this trade was auto-executed without manual approval';



COMMENT ON COLUMN "public"."trading_actions"."analysis_id" IS 'Links trade order to the analysis that generated the recommendation';



COMMENT ON COLUMN "public"."trading_actions"."dollar_amount" IS 'Dollar amount for the trade order (alternative to specifying shares)';



COMMENT ON COLUMN "public"."trading_actions"."metadata" IS 'JSONB field storing additional trade metadata including:
- beforePosition: {shares, value, allocation}
- afterPosition: {shares, value, allocation}
- changes: {shares, value, allocation}
- alpaca_order: {
    id: Alpaca order ID,
    client_order_id: Client order ID,
    status: Order status (pending, filled, canceled, rejected),
    created_at: Order creation timestamp,
    submitted_at: Order submission timestamp,
    type: Order type (market, limit, stop, etc),
    time_in_force: Time in force (day, gtc, etc),
    filled_qty: Filled quantity,
    filled_avg_price: Average fill price,
    updated_at: Last update timestamp
  }';



COMMENT ON COLUMN "public"."trading_actions"."alpaca_order_id" IS 'Alpaca order ID linked to this AI trade decision';



COMMENT ON COLUMN "public"."trading_actions"."alpaca_order_status" IS 'Current status of the linked Alpaca order';



COMMENT ON COLUMN "public"."trading_actions"."alpaca_filled_qty" IS 'Quantity filled by Alpaca for this order';



COMMENT ON COLUMN "public"."trading_actions"."alpaca_filled_price" IS 'Average filled price by Alpaca for this order';



CREATE OR REPLACE VIEW "public"."rebalance_summary" WITH ("security_invoker"='true') AS
 SELECT "rr"."id",
    "rr"."user_id",
    "rr"."status",
    "rr"."created_at",
    "rr"."updated_at",
    "rr"."total_stocks",
    "rr"."stocks_analyzed",
    "rr"."total_portfolio_value",
    "rr"."target_allocations",
    "rr"."created_by",
    "count"("ta"."id") AS "total_trades",
    "count"("ta"."id") FILTER (WHERE ("ta"."status" = 'approved'::"text")) AS "approved_trades",
    "count"("ta"."id") FILTER (WHERE ("ta"."status" = 'executed'::"text")) AS "executed_trades"
   FROM ("public"."rebalance_requests" "rr"
     LEFT JOIN "public"."trading_actions" "ta" ON (("rr"."id" = "ta"."rebalance_request_id")))
  GROUP BY "rr"."id", "rr"."user_id", "rr"."status", "rr"."created_at", "rr"."updated_at", "rr"."total_stocks", "rr"."stocks_analyzed", "rr"."total_portfolio_value", "rr"."target_allocations", "rr"."created_by"
  ORDER BY "rr"."created_at" DESC;


ALTER VIEW "public"."rebalance_summary" OWNER TO "postgres";


COMMENT ON VIEW "public"."rebalance_summary" IS 'Rebalance summary with trade counts. Converted to SECURITY INVOKER to respect user permissions and RLS policies.';



CREATE TABLE IF NOT EXISTS "public"."role_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "target_user_id" "uuid",
    "action" character varying(50) NOT NULL,
    "role_id" "uuid",
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."role_audit_log" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."role_display_info" AS
 SELECT "id",
    "name",
    "display_name",
    "description",
    "priority",
    "color",
    "icon_url",
    "price_monthly",
    "price_yearly",
    "features",
    "stripe_price_id_monthly",
    "stripe_price_id_yearly",
    "stripe_product_id",
    "discord_role_id",
        CASE
            WHEN (("price_yearly" > (0)::numeric) AND ("price_monthly" > (0)::numeric)) THEN "round"((((1)::numeric - (("price_yearly" / (12)::numeric) / "price_monthly")) * (100)::numeric), 0)
            ELSE (0)::numeric
        END AS "yearly_discount_percentage",
        CASE
            WHEN ("price_yearly" > (0)::numeric) THEN "round"(("price_yearly" / (12)::numeric), 2)
            ELSE (0)::numeric
        END AS "effective_monthly_price_yearly"
   FROM "public"."roles"
  ORDER BY "priority";


ALTER VIEW "public"."role_display_info" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "role_id" "uuid",
    "max_watchlist_stocks" integer DEFAULT 20,
    "max_rebalance_stocks" integer DEFAULT 10,
    "max_scheduled_rebalances" integer DEFAULT 5,
    "rebalance_access" boolean DEFAULT true,
    "opportunity_agent_access" boolean DEFAULT false,
    "additional_provider_access" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "enable_live_trading" boolean DEFAULT false,
    "enable_auto_trading" boolean DEFAULT false,
    "max_parallel_analysis" integer DEFAULT 1,
    "schedule_resolution" "text" DEFAULT 'Month'::"text",
    "optimization_mode" "text" DEFAULT 'speed'::"text",
    "number_of_search_sources" integer DEFAULT 5,
    "max_debate_rounds" integer DEFAULT 2,
    "near_limit_analysis_access" boolean DEFAULT false,
    CONSTRAINT "role_limits_max_debate_rounds_check" CHECK ((("max_debate_rounds" >= 1) AND ("max_debate_rounds" <= 5)))
);


ALTER TABLE "public"."role_limits" OWNER TO "postgres";


COMMENT ON COLUMN "public"."role_limits"."enable_live_trading" IS 'When true, allows users with this role to execute real trades (vs paper trading)';



COMMENT ON COLUMN "public"."role_limits"."enable_auto_trading" IS 'When true, allows users with this role to enable automatic trade execution';



COMMENT ON COLUMN "public"."role_limits"."max_parallel_analysis" IS 'Maximum number of analysis that can run in parallel for this role';



COMMENT ON COLUMN "public"."role_limits"."schedule_resolution" IS 'Comma-separated list of allowed schedule resolutions (Day,Week,Month) for this role';



COMMENT ON COLUMN "public"."role_limits"."optimization_mode" IS 'Comma-separated list of available optimization modes for this role. Options: "speed" (faster results), "balanced" (comprehensive analysis), or both "speed,balanced". Default is "speed" only';



COMMENT ON COLUMN "public"."role_limits"."number_of_search_sources" IS 'Maximum number of search sources that can be used for analysis. Higher values provide more comprehensive data but may take longer';



COMMENT ON COLUMN "public"."role_limits"."max_debate_rounds" IS 'Maximum number of debate rounds allowed in research phase (1-5). Higher tiers can have more rounds for deeper analysis.';



COMMENT ON COLUMN "public"."role_limits"."near_limit_analysis_access" IS 'Controls whether a role has access to enable auto near limit analysis feature';



CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role_id" "uuid" NOT NULL,
    "permission_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."role_summary" WITH ("security_invoker"='true') AS
 SELECT "r"."id",
    "r"."name",
    "r"."display_name",
    "r"."description",
    "r"."priority",
    "count"("ur"."user_id") AS "user_count",
    "count"("ur"."user_id") FILTER (WHERE ("ur"."is_active" = true)) AS "active_user_count"
   FROM ("public"."roles" "r"
     LEFT JOIN "public"."user_roles" "ur" ON (("r"."id" = "ur"."role_id")))
  GROUP BY "r"."id", "r"."name", "r"."display_name", "r"."description", "r"."priority"
  ORDER BY "r"."priority" DESC;


ALTER VIEW "public"."role_summary" OWNER TO "postgres";


COMMENT ON VIEW "public"."role_summary" IS 'Role summary with user counts. Converted to SECURITY INVOKER to respect user permissions and RLS policies.';



CREATE OR REPLACE VIEW "public"."scheduled_rebalance_status" AS
 SELECT "rs"."id",
    "rs"."user_id",
    "p"."email" AS "user_email",
    "rs"."enabled",
    "rs"."interval_value",
    "rs"."interval_unit",
        CASE
            WHEN (("rs"."interval_value" = 1) AND ("rs"."interval_unit" = 'days'::"text")) THEN 'Daily'::"text"
            WHEN (("rs"."interval_value" = 1) AND ("rs"."interval_unit" = 'weeks'::"text")) THEN 'Weekly'::"text"
            WHEN (("rs"."interval_value" = 2) AND ("rs"."interval_unit" = 'weeks'::"text")) THEN 'Bi-weekly'::"text"
            WHEN (("rs"."interval_value" = 1) AND ("rs"."interval_unit" = 'months'::"text")) THEN 'Monthly'::"text"
            ELSE ((('Every '::"text" || "rs"."interval_value") || ' '::"text") || "rs"."interval_unit")
        END AS "frequency_display",
    "rs"."time_of_day",
    "rs"."timezone",
    "rs"."last_executed_at",
    "rs"."next_scheduled_at",
    "rs"."created_at",
    "rs"."updated_at"
   FROM ("public"."rebalance_schedules" "rs"
     LEFT JOIN "public"."profiles" "p" ON (("rs"."user_id" = "p"."id")))
  ORDER BY "rs"."next_scheduled_at";


ALTER VIEW "public"."scheduled_rebalance_status" OWNER TO "postgres";


COMMENT ON VIEW "public"."scheduled_rebalance_status" IS 'View of scheduled rebalances with user email. Uses profiles table instead of auth.users to prevent security exposure. Access controlled via RLS policies.';



CREATE TABLE IF NOT EXISTS "public"."target_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "ticker" "text" NOT NULL,
    "target_percentage" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "target_allocations_target_percentage_check" CHECK ((("target_percentage" >= (0)::numeric) AND ("target_percentage" <= (100)::numeric)))
);


ALTER TABLE "public"."target_allocations" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."trade_orders_detailed" WITH ("security_invoker"='true') AS
 SELECT "ta"."id",
    "ta"."user_id",
    "ta"."ticker",
    "ta"."action",
    "ta"."shares",
    "ta"."dollar_amount",
    "ta"."price",
    "ta"."status",
    "ta"."agent",
    "ta"."reasoning",
    "ta"."created_at",
    "ta"."executed_at",
    "ta"."source_type",
    "ta"."rebalance_request_id",
    "ta"."analysis_id",
    "ta"."auto_executed",
    "ta"."metadata",
    ((("ta"."metadata" -> 'beforePosition'::"text") ->> 'shares'::"text"))::numeric AS "before_shares",
    ((("ta"."metadata" -> 'beforePosition'::"text") ->> 'value'::"text"))::numeric AS "before_value",
    ((("ta"."metadata" -> 'beforePosition'::"text") ->> 'allocation'::"text"))::numeric AS "before_allocation",
    ((("ta"."metadata" -> 'afterPosition'::"text") ->> 'shares'::"text"))::numeric AS "after_shares",
    ((("ta"."metadata" -> 'afterPosition'::"text") ->> 'value'::"text"))::numeric AS "after_value",
    ((("ta"."metadata" -> 'afterPosition'::"text") ->> 'allocation'::"text"))::numeric AS "after_allocation",
    ((("ta"."metadata" -> 'changes'::"text") ->> 'shares'::"text"))::numeric AS "shares_change",
    ((("ta"."metadata" -> 'changes'::"text") ->> 'value'::"text"))::numeric AS "value_change",
    ((("ta"."metadata" -> 'changes'::"text") ->> 'allocation'::"text"))::numeric AS "allocation_change",
        CASE
            WHEN ("ta"."dollar_amount" > (0)::numeric) THEN 'dollar_order'::"text"
            WHEN ("ta"."shares" > (0)::numeric) THEN 'share_order'::"text"
            ELSE 'hold'::"text"
        END AS "order_type",
    "ah"."ticker" AS "analysis_ticker",
    "ah"."decision" AS "analysis_decision",
    "ah"."confidence" AS "analysis_confidence",
    "rr"."status" AS "rebalance_status",
    "rr"."target_allocations" AS "rebalance_target_allocations"
   FROM (("public"."trading_actions" "ta"
     LEFT JOIN "public"."analysis_history" "ah" ON (("ta"."analysis_id" = "ah"."id")))
     LEFT JOIN "public"."rebalance_requests" "rr" ON (("ta"."rebalance_request_id" = "rr"."id")));


ALTER VIEW "public"."trade_orders_detailed" OWNER TO "postgres";


COMMENT ON VIEW "public"."trade_orders_detailed" IS 'Detailed view of trading actions. Uses SECURITY INVOKER to respect user permissions and RLS policies.';



CREATE OR REPLACE VIEW "public"."user_roles_simple" WITH ("security_invoker"='true') AS
 SELECT "ur"."id",
    "ur"."user_id",
    "ur"."role_id",
    "ur"."is_active",
    "r"."name" AS "role_name",
    "r"."display_name" AS "role_display_name",
    "ur"."created_at",
    "ur"."updated_at"
   FROM ("public"."user_roles" "ur"
     LEFT JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")));


ALTER VIEW "public"."user_roles_simple" OWNER TO "postgres";


COMMENT ON VIEW "public"."user_roles_simple" IS 'Simplified user roles view. Uses SECURITY INVOKER to respect user permissions and RLS policies.';



CREATE OR REPLACE VIEW "public"."user_subscription_status" AS
 SELECT "ur"."user_id",
    "ur"."stripe_subscription_id",
    "ur"."stripe_customer_id",
    "ur"."stripe_price_id",
    "ur"."subscription_status",
    "ur"."current_period_end",
    "ur"."cancel_at_period_end",
    "r"."id" AS "role_id",
    "r"."name" AS "role_name",
    "r"."display_name" AS "role_display_name",
    "r"."stripe_product_id",
    "r"."price_monthly",
    "r"."price_yearly",
    "u"."email" AS "user_email"
   FROM (("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
     JOIN "auth"."users" "u" ON (("u"."id" = "ur"."user_id")))
  WHERE (("ur"."is_active" = true) AND ("ur"."stripe_subscription_id" IS NOT NULL));


ALTER VIEW "public"."user_subscription_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "usage_date" "date" DEFAULT CURRENT_DATE,
    "analysis_count" integer DEFAULT 0,
    "rebalance_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."watchlist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "ticker" "text" NOT NULL,
    "added_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "last_analysis" timestamp with time zone,
    "last_decision" "text",
    CONSTRAINT "watchlist_last_decision_check" CHECK (("last_decision" = ANY (ARRAY['BUY'::"text", 'SELL'::"text", 'HOLD'::"text"])))
);


ALTER TABLE "public"."watchlist" OWNER TO "postgres";


ALTER TABLE ONLY "public"."analysis_history"
    ADD CONSTRAINT "analysis_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analysis_messages"
    ADD CONSTRAINT "analysis_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_settings"
    ADD CONSTRAINT "api_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_settings"
    ADD CONSTRAINT "api_settings_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."market_data_cache"
    ADD CONSTRAINT "market_data_cache_pkey" PRIMARY KEY ("ticker", "timeframe", "fetched_date");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."portfolios"
    ADD CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_portfolio_id_ticker_key" UNIQUE ("portfolio_id", "ticker");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_discord_id_key" UNIQUE ("discord_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_configurations"
    ADD CONSTRAINT "provider_configurations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_configurations"
    ADD CONSTRAINT "provider_configurations_user_id_nickname_key" UNIQUE ("user_id", "nickname");



ALTER TABLE ONLY "public"."rebalance_history"
    ADD CONSTRAINT "rebalance_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rebalance_requests"
    ADD CONSTRAINT "rebalance_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rebalance_schedules"
    ADD CONSTRAINT "rebalance_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_audit_log"
    ADD CONSTRAINT "role_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_limits"
    ADD CONSTRAINT "role_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_limits"
    ADD CONSTRAINT "role_limits_role_id_key" UNIQUE ("role_id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."target_allocations"
    ADD CONSTRAINT "target_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."target_allocations"
    ADD CONSTRAINT "target_allocations_user_id_ticker_key" UNIQUE ("user_id", "ticker");



ALTER TABLE ONLY "public"."trading_actions"
    ADD CONSTRAINT "trading_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_id_key" UNIQUE ("user_id", "role_id");



ALTER TABLE ONLY "public"."user_usage"
    ADD CONSTRAINT "user_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_usage"
    ADD CONSTRAINT "user_usage_user_id_usage_date_key" UNIQUE ("user_id", "usage_date");



ALTER TABLE ONLY "public"."watchlist"
    ADD CONSTRAINT "watchlist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."watchlist"
    ADD CONSTRAINT "watchlist_user_id_ticker_key" UNIQUE ("user_id", "ticker");



CREATE UNIQUE INDEX "admin_users_user_id_idx" ON "public"."admin_users" USING "btree" ("user_id");



CREATE INDEX "idx_analysis_history_canceled" ON "public"."analysis_history" USING "btree" ("user_id", "is_canceled") WHERE ("is_canceled" = true);



CREATE INDEX "idx_analysis_history_completed" ON "public"."analysis_history" USING "btree" ("user_id", "ticker", "created_at" DESC) WHERE ("analysis_status" = 'completed'::"text");



CREATE INDEX "idx_analysis_history_covering" ON "public"."analysis_history" USING "btree" ("id", "user_id") INCLUDE ("ticker", "analysis_status", "created_at", "updated_at");



CREATE INDEX "idx_analysis_history_id_user" ON "public"."analysis_history" USING "btree" ("id", "user_id");



COMMENT ON INDEX "public"."idx_analysis_history_id_user" IS 'Primary lookup for AnalysisDetailModal - fixes 5-10 minute load time';



CREATE INDEX "idx_analysis_history_metadata_reactivation" ON "public"."analysis_history" USING "btree" ((("metadata" ->> 'reactivation_attempts'::"text"))) WHERE (("metadata" IS NOT NULL) AND (("metadata" ->> 'reactivation_attempts'::"text") IS NOT NULL));



CREATE INDEX "idx_analysis_history_rebalance" ON "public"."analysis_history" USING "btree" ("rebalance_request_id") WHERE ("rebalance_request_id" IS NOT NULL);



CREATE INDEX "idx_analysis_history_rebalance_created" ON "public"."analysis_history" USING "btree" ("rebalance_request_id", "created_at" DESC) WHERE ("rebalance_request_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_analysis_history_rebalance_created" IS 'Analyses for rebalance with ordering';



CREATE INDEX "idx_analysis_history_running" ON "public"."analysis_history" USING "btree" ("user_id", "ticker", "created_at" DESC) WHERE ("analysis_status" = 'running'::"text");



CREATE INDEX "idx_analysis_history_status" ON "public"."analysis_history" USING "btree" ("analysis_status");



CREATE INDEX "idx_analysis_history_user_status" ON "public"."analysis_history" USING "btree" ("user_id", "analysis_status");



CREATE INDEX "idx_analysis_history_user_ticker_date" ON "public"."analysis_history" USING "btree" ("user_id", "ticker", "analysis_date");



COMMENT ON INDEX "public"."idx_analysis_history_user_ticker_date" IS 'Historical analysis lookup by date';



CREATE INDEX "idx_analysis_history_user_ticker_status" ON "public"."analysis_history" USING "btree" ("user_id", "ticker", "analysis_status");



COMMENT ON INDEX "public"."idx_analysis_history_user_ticker_status" IS 'Running analysis lookup';



CREATE INDEX "idx_analysis_messages_analysis_id" ON "public"."analysis_messages" USING "btree" ("analysis_id");



CREATE INDEX "idx_analysis_messages_created_at" ON "public"."analysis_messages" USING "btree" ("created_at");



CREATE INDEX "idx_analysis_messages_metadata" ON "public"."analysis_messages" USING "gin" ("metadata") WHERE ("metadata" IS NOT NULL);



CREATE INDEX "idx_api_settings_analysis_config" ON "public"."api_settings" USING "btree" ("analysis_optimization", "analysis_search_sources") WHERE ("analysis_optimization" IS NOT NULL);



CREATE INDEX "idx_api_settings_auto_near_limit_enabled" ON "public"."api_settings" USING "btree" ("user_id") WHERE ("auto_near_limit_analysis" = true);



CREATE INDEX "idx_api_settings_opportunity_agent" ON "public"."api_settings" USING "btree" ("user_id", "opportunity_agent_ai") WHERE ("opportunity_agent_ai" IS NOT NULL);



CREATE INDEX "idx_api_settings_opportunity_provider" ON "public"."api_settings" USING "btree" ("user_id", "opportunity_agent_provider_id") WHERE ("opportunity_agent_provider_id" IS NOT NULL);



CREATE INDEX "idx_api_settings_portfolio_manager" ON "public"."api_settings" USING "btree" ("user_id", "portfolio_manager_ai") WHERE ("portfolio_manager_ai" IS NOT NULL);



CREATE INDEX "idx_api_settings_portfolio_manager_provider" ON "public"."api_settings" USING "btree" ("portfolio_manager_provider_id") WHERE ("portfolio_manager_provider_id" IS NOT NULL);



CREATE INDEX "idx_api_settings_risk_level" ON "public"."api_settings" USING "btree" ("user_id", "user_risk_level");



CREATE INDEX "idx_invitations_email" ON "public"."invitations" USING "btree" ("email");



CREATE INDEX "idx_invitations_email_status" ON "public"."invitations" USING "btree" ("lower"("email"), "status");



CREATE INDEX "idx_invitations_invited_by" ON "public"."invitations" USING "btree" ("invited_by");



CREATE INDEX "idx_invitations_status" ON "public"."invitations" USING "btree" ("status");



CREATE INDEX "idx_market_cache_ny_date" ON "public"."market_data_cache" USING "btree" ("ticker", "timeframe", "fetched_date" DESC) WHERE ("fetched_date" = "public"."get_ny_current_date"());



CREATE INDEX "idx_market_cache_ticker_timeframe_date" ON "public"."market_data_cache" USING "btree" ("ticker", "timeframe", "fetched_date" DESC);



CREATE INDEX "idx_profiles_discord_id" ON "public"."profiles" USING "btree" ("discord_id");



CREATE INDEX "idx_rebalance_history_user" ON "public"."rebalance_history" USING "btree" ("user_id");



CREATE INDEX "idx_rebalance_requests_id_user" ON "public"."rebalance_requests" USING "btree" ("id", "user_id");



COMMENT ON INDEX "public"."idx_rebalance_requests_id_user" IS 'Primary lookup for RebalanceDetailModal - fixes 5-10 minute load time';



CREATE INDEX "idx_rebalance_requests_metadata_autotrade" ON "public"."rebalance_requests" USING "btree" ((("metadata" ->> 'autoTradeEnabled'::"text"))) WHERE (("metadata" IS NOT NULL) AND (("metadata" ->> 'autoTradeEnabled'::"text") IS NOT NULL));



CREATE INDEX "idx_rebalance_requests_status" ON "public"."rebalance_requests" USING "btree" ("status");



CREATE INDEX "idx_rebalance_requests_status_stocks" ON "public"."rebalance_requests" USING "btree" ("id", "status", "stocks_analyzed", "total_stocks");



CREATE INDEX "idx_rebalance_requests_status_tracking" ON "public"."rebalance_requests" USING "btree" ("status", "total_stocks", "stocks_analyzed");



CREATE INDEX "idx_rebalance_requests_updated_at" ON "public"."rebalance_requests" USING "btree" ("updated_at");



CREATE INDEX "idx_rebalance_requests_user_status" ON "public"."rebalance_requests" USING "btree" ("user_id", "status");



CREATE INDEX "idx_rebalance_schedules_next_run" ON "public"."rebalance_schedules" USING "btree" ("next_scheduled_at", "enabled") WHERE ("enabled" = true);



CREATE INDEX "idx_rebalance_schedules_user" ON "public"."rebalance_schedules" USING "btree" ("user_id");



CREATE INDEX "idx_rebalance_workflow_status" ON "public"."rebalance_requests" USING "btree" ("status", "created_at" DESC) WHERE ("status" = ANY (ARRAY['analyzing'::"text", 'planning'::"text", 'pending_approval'::"text"]));



CREATE INDEX "idx_role_audit_log_target_user_id" ON "public"."role_audit_log" USING "btree" ("target_user_id");



CREATE INDEX "idx_role_audit_log_user_id" ON "public"."role_audit_log" USING "btree" ("user_id");



CREATE INDEX "idx_role_limits_max_debate_rounds" ON "public"."role_limits" USING "btree" ("role_id", "max_debate_rounds") WHERE ("max_debate_rounds" IS NOT NULL);



CREATE INDEX "idx_role_limits_role_id" ON "public"."role_limits" USING "btree" ("role_id");



CREATE INDEX "idx_role_permissions_permission_id" ON "public"."role_permissions" USING "btree" ("permission_id");



CREATE INDEX "idx_role_permissions_role_id" ON "public"."role_permissions" USING "btree" ("role_id");



CREATE INDEX "idx_roles_stripe_product" ON "public"."roles" USING "btree" ("stripe_product_id") WHERE ("stripe_product_id" IS NOT NULL);



CREATE INDEX "idx_target_allocations_user" ON "public"."target_allocations" USING "btree" ("user_id");



CREATE INDEX "idx_trading_actions_alpaca_order" ON "public"."trading_actions" USING "btree" ("alpaca_order_id") WHERE ("alpaca_order_id" IS NOT NULL);



CREATE INDEX "idx_trading_actions_alpaca_order_id" ON "public"."trading_actions" USING "btree" (((("metadata" -> 'alpaca_order'::"text") ->> 'id'::"text"))) WHERE ((("metadata" -> 'alpaca_order'::"text") ->> 'id'::"text") IS NOT NULL);



CREATE INDEX "idx_trading_actions_alpaca_status" ON "public"."trading_actions" USING "btree" (((("metadata" -> 'alpaca_order'::"text") ->> 'status'::"text"))) WHERE ((("metadata" -> 'alpaca_order'::"text") ->> 'status'::"text") IS NOT NULL);



CREATE INDEX "idx_trading_actions_analysis" ON "public"."trading_actions" USING "btree" ("analysis_id") WHERE ("analysis_id" IS NOT NULL);



CREATE INDEX "idx_trading_actions_analysis_created" ON "public"."trading_actions" USING "btree" ("analysis_id", "created_at" DESC) WHERE ("analysis_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_trading_actions_analysis_created" IS 'Trade orders for analysis with ordering';



CREATE INDEX "idx_trading_actions_composite" ON "public"."trading_actions" USING "btree" ("user_id", "created_at" DESC, "status") WHERE ("status" = ANY (ARRAY['pending'::"text", 'approved'::"text"]));



CREATE INDEX "idx_trading_actions_dollar_orders" ON "public"."trading_actions" USING "btree" ("user_id", "created_at" DESC) WHERE ("dollar_amount" > (0)::numeric);



CREATE INDEX "idx_trading_actions_metadata_gin" ON "public"."trading_actions" USING "gin" ("metadata");



CREATE INDEX "idx_trading_actions_rebalance" ON "public"."trading_actions" USING "btree" ("rebalance_request_id") WHERE ("rebalance_request_id" IS NOT NULL);



CREATE INDEX "idx_trading_actions_rebalance_user" ON "public"."trading_actions" USING "btree" ("rebalance_request_id", "user_id") WHERE ("rebalance_request_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_trading_actions_rebalance_user" IS 'Trade orders for rebalance by user';



CREATE INDEX "idx_trading_actions_source_analysis" ON "public"."trading_actions" USING "btree" ("source_type", "analysis_id") WHERE ("source_type" = 'individual_analysis'::"text");



CREATE INDEX "idx_trading_actions_status" ON "public"."trading_actions" USING "btree" ("status");



CREATE INDEX "idx_trading_actions_user_created" ON "public"."trading_actions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_trading_actions_user_status" ON "public"."trading_actions" USING "btree" ("user_id", "status");



CREATE UNIQUE INDEX "idx_unique_pending_invitation" ON "public"."invitations" USING "btree" ("lower"("email")) WHERE ("status" = ANY (ARRAY['pending'::"text", 'sent'::"text"]));



CREATE INDEX "idx_user_roles_active" ON "public"."user_roles" USING "btree" ("is_active");



CREATE INDEX "idx_user_roles_role_id" ON "public"."user_roles" USING "btree" ("role_id");



CREATE INDEX "idx_user_roles_stripe_customer" ON "public"."user_roles" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE INDEX "idx_user_roles_stripe_subscription" ON "public"."user_roles" USING "btree" ("stripe_subscription_id") WHERE ("stripe_subscription_id" IS NOT NULL);



CREATE INDEX "idx_user_roles_user_id" ON "public"."user_roles" USING "btree" ("user_id");



CREATE INDEX "idx_user_usage_user_date" ON "public"."user_usage" USING "btree" ("user_id", "usage_date");



CREATE UNIQUE INDEX "invitations_email_unique" ON "public"."invitations" USING "btree" ("lower"("email"));



CREATE OR REPLACE TRIGGER "confirm_invitation_on_profile_creation" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_user_registration_complete"();



CREATE OR REPLACE TRIGGER "ensure_single_active_role_trigger" BEFORE INSERT OR UPDATE ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_single_active_role"();



CREATE OR REPLACE TRIGGER "handle_api_settings_updated_at" BEFORE UPDATE ON "public"."api_settings" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "handle_portfolios_updated_at" BEFORE UPDATE ON "public"."portfolios" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "handle_positions_updated_at" BEFORE UPDATE ON "public"."positions" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "handle_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_user_role_change_discord" AFTER UPDATE ON "public"."user_roles" FOR EACH ROW WHEN ((("old"."role_id" IS DISTINCT FROM "new"."role_id") AND ("new"."is_active" = true))) EXECUTE FUNCTION "public"."notify_discord_role_change"();



CREATE OR REPLACE TRIGGER "protect_builtin_roles" BEFORE DELETE OR UPDATE ON "public"."roles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_builtin_role_changes"();



CREATE OR REPLACE TRIGGER "refresh_admin_users_on_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."user_roles" FOR EACH STATEMENT EXECUTE FUNCTION "public"."refresh_admin_users_trigger"();



CREATE OR REPLACE TRIGGER "refresh_admin_users_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."user_roles" FOR EACH STATEMENT EXECUTE FUNCTION "public"."auto_refresh_admin_users"();



CREATE OR REPLACE TRIGGER "resolve_schedule_data_trigger" AFTER INSERT OR UPDATE OF "selected_tickers", "include_watchlist", "rebalance_threshold", "skip_threshold_check", "skip_opportunity_agent" ON "public"."rebalance_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_resolve_schedule_data"();



CREATE OR REPLACE TRIGGER "trigger_auto_assign_first_admin" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."auto_assign_first_admin"();



CREATE OR REPLACE TRIGGER "update_analysis_history_updated_at" BEFORE UPDATE ON "public"."analysis_history" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_invitations_updated_at" BEFORE UPDATE ON "public"."invitations" FOR EACH ROW EXECUTE FUNCTION "public"."update_invitations_updated_at"();



CREATE OR REPLACE TRIGGER "update_market_cache_updated_at" BEFORE UPDATE ON "public"."market_data_cache" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_provider_configurations_updated_at" BEFORE UPDATE ON "public"."provider_configurations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_rebalance_requests_updated_at" BEFORE UPDATE ON "public"."rebalance_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_rebalance_schedule_timestamp" BEFORE INSERT OR UPDATE ON "public"."rebalance_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."update_rebalance_schedule_timestamp"();



CREATE OR REPLACE TRIGGER "update_role_limits_updated_at" BEFORE UPDATE ON "public"."role_limits" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_roles_updated_at" BEFORE UPDATE ON "public"."roles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_roles_updated_at" BEFORE UPDATE ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_usage_updated_at" BEFORE UPDATE ON "public"."user_usage" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "validate_analysis_reference" BEFORE INSERT OR UPDATE ON "public"."trading_actions" FOR EACH ROW EXECUTE FUNCTION "public"."check_analysis_exists"();



CREATE OR REPLACE TRIGGER "validate_trade_order_trigger" BEFORE INSERT OR UPDATE ON "public"."trading_actions" FOR EACH ROW EXECUTE FUNCTION "public"."validate_trade_order"();



ALTER TABLE ONLY "public"."analysis_history"
    ADD CONSTRAINT "analysis_history_rebalance_request_id_fkey" FOREIGN KEY ("rebalance_request_id") REFERENCES "public"."rebalance_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analysis_history"
    ADD CONSTRAINT "analysis_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analysis_messages"
    ADD CONSTRAINT "analysis_messages_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "public"."analysis_history"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."api_settings"
    ADD CONSTRAINT "api_settings_analysis_team_provider_id_fkey" FOREIGN KEY ("analysis_team_provider_id") REFERENCES "public"."provider_configurations"("id");



ALTER TABLE ONLY "public"."api_settings"
    ADD CONSTRAINT "api_settings_default_provider_id_fkey" FOREIGN KEY ("default_provider_id") REFERENCES "public"."provider_configurations"("id");



ALTER TABLE ONLY "public"."api_settings"
    ADD CONSTRAINT "api_settings_opportunity_agent_provider_id_fkey" FOREIGN KEY ("opportunity_agent_provider_id") REFERENCES "public"."provider_configurations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."api_settings"
    ADD CONSTRAINT "api_settings_portfolio_manager_provider_id_fkey" FOREIGN KEY ("portfolio_manager_provider_id") REFERENCES "public"."provider_configurations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."api_settings"
    ADD CONSTRAINT "api_settings_research_team_provider_id_fkey" FOREIGN KEY ("research_team_provider_id") REFERENCES "public"."provider_configurations"("id");



ALTER TABLE ONLY "public"."api_settings"
    ADD CONSTRAINT "api_settings_risk_team_provider_id_fkey" FOREIGN KEY ("risk_team_provider_id") REFERENCES "public"."provider_configurations"("id");



ALTER TABLE ONLY "public"."api_settings"
    ADD CONSTRAINT "api_settings_trading_team_provider_id_fkey" FOREIGN KEY ("trading_team_provider_id") REFERENCES "public"."provider_configurations"("id");



ALTER TABLE ONLY "public"."api_settings"
    ADD CONSTRAINT "api_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_confirmed_user_id_fkey" FOREIGN KEY ("confirmed_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."portfolios"
    ADD CONSTRAINT "portfolios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_configurations"
    ADD CONSTRAINT "provider_configurations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rebalance_history"
    ADD CONSTRAINT "rebalance_history_rebalance_request_id_fkey" FOREIGN KEY ("rebalance_request_id") REFERENCES "public"."rebalance_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rebalance_history"
    ADD CONSTRAINT "rebalance_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rebalance_requests"
    ADD CONSTRAINT "rebalance_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rebalance_schedules"
    ADD CONSTRAINT "rebalance_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_audit_log"
    ADD CONSTRAINT "role_audit_log_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");



ALTER TABLE ONLY "public"."role_audit_log"
    ADD CONSTRAINT "role_audit_log_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_audit_log"
    ADD CONSTRAINT "role_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_limits"
    ADD CONSTRAINT "role_limits_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."target_allocations"
    ADD CONSTRAINT "target_allocations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trading_actions"
    ADD CONSTRAINT "trading_actions_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "public"."analysis_history"("id") ON DELETE CASCADE;



COMMENT ON CONSTRAINT "trading_actions_analysis_id_fkey" ON "public"."trading_actions" IS 'Ensures trade actions are deleted when their linked analysis is deleted (CASCADE DELETE)';



ALTER TABLE ONLY "public"."trading_actions"
    ADD CONSTRAINT "trading_actions_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trading_actions"
    ADD CONSTRAINT "trading_actions_rebalance_request_id_fkey" FOREIGN KEY ("rebalance_request_id") REFERENCES "public"."rebalance_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trading_actions"
    ADD CONSTRAINT "trading_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_usage"
    ADD CONSTRAINT "user_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."watchlist"
    ADD CONSTRAINT "watchlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Allow authenticated users to read market cache" ON "public"."market_data_cache" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow public read access to roles" ON "public"."roles" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Allow service role full access to market cache" ON "public"."market_data_cache" TO "service_role" USING (true);



CREATE POLICY "Service role can insert messages" ON "public"."analysis_messages" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service role can insert rebalance history" ON "public"."rebalance_history" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Service role can manage subscriptions" ON "public"."user_roles" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can update messages" ON "public"."analysis_messages" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."rebalance_schedules" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to analysis history" ON "public"."analysis_history" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to rebalance requests" ON "public"."rebalance_requests" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "System can manage usage" ON "public"."user_usage" USING (true);



CREATE POLICY "System can update invitations" ON "public"."invitations" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Users can create own analysis history" ON "public"."analysis_history" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can create own portfolios" ON "public"."portfolios" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create own rebalance requests" ON "public"."rebalance_requests" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can create own schedules" ON "public"."rebalance_schedules" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create own trading actions" ON "public"."trading_actions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own provider configurations" ON "public"."provider_configurations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own analysis history" ON "public"."analysis_history" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete own portfolios" ON "public"."portfolios" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own rebalance requests" ON "public"."rebalance_requests" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete own schedules" ON "public"."rebalance_schedules" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own target allocations" ON "public"."target_allocations" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own provider configurations" ON "public"."provider_configurations" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own target allocations" ON "public"."target_allocations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own provider configurations" ON "public"."provider_configurations" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own watchlist" ON "public"."watchlist" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage positions in own portfolios" ON "public"."positions" USING ((EXISTS ( SELECT 1
   FROM "public"."portfolios"
  WHERE (("portfolios"."id" = "positions"."portfolio_id") AND ("portfolios"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can read their own analysis messages" ON "public"."analysis_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."analysis_history" "ah"
  WHERE (("ah"."id" = "analysis_messages"."analysis_id") AND ("ah"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update own analysis history" ON "public"."analysis_history" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own portfolios" ON "public"."portfolios" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own rebalance requests" ON "public"."rebalance_requests" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own schedules" ON "public"."rebalance_schedules" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own target allocations" ON "public"."target_allocations" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own trading actions" ON "public"."trading_actions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own discord_id" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own provider configurations" ON "public"."provider_configurations" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own analysis history" ON "public"."analysis_history" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own detailed trade orders" ON "public"."trading_actions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own portfolios" ON "public"."portfolios" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own rebalance history" ON "public"."rebalance_history" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own rebalance requests" ON "public"."rebalance_requests" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own schedules" ON "public"."rebalance_schedules" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own subscription data" ON "public"."user_roles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own target allocations" ON "public"."target_allocations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own trading actions" ON "public"."trading_actions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own usage" ON "public"."user_usage" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own watchlist" ON "public"."watchlist" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view positions in own portfolios" ON "public"."positions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."portfolios"
  WHERE (("portfolios"."id" = "positions"."portfolio_id") AND ("portfolios"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own provider configurations" ON "public"."provider_configurations" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own usage" ON "public"."user_usage" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "admin_update_all_profiles" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() IN ( SELECT "admin_users"."user_id"
   FROM "public"."admin_users"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admin_users"."user_id"
   FROM "public"."admin_users")));



CREATE POLICY "admin_view_all_profiles" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() IN ( SELECT "admin_users"."user_id"
   FROM "public"."admin_users")));



ALTER TABLE "public"."analysis_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analysis_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "api_settings_delete_own" ON "public"."api_settings" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



COMMENT ON POLICY "api_settings_delete_own" ON "public"."api_settings" IS 'Users can delete their own API settings';



CREATE POLICY "api_settings_first_user_admin" ON "public"."api_settings" TO "authenticated" USING (("auth"."uid"() = ( SELECT "users"."id"
   FROM "auth"."users"
  ORDER BY "users"."created_at"
 LIMIT 1))) WITH CHECK (("auth"."uid"() = ( SELECT "users"."id"
   FROM "auth"."users"
  ORDER BY "users"."created_at"
 LIMIT 1)));



COMMENT ON POLICY "api_settings_first_user_admin" ON "public"."api_settings" IS 'First registered user has admin access to all settings';



CREATE POLICY "api_settings_insert_own" ON "public"."api_settings" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



COMMENT ON POLICY "api_settings_insert_own" ON "public"."api_settings" IS 'Users can create their own API settings';



CREATE POLICY "api_settings_select_own" ON "public"."api_settings" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



COMMENT ON POLICY "api_settings_select_own" ON "public"."api_settings" IS 'Users can view their own API settings';



CREATE POLICY "api_settings_service_role_all" ON "public"."api_settings" TO "service_role" USING (true) WITH CHECK (true);



COMMENT ON POLICY "api_settings_service_role_all" ON "public"."api_settings" IS 'Service role has full access (for Edge Functions)';



CREATE POLICY "api_settings_update_own" ON "public"."api_settings" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



COMMENT ON POLICY "api_settings_update_own" ON "public"."api_settings" IS 'Users can update their own API settings';



ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invitations_first_user_insert" ON "public"."invitations" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = ( SELECT "users"."id"
   FROM "auth"."users"
  ORDER BY "users"."created_at"
 LIMIT 1)));



CREATE POLICY "invitations_first_user_select" ON "public"."invitations" FOR SELECT TO "authenticated" USING (("auth"."uid"() = ( SELECT "users"."id"
   FROM "auth"."users"
  ORDER BY "users"."created_at"
 LIMIT 1)));



CREATE POLICY "invitations_temp_access" ON "public"."invitations" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."market_data_cache" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "market_data_cache_access_policy" ON "public"."market_data_cache" FOR SELECT USING ((("current_setting"('role'::"text") = 'service_role'::"text") OR ("auth"."uid"() IS NOT NULL)));



COMMENT ON POLICY "market_data_cache_access_policy" ON "public"."market_data_cache" IS 'Controls access to market data cache: service_role and all authenticated users';



ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "permissions_delete" ON "public"."permissions" FOR DELETE TO "authenticated" USING (("auth"."uid"() = ( SELECT "users"."id"
   FROM "auth"."users"
  ORDER BY "users"."created_at"
 LIMIT 1)));



CREATE POLICY "permissions_insert" ON "public"."permissions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = ( SELECT "users"."id"
   FROM "auth"."users"
  ORDER BY "users"."created_at"
 LIMIT 1)));



CREATE POLICY "permissions_select" ON "public"."permissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "permissions_update" ON "public"."permissions" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = ( SELECT "users"."id"
   FROM "auth"."users"
  ORDER BY "users"."created_at"
 LIMIT 1))) WITH CHECK (("auth"."uid"() = ( SELECT "users"."id"
   FROM "auth"."users"
  ORDER BY "users"."created_at"
 LIMIT 1)));



ALTER TABLE "public"."portfolios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."positions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_self_access" ON "public"."profiles" TO "authenticated" USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."provider_configurations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rebalance_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rebalance_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rebalance_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_audit_log_delete" ON "public"."role_audit_log" FOR DELETE TO "authenticated" USING ("public"."is_user_admin"("auth"."uid"()));



CREATE POLICY "role_audit_log_insert" ON "public"."role_audit_log" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "role_audit_log_select" ON "public"."role_audit_log" FOR SELECT TO "authenticated" USING ("public"."is_user_admin"("auth"."uid"()));



ALTER TABLE "public"."role_limits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_limits_delete" ON "public"."role_limits" FOR DELETE TO "authenticated" USING ("public"."is_user_admin"("auth"."uid"()));



CREATE POLICY "role_limits_insert" ON "public"."role_limits" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_user_admin"("auth"."uid"()));



CREATE POLICY "role_limits_select" ON "public"."role_limits" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "role_limits_update" ON "public"."role_limits" FOR UPDATE TO "authenticated" USING ("public"."is_user_admin"("auth"."uid"())) WITH CHECK ("public"."is_user_admin"("auth"."uid"()));



ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_permissions_delete" ON "public"."role_permissions" FOR DELETE TO "authenticated" USING ("public"."is_user_admin"("auth"."uid"()));



CREATE POLICY "role_permissions_insert" ON "public"."role_permissions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_user_admin"("auth"."uid"()));



CREATE POLICY "role_permissions_select" ON "public"."role_permissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "role_permissions_update" ON "public"."role_permissions" FOR UPDATE TO "authenticated" USING ("public"."is_user_admin"("auth"."uid"())) WITH CHECK ("public"."is_user_admin"("auth"."uid"()));



ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roles_access_policy" ON "public"."roles" FOR SELECT USING ((("current_setting"('role'::"text") = 'service_role'::"text") OR ("auth"."uid"() IS NOT NULL)));



COMMENT ON POLICY "roles_access_policy" ON "public"."roles" IS 'Controls access to role definitions: service_role and all authenticated users';



CREATE POLICY "roles_delete" ON "public"."roles" FOR DELETE TO "authenticated" USING (("public"."is_user_admin"("auth"."uid"()) AND ("is_built_in" = false)));



CREATE POLICY "roles_insert" ON "public"."roles" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_user_admin"("auth"."uid"()));



CREATE POLICY "roles_select" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "roles_update" ON "public"."roles" FOR UPDATE TO "authenticated" USING ("public"."is_user_admin"("auth"."uid"())) WITH CHECK ("public"."is_user_admin"("auth"."uid"()));



CREATE POLICY "system_insert_profiles" ON "public"."profiles" FOR INSERT WITH CHECK ((("auth"."uid"() = "id") OR ("auth"."uid"() IN ( SELECT "admin_users"."user_id"
   FROM "public"."admin_users"))));



ALTER TABLE "public"."target_allocations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trading_actions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trading_actions_user_access" ON "public"."trading_actions" FOR SELECT USING ((("current_setting"('role'::"text") = 'service_role'::"text") OR ("user_id" = "auth"."uid"())));



ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_roles_basic_access" ON "public"."user_roles" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "user_roles_delete" ON "public"."user_roles" FOR DELETE TO "authenticated" USING (("auth"."uid"() = ( SELECT "users"."id"
   FROM "auth"."users"
  ORDER BY "users"."created_at"
 LIMIT 1)));



CREATE POLICY "user_roles_first_user_all" ON "public"."user_roles" TO "authenticated" USING (("auth"."uid"() = ( SELECT "users"."id"
   FROM "auth"."users"
  ORDER BY "users"."created_at"
 LIMIT 1)));



COMMENT ON POLICY "user_roles_first_user_all" ON "public"."user_roles" IS 'Allows first user (system admin) full access to manage roles. No recursion risk as it checks auth.users, not user_roles.';



CREATE POLICY "user_roles_insert" ON "public"."user_roles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = ( SELECT "users"."id"
   FROM "auth"."users"
  ORDER BY "users"."created_at"
 LIMIT 1)));



CREATE POLICY "user_roles_own_read" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



COMMENT ON POLICY "user_roles_own_read" ON "public"."user_roles" IS 'Allows users to read their own role assignments. No recursion risk as it only checks auth.uid().';



CREATE POLICY "user_roles_select" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "user_roles_update" ON "public"."user_roles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = ( SELECT "users"."id"
   FROM "auth"."users"
  ORDER BY "users"."created_at"
 LIMIT 1))) WITH CHECK (("auth"."uid"() = ( SELECT "users"."id"
   FROM "auth"."users"
  ORDER BY "users"."created_at"
 LIMIT 1)));



ALTER TABLE "public"."user_usage" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_update_own_profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "users_view_own_profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."watchlist" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";












GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";





















































































































































































































































































































GRANT ALL ON FUNCTION "public"."activate_pending_downgrades"() TO "anon";
GRANT ALL ON FUNCTION "public"."activate_pending_downgrades"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_pending_downgrades"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_delete_user"("p_target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_delete_user"("p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_user"("p_target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_default_role_to_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_default_role_to_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_default_role_to_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_user_role"("p_user_id" "uuid", "p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."assign_user_role"("p_user_id" "uuid", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_user_role"("p_user_id" "uuid", "p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_user_role_with_expiration"("p_user_id" "uuid", "p_role_id" "uuid", "p_expires_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."assign_user_role_with_expiration"("p_user_id" "uuid", "p_role_id" "uuid", "p_expires_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_user_role_with_expiration"("p_user_id" "uuid", "p_role_id" "uuid", "p_expires_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_assign_first_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_assign_first_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_assign_first_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_refresh_admin_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_refresh_admin_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_refresh_admin_users"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_rebalance_request"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_rebalance_request"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_rebalance_request"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_admin_exists"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_admin_exists"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_admin_exists"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_analysis_exists"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_analysis_exists"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_analysis_exists"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_and_expire_roles"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_and_expire_roles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_and_expire_roles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_role_and_update_access_settings"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_role_and_update_access_settings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_role_and_update_access_settings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_multiple_active_roles"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_multiple_active_roles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_multiple_active_roles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_invitation_on_signup"() TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_invitation_on_signup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_invitation_on_signup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_role_safely"("p_role_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_role_safely"("p_role_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_role_safely"("p_role_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_admin_exists"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_admin_exists"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_admin_exists"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_single_active_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_single_active_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_single_active_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_single_active_role_for_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_single_active_role_for_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_single_active_role_for_user"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."extract_discord_id_from_identity"() TO "anon";
GRANT ALL ON FUNCTION "public"."extract_discord_id_from_identity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."extract_discord_id_from_identity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."force_assign_admin_to_first_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."force_assign_admin_to_first_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."force_assign_admin_to_first_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_role"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_role"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_role"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_earliest_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_earliest_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_earliest_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_invitations_with_confirmation_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_invitations_with_confirmation_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_invitations_with_confirmation_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_ny_current_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_ny_current_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_ny_current_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_premium_roles"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_premium_roles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_premium_roles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_role_pricing"("p_role_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_role_pricing"("p_role_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_role_pricing"("p_role_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_upcoming_schedules"("p_minutes_ahead" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_upcoming_schedules"("p_minutes_ahead" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_upcoming_schedules"("p_minutes_ahead" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_by_stripe_customer"("p_customer_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_by_stripe_customer"("p_customer_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_by_stripe_customer"("p_customer_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_max_debate_rounds"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_max_debate_rounds"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_max_debate_rounds"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role_limits"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role_limits"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role_limits"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_roles"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_roles"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_roles"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_subscription_info"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_subscription_info"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_subscription_info"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_subscription_info_with_role_details"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_subscription_info_with_role_details"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_subscription_info_with_role_details"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_users_with_auth_details"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_users_with_auth_details"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_users_with_auth_details"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_stripe_subscription_update"("p_customer_id" "text", "p_subscription_id" "text", "p_price_id" "text", "p_product_id" "text", "p_status" "text", "p_current_period_end" timestamp with time zone, "p_cancel_at_period_end" boolean, "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."handle_stripe_subscription_update"("p_customer_id" "text", "p_subscription_id" "text", "p_price_id" "text", "p_product_id" "text", "p_status" "text", "p_current_period_end" timestamp with time zone, "p_cancel_at_period_end" boolean, "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_stripe_subscription_update"("p_customer_id" "text", "p_subscription_id" "text", "p_price_id" "text", "p_product_id" "text", "p_status" "text", "p_current_period_end" timestamp with time zone, "p_cancel_at_period_end" boolean, "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_user_registration_complete"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_user_registration_complete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_user_registration_complete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_stocks_analyzed"("p_rebalance_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_stocks_analyzed"("p_rebalance_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_stocks_analyzed"("p_rebalance_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_user_admin"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_user_admin"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_admin"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_schedule_executed"("p_schedule_id" "uuid", "p_success" boolean, "p_rebalance_request_id" "uuid", "p_error_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_schedule_executed"("p_schedule_id" "uuid", "p_success" boolean, "p_rebalance_request_id" "uuid", "p_error_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_schedule_executed"("p_schedule_id" "uuid", "p_success" boolean, "p_rebalance_request_id" "uuid", "p_error_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_discord_role_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_discord_role_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_discord_role_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_builtin_role_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_builtin_role_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_builtin_role_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_new_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_new_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_new_users"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_admin_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_admin_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_admin_users"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_admin_users_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_admin_users_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_admin_users_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_schedule_data"("p_schedule_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_schedule_data"("p_schedule_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_schedule_data"("p_schedule_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."should_schedule_run"("p_schedule_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."should_schedule_run"("p_schedule_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."should_schedule_run"("p_schedule_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_discord_id_for_user"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_discord_id_for_user"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_discord_id_for_user"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_user_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_user_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_user_profile"() TO "service_role";



GRANT ALL ON FUNCTION "public"."test_schedule_timezone_calc"("p_timezone" "text", "p_time_of_day" time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."test_schedule_timezone_calc"("p_timezone" "text", "p_time_of_day" time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."test_schedule_timezone_calc"("p_timezone" "text", "p_time_of_day" time without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_resolve_schedule_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_resolve_schedule_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_resolve_schedule_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_debate_round"("p_analysis_id" "uuid", "p_round" integer, "p_agent_type" "text", "p_response" "text", "p_points" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."update_debate_round"("p_analysis_id" "uuid", "p_round" integer, "p_agent_type" "text", "p_response" "text", "p_points" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_debate_round"("p_analysis_id" "uuid", "p_round" integer, "p_agent_type" "text", "p_response" "text", "p_points" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_invitation_on_user_signup"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_invitation_on_user_signup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_invitation_on_user_signup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_invitations_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_invitations_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_invitations_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_rebalance_schedule_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_rebalance_schedule_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_rebalance_schedule_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_rebalance_workflow_step"("p_request_id" "uuid", "p_step_name" "text", "p_step_status" "text", "p_step_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_rebalance_workflow_step"("p_request_id" "uuid", "p_step_name" "text", "p_step_status" "text", "p_step_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_rebalance_workflow_step"("p_request_id" "uuid", "p_step_name" "text", "p_step_status" "text", "p_step_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_role_details"("p_role_id" "uuid", "p_name" "text", "p_display_name" "text", "p_description" "text", "p_priority" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."update_role_details"("p_role_id" "uuid", "p_name" "text", "p_display_name" "text", "p_description" "text", "p_priority" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_role_details"("p_role_id" "uuid", "p_name" "text", "p_display_name" "text", "p_description" "text", "p_priority" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_workflow_step_status"("p_analysis_id" "uuid", "p_phase_id" "text", "p_agent_name" "text", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_workflow_step_status"("p_analysis_id" "uuid", "p_phase_id" "text", "p_agent_name" "text", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_workflow_step_status"("p_analysis_id" "uuid", "p_phase_id" "text", "p_agent_name" "text", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_has_permission"("p_user_id" "uuid", "p_permission_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_permission"("p_user_id" "uuid", "p_permission_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_permission"("p_user_id" "uuid", "p_permission_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_trade_order"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_trade_order"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_trade_order"() TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_admin_access"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_admin_access"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_admin_access"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_admin_with_auto_assignment"() TO "anon";
GRANT ALL ON FUNCTION "public"."verify_admin_with_auto_assignment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_admin_with_auto_assignment"() TO "service_role";



























GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."admin_users" TO "anon";
GRANT ALL ON TABLE "public"."admin_users" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_users" TO "service_role";



GRANT ALL ON TABLE "public"."analysis_history" TO "anon";
GRANT ALL ON TABLE "public"."analysis_history" TO "authenticated";
GRANT ALL ON TABLE "public"."analysis_history" TO "service_role";



GRANT ALL ON TABLE "public"."analysis_messages" TO "anon";
GRANT ALL ON TABLE "public"."analysis_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."analysis_messages" TO "service_role";



GRANT ALL ON TABLE "public"."api_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."api_settings" TO "service_role";



GRANT ALL ON TABLE "public"."api_settings_unified" TO "authenticated";
GRANT ALL ON TABLE "public"."api_settings_unified" TO "service_role";



GRANT ALL ON TABLE "public"."invitations" TO "anon";
GRANT ALL ON TABLE "public"."invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."invitations" TO "service_role";



GRANT ALL ON TABLE "public"."market_data_cache" TO "anon";
GRANT ALL ON TABLE "public"."market_data_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."market_data_cache" TO "service_role";



GRANT ALL ON TABLE "public"."market_cache_status" TO "authenticated";
GRANT ALL ON TABLE "public"."market_cache_status" TO "service_role";



GRANT ALL ON TABLE "public"."permissions" TO "anon";
GRANT ALL ON TABLE "public"."permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."permissions" TO "service_role";



GRANT ALL ON TABLE "public"."portfolios" TO "anon";
GRANT ALL ON TABLE "public"."portfolios" TO "authenticated";
GRANT ALL ON TABLE "public"."portfolios" TO "service_role";



GRANT ALL ON TABLE "public"."positions" TO "anon";
GRANT ALL ON TABLE "public"."positions" TO "authenticated";
GRANT ALL ON TABLE "public"."positions" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."provider_configurations" TO "anon";
GRANT ALL ON TABLE "public"."provider_configurations" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_configurations" TO "service_role";



GRANT ALL ON TABLE "public"."rebalance_history" TO "anon";
GRANT ALL ON TABLE "public"."rebalance_history" TO "authenticated";
GRANT ALL ON TABLE "public"."rebalance_history" TO "service_role";



GRANT ALL ON TABLE "public"."rebalance_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."rebalance_requests" TO "service_role";



GRANT ALL ON TABLE "public"."rebalance_schedules" TO "anon";
GRANT ALL ON TABLE "public"."rebalance_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."rebalance_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."trading_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."trading_actions" TO "service_role";



GRANT ALL ON TABLE "public"."rebalance_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."rebalance_summary" TO "service_role";



GRANT ALL ON TABLE "public"."role_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."role_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."role_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."role_display_info" TO "anon";
GRANT ALL ON TABLE "public"."role_display_info" TO "authenticated";
GRANT ALL ON TABLE "public"."role_display_info" TO "service_role";



GRANT ALL ON TABLE "public"."role_limits" TO "anon";
GRANT ALL ON TABLE "public"."role_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."role_limits" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."role_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."role_summary" TO "service_role";



GRANT ALL ON TABLE "public"."scheduled_rebalance_status" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_rebalance_status" TO "service_role";



GRANT ALL ON TABLE "public"."target_allocations" TO "anon";
GRANT ALL ON TABLE "public"."target_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."target_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."trade_orders_detailed" TO "authenticated";
GRANT ALL ON TABLE "public"."trade_orders_detailed" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles_simple" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles_simple" TO "service_role";



GRANT ALL ON TABLE "public"."user_subscription_status" TO "anon";
GRANT ALL ON TABLE "public"."user_subscription_status" TO "authenticated";
GRANT ALL ON TABLE "public"."user_subscription_status" TO "service_role";



GRANT ALL ON TABLE "public"."user_usage" TO "anon";
GRANT ALL ON TABLE "public"."user_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."user_usage" TO "service_role";



GRANT ALL ON TABLE "public"."watchlist" TO "anon";
GRANT ALL ON TABLE "public"."watchlist" TO "authenticated";
GRANT ALL ON TABLE "public"."watchlist" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























RESET ALL;
