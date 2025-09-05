import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth, isSessionValid } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// Cache for role details to prevent repeated fetches
const roleDetailsCache = new Map<string, any>();
const roleCacheExpiry = new Map<string, number>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface RBACContextType {
  permissions: string[];
  userRoles: any[];
  roleDetails: Map<string, any>;
  isLoading: boolean;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (perms: string[]) => boolean;
  hasAllPermissions: (perms: string[]) => boolean;
  getPrimaryRole: () => any;
  getMaxParallelAnalysis: () => number;
  getMaxWatchlistStocks: () => number;
  getMaxRebalanceStocks: () => number;
  getMaxScheduledRebalances: () => number;
  getMaxSearchSources: () => number;
  getScheduleResolution: () => string[];
  getAvailableOptimizationModes: () => string[];
  hasRebalanceAccess: () => boolean;
  hasOpportunityAgentAccess: () => boolean;
  hasAdditionalProviderAccess: () => boolean;
  hasLiveTradingAccess: () => boolean;
  hasAutoTradingAccess: () => boolean;
}

const RBACContext = createContext<RBACContextType | undefined>(undefined);

export function RBACProvider({ children }: { children: React.ReactNode }) {
  const { user, isAdmin } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [userRoles, setUserRoles] = useState<any[]>([]);
  const [roleDetails, setRoleDetails] = useState<Map<string, any>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  
  const loadingRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);
  const lastIsAdminRef = useRef<boolean | null>(null);

  useEffect(() => {
    async function loadPermissions() {
      if (!user) {
        setPermissions([]);
        setUserRoles([]);
        setRoleDetails(new Map());
        setIsLoading(false);
        lastUserIdRef.current = null;
        lastIsAdminRef.current = null;
        return;
      }

      // Check session validity before making any API calls
      if (!isSessionValid()) {
        console.log('RBAC: Skipping permission load - session invalid');
        setIsLoading(false);
        return;
      }

      // Prevent duplicate requests for the same user and admin status
      if (loadingRef.current) {
        return;
      }
      
      // Check if we already loaded for this user/admin combo
      if (lastUserIdRef.current === user.id && lastIsAdminRef.current === isAdmin) {
        setIsLoading(false);
        return;
      }

      loadingRef.current = true;
      lastUserIdRef.current = user.id;
      lastIsAdminRef.current = isAdmin;
      setIsLoading(true);
      
      try {
        // Use RPC function to get user roles
        const { data: rolesData, error: rolesError } = await supabase
          .rpc('get_user_roles', { p_user_id: user.id });

        if (!rolesError && rolesData && rolesData.length > 0) {
          // Map the RPC response to the expected format
          const mappedUserRoles = rolesData.map((role: any) => ({
            role_id: role.role_id,
            role_name: role.role_name,
            is_active: role.is_active
          }));
          
          setUserRoles(mappedUserRoles);
          const roleIds = mappedUserRoles.map((ur: any) => ur.role_id);

          // Check cache first for role details
          const now = Date.now();
          const uncachedRoleIds = roleIds.filter((id: string) => {
            const expiry = roleCacheExpiry.get(id);
            return !expiry || expiry < now;
          });

          let rolesDetail: any[] = [];
          
          // Get cached roles
          roleIds.forEach((id: string) => {
            const cached = roleDetailsCache.get(id);
            if (cached && roleCacheExpiry.get(id)! > now) {
              rolesDetail.push(cached);
            }
          });

          // Fetch only uncached roles
          if (uncachedRoleIds.length > 0) {
            const { data: fetchedRoles } = await supabase
              .from('roles')
              .select('*')
              .in('id', uncachedRoleIds);

            if (fetchedRoles) {
              // Cache the fetched roles
              fetchedRoles.forEach(role => {
                roleDetailsCache.set(role.id, role);
                roleCacheExpiry.set(role.id, now + CACHE_DURATION);
              });
              rolesDetail = [...rolesDetail, ...fetchedRoles];
            }
          }

          // Get role limits from role_limits table
          let roleLimits = null;
          if (rolesDetail && rolesDetail.length > 0) {
            const limitsResult = await supabase
              .from('role_limits')
              .select('*')
              .in('role_id', roleIds);
            
            roleLimits = limitsResult.data;
          }

          if (rolesDetail && rolesDetail.length > 0) {
            const roleMap = new Map();

            // Create a map of role limits for quick lookup
            const limitsMap = new Map();
            if (roleLimits) {
              roleLimits.forEach((limit: any) => {
                limitsMap.set(limit.role_id, limit);
              });
            }

            rolesDetail.forEach(role => {
              // Get limits from role_limits table
              const limits = limitsMap.get(role.id);

              // Use limits from role_limits table
              const maxParallelAnalysis = limits?.max_parallel_analysis !== undefined ? Number(limits.max_parallel_analysis) : undefined;
              const maxWatchlistStocks = limits?.max_watchlist_stocks !== undefined ? Number(limits.max_watchlist_stocks) : undefined;
              const maxRebalanceStocks = limits?.max_rebalance_stocks !== undefined ? Number(limits.max_rebalance_stocks) : undefined;
              const maxScheduledRebalances = limits?.max_scheduled_rebalances !== undefined ? Number(limits.max_scheduled_rebalances) : undefined;

              roleMap.set(role.id, {
                name: role.name,
                display_name: role.display_name || role.name,
                priority: role.priority || 10,
                color: role.color,
                icon_url: role.icon_url,
                features: role.features || [],
                max_parallel_analysis: maxParallelAnalysis,
                max_watchlist_stocks: maxWatchlistStocks,
                max_rebalance_stocks: maxRebalanceStocks,
                max_scheduled_rebalances: maxScheduledRebalances,
                schedule_resolution: limits?.schedule_resolution || role.schedule_resolution,
                rebalance_access: limits?.rebalance_access !== undefined ? limits.rebalance_access : role.rebalance_access,
                opportunity_agent_access: limits?.opportunity_agent_access !== undefined ? limits.opportunity_agent_access : role.opportunity_agent_access,
                additional_provider_access: limits?.additional_provider_access !== undefined ? limits.additional_provider_access : role.additional_provider_access,
                enable_live_trading: limits?.enable_live_trading !== undefined ? limits.enable_live_trading : role.enable_live_trading,
                enable_auto_trading: limits?.enable_auto_trading !== undefined ? limits.enable_auto_trading : role.enable_auto_trading
              });
            });
            
            setRoleDetails(roleMap);
          } else if (mappedUserRoles.length > 0) {
            // No role details found, create basic entries
            const roleMap = new Map();
            
            mappedUserRoles.forEach(userRole => {
              const isMax = userRole.role_name === 'max';
              const isPro = userRole.role_name === 'pro';
              
              roleMap.set(userRole.role_id, {
                name: userRole.role_name,
                display_name: userRole.role_name.charAt(0).toUpperCase() + userRole.role_name.slice(1),
                priority: isAdmin ? 100 : (isMax ? 80 : (isPro ? 60 : 10)),
                color: undefined,
                icon_url: undefined,
                features: [],
                max_parallel_analysis: isAdmin ? 10 : (isMax ? 5 : (isPro ? 3 : 1)),
                max_watchlist_stocks: isAdmin ? 100 : (isMax ? 50 : (isPro ? 25 : 10)),
                max_rebalance_stocks: isAdmin ? 50 : (isMax ? 25 : (isPro ? 15 : 5)),
                max_scheduled_rebalances: isAdmin ? 20 : (isMax ? 10 : (isPro ? 5 : 2)),
                schedule_resolution: isAdmin || isMax ? 'Day,Week,Month' : (isPro ? 'Week,Month' : 'Month'),
                rebalance_access: isAdmin || isMax || isPro,
                opportunity_agent_access: isAdmin || isMax,
                additional_provider_access: isAdmin || isMax || isPro,
                enable_live_trading: isAdmin,
                enable_auto_trading: isAdmin
              });
              
              // Cache this for future use
              roleDetailsCache.set(userRole.role_id, roleMap.get(userRole.role_id));
              roleCacheExpiry.set(userRole.role_id, Date.now() + CACHE_DURATION);
            });
            
            setRoleDetails(roleMap);
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
        loadingRef.current = false;
      }
    }

    loadPermissions();
  }, [user?.id, isAdmin]);

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    if (isAdmin || permissions.includes('*')) return true;
    return permissions.includes(permission);
  };

  const hasAnyPermission = (perms: string[]): boolean => {
    return perms.some(p => hasPermission(p));
  };

  const hasAllPermissions = (perms: string[]): boolean => {
    return perms.every(p => hasPermission(p));
  };

  const getPrimaryRole = () => {
    if (!userRoles || userRoles.length === 0) {
      return null;
    }

    // Get the role with the highest priority
    let primaryRole = null;
    let highestPriority = -1;

    userRoles.forEach(userRole => {
      const detail = roleDetails.get(userRole.role_id);
      if (detail && detail.priority > highestPriority) {
        highestPriority = detail.priority;
        primaryRole = {
          ...detail,
          role_id: userRole.role_id
        };
      }
    });

    return primaryRole;
  };

  const getMaxParallelAnalysis = (): number => {
    if (isAdmin) return 10;

    let maxLimit = 0;
    userRoles.forEach(userRole => {
      const detail = roleDetails.get(userRole.role_id);
      if (detail?.max_parallel_analysis && detail.max_parallel_analysis > maxLimit) {
        maxLimit = detail.max_parallel_analysis;
      }
    });

    return maxLimit || 1;
  };

  const getMaxWatchlistStocks = (): number => {
    if (isAdmin) return 100;

    let maxLimit = 0;
    userRoles.forEach(userRole => {
      const detail = roleDetails.get(userRole.role_id);
      if (detail?.max_watchlist_stocks && detail.max_watchlist_stocks > maxLimit) {
        maxLimit = detail.max_watchlist_stocks;
      }
    });

    return maxLimit || 10;
  };

  const getMaxRebalanceStocks = (): number => {
    if (isAdmin) return 50;

    let maxLimit = 0;
    userRoles.forEach(userRole => {
      const detail = roleDetails.get(userRole.role_id);
      if (detail?.max_rebalance_stocks && detail.max_rebalance_stocks > maxLimit) {
        maxLimit = detail.max_rebalance_stocks;
      }
    });

    return maxLimit || 5;
  };

  const getMaxScheduledRebalances = (): number => {
    if (isAdmin) return 20;

    let maxLimit = 0;
    userRoles.forEach(userRole => {
      const detail = roleDetails.get(userRole.role_id);
      if (detail?.max_scheduled_rebalances && detail.max_scheduled_rebalances > maxLimit) {
        maxLimit = detail.max_scheduled_rebalances;
      }
    });

    return maxLimit || 2;
  };

  const getMaxSearchSources = (): number => {
    if (isAdmin) return 10;

    let maxLimit = 0;
    userRoles.forEach(userRole => {
      const detail = roleDetails.get(userRole.role_id);
      if (detail?.max_search_sources && detail.max_search_sources > maxLimit) {
        maxLimit = detail.max_search_sources;
      }
    });

    // Default search sources based on role if not explicitly set
    if (maxLimit === 0) {
      const primaryRole = getPrimaryRole();
      if (primaryRole) {
        const isMax = primaryRole.name === 'max';
        const isPro = primaryRole.name === 'pro';
        return isMax ? 8 : (isPro ? 5 : 3);
      }
    }

    return maxLimit || 3;
  };

  const getScheduleResolution = (): string[] => {
    if (isAdmin) return ['Day', 'Week', 'Month'];

    const resolutions = new Set<string>();
    userRoles.forEach(userRole => {
      const detail = roleDetails.get(userRole.role_id);
      if (detail?.schedule_resolution) {
        const resArray = detail.schedule_resolution.split(',').map((r: string) => r.trim());
        resArray.forEach((r: string) => resolutions.add(r));
      }
    });

    return Array.from(resolutions).length > 0 ? Array.from(resolutions) : ['Month'];
  };

  const getAvailableOptimizationModes = (): string[] => {
    if (isAdmin) return ['speed', 'balanced', 'quality'];

    const modes = new Set<string>();
    userRoles.forEach(userRole => {
      const detail = roleDetails.get(userRole.role_id);
      if (detail?.available_optimization_modes) {
        const modeArray = detail.available_optimization_modes.split(',').map((m: string) => m.trim());
        modeArray.forEach((m: string) => modes.add(m));
      }
    });

    // Default optimization modes based on role if not explicitly set
    if (modes.size === 0) {
      const primaryRole = getPrimaryRole();
      if (primaryRole) {
        const isMax = primaryRole.name === 'max';
        const isPro = primaryRole.name === 'pro';
        if (isMax) {
          return ['speed', 'balanced', 'quality'];
        } else if (isPro) {
          return ['speed', 'balanced'];
        } else {
          return ['balanced'];
        }
      }
    }

    return Array.from(modes).length > 0 ? Array.from(modes) : ['balanced'];
  };

  const hasRebalanceAccess = (): boolean => {
    if (isAdmin) return true;

    return userRoles.some(userRole => {
      const detail = roleDetails.get(userRole.role_id);
      return detail?.rebalance_access === true;
    });
  };

  const hasOpportunityAgentAccess = (): boolean => {
    if (isAdmin) return true;

    return userRoles.some(userRole => {
      const detail = roleDetails.get(userRole.role_id);
      return detail?.opportunity_agent_access === true;
    });
  };

  const hasAdditionalProviderAccess = (): boolean => {
    if (isAdmin) return true;

    return userRoles.some(userRole => {
      const detail = roleDetails.get(userRole.role_id);
      return detail?.additional_provider_access === true;
    });
  };

  const hasLiveTradingAccess = (): boolean => {
    if (isAdmin) return true;

    return userRoles.some(userRole => {
      const detail = roleDetails.get(userRole.role_id);
      return detail?.enable_live_trading === true;
    });
  };

  const hasAutoTradingAccess = (): boolean => {
    if (isAdmin) return true;

    return userRoles.some(userRole => {
      const detail = roleDetails.get(userRole.role_id);
      return detail?.enable_auto_trading === true;
    });
  };

  const value: RBACContextType = {
    permissions,
    userRoles,
    roleDetails,
    isLoading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    getPrimaryRole,
    getMaxParallelAnalysis,
    getMaxWatchlistStocks,
    getMaxRebalanceStocks,
    getMaxScheduledRebalances,
    getMaxSearchSources,
    getScheduleResolution,
    getAvailableOptimizationModes,
    hasRebalanceAccess,
    hasOpportunityAgentAccess,
    hasAdditionalProviderAccess,
    hasLiveTradingAccess,
    hasAutoTradingAccess
  };

  return <RBACContext.Provider value={value}>{children}</RBACContext.Provider>;
}

export function useRBAC() {
  const context = useContext(RBACContext);
  if (context === undefined) {
    throw new Error('useRBAC must be used within a RBACProvider');
  }
  return context;
}