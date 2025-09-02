import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useRoleManagement, type RoleWithLimits } from "@/hooks/useRoleManagement";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, AlertCircle, Loader2 } from "lucide-react";
import { NewRoleForm, ExtendedRoleData } from "./types";
import { DEFAULT_NEW_ROLE } from "./constants";
import { useRoleActions } from "./hooks/useRoleActions";
import RoleCard from "./components/RoleCard";
import CreateRoleDialog from "./dialogs/CreateRoleDialog";
import EditRoleDialog from "./dialogs/EditRoleDialog";
import EditLimitsDialog from "./dialogs/EditLimitsDialog";

export default function AdminRoleManager() {
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

  const [editingLimits, setEditingLimits] = useState<RoleWithLimits | null>(null);
  const [editingRole, setEditingRole] = useState<RoleWithLimits | null>(null);
  const [editingRoleExtended, setEditingRoleExtended] = useState<ExtendedRoleData | null>(null);
  const [expandedPermissions, setExpandedPermissions] = useState<string[]>([]);
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [newRole, setNewRole] = useState<NewRoleForm>(DEFAULT_NEW_ROLE);

  const {
    handleSaveLimits,
    handleTogglePermission,
    handleCreateRole,
    handleDeleteRole,
    handleUpdateRole
  } = useRoleActions({
    updateRoleLimits,
    updateRole,
    toggleRolePermission,
    createRole,
    deleteRole,
    refresh
  });

  const handleSaveLimitsWrapper = async () => {
    if (!editingLimits) return;
    const success = await handleSaveLimits(editingLimits);
    if (success) {
      setEditingLimits(null);
    }
  };

  const handleCreateRoleWrapper = async () => {
    const success = await handleCreateRole(newRole);
    if (success) {
      setIsCreatingRole(false);
      setNewRole(DEFAULT_NEW_ROLE);
    }
  };

  const handleUpdateRoleWrapper = async () => {
    if (!editingRole || !editingRoleExtended) return;
    const success = await handleUpdateRole(editingRole, editingRoleExtended);
    if (success) {
      setEditingRole(null);
      setEditingRoleExtended(null);
    }
  };

  const togglePermissionsExpanded = (roleId: string) => {
    if (expandedPermissions.includes(roleId)) {
      setExpandedPermissions(expandedPermissions.filter(id => id !== roleId));
    } else {
      setExpandedPermissions([...expandedPermissions, roleId]);
    }
  };

  if (!canManageRoles) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-6 py-8">
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
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-6 py-8">
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
                <CreateRoleDialog
                  isOpen={isCreatingRole}
                  onOpenChange={setIsCreatingRole}
                  newRole={newRole}
                  onUpdateNewRole={setNewRole}
                  onCreateRole={handleCreateRoleWrapper}
                />
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
                    <RoleCard
                      key={role.id}
                      role={role}
                      isPermissionsExpanded={expandedPermissions.includes(role.id)}
                      onTogglePermissions={() => togglePermissionsExpanded(role.id)}
                      onEditRole={(role, extended) => {
                        setEditingRole(role);
                        setEditingRoleExtended(extended);
                      }}
                      onEditLimits={setEditingLimits}
                      onDeleteRole={handleDeleteRole}
                      onTogglePermission={handleTogglePermission}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <EditRoleDialog
          editingRole={editingRole}
          editingRoleExtended={editingRoleExtended}
          onClose={() => {
            setEditingRole(null);
            setEditingRoleExtended(null);
          }}
          onUpdateRole={setEditingRole}
          onUpdateExtended={setEditingRoleExtended}
          onSave={handleUpdateRoleWrapper}
        />

        <EditLimitsDialog
          editingLimits={editingLimits}
          onClose={() => setEditingLimits(null)}
          onUpdateLimits={setEditingLimits}
          onSave={handleSaveLimitsWrapper}
        />
      </main>

      <Footer />
    </div>
  );
}