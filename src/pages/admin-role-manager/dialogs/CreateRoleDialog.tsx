import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { NewRoleForm } from "../types";

interface CreateRoleDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  newRole: NewRoleForm;
  onUpdateNewRole: (role: NewRoleForm) => void;
  onCreateRole: () => Promise<void>;
}

export default function CreateRoleDialog({
  isOpen,
  onOpenChange,
  newRole,
  onUpdateNewRole,
  onCreateRole
}: CreateRoleDialogProps) {
  const handleCreate = async () => {
    await onCreateRole();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
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
              onChange={(e) => onUpdateNewRole({ 
                ...newRole, 
                name: e.target.value.toLowerCase().replace(/\s/g, '_') 
              })}
              placeholder="e.g., premium_user"
            />
          </div>
          <div>
            <Label>Display Name</Label>
            <Input
              value={newRole.display_name}
              onChange={(e) => onUpdateNewRole({ 
                ...newRole, 
                display_name: e.target.value 
              })}
              placeholder="e.g., Premium User"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Input
              value={newRole.description}
              onChange={(e) => onUpdateNewRole({ 
                ...newRole, 
                description: e.target.value 
              })}
              placeholder="Role description..."
            />
          </div>
          <div>
            <Label>Priority (higher = more important)</Label>
            <Input
              type="number"
              value={newRole.priority}
              onChange={(e) => onUpdateNewRole({ 
                ...newRole, 
                priority: parseInt(e.target.value) || 10 
              })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate}>
            Create Role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}