import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { useRoleManagement, type RoleWithLimits } from "@/hooks/useRoleManagement";
import { RoleGate } from "@/components/RoleBasedAccess";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  Settings,
  Save,
  Plus,
  Trash2,
  Edit,
  AlertCircle,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AdminRoleManager() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    roles,
    users,
    isLoading,
    error,
    canManageRoles,
    updateRoleLimits,
    updateRole,
    assignRole,
    revokeRole,
    toggleRolePermission,
    createRole,
    deleteRole,
    refresh
  } = useRoleManagement();

  const [selectedRole, setSelectedRole] = useState<RoleWithLimits | null>(null);
  const [editingLimits, setEditingLimits] = useState<RoleWithLimits | null>(null);
  const [editingRole, setEditingRole] = useState<RoleWithLimits | null>(null);
  const [expandedPermissions, setExpandedPermissions] = useState<string[]>([]);
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [newRole, setNewRole] = useState({
    name: '',
    display_name: '',
    description: '',
    priority: 10
  });

  // Permissions that are actually used in the system
  const allPermissions = [
    'admin.access',         // Access admin pages
    'invitations.create',   // Create and send invitations
    'users.update',         // Manage users
    'roles.assign'          // Assign roles to users
  ];

  // Friendly names for permissions
  const permissionLabels: Record<string, string> = {
    'admin.access': 'Admin Panel Access',
    'invitations.create': 'Send Invitations',
    'users.update': 'Manage Users',
    'roles.assign': 'Assign Roles'
  };

  const handleSaveLimits = async () => {
    if (!editingLimits) return;

    try {
      await updateRoleLimits(editingLimits.id, {
        role_id: editingLimits.id,
        max_parallel_analysis: editingLimits.max_parallel_analysis,
        max_watchlist_stocks: editingLimits.max_watchlist_stocks,
        max_rebalance_stocks: editingLimits.max_rebalance_stocks,
        max_scheduled_rebalances: editingLimits.max_scheduled_rebalances,
        schedule_resolution: editingLimits.schedule_resolution,
        rebalance_access: editingLimits.rebalance_access,
        opportunity_agent_access: editingLimits.opportunity_agent_access,
        additional_provider_access: editingLimits.additional_provider_access,
        enable_live_trading: editingLimits.enable_live_trading,
        enable_auto_trading: editingLimits.enable_auto_trading
      });

      toast({
        title: "Success",
        description: `Role limits updated for ${editingLimits.display_name}`,
      });

      setEditingLimits(null);
      await refresh();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to update role limits",
        variant: "destructive"
      });
    }
  };

  const handleTogglePermission = async (roleId: string, permission: string, currentState: boolean) => {
    try {
      await toggleRolePermission(roleId, permission, !currentState);
      toast({
        title: "Success",
        description: `Permission ${!currentState ? 'granted' : 'revoked'}`,
      });
      // Note: toggleRolePermission already calls loadRoles internally
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to toggle permission",
        variant: "destructive"
      });
    }
  };

  const handleCreateRole = async () => {
    try {
      await createRole(
        newRole.name,
        newRole.display_name,
        newRole.description,
        newRole.priority
      );

      toast({
        title: "Success",
        description: `Role "${newRole.display_name}" created successfully`,
      });

      setIsCreatingRole(false);
      setNewRole({ name: '', display_name: '', description: '', priority: 10 });
      // Note: createRole already calls loadRoles internally
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to create role",
        variant: "destructive"
      });
    }
  };

  const handleDeleteRole = async (roleId: string, roleName: string) => {
    if (!confirm(`Are you sure you want to delete the role "${roleName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteRole(roleId);
      toast({
        title: "Success",
        description: `Role "${roleName}" deleted successfully`,
      });
      // Note: deleteRole already calls loadRoles internally
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to delete role",
        variant: "destructive"
      });
    }
  };

  const handleUpdateRole = async () => {
    if (!editingRole) return;

    try {
      const result = await updateRole(editingRole.id, {
        name: editingRole.name,
        display_name: editingRole.display_name,
        description: editingRole.description,
        priority: editingRole.priority
      });

      if (result.success) {
        toast({
          title: "Success",
          description: `Role "${editingRole.display_name}" updated successfully`,
        });
        setEditingRole(null);
        // Note: updateRole already calls loadRoles internally
      } else {
        throw new Error(result.error || 'Failed to update role');
      }
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to update role",
        variant: "destructive"
      });
    }
  };

  if (!canManageRoles) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-6 py-8">
          <Alert className="max-w-md mx-auto">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You don't have permission to manage roles.
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
            <Shield className="h-8 w-8" />
            Role Management
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage user roles, permissions, and access limits
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>System Roles</CardTitle>
                <Dialog open={isCreatingRole} onOpenChange={setIsCreatingRole}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Role
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Role</DialogTitle>
                      <DialogDescription>
                        Define a new role with custom permissions and limits
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Role Name (lowercase, no spaces)</Label>
                        <Input
                          value={newRole.name}
                          onChange={(e) => setNewRole({ ...newRole, name: e.target.value.toLowerCase().replace(/\s/g, '_') })}
                          placeholder="e.g., premium_user"
                        />
                      </div>
                      <div>
                        <Label>Display Name</Label>
                        <Input
                          value={newRole.display_name}
                          onChange={(e) => setNewRole({ ...newRole, display_name: e.target.value })}
                          placeholder="e.g., Premium User"
                        />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Input
                          value={newRole.description}
                          onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                          placeholder="Role description..."
                        />
                      </div>
                      <div>
                        <Label>Priority (higher = more important)</Label>
                        <Input
                          type="number"
                          value={newRole.priority}
                          onChange={(e) => setNewRole({ ...newRole, priority: parseInt(e.target.value) || 10 })}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsCreatingRole(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleCreateRole}>
                        Create Role
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  {roles.map((role) => (
                    <Card key={role.id}>
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                              {role.display_name}
                              {['admin', 'default'].includes(role.role_name) && (
                                <Badge variant="secondary">Built-in</Badge>
                              )}
                              <Badge variant="outline">Priority: {role.priority}</Badge>
                            </CardTitle>
                            <CardDescription>{role.role_name}</CardDescription>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingRole(role)}
                              title="Edit role details"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingLimits(role)}
                            >
                              <Settings className="h-4 w-4 mr-1" />
                              Limits
                            </Button>
                            {!['admin', 'default'].includes(role.role_name) && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeleteRole(role.id, role.display_name)}
                                title="Delete custom role"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Limits Display */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <Label className="text-xs">Parallel Analysis</Label>
                            <p className="text-lg font-semibold">{role.max_parallel_analysis}</p>
                          </div>
                          <div>
                            <Label className="text-xs">Watchlist Stocks</Label>
                            <p className="text-lg font-semibold">{role.max_watchlist_stocks}</p>
                          </div>
                          <div>
                            <Label className="text-xs">Rebalance Stocks</Label>
                            <p className="text-lg font-semibold">{role.max_rebalance_stocks}</p>
                          </div>
                          <div>
                            <Label className="text-xs">Schedule Resolution</Label>
                            <p className="text-sm font-semibold">{role.schedule_resolution}</p>
                          </div>
                        </div>

                        {/* Access Flags */}
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={role.rebalance_access ? "default" : "secondary"}>
                            Rebalance: {role.rebalance_access ? <Check className="h-3 w-3 ml-1" /> : <X className="h-3 w-3 ml-1" />}
                          </Badge>
                          <Badge variant={role.opportunity_agent_access ? "default" : "secondary"}>
                            Opportunity Agent: {role.opportunity_agent_access ? <Check className="h-3 w-3 ml-1" /> : <X className="h-3 w-3 ml-1" />}
                          </Badge>
                          <Badge variant={role.additional_provider_access ? "default" : "secondary"}>
                            Additional Providers: {role.additional_provider_access ? <Check className="h-3 w-3 ml-1" /> : <X className="h-3 w-3 ml-1" />}
                          </Badge>
                          <Badge variant={role.enable_live_trading ? "default" : "secondary"}>
                            Live Trading: {role.enable_live_trading ? <Check className="h-3 w-3 ml-1" /> : <X className="h-3 w-3 ml-1" />}
                          </Badge>
                          <Badge variant={role.enable_auto_trading ? "default" : "secondary"}>
                            Auto Trading: {role.enable_auto_trading ? <Check className="h-3 w-3 ml-1" /> : <X className="h-3 w-3 ml-1" />}
                          </Badge>
                        </div>

                        {/* Permissions */}
                        <div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (expandedPermissions.includes(role.id)) {
                                setExpandedPermissions(expandedPermissions.filter(id => id !== role.id));
                              } else {
                                setExpandedPermissions([...expandedPermissions, role.id]);
                              }
                            }}
                            className="w-full justify-between"
                          >
                            <span>Permissions ({role.permissions?.length || 0})</span>
                            {expandedPermissions.includes(role.id) ?
                              <ChevronUp className="h-4 w-4" /> :
                              <ChevronDown className="h-4 w-4" />
                            }
                          </Button>

                          {expandedPermissions.includes(role.id) && (
                            <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                              {allPermissions.map(perm => {
                                const hasPermission = role.permissions?.includes(perm) || false;
                                return (
                                  <div key={perm} className="flex items-center space-x-2">
                                    <Switch
                                      checked={hasPermission}
                                      onCheckedChange={() => handleTogglePermission(role.id, perm, hasPermission)}
                                    />
                                    <Label className="text-xs">{permissionLabels[perm] || perm}</Label>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Edit Role Dialog */}
        {editingRole && (
          <Dialog open={!!editingRole} onOpenChange={() => setEditingRole(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Role: {editingRole.display_name}</DialogTitle>
                <DialogDescription>
                  {['admin', 'default'].includes(editingRole.role_name)
                    ? 'Built-in roles can only have their display name and description edited.'
                    : 'Update role details'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {!['admin', 'default'].includes(editingRole.role_name) && (
                  <div>
                    <Label>Role Name (lowercase, no spaces)</Label>
                    <Input
                      value={editingRole.name}
                      onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value.toLowerCase().replace(/\s/g, '_') })}
                      placeholder="e.g., premium_user"
                    />
                  </div>
                )}
                <div>
                  <Label>Display Name</Label>
                  <Input
                    value={editingRole.display_name}
                    onChange={(e) => setEditingRole({ ...editingRole, display_name: e.target.value })}
                    placeholder="e.g., Premium User"
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    value={editingRole.description || ''}
                    onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })}
                    placeholder="Role description..."
                  />
                </div>
                <div>
                  <Label>Priority (higher = more important)</Label>
                  <Input
                    type="number"
                    value={editingRole.priority}
                    onChange={(e) => setEditingRole({ ...editingRole, priority: parseInt(e.target.value) || 10 })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingRole(null)}>
                  Cancel
                </Button>
                <Button onClick={handleUpdateRole}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Edit Limits Dialog */}
        {editingLimits && (
          <Dialog open={!!editingLimits} onOpenChange={() => setEditingLimits(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Role Limits: {editingLimits.display_name}</DialogTitle>
                <DialogDescription>
                  Configure access limits and permissions for this role
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6">
                {/* Numeric Limits */}
                <div className="space-y-4">
                  <div>
                    <Label>Max Parallel Analysis: {editingLimits.max_parallel_analysis}</Label>
                    <Slider
                      value={[editingLimits.max_parallel_analysis]}
                      onValueChange={(v) => setEditingLimits({ ...editingLimits, max_parallel_analysis: v[0] })}
                      min={1}
                      max={10}
                      step={1}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Max Watchlist Stocks: {editingLimits.max_watchlist_stocks}</Label>
                    <Slider
                      value={[editingLimits.max_watchlist_stocks]}
                      onValueChange={(v) => setEditingLimits({ ...editingLimits, max_watchlist_stocks: v[0] })}
                      min={0}
                      max={30}
                      step={1}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Max Stocks per Rebalance: {editingLimits.max_rebalance_stocks}</Label>
                    <Slider
                      value={[editingLimits.max_rebalance_stocks]}
                      onValueChange={(v) => setEditingLimits({ ...editingLimits, max_rebalance_stocks: v[0] })}
                      min={0}
                      max={20}
                      step={1}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Max Scheduled Rebalances: {editingLimits.max_scheduled_rebalances}</Label>
                    <Slider
                      value={[editingLimits.max_scheduled_rebalances]}
                      onValueChange={(v) => setEditingLimits({ ...editingLimits, max_scheduled_rebalances: v[0] })}
                      min={0}
                      max={5}
                      step={1}
                      className="mt-2"
                    />
                  </div>
                </div>

                {/* Schedule Resolution */}
                <div className="space-y-2">
                  <Label>Schedule Resolution</Label>
                  <div className="flex gap-4">
                    {['Day', 'Week', 'Month'].map((resolution) => {
                      const resolutions = editingLimits.schedule_resolution?.split(',') || [];
                      const isChecked = resolutions.includes(resolution);
                      return (
                        <div key={resolution} className="flex items-center space-x-2">
                          <Checkbox
                            id={`resolution-${resolution}`}
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              let newResolutions = [...resolutions];
                              if (checked) {
                                if (!newResolutions.includes(resolution)) {
                                  newResolutions.push(resolution);
                                }
                              } else {
                                newResolutions = newResolutions.filter(r => r !== resolution);
                              }
                              // Ensure at least one resolution is selected
                              if (newResolutions.length === 0) {
                                newResolutions = ['Month'];
                              }
                              setEditingLimits({ 
                                ...editingLimits, 
                                schedule_resolution: newResolutions.join(',') 
                              });
                            }}
                          />
                          <Label htmlFor={`resolution-${resolution}`}>{resolution}</Label>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Select which schedule intervals this role can access
                  </p>
                </div>

                {/* Boolean Flags */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Rebalance Access</Label>
                    <Switch
                      checked={editingLimits.rebalance_access}
                      onCheckedChange={(v) => setEditingLimits({ ...editingLimits, rebalance_access: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Opportunity Agent Access</Label>
                    <Switch
                      checked={editingLimits.opportunity_agent_access}
                      onCheckedChange={(v) => setEditingLimits({ ...editingLimits, opportunity_agent_access: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Additional Provider Access</Label>
                    <Switch
                      checked={editingLimits.additional_provider_access}
                      onCheckedChange={(v) => setEditingLimits({ ...editingLimits, additional_provider_access: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Enable Live Trading</Label>
                      <p className="text-sm text-muted-foreground">Allow users to execute real trades (vs paper trading)</p>
                    </div>
                    <Switch
                      checked={editingLimits.enable_live_trading ?? false}
                      onCheckedChange={(v) => setEditingLimits({ ...editingLimits, enable_live_trading: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Enable Auto Trading</Label>
                      <p className="text-sm text-muted-foreground">Allow users to enable automatic trade execution</p>
                    </div>
                    <Switch
                      checked={editingLimits.enable_auto_trading ?? false}
                      onCheckedChange={(v) => setEditingLimits({ ...editingLimits, enable_auto_trading: v })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingLimits(null)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveLimits}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </main>
    </div>
  );
}

