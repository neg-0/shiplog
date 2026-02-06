# UI Refactor TODO

## Created Components
- `src/components/Dialog.tsx` - Shared dialog components (Dialog, ConfirmDialog, AlertDialog)
- `src/components/DashboardLayout.tsx` - Shared sidebar navigation

## Changes Needed

### 1. Update all dashboard pages to use DashboardLayout
Replace the duplicated sidebar code in each page with:
```tsx
import { DashboardLayout } from '@/components/DashboardLayout';

// In the component, wrap content with:
<DashboardLayout user={user}>
  {/* page content */}
</DashboardLayout>
```

Pages to update:
- [ ] `dashboard/page.tsx`
- [ ] `dashboard/activity/page.tsx`
- [ ] `dashboard/settings/page.tsx`
- [ ] `dashboard/organizations/page.tsx`
- [ ] `dashboard/organizations/[id]/page.tsx`
- [ ] `dashboard/repos/[id]/page.tsx`
- [ ] `dashboard/repos/connect/page.tsx`
- [ ] `dashboard/releases/[id]/page.tsx`

### 2. Disable "Generate API Key" button (settings/page.tsx)
```tsx
<button 
  disabled
  className="... opacity-50 cursor-not-allowed"
>
  Generate API Key
</button>
<p className="text-sm text-navy-500 mt-2">Coming soon</p>
```

### 3. Add changelog link on repo page (repos/[id]/page.tsx)
Next to "View on GitHub" button, add:
```tsx
<Link 
  href={`/c/${repo.slug || repo.fullName.replace('/', '-')}`}
  className="..."
>
  <ExternalLink className="w-4 h-4" />
  View Changelog
</Link>
```

### 4. Fix duplicate plus in "Add Custom Audience" (repos/[id]/page.tsx)
Change from:
```tsx
{isPro ? <Plus className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
+ Add Custom Audience
```
To:
```tsx
{isPro ? <Plus className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
Add Custom Audience
```

### 5. Replace confirm() with ConfirmDialog (repos/[id]/page.tsx)
```tsx
import { ConfirmDialog } from '@/components/Dialog';

const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

// Replace confirm() call with:
<ConfirmDialog
  isOpen={showDisconnectDialog}
  onClose={() => setShowDisconnectDialog(false)}
  onConfirm={handleDisconnect}
  title="Disconnect Repository"
  message="This will remove the webhook and delete all release data. This action cannot be undone."
  confirmText="Disconnect"
  variant="danger"
  loading={disconnecting}
/>
```

### 6. Replace alert() with AlertDialog (settings/page.tsx)
```tsx
import { AlertDialog } from '@/components/Dialog';

const [alertDialog, setAlertDialog] = useState<{open: boolean; title: string; message: string; variant: 'success' | 'error'}>({
  open: false, title: '', message: '', variant: 'info'
});

// Replace alert('Profile updated') with:
setAlertDialog({open: true, title: 'Success', message: 'Profile updated successfully', variant: 'success'});
```

### 7. Show trial expiration date (settings/page.tsx)
```tsx
{user.subscriptionStatus === 'trialing' && user.trialEndsAt && (
  <span>Trial until {new Date(user.trialEndsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
)}
```

Note: May need to add `trialEndsAt` to the User type in `lib/api.ts` if not already there.
