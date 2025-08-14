import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useRBAC } from './useRBAC';

export interface UserDetails {
  id: string;
  email: string;
  name: string;
  provider: string;
  provider_type: string;
  last_sign_in_at: string | null;
  created_at: string;
  email_confirmed_at: string | null;
  phone: string | null;
  app_metadata: any;
  user_metadata: any;
  current_role_id: string | null;
  current_role_name: string | null;
  pending_role_id?: string | null;
}

export interface UserFilter {
  userId?: string;
  provider?: string;
  providerType?: string;
  roleId?: string;
  searchTerm?: string;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

type SortField = 'created_at' | 'last_sign_in_at' | 'email' | 'name';
type SortDirection = 'asc' | 'desc';

export function useUserManagement() {
  const { hasPermission } = useRBAC();
  const [users, setUsers] = useState<UserDetails[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserDetails[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<UserFilter>({});
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: 50,
    totalCount: 0,
    totalPages: 0
  });
  const [pendingChanges, setPendingChanges] = useState<Map<string, string>>(new Map());
  const [isSaving, setIsSaving] = useState(false);

  const canManageUsers = hasPermission('users.update') || hasPermission('roles.assign');

  // Fetch all available roles
  const [availableRoles, setAvailableRoles] = useState<Array<{ id: string; name: string; display_name: string }>>([]);

  // Fetch roles
  const fetchRoles = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('id, name, display_name')
        .order('priority', { ascending: false });

      if (error) throw error;
      setAvailableRoles(data || []);
    } catch (err) {
      console.error('Error fetching roles:', err);
    }
  }, []);

  // Fetch users with their details
  const fetchUsers = useCallback(async () => {
    if (!canManageUsers) return;

    try {
      setIsLoading(true);
      setError(null);

      // Use direct queries (RPC functions have permission issues with auth.users table)
      // This approach works reliably without errors
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profileError) throw profileError;

      // Get user roles separately
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role_id, is_active')
        .eq('is_active', true);

      if (rolesError) throw rolesError;

      // Get all roles
      const { data: allRoles, error: allRolesError } = await supabase
        .from('roles')
        .select('id, name, display_name');

      if (allRolesError) throw allRolesError;

      // Map profiles to user details format
      const mappedUsers: UserDetails[] = profiles?.map(profile => {
        const userRole = userRoles?.find(ur => ur.user_id === profile.id);
        const role = userRole ? allRoles?.find(r => r.id === userRole.role_id) : null;
        
        return {
          id: profile.id,
          email: profile.email || '',
          name: profile.name || profile.full_name || '',
          provider: 'email',
          provider_type: 'email',
          last_sign_in_at: null,
          created_at: profile.created_at,
          email_confirmed_at: null,
          phone: null,
          app_metadata: {},
          user_metadata: {},
          current_role_id: userRole?.role_id || null,
          current_role_name: role?.name || null
        };
      }) || [];

      setUsers(mappedUsers);
      setFilteredUsers(mappedUsers);
      setPagination(prev => ({
        ...prev,
        totalCount: mappedUsers.length,
        totalPages: Math.ceil(mappedUsers.length / prev.pageSize)
      }));

    } catch (err) {
      console.error('Error fetching users:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setIsLoading(false);
    }
  }, [canManageUsers]);

  // Apply filters and sorting
  const applyFiltersAndSort = useCallback(() => {
    let filtered = [...users];

    // Apply filters
    if (filters.userId) {
      filtered = filtered.filter(u => 
        u.id.toLowerCase().includes(filters.userId!.toLowerCase())
      );
    }

    if (filters.provider) {
      filtered = filtered.filter(u => 
        u.provider.toLowerCase() === filters.provider!.toLowerCase()
      );
    }

    if (filters.providerType) {
      filtered = filtered.filter(u => 
        u.provider_type.toLowerCase() === filters.providerType!.toLowerCase()
      );
    }

    if (filters.roleId) {
      filtered = filtered.filter(u => u.current_role_id === filters.roleId);
    }

    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(u => 
        u.email.toLowerCase().includes(term) ||
        u.name.toLowerCase().includes(term) ||
        u.id.toLowerCase().includes(term)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      // Handle null values
      if (aVal === null) aVal = '';
      if (bVal === null) bVal = '';

      // Convert dates to timestamps for comparison
      if (sortField === 'created_at' || sortField === 'last_sign_in_at') {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }

      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    setFilteredUsers(filtered);
    setPagination(prev => ({
      ...prev,
      totalCount: filtered.length,
      totalPages: Math.ceil(filtered.length / prev.pageSize),
      page: 1 // Reset to first page when filters change
    }));
  }, [users, filters, sortField, sortDirection]);

  // Get paginated users
  const paginatedUsers = useMemo(() => {
    const startIndex = (pagination.page - 1) * pagination.pageSize;
    const endIndex = startIndex + pagination.pageSize;
    
    return filteredUsers.slice(startIndex, endIndex).map(user => ({
      ...user,
      pending_role_id: pendingChanges.get(user.id) || user.current_role_id
    }));
  }, [filteredUsers, pagination.page, pagination.pageSize, pendingChanges]);

  // Update filter
  const updateFilter = useCallback((key: keyof UserFilter, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined
    }));
  }, []);

  // Clear filters
  const clearFilters = useCallback(() => {
    setFilters({});
  }, []);

  // Update sorting
  const updateSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }, [sortField]);

  // Change page
  const changePage = useCallback((newPage: number) => {
    setPagination(prev => ({
      ...prev,
      page: Math.max(1, Math.min(newPage, prev.totalPages))
    }));
  }, []);

  // Update user role (pending)
  const updateUserRole = useCallback((userId: string, roleId: string | null) => {
    setPendingChanges(prev => {
      const newChanges = new Map(prev);
      if (roleId === null || roleId === users.find(u => u.id === userId)?.current_role_id) {
        newChanges.delete(userId);
      } else {
        newChanges.set(userId, roleId);
      }
      return newChanges;
    });
  }, [users]);

  // Save pending changes for current page only
  const saveChanges = useCallback(async () => {
    // Get current page user IDs
    const currentPageUserIds = new Set(paginatedUsers.map(u => u.id));
    
    // Filter pending changes to only include users on current page
    const pageChanges = new Map(
      Array.from(pendingChanges).filter(([userId]) => currentPageUserIds.has(userId))
    );

    if (pageChanges.size === 0) return;

    if (!hasPermission('roles.assign')) {
      setError('Insufficient permissions to assign roles');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const currentUserId = (await supabase.auth.getUser()).data.user?.id;
      const promises: Promise<any>[] = [];
      let successCount = 0;

      for (const [userId, newRoleId] of pageChanges) {
        const user = users.find(u => u.id === userId);
        if (!user) continue;

        // Process role change for this user
        const processUserRole = async () => {
          // Direct update approach (RPC function not available)
          // If user has a current role, deactivate it first
          if (user.current_role_id) {
            await supabase
              .from('user_roles')
              .update({ is_active: false })
              .match({ user_id: userId, role_id: user.current_role_id });
          }

          // Assign new role
          if (newRoleId) {
            // Try to insert, if it fails due to duplicate, update instead
            const { error: insertError } = await supabase
              .from('user_roles')
              .insert({
                user_id: userId,
                role_id: newRoleId,
                is_active: true,
                granted_by: currentUserId
              });

            if (insertError && insertError.code === '23505') {
              // Duplicate key error, update instead
              await supabase
                .from('user_roles')
                .update({
                  is_active: true,
                  granted_by: currentUserId,
                  updated_at: new Date().toISOString()
                  })
                  .eq('user_id', userId)
                  .eq('role_id', newRoleId);
            } else if (insertError) {
              throw insertError;
            }
          }
        };

        promises.push(processUserRole());

        // Log the change if assigning a new role
        if (newRoleId) {
          promises.push(
            supabase
              .from('role_audit_log')
              .insert({
                user_id: currentUserId,
                target_user_id: userId,
                action: 'grant',
                role_id: newRoleId,
                details: { 
                  previous_role: user.current_role_name,
                  bulk_update: true,
                  page: pagination.page 
                }
              })
          );
        }
        successCount++;
      }

      await Promise.all(promises);

      // Clear only the saved changes for current page
      setPendingChanges(prev => {
        const newChanges = new Map(prev);
        pageChanges.forEach((_, userId) => {
          newChanges.delete(userId);
        });
        return newChanges;
      });
      
      // Refresh users
      await fetchUsers();

      return successCount;
    } catch (err) {
      console.error('Error saving changes:', err);
      setError(err instanceof Error ? err.message : 'Failed to save changes');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [pendingChanges, paginatedUsers, users, hasPermission, fetchUsers, pagination.page]);

  // Cancel pending changes
  const cancelChanges = useCallback(() => {
    setPendingChanges(new Map());
  }, []);

  // Initialize
  useEffect(() => {
    if (canManageUsers) {
      fetchRoles();
      fetchUsers();
    }
  }, [canManageUsers, fetchRoles, fetchUsers]);

  // Apply filters when they change
  useEffect(() => {
    applyFiltersAndSort();
  }, [filters, sortField, sortDirection, users, applyFiltersAndSort]);

  return {
    // Data
    users: paginatedUsers,
    availableRoles,
    isLoading,
    isSaving,
    error,
    
    // Pagination
    pagination,
    changePage,
    
    // Filtering & Sorting
    filters,
    updateFilter,
    clearFilters,
    sortField,
    sortDirection,
    updateSort,
    
    // Role management
    pendingChanges,
    updateUserRole,
    saveChanges,
    cancelChanges,
    hasPendingChanges: pendingChanges.size > 0,
    
    // Permissions
    canManageUsers,
    
    // Actions
    refresh: fetchUsers
  };
}