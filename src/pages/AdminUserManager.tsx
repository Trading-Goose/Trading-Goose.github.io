import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { useUserManagement } from "@/hooks/useUserManagement";
import { RoleGate } from "@/components/RoleBasedAccess";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Users,
  Search,
  Save,
  X,
  AlertCircle,
  Loader2,
  ChevronUp,
  ChevronDown,
  Filter,
  RefreshCw,
  User,
  Mail,
  Calendar,
  Clock,
  Shield,
  Hash,
  Trash2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow, addDays, addMonths, addYears } from "date-fns";
import { supabase } from "@/lib/supabase";

export default function AdminUserManager() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    users,
    availableRoles,
    isLoading,
    isSaving,
    error,
    pagination,
    changePage,
    filters,
    updateFilter,
    clearFilters,
    sortField,
    sortDirection,
    updateSort,
    pendingChanges,
    updateUserRole,
    saveChanges,
    cancelChanges,
    hasPendingChanges,
    canManageUsers,
    refresh,
    deleteUser
  } = useUserManagement();

  const [searchInput, setSearchInput] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{ id: string; email: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [roleExpirations, setRoleExpirations] = useState<Map<string, string | null>>(new Map());

  // Get current user ID on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setCurrentUserId(data.user.id);
      }
    });
  }, []);


  // Get unique providers from users
  const uniqueProviders = Array.from(new Set(users.map(u => u.provider).filter(Boolean)));
  const uniqueProviderTypes = Array.from(new Set(users.map(u => u.provider_type).filter(Boolean)));

  const handleSearch = () => {
    updateFilter('searchTerm', searchInput);
  };

  const handleSaveChanges = async () => {
    const successCount = await saveChanges();
    if (successCount) {
      toast({
        title: "Success",
        description: `Role changes saved for ${successCount} user(s) on this page`,
      });
    }
  };

  const handleDeleteClick = (user: { id: string; email: string; name: string }) => {
    setUserToDelete(user);
    setDeleteConfirmOpen(true);
  };

  const handleRoleChange = (userId: string, roleId: string | null) => {
    const expiresAt = roleExpirations.get(userId) || null;
    updateUserRole(userId, roleId === 'none' ? null : roleId, expiresAt);
  };

  const handleExpirationChange = (userId: string, expiresAt: string | null) => {
    setRoleExpirations(prev => {
      const newMap = new Map(prev);
      if (expiresAt) {
        newMap.set(userId, expiresAt);
      } else {
        newMap.delete(userId);
      }
      return newMap;
    });

    // Update the pending change with new expiration
    const user = users.find(u => u.id === userId);
    if (user) {
      // Get the current role (either pending or existing)
      const roleId = pendingChanges.get(userId)?.roleId || user.current_role_id;
      // Always update user role when expiration changes to trigger save button
      updateUserRole(userId, roleId, expiresAt);
    }
  };

  const formatExpiration = (dateString: string | null | undefined) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      const now = new Date();
      if (date < now) return 'Expired';
      return format(date, 'MMM dd, yyyy HH:mm');
    } catch {
      return null;
    }
  };

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;

    setIsDeleting(true);
    try {
      const success = await deleteUser(userToDelete.id);
      if (success) {
        toast({
          title: "Success",
          description: `User ${userToDelete.email} has been deleted successfully`,
        });
        setDeleteConfirmOpen(false);
        setUserToDelete(null);
      } else {
        toast({
          title: "Error",
          description: "Failed to delete user. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred while deleting the user",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Calculate pending changes on current page
  const currentPageUserIds = new Set(users.map(u => u.id));
  const currentPageChanges = Array.from(pendingChanges).filter(([userId]) =>
    currentPageUserIds.has(userId)
  ).length;

  const getSortIcon = (field: string) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ?
      <ChevronUp className="h-4 w-4" /> :
      <ChevronDown className="h-4 w-4" />;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'MMM dd, yyyy');
    } catch {
      return '-';
    }
  };

  const formatLastLogin = (dateString: string | null) => {
    if (!dateString) return 'Never';
    try {
      const date = new Date(dateString);
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return 'Never';
      }
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return 'Never';
    }
  };

  if (!canManageUsers) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-6 py-8">
          <Alert className="max-w-md mx-auto">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You don't have permission to manage users.
            </AlertDescription>
          </Alert>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-8 w-8" />
            User Management
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage user accounts and role assignments
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {currentPageChanges > 0 && (
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Unsaved Changes on This Page</AlertTitle>
            <AlertDescription>
              You have {currentPageChanges} pending role change(s) on this page.
              {pendingChanges.size > currentPageChanges &&
                ` (${pendingChanges.size - currentPageChanges} changes on other pages)`
              }
            </AlertDescription>
          </Alert>
        )}

        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Users</CardTitle>
                <CardDescription>
                  Page {pagination.page} of {pagination.totalPages} •
                  Showing {Math.min(pagination.pageSize, pagination.totalCount)} of {pagination.totalCount} users
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refresh}
                  disabled={isLoading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </CardHeader>

          {showFilters && (
            <CardContent className="border-b">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Search */}
                <div className="lg:col-span-2">
                  <Label>Search</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search by email, name, or ID..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <Button onClick={handleSearch} size="icon">
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* User ID Filter */}
                <div>
                  <Label>User ID</Label>
                  <Input
                    placeholder="Filter by ID..."
                    value={filters.userId || ''}
                    onChange={(e) => updateFilter('userId', e.target.value)}
                  />
                </div>

                {/* Role Filter */}
                <div>
                  <Label>Role</Label>
                  <Select
                    value={filters.roleId || 'all'}
                    onValueChange={(v) => updateFilter('roleId', v === 'all' ? null : v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="none">No Role</SelectItem>
                      {availableRoles.map(role => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Provider Filter */}
                <div>
                  <Label>Provider</Label>
                  <Select
                    value={filters.provider || 'all'}
                    onValueChange={(v) => updateFilter('provider', v === 'all' ? null : v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Providers</SelectItem>
                      {uniqueProviders.map(provider => (
                        <SelectItem key={provider} value={provider}>
                          {provider}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Provider Type Filter */}
                <div>
                  <Label>Provider Type</Label>
                  <Select
                    value={filters.providerType || 'all'}
                    onValueChange={(v) => updateFilter('providerType', v === 'all' ? null : v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {uniqueProviderTypes.map(type => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Clear Filters */}
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      clearFilters();
                      setSearchInput('');
                    }}
                    className="w-full"
                  >
                    Clear Filters
                  </Button>
                </div>
              </div>
            </CardContent>
          )}

          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No users found matching your filters
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">#</TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateSort('email')}
                          className="h-auto p-0 font-medium"
                        >
                          User Info
                          {getSortIcon('email')}
                        </Button>
                      </TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateSort('last_sign_in_at')}
                          className="h-auto p-0 font-medium"
                        >
                          Last Login
                          {getSortIcon('last_sign_in_at')}
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateSort('created_at')}
                          className="h-auto p-0 font-medium"
                        >
                          Created
                          {getSortIcon('created_at')}
                        </Button>
                      </TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead >Expiration</TableHead>
                      <TableHead >Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user, index) => {
                      const globalIndex = (pagination.page - 1) * pagination.pageSize + index + 1;
                      const hasChanged = pendingChanges.has(user.id);
                      const isCurrentUser = user.id === currentUserId;

                      return (
                        <TableRow key={user.id} className={hasChanged ? 'bg-muted/50' : ''}>
                          <TableCell className="font-mono text-xs">
                            {globalIndex}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{user.name || 'Unnamed User'}</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                {user.email}
                              </div>
                              <div className="flex items-center gap-2">
                                <Hash className="h-3 w-3 text-muted-foreground" />
                                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                                  {user.id.substring(0, 8)}...
                                </code>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Badge variant="outline" className="text-xs">
                                {user.provider}
                              </Badge>
                              {user.provider_type !== user.provider && (
                                <Badge variant="secondary" className="text-xs block w-fit">
                                  {user.provider_type}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              {formatLastLogin(user.last_sign_in_at)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              {formatDate(user.created_at)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={user.pending_role_id || 'none'}
                              onValueChange={(v) => handleRoleChange(user.id, v)}
                            >
                              <SelectTrigger className={`w-[150px] ${hasChanged ? 'border-yellow-500' : ''}`}>
                                <SelectValue>
                                  {user.pending_role_id ?
                                    availableRoles.find(r => r.id === user.pending_role_id)?.display_name || 'Select Role' :
                                    'No Role'
                                  }
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">
                                  <span className="text-muted-foreground">No Role</span>
                                </SelectItem>
                                {availableRoles
                                  .sort((a, b) => {
                                    // Sort roles by priority (admin first, then default)
                                    const priority = { admin: 2, default: 1 };
                                    const aPriority = priority[a.name as keyof typeof priority] || 0;
                                    const bPriority = priority[b.name as keyof typeof priority] || 0;
                                    return bPriority - aPriority;
                                  })
                                  .map(role => (
                                    <SelectItem key={role.id} value={role.id}>
                                      <div className="flex items-center gap-2">
                                        <Shield className="h-3 w-3" />
                                        {role.display_name}
                                      </div>
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            {hasChanged && (
                              <Badge variant="outline" className="mt-1 text-xs">
                                Changed
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {/* Show expiration controls for non-admin/default roles */}
                            {user.pending_role_id &&
                              availableRoles.find(r => r.id === user.pending_role_id)?.name !== 'admin' &&
                              availableRoles.find(r => r.id === user.pending_role_id)?.name !== 'default' ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="datetime-local"
                                    className="w-[200px] text-xs"
                                    value={(() => {
                                      const expiration = roleExpirations.get(user.id) || user.pending_expires_at;
                                      if (!expiration) return '';
                                      // Convert to local datetime format (remove timezone)
                                      return expiration.slice(0, 16);
                                    })()}
                                    min={new Date().toISOString().slice(0, 16)}
                                    onChange={(e) => handleExpirationChange(user.id, e.target.value || null)}
                                  />
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => {
                                      const expires = addDays(new Date(), 7).toISOString().slice(0, 16);
                                      handleExpirationChange(user.id, expires);
                                    }}
                                  >
                                    +7d
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => {
                                      const expires = addDays(new Date(), 30).toISOString().slice(0, 16);
                                      handleExpirationChange(user.id, expires);
                                    }}
                                  >
                                    +30d
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => {
                                      const expires = addMonths(new Date(), 3).toISOString().slice(0, 16);
                                      handleExpirationChange(user.id, expires);
                                    }}
                                  >
                                    +3m
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => {
                                      const expires = addYears(new Date(), 1).toISOString().slice(0, 16);
                                      handleExpirationChange(user.id, expires);
                                    }}
                                  >
                                    +1y
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {/* Show current expiration if exists */}
                                {user.current_role_expires_at ? (
                                  <div className="text-sm">
                                    {formatExpiration(user.current_role_expires_at)}
                                  </div>
                                ) : (
                                  <span className="text-sm text-muted-foreground">
                                    {user.pending_role_id && (
                                      availableRoles.find(r => r.id === user.pending_role_id)?.name === 'admin' ||
                                      availableRoles.find(r => r.id === user.pending_role_id)?.name === 'default'
                                    ) ? 'Never' : '-'}
                                  </span>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClick({
                                id: user.id,
                                email: user.email,
                                name: user.name || 'Unnamed User'
                              })}
                              disabled={isCurrentUser}
                              title={isCurrentUser ? "Cannot delete your own account" : "Delete user"}
                            >
                              <Trash2 className={`h-4 w-4 ${isCurrentUser ? 'text-muted-foreground' : 'text-destructive'}`} />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>

          {pagination.totalPages > 1 && (
            <CardContent className="border-t">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => changePage(pagination.page - 1)}
                      className={pagination.page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>

                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (pagination.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (pagination.page <= 3) {
                      pageNum = i + 1;
                    } else if (pagination.page >= pagination.totalPages - 2) {
                      pageNum = pagination.totalPages - 4 + i;
                    } else {
                      pageNum = pagination.page - 2 + i;
                    }

                    if (pageNum < 1 || pageNum > pagination.totalPages) return null;

                    return (
                      <PaginationItem key={pageNum}>
                        <PaginationLink
                          onClick={() => changePage(pageNum)}
                          isActive={pageNum === pagination.page}
                          className="cursor-pointer"
                        >
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}

                  {pagination.totalPages > 5 && pagination.page < pagination.totalPages - 2 && (
                    <>
                      <PaginationItem>
                        <PaginationEllipsis />
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationLink
                          onClick={() => changePage(pagination.totalPages)}
                          className="cursor-pointer"
                        >
                          {pagination.totalPages}
                        </PaginationLink>
                      </PaginationItem>
                    </>
                  )}

                  <PaginationItem>
                    <PaginationNext
                      onClick={() => changePage(pagination.page + 1)}
                      className={pagination.page === pagination.totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </CardContent>
          )}
        </Card>

        {/* Action Buttons - Only show if there are changes on current page */}
        {currentPageChanges > 0 && (
          <div className="fixed bottom-6 right-6 z-50">
            <Card className="shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium">
                    {currentPageChanges} change(s) on this page
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={cancelChanges}
                      disabled={isSaving}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel All
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveChanges}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Save Page Changes
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure you want to delete this user?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the user account.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {userToDelete && (
              <div className="space-y-3 py-4">
                <div className="rounded-lg bg-muted p-3 space-y-1">
                  <div><span className="font-semibold">User:</span> {userToDelete.name || 'Unnamed User'}</div>
                  <div><span className="font-semibold">Email:</span> {userToDelete.email}</div>
                </div>
                <div>
                  <p className="mb-2 text-sm">All associated data will be permanently deleted:</p>
                  <div className="text-sm text-muted-foreground space-y-1 ml-4">
                    <div>• Analysis history</div>
                    <div>• Portfolios and positions</div>
                    <div>• Rebalance requests</div>
                    <div>• Trading actions</div>
                    <div>• Watchlists</div>
                    <div>• Settings and configurations</div>
                  </div>
                </div>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete User'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}