import { useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Hash
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";

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
    refresh
  } = useUserManagement();

  const [searchInput, setSearchInput] = useState('');
  const [showFilters, setShowFilters] = useState(false);

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
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user, index) => {
                      const globalIndex = (pagination.page - 1) * pagination.pageSize + index + 1;
                      const hasChanged = pendingChanges.has(user.id);
                      
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
                              onValueChange={(v) => updateUserRole(user.id, v === 'none' ? null : v)}
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
      </main>
    </div>
  );
}