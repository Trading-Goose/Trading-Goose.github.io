// Permissions that are actually used in the system
export const ALL_PERMISSIONS = [
  'admin.access',         // Access admin pages
  'invitations.create',   // Create and send invitations
  'users.update',         // Manage users
  'roles.assign'          // Assign roles to users
];

// Friendly names for permissions
export const PERMISSION_LABELS: Record<string, string> = {
  'admin.access': 'Admin Panel Access',
  'invitations.create': 'Send Invitations',
  'users.update': 'Manage Users',
  'roles.assign': 'Assign Roles'
};

// Schedule resolution options
export const SCHEDULE_RESOLUTIONS = ['Day', 'Week', 'Month'];

// Optimization modes
export const OPTIMIZATION_MODES = ['speed', 'balanced'];

// Default values for new role
export const DEFAULT_NEW_ROLE = {
  name: '',
  display_name: '',
  description: '',
  priority: 10
};