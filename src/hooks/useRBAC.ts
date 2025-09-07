// Simple RBAC hook for Header component compatibility
import { useAuth, isSessionValid } from '@/lib/auth';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useRBAC() {
    const { user, isAdmin } = useAuth();
    const [permissions, setPermissions] = useState<string[]>([]);
    const [userRoles, setUserRoles] = useState<any[]>([]);
    const [roleDetails, setRoleDetails] = useState<Map<string, {
        name: string;
        display_name: string;
        priority: number;
        color?: string;
        icon_url?: string;
        features?: string[];
        max_parallel_analysis?: number;
        max_watchlist_stocks?: number;
        max_rebalance_stocks?: number;
        max_scheduled_rebalances?: number;
        max_debate_rounds?: number;
        schedule_resolution?: string;
        optimization_mode?: string;
        number_of_search_sources?: number;
        rebalance_access?: boolean;
        opportunity_agent_access?: boolean;
        additional_provider_access?: boolean;
        enable_live_trading?: boolean;
        enable_auto_trading?: boolean;
    }>>(new Map());
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function loadPermissions() {
            if (!user) {
                setPermissions([]);
                setUserRoles([]);
                setRoleDetails(new Map());
                setIsLoading(false);
                return;
            }

            // Only skip if we have an invalid refresh token
            if ((window as any).__invalidRefreshToken) {
                console.log('[useRBAC] Skipping permission load - invalid refresh token');
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            try {
                // Use RPC function to get user roles
                const { data: rolesData, error: rolesError } = await supabase
                    .rpc('get_user_roles', { p_user_id: user.id });

                if (!rolesError && rolesData && rolesData.length > 0) {
                    setUserRoles(rolesData);
                    const roleIds = rolesData.map((ur: any) => ur.role_id);
                    console.log('[useRBAC] User roles from RPC:', rolesData);
                    console.log('[useRBAC] Role IDs to fetch:', roleIds);

                    // Get role details directly from roles table
                    const { data: rolesDetail, error: roleDetailError } = await supabase
                        .from('roles')
                        .select('*')
                        .in('id', roleIds);

                    console.log('[useRBAC] Roles detail query result:', { rolesDetail, roleDetailError });

                    // Get role limits from role_limits table
                    const { data: roleLimits, error: limitsError } = await supabase
                        .from('role_limits')
                        .select('*')
                        .in('role_id', roleIds);

                    console.log('[useRBAC] Role limits query result:', { roleLimits, limitsError });

                    if (rolesDetail) {
                        const roleMap = new Map();

                        // Create a map of role limits for quick lookup
                        const limitsMap = new Map();
                        if (roleLimits) {
                            roleLimits.forEach(limit => {
                                limitsMap.set(limit.role_id, limit);
                            });
                        }

                        rolesDetail.forEach(role => {
                            console.log('[useRBAC] Adding role to map:', role);

                            // Get limits from role_limits table
                            const limits = limitsMap.get(role.id);
                            console.log('[useRBAC] Role limits for', role.name, ':', limits);

                            // Use limits from role_limits table - let database be the source of truth
                            const maxParallelAnalysis = limits?.max_parallel_analysis !== undefined ? Number(limits.max_parallel_analysis) : undefined;
                            const maxWatchlistStocks = limits?.max_watchlist_stocks !== undefined ? Number(limits.max_watchlist_stocks) : undefined;
                            const maxRebalanceStocks = limits?.max_rebalance_stocks !== undefined ? Number(limits.max_rebalance_stocks) : undefined;
                            const maxScheduledRebalances = limits?.max_scheduled_rebalances !== undefined ? Number(limits.max_scheduled_rebalances) : undefined;
                            const maxDebateRounds = limits?.max_debate_rounds !== undefined ? Number(limits.max_debate_rounds) : undefined;
                            const scheduleResolution = limits?.schedule_resolution || undefined;
                            const optimizationMode = limits?.optimization_mode || undefined;
                            const numberOfSearchSources = limits?.number_of_search_sources !== undefined ? Number(limits.number_of_search_sources) : undefined;
                            const rebalanceAccess = limits?.rebalance_access ?? false;
                            const opportunityAgentAccess = limits?.opportunity_agent_access ?? false;
                            const additionalProviderAccess = limits?.additional_provider_access ?? false;
                            const enableLiveTrading = limits?.enable_live_trading ?? false;
                            const enableAutoTrading = limits?.enable_auto_trading ?? false;

                            console.log('[useRBAC] Role limits for', role.name, ':', limits);

                            roleMap.set(role.id, {
                                name: role.name,
                                display_name: role.display_name,
                                priority: role.priority || 0,
                                color: role.color,
                                icon_url: role.icon_url,
                                features: role.features || [],
                                max_parallel_analysis: maxParallelAnalysis,
                                max_watchlist_stocks: maxWatchlistStocks,
                                max_rebalance_stocks: maxRebalanceStocks,
                                max_scheduled_rebalances: maxScheduledRebalances,
                                max_debate_rounds: maxDebateRounds,
                                schedule_resolution: scheduleResolution,
                                optimization_mode: optimizationMode,
                                number_of_search_sources: numberOfSearchSources,
                                rebalance_access: rebalanceAccess,
                                opportunity_agent_access: opportunityAgentAccess,
                                additional_provider_access: additionalProviderAccess,
                                enable_live_trading: enableLiveTrading,
                                enable_auto_trading: enableAutoTrading
                            });
                        });
                        setRoleDetails(roleMap);
                        console.log('[useRBAC] Final role map:', roleMap);
                    }

                    // Get role permissions
                    const { data: rolePerms } = await supabase
                        .from('role_permissions')
                        .select('permission_id')
                        .in('role_id', roleIds);

                    if (rolePerms && rolePerms.length > 0) {
                        const permIds = rolePerms.map(rp => rp.permission_id);

                        // Get permission names
                        const { data: perms } = await supabase
                            .from('permissions')
                            .select('name')
                            .in('id', permIds);

                        const userPermissions = perms?.map(p => p.name) || [];

                        // Admins have all permissions
                        if (isAdmin) {
                            setPermissions(['*']);
                        } else {
                            setPermissions(userPermissions);
                        }
                    } else {
                        // No role permissions found
                        if (isAdmin) {
                            setPermissions(['*']);
                        } else {
                            setPermissions([]);
                        }
                    }
                } else {
                    setUserRoles([]);
                    setRoleDetails(new Map());
                    // Even if no roles found, admin still gets all permissions
                    if (isAdmin) {
                        setPermissions(['*']);
                    } else {
                        setPermissions([]);
                    }
                }
            } catch (error) {
                console.error('Error loading permissions:', error);
                setPermissions([]);
                setUserRoles([]);
                setRoleDetails(new Map());
            } finally {
                setIsLoading(false);
            }
        }

        loadPermissions();
    }, [user, isAdmin]);

    const hasPermission = (permission: string): boolean => {
        // No user means no permissions
        if (!user) return false;

        // Admins have all permissions
        if (isAdmin || permissions.includes('*')) return true;

        // Check specific permission
        return permissions.includes(permission);
    };

    const hasAnyPermission = (perms: string[]): boolean => {
        return perms.some(p => hasPermission(p));
    };

    const hasAllPermissions = (perms: string[]): boolean => {
        return perms.every(p => hasPermission(p));
    };

    const hasRole = (roleName: string): boolean => {
        if (!user) return false;
        if (isAdmin) return true;

        return userRoles.some(ur => {
            const roleDetail = roleDetails.get(ur.role_id);
            return roleDetail?.name === roleName;
        });
    };

    const hasAnyRole = (roleNames: string[]): boolean => {
        return roleNames.some(r => hasRole(r));
    };

    const hasAllRoles = (roleNames: string[]): boolean => {
        return roleNames.every(r => hasRole(r));
    };

    const canPerform = (resource: string, action: string): boolean => {
        // Check if user has specific permission for resource.action
        return hasPermission(`${resource}.${action}`);
    };

    const getPrimaryRole = () => {
        console.log('[useRBAC] getPrimaryRole called. userRoles:', userRoles, 'roleDetails size:', roleDetails.size);

        if (userRoles && userRoles.length > 0) {
            // Sort roles by priority (highest first) to get the primary role
            const sortedRoles = [...userRoles].sort((a, b) => {
                const aDetails = roleDetails.get(a.role_id);
                const bDetails = roleDetails.get(b.role_id);

                const aPriority = aDetails?.priority || 0;
                const bPriority = bDetails?.priority || 0;

                return bPriority - aPriority; // Higher priority first
            });

            const primaryRole = sortedRoles[0];
            console.log('[useRBAC] Primary role selected:', primaryRole);

            const roleDetail = roleDetails.get(primaryRole.role_id);
            console.log('[useRBAC] Role detail from map:', roleDetail);

            if (!roleDetail) {
                // This should not happen if data was fetched correctly
                console.error('[useRBAC] Role details not found for role:', primaryRole.role_name, 'Role ID:', primaryRole.role_id);
                console.error('[useRBAC] Available role details keys:', Array.from(roleDetails.keys()));
                return null;
            }

            const result = {
                name: primaryRole.role_name,
                display_name: roleDetail.display_name,
                color: roleDetail.color,
                icon_url: roleDetail.icon_url,
                features: roleDetail.features
            };
            console.log('[useRBAC] Returning role result:', result);
            return result;
        }

        console.log('[useRBAC] No user roles found, returning null');
        // No fallbacks - only use database values
        return null;
    };

    const getMaxParallelAnalysis = (): number => {
        // Don't hardcode for admin - use database values
        console.log('[useRBAC] getMaxParallelAnalysis called. userRoles:', userRoles);
        console.log('[useRBAC] roleDetails:', Array.from(roleDetails.entries()));

        // Get the highest limit from all user roles
        let maxLimit = 0; // Start at 0 to get actual max from roles
        let foundLimit = false;

        for (const userRole of userRoles) {
            const roleDetail = roleDetails.get(userRole.role_id);
            console.log('[useRBAC] Checking role:', userRole.role_id, 'Detail:', roleDetail);
            if (roleDetail && typeof roleDetail.max_parallel_analysis === 'number') {
                console.log('[useRBAC] Found max_parallel_analysis:', roleDetail.max_parallel_analysis);
                maxLimit = Math.max(maxLimit, roleDetail.max_parallel_analysis);
                foundLimit = true;
            }
        }

        // Return found limit or default fallback
        if (!foundLimit) {
            console.log('[useRBAC] No max_parallel_analysis found in any role, returning default 1');
            return 1;
        }

        console.log('[useRBAC] Final maxLimit:', maxLimit);
        return maxLimit;
    };

    const getMaxWatchlistStocks = (): number => {
        // Don't hardcode for admin - use database values
        console.log('[useRBAC] getMaxWatchlistStocks called. userRoles:', userRoles);

        // Get the highest limit from all user roles
        let maxLimit = 0;
        let foundLimit = false;

        for (const userRole of userRoles) {
            const roleDetail = roleDetails.get(userRole.role_id);
            if (roleDetail && typeof roleDetail.max_watchlist_stocks === 'number') {
                maxLimit = Math.max(maxLimit, roleDetail.max_watchlist_stocks);
                foundLimit = true;
            }
        }

        return foundLimit ? maxLimit : 10; // Default fallback
    };

    const getMaxRebalanceStocks = (): number => {
        // Don't hardcode for admin - use database values
        // Get the highest limit from all user roles
        let maxLimit = 0;
        let foundLimit = false;

        for (const userRole of userRoles) {
            const roleDetail = roleDetails.get(userRole.role_id);
            if (roleDetail && typeof roleDetail.max_rebalance_stocks === 'number') {
                maxLimit = Math.max(maxLimit, roleDetail.max_rebalance_stocks);
                foundLimit = true;
            }
        }

        return foundLimit ? maxLimit : 5; // Default fallback
    };

    const getMaxScheduledRebalances = (): number => {
        // Don't hardcode for admin - use database values
        // Get the highest limit from all user roles
        let maxLimit = 0;
        let foundLimit = false;

        for (const userRole of userRoles) {
            const roleDetail = roleDetails.get(userRole.role_id);
            if (roleDetail && typeof roleDetail.max_scheduled_rebalances === 'number') {
                maxLimit = Math.max(maxLimit, roleDetail.max_scheduled_rebalances);
                foundLimit = true;
            }
        }

        return foundLimit ? maxLimit : 2; // Default fallback
    };

    const getMaxDebateRounds = (): number => {
        // Get the highest debate rounds limit from all user roles
        console.log('[useRBAC] getMaxDebateRounds called.');
        console.log('[useRBAC] userRoles:', userRoles);
        console.log('[useRBAC] roleDetails size:', roleDetails.size);
        
        let maxLimit = 0;
        let foundLimit = false;

        for (const userRole of userRoles) {
            const roleDetail = roleDetails.get(userRole.role_id);
            console.log('[useRBAC] Checking role ID:', userRole.role_id);
            console.log('[useRBAC] Role detail found:', roleDetail);
            console.log('[useRBAC] max_debate_rounds value:', roleDetail?.max_debate_rounds);
            console.log('[useRBAC] max_debate_rounds type:', typeof roleDetail?.max_debate_rounds);
            
            if (roleDetail && typeof roleDetail.max_debate_rounds === 'number') {
                console.log('[useRBAC] Using max_debate_rounds:', roleDetail.max_debate_rounds);
                maxLimit = Math.max(maxLimit, roleDetail.max_debate_rounds);
                foundLimit = true;
            }
        }

        const result = foundLimit ? maxLimit : 2; // Default to 2 debate rounds
        console.log('[useRBAC] getMaxDebateRounds final result:', result, 'foundLimit:', foundLimit, 'maxLimit:', maxLimit);
        
        return result;
    };

    const getScheduleResolution = (): string[] => {
        // Don't hardcode for admin - use database values
        // Collect all available resolutions from all user roles
        const resolutions = new Set<string>();

        for (const userRole of userRoles) {
            const roleDetail = roleDetails.get(userRole.role_id);
            if (roleDetail && roleDetail.schedule_resolution) {
                // Split comma-separated values and add to set
                roleDetail.schedule_resolution.split(',').forEach(res => resolutions.add(res.trim()));
            }
        }

        return Array.from(resolutions).length > 0 ? Array.from(resolutions) : ['Month'];
    };

    const getMaxSearchSources = (): number => {
        // Don't hardcode for admin - use database values

        // Get the highest search sources limit from all user roles
        let maxLimit = 0;
        let foundLimit = false;

        for (const userRole of userRoles) {
            const roleDetail = roleDetails.get(userRole.role_id);
            const searchSources = roleDetail?.number_of_search_sources;

            console.log('[useRBAC] getMaxSearchSources - role:', roleDetail?.name, 'sources:', searchSources);

            if (searchSources !== undefined && searchSources !== null && searchSources > 0) {
                foundLimit = true;
                maxLimit = Math.max(maxLimit, searchSources);
            }
        }

        console.log('[useRBAC] getMaxSearchSources - final maxLimit:', maxLimit, 'foundLimit:', foundLimit);

        // Return the found limit or reasonable default
        return foundLimit ? maxLimit : 3;
    };

    const getAvailableOptimizationModes = (): string[] => {
        if (isAdmin) return ['speed', 'balanced', 'quality'];

        // Get all available optimization modes from all user roles
        const allModes = new Set<string>();

        for (const userRole of userRoles) {
            const roleDetail = roleDetails.get(userRole.role_id);
            const optimizationMode = roleDetail?.optimization_mode;

            console.log('[useRBAC] getAvailableOptimizationModes - role:', roleDetail?.name, 'modes:', optimizationMode);

            if (optimizationMode) {
                // Split comma-separated modes and add to set
                const modes = optimizationMode.split(',').map(m => m.trim());
                modes.forEach(mode => allModes.add(mode));
            }
        }

        // If no modes found, default to balanced
        if (allModes.size === 0) {
            allModes.add('balanced');
        }

        console.log('[useRBAC] getAvailableOptimizationModes - final modes:', Array.from(allModes));

        return Array.from(allModes);
    };

    const hasRebalanceAccess = (): boolean => {
        if (isAdmin) return true;

        // Check if any role has rebalance access
        for (const userRole of userRoles) {
            const roleDetail = roleDetails.get(userRole.role_id);
            if (roleDetail && roleDetail.rebalance_access) {
                return true;
            }
        }

        return false;
    };

    const hasOpportunityAgentAccess = (): boolean => {
        if (isAdmin) return true;

        // Check if any role has opportunity agent access
        for (const userRole of userRoles) {
            const roleDetail = roleDetails.get(userRole.role_id);
            if (roleDetail && roleDetail.opportunity_agent_access) {
                return true;
            }
        }

        return false;
    };

    const hasAdditionalProviderAccess = (): boolean => {
        if (isAdmin) return true;

        // Check if any role has additional provider access
        for (const userRole of userRoles) {
            const roleDetail = roleDetails.get(userRole.role_id);
            if (roleDetail && roleDetail.additional_provider_access) {
                return true;
            }
        }

        return false;
    };

    // These match the function names used in Settings.tsx
    const canUseLiveTrading = (): boolean => {
        if (isAdmin) return true;

        // Check if any role has live trading enabled
        for (const userRole of userRoles) {
            const roleDetail = roleDetails.get(userRole.role_id);
            if (roleDetail && roleDetail.enable_live_trading) {
                return true;
            }
        }

        return false;
    };

    const canUseAutoTrading = (): boolean => {
        if (isAdmin) return true;

        // Check if any role has auto trading enabled
        for (const userRole of userRoles) {
            const roleDetail = roleDetails.get(userRole.role_id);
            if (roleDetail && roleDetail.enable_auto_trading) {
                return true;
            }
        }

        return false;
    };

    // Aliases for compatibility with different naming conventions
    const hasLiveTradingAccess = canUseLiveTrading;
    const hasAutoTradingAccess = canUseAutoTrading;

    return {
        permissions,
        isLoading,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        hasRole,
        hasAnyRole,
        hasAllRoles,
        canPerform,
        isAdmin,
        getPrimaryRole,
        getMaxParallelAnalysis,
        getMaxWatchlistStocks,
        getMaxRebalanceStocks,
        getMaxScheduledRebalances,
        getMaxDebateRounds,
        getScheduleResolution,
        getMaxSearchSources,
        getAvailableOptimizationModes,
        hasRebalanceAccess,
        hasOpportunityAgentAccess,
        hasAdditionalProviderAccess,
        canUseLiveTrading,
        canUseAutoTrading,
        hasLiveTradingAccess,
        hasAutoTradingAccess,
        userRoles,
        roleDetails
    };
}