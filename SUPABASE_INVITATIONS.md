# Supabase Auth Invitation System

## Overview
TradingGoose now uses Supabase's built-in authentication invitation system instead of custom invite codes. This provides a more secure and seamless user experience.

## How It Works

### Admin Side
1. **Admin Interface**: Visit `/admin/invitations` (requires admin email)
2. **Send Invitation**: Enter user's email address and optional name
3. **Automatic Email**: Supabase automatically sends invitation email with magic link
4. **No Manual Codes**: No need to generate or share invite codes

### User Side
1. **Receives Email**: User gets invitation email from Supabase
2. **Clicks Magic Link**: Link automatically authenticates the user
3. **Instant Access**: User lands on dashboard, already signed in
4. **Profile Setup**: Can optionally set password and complete profile

## Admin Access

### Current Setup
- Simple email-based admin check in `AdminInvitations.tsx`
- Admins: emails ending with `@your-domain.com` or specific admin emails
- **Production**: Replace with proper role-based access control

### Sending Invitations
```typescript
// Programmatic invitation
const result = await supabaseHelpers.inviteUserByEmail(
  'user@example.com',
  { name: 'John Doe', invited_by: 'Admin Name' }
);
```

### Via Admin Interface
1. Navigate to `/admin/invitations`
2. Enter email and optional name
3. Click "Send Invitation"
4. User receives email immediately

## Configuration

### Supabase Dashboard Settings
1. **Authentication > Settings**
2. **Disable Public Registration** (for invite-only)
3. **Enable Email Confirmations**
4. **Customize Email Templates** (optional)

### Email Templates
- **Invitation Subject**: "You're invited to join [AppName]"
- **Magic Link**: Automatically included by Supabase
- **Redirect URL**: Points to `/dashboard` after successful authentication

## Technical Details

### Database Changes
- ✅ Removed custom `invitations` table
- ✅ Removed custom invite functions
- ✅ Removed `invite_code` from profiles
- ✅ Uses Supabase's built-in `auth.users` system

### Code Changes
- ✅ Removed invite code validation logic
- ✅ Simplified registration form (no invite field)
- ✅ Added admin invitation interface
- ✅ Updated auth flow to handle invitations

### Environment Variables
- ❌ `VITE_INVITE_ONLY` (no longer needed)
- ✅ Configure via Supabase Dashboard instead

## Security Features

### Built-in Protection
- **Secure Tokens**: Cryptographically secure magic links
- **Automatic Expiry**: Links expire after 24 hours
- **One-time Use**: Links can't be reused
- **Email Verification**: Ensures email ownership

### Admin Controls
- **Role-based Access**: Only admins can send invitations
- **Audit Trail**: Supabase tracks invitation history
- **Resend Capability**: Can re-invite if link expires

## Migration Notes

### From Custom System
- Old invite codes no longer work
- Users with pending custom invites need new Supabase invitations
- Database cleaned up automatically via migration

### Backward Compatibility
- Existing users unaffected
- Registration still works for non-invited users (if public registration enabled)
- Smooth transition with no data loss

## Testing

### Development Flow
1. Access admin interface at `/admin/invitations`
2. Send invitation to test email
3. Check email for magic link
4. Click link and verify automatic authentication
5. Confirm user lands on dashboard

### Production Deployment
1. Run database migration: `45_remove_custom_invitations.sql`
2. Configure Supabase auth settings
3. Update admin access control for your domain
4. Test invitation flow thoroughly

## Troubleshooting

### Common Issues
- **"Access Denied"**: Update admin email check in `AdminInvitations.tsx`
- **Email Not Received**: Check Supabase email configuration
- **Link Expired**: Resend invitation from admin interface
- **Wrong Redirect**: Verify redirect URL in invitation call

### Support
- Check Supabase Auth logs for delivery status
- Monitor user sign-in events in Supabase dashboard
- Review email templates if customization needed

## Benefits

### For Admins
- ✅ No manual code generation
- ✅ Automatic email delivery
- ✅ Built-in tracking and analytics
- ✅ Professional email templates

### For Users
- ✅ No codes to enter
- ✅ One-click authentication
- ✅ Seamless onboarding experience
- ✅ Professional invitation emails

### For Developers
- ✅ Less code to maintain
- ✅ Better security by default
- ✅ Leverages Supabase's proven system
- ✅ Easier to test and debug