import { useRef, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { User, Phone, Mail, ShieldCheck, Loader2, Check, Camera, X, Pencil, Lock, KeyRound, Eye, EyeOff, ChevronDown } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile details start in read-only "view" mode after a save so the user
  // can't accidentally edit fields just by tapping them. Clicking the Edit
  // button enters edit mode; saving (or cancelling) returns to view mode.
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState((user as any)?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState<string>((user as any)?.avatarUrl ?? "");
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Change-password card state. Kept separate from the details form so a
  // password change never accidentally fires when the user only meant to
  // update their name/phone, and vice versa.
  // The card is collapsed by default — only the trigger button is visible
  // until the user explicitly opts into changing their password. This keeps
  // a high-stakes credential field out of the way during normal profile
  // edits and makes accidental input on these inputs impossible.
  const [passwordExpanded, setPasswordExpanded] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);

  // Single helper to fully reset the change-password card to its initial
  // (collapsed, empty) state. Used after a successful change and on Cancel.
  const resetPasswordForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setPasswordExpanded(false);
  };

  const isDirty =
    name.trim() !== (user?.name ?? "").trim() ||
    phone.trim() !== ((user as any)?.phone ?? "").trim();

  const enterEditMode = () => {
    // Re-seed the local form fields from the freshest user data so the form
    // never shows a stale value left over from a previous edit session.
    setName(user?.name ?? "");
    setPhone((user as any)?.phone ?? "");
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setName(user?.name ?? "");
    setPhone((user as any)?.phone ?? "");
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Name cannot be empty", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.error ?? "Failed to update profile", variant: "destructive" });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      // Lock the form back into read-only view so subsequent taps don't
      // accidentally mutate the just-saved values.
      setIsEditing(false);
      toast({ title: "Profile updated!" });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ title: "Please fill in all password fields", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "New password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "New passwords do not match", variant: "destructive" });
      return;
    }
    if (currentPassword === newPassword) {
      toast({ title: "New password must be different from current", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: data.error ?? "Failed to change password", variant: "destructive" });
        return;
      }
      // Clear inputs, collapse the card, and flash success — keeps the user
      // on the same page so they can confirm the action worked without being
      // booted back to login. Collapsing back to the trigger button matches
      // the "expand only when needed" pattern set by the initial state.
      resetPasswordForm();
      setPasswordChanged(true);
      setTimeout(() => setPasswordChanged(false), 3000);
      toast({ title: "Password changed successfully!" });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleAvatarFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Image must be under 10 MB", variant: "destructive" });
      return;
    }

    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const uploadRes = await fetch(`${BASE_URL}/api/upload/image`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!uploadRes.ok) {
        const data = await uploadRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Upload failed");
      }
      const { url } = await uploadRes.json();
      const fullUrl = `${BASE_URL}${url}`;

      const patchRes = await fetch(`${API_BASE}/api/auth/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: fullUrl }),
      });
      if (!patchRes.ok) {
        const data = await patchRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save photo");
      }

      setAvatarUrl(fullUrl);
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: "Profile photo updated!" });
    } catch (err: any) {
      toast({ title: err.message ?? "Upload failed", variant: "destructive" });
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarUploading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: "" }),
      });
      if (!res.ok) throw new Error("Failed to remove photo");
      setAvatarUrl("");
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: "Profile photo removed" });
    } catch (err: any) {
      toast({ title: err.message ?? "Failed to remove photo", variant: "destructive" });
    } finally {
      setAvatarUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-10 max-w-2xl">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
          <p className="text-muted-foreground mt-1">Manage your personal information</p>
        </div>

        {/* Avatar + summary card */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-6 flex items-center gap-5">

          {/* Clickable avatar */}
          <div className="relative flex-shrink-0 group">
            <div
              className="w-20 h-20 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center cursor-pointer ring-2 ring-border group-hover:ring-primary/50 transition-all"
              onClick={() => !avatarUploading && fileInputRef.current?.click()}
            >
              {avatarUploading ? (
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
              ) : avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile photo"
                  className="w-full h-full object-cover"
                  onError={() => setAvatarUrl("")}
                />
              ) : (
                <span className="text-3xl font-bold text-primary">
                  {(user?.name ?? "?").charAt(0).toUpperCase()}
                </span>
              )}

              {/* Hover overlay */}
              {!avatarUploading && (
                <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                  <Camera className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
            </div>

            {/* Remove button (shown when avatar exists) */}
            {avatarUrl && !avatarUploading && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); handleRemoveAvatar(); }}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm hover:bg-destructive/80 transition-colors cursor-pointer z-10"
                title="Remove photo"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-semibold text-lg text-foreground truncate">{user?.name}</p>
            <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs text-primary font-medium capitalize">{(user as any)?.role ?? "user"}</span>
            </div>
            <button
              type="button"
              onClick={() => !avatarUploading && fileInputRef.current?.click()}
              disabled={avatarUploading}
              className="mt-2 text-xs text-primary hover:underline disabled:opacity-50 cursor-pointer"
            >
              {avatarUploading ? "Uploading…" : avatarUrl ? "Change photo" : "Upload photo"}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            className="hidden"
            onChange={e => handleAvatarFile(e.target.files?.[0])}
          />
        </div>

        {/* Profile details — view-by-default, edit-on-demand. The card title
            switches between "Your Details" (locked) and "Edit Details"
            (unlocked) so it's always obvious which mode the user is in. */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              {isEditing ? "Edit Details" : "Your Details"}
            </h2>
            {!isEditing && (
              <button
                type="button"
                onClick={enterEditMode}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer px-2.5 py-1 rounded-md hover:bg-primary/10"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
            )}
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-name" className="flex items-center gap-1.5 text-sm font-medium">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
              Full Name
            </Label>
            <Input
              id="profile-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your full name"
              readOnly={!isEditing}
              tabIndex={isEditing ? 0 : -1}
              className={
                isEditing
                  ? "bg-background border-border"
                  : "bg-muted/40 border-border text-foreground cursor-default focus-visible:ring-0 focus-visible:ring-offset-0"
              }
              onKeyDown={e => { if (e.key === "Enter" && isEditing) handleSave(); }}
            />
          </div>

          {/* Email (always read-only — managed by auth provider) */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Mail className="w-3.5 h-3.5" />
              Email Address
              <span className="text-[10px] ml-1 bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-normal">Read-only</span>
            </Label>
            <Input
              value={user?.email ?? ""}
              readOnly
              disabled
              className="bg-muted border-border text-muted-foreground cursor-not-allowed"
            />
          </div>

          {/* Mobile */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-phone" className="flex items-center gap-1.5 text-sm font-medium">
              <Phone className="w-3.5 h-3.5 text-muted-foreground" />
              Mobile Number
            </Label>
            <Input
              id="profile-phone"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+91 9876543210"
              readOnly={!isEditing}
              tabIndex={isEditing ? 0 : -1}
              className={
                isEditing
                  ? "bg-background border-border"
                  : "bg-muted/40 border-border text-foreground cursor-default focus-visible:ring-0 focus-visible:ring-offset-0"
              }
              type="tel"
              onKeyDown={e => { if (e.key === "Enter" && isEditing) handleSave(); }}
            />
            <p className="text-[11px] text-muted-foreground">Used for GST invoices and support contact</p>
          </div>

          {/* Action buttons — only shown while editing. In view mode the
              fields are locked and the only affordance is the Edit button
              in the card header. */}
          {isEditing && (
            <div className="flex items-center gap-3 pt-1">
              <Button
                onClick={handleSave}
                disabled={saving || !isDirty}
                className="gap-2 bg-primary hover:bg-primary/90 cursor-pointer"
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
                ) : saved ? (
                  <><Check className="w-4 h-4" />Saved!</>
                ) : (
                  "Save Changes"
                )}
              </Button>
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Saved confirmation chip — appears briefly after a successful
              save in view mode so the user gets feedback even though the
              Save button has already disappeared. */}
          {!isEditing && saved && (
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-500">
              <Check className="w-3.5 h-3.5" />
              Saved!
            </div>
          )}
        </div>

        {/* Change password — collapsible card. Default state shows only the
            header + a trigger button, so the credential-mutating fields stay
            out of the way during normal profile edits. Expanding requires an
            explicit click; collapsing happens automatically after a
            successful change or via the in-form Cancel button. */}
        <div className="bg-card border border-border rounded-2xl p-6 mt-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground truncate">
                Change Password
              </h2>
            </div>
            {/* Persistent disclosure toggle. Stays visible in both states so
                screen-reader / keyboard users always have a single, predictable
                control for both expanding and collapsing the panel. */}
            <button
              type="button"
              onClick={() => (passwordExpanded ? resetPasswordForm() : setPasswordExpanded(true))}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer px-2.5 py-1 rounded-md hover:bg-primary/10 flex-shrink-0"
              aria-expanded={passwordExpanded}
              aria-controls="change-password-panel"
            >
              {passwordExpanded ? "Collapse" : "Change Password"}
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${passwordExpanded ? "rotate-180" : ""}`}
              />
            </button>
          </div>

          {/* Collapsed-state hint or last-update confirmation. */}
          {!passwordExpanded && (
            passwordChanged ? (
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-500">
                <Check className="w-3.5 h-3.5" />
                Password updated successfully
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Update your account password. Your current password will be required.
              </p>
            )
          )}

          {/* Expanded panel — full form. Rendered only while
              `passwordExpanded` is true; field values are explicitly cleared
              by `resetPasswordForm()` on Cancel and on successful change. */}
          {passwordExpanded && (
          <div id="change-password-panel" className="space-y-5">
          <p className="text-sm text-muted-foreground">
            For your security, enter your current password to set a new one.
          </p>

          {/* Current password */}
          <div className="space-y-1.5">
            <Label htmlFor="current-password" className="flex items-center gap-1.5 text-sm font-medium">
              <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
              Current Password
            </Label>
            <div className="relative">
              <Input
                id="current-password"
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Enter your current password"
                className="bg-background border-border pr-10"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={showCurrent ? "Hide password" : "Show password"}
                aria-pressed={showCurrent}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {/* Forgot password — opens the public reset flow. We send the
                user to /forgot-password instead of inline-emailing here so
                there is one canonical reset path the entire app shares. */}
            <div className="flex justify-end pt-0.5">
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          {/* New password */}
          <div className="space-y-1.5">
            <Label htmlFor="new-password" className="flex items-center gap-1.5 text-sm font-medium">
              <Lock className="w-3.5 h-3.5 text-muted-foreground" />
              New Password
            </Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="bg-background border-border pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNew(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={showNew ? "Hide password" : "Show password"}
                aria-pressed={showNew}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm new password */}
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password" className="flex items-center gap-1.5 text-sm font-medium">
              <Lock className="w-3.5 h-3.5 text-muted-foreground" />
              Confirm New Password
            </Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter the new password"
                className="bg-background border-border pr-10"
                autoComplete="new-password"
                onKeyDown={e => { if (e.key === "Enter") handleChangePassword(); }}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={showConfirm ? "Hide password" : "Show password"}
                aria-pressed={showConfirm}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {/* Inline mismatch hint — fires only once the user has typed in
                both fields so we don't flag empty-state as an error. */}
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="text-[11px] text-destructive">Passwords do not match</p>
            )}
          </div>

          {/* Action row — Update + Cancel. Cancel collapses the panel and
              clears any half-typed credentials so they don't sit in memory. */}
          <div className="flex items-center gap-3 pt-1">
            <Button
              onClick={handleChangePassword}
              disabled={
                changingPassword ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword ||
                newPassword !== confirmPassword
              }
              className="gap-2 bg-primary hover:bg-primary/90 cursor-pointer"
            >
              {changingPassword ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Updating…</>
              ) : (
                "Update Password"
              )}
            </Button>
            <button
              type="button"
              onClick={resetPasswordForm}
              disabled={changingPassword}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          </div>
          )}
        </div>

      </div>
    </div>
  );
}
