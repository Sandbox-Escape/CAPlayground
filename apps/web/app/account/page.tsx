"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSupabaseBrowserClient } from "@/lib/supabase"
import { ArrowLeft, Link as LinkIcon, Unlink } from "lucide-react"
import { Separator } from "@/components/ui/separator"

export default function AccountPage() {
  const supabase = getSupabaseBrowserClient()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string>("")
  const [newEmail, setNewEmail] = useState<string>("")
  const [username, setUsername] = useState<string>("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<"menu" | "email" | "username" | "password" | "linked-accounts">("menu")
  const [canChangeEmail, setCanChangeEmail] = useState<boolean>(true)
  const [linkedIdentities, setLinkedIdentities] = useState<any[]>([])
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return
      const u = data.user
      if (!u) {
        window.location.href = "/signin"
        return
      }
      setUserId(u.id)
      setEmail(u.email ?? "")
      const isGoogleProvider = (u as any).app_metadata?.provider === "google" ||
        Array.isArray((u as any).identities) && (u as any).identities.some((i: any) => i?.provider === "google")
      setCanChangeEmail(!isGoogleProvider)
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", u.id)
          .maybeSingle()
        if (profile?.username) setUsername(profile.username)
      } catch {}
      await loadIdentities()
      setLoading(false)
    }
    load()
  }, [supabase])

  async function loadIdentities() {
    try {
      const { data, error } = await supabase.auth.getUserIdentities()
      if (!error && data?.identities) {
        setLinkedIdentities(data.identities)
      }
    } catch (e) {
      console.error('Failed to load identities:', e)
    }
  }

  async function linkProvider(provider: 'google' | 'github' | 'discord') {
    setMessage(null)
    setError(null)
    setLinkingProvider(provider)
    try {
      const origin = window.location.origin
      const { data, error } = await supabase.auth.linkIdentity({
        provider,
        options: {
          redirectTo: `${origin}/account?linked=${provider}`
        }
      })
      if (error) throw error
    } catch (e: any) {
      setError(e.message ?? `Failed to link ${provider} account`)
      setLinkingProvider(null)
    }
  }

  async function unlinkProvider(identity: any) {
    const providerName = identity.provider
    const confirmed = window.confirm(`Are you sure you want to unlink your ${providerName} account?`)
    if (!confirmed) return
    
    setMessage(null)
    setError(null)
    
    if (linkedIdentities.length <= 1) {
      setError("You cannot unlink your only authentication method. Please link another provider first.")
      return
    }
    
    try {
      const { error } = await supabase.auth.unlinkIdentity(identity)
      if (error) throw error
      setMessage(`Successfully unlinked ${providerName} account`)
      await loadIdentities()
    } catch (e: any) {
      setError(e.message ?? `Failed to unlink ${providerName} account`)
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const linked = params.get('linked')
    if (linked) {
      setMessage(`Successfully linked ${linked} account!`)
      loadIdentities()
      window.history.replaceState({}, '', '/account')
    }
  }, [])

  async function saveUsername() {
    if (!userId) return
    setMessage(null)
    setError(null)
    try {
      const { error } = await supabase.from("profiles").upsert({ id: userId, username })
      if (error) throw error
      setMessage("Username saved")
    } catch (e: any) {
      setError(e.message ?? "Failed to save username. Ensure a 'profiles' table exists with columns: id uuid primary key, username text.")
    }
  }

  async function updateEmail() {
    setMessage(null)
    setError(null)
    if (!canChangeEmail) {
      setError("Email is managed by your Google account. To change it, update your Google Account email.")
      return
    }
    const next = newEmail.trim()
    if (!next || !next.includes("@")) {
      setError("Please enter a valid email")
      return
    }
    try {
      const { error } = await supabase.auth.updateUser({ email: next })
      if (error) throw error
      setMessage("Verification email sent to update your email. You'll be signed out now; please sign back in after verifying.")
      await supabase.auth.signOut()
      window.location.href = "/signin"
    } catch (e: any) {
      setError(e.message ?? "Failed to update email")
    }
  }

  async function sendResetEmail() {
    setMessage(null)
    setError(null)
    try {
      const origin = window.location.origin
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/reset-password` })
      if (error) throw error
      setMessage("Password reset email sent (if the email exists)")
    } catch (e: any) {
      setError(e.message ?? "Failed to send reset email")
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = "/"
  }

  async function deleteAccount() {
    const confirmed = window.confirm("This will delete your account permanently. Continue?")
    if (!confirmed) return
    setMessage(null)
    setError(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error("No session token. Please sign in again.")

      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Delete failed with status ${res.status}`)
      }
      await supabase.auth.signOut()
      window.location.href = "/"
    } catch (e: any) {
      setError(e.message ?? "Failed to delete account (ensure server is configured with SUPABASE_SERVICE_ROLE_KEY)")
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Loading account…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-12 relative flex items-start justify-center">
      {/* Back to dashboard */}
      <div className="absolute left-4 top-6">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </Link>
      </div>

      <div className="w-full max-w-2xl space-y-6">
        {message && <p className="text-sm text-green-600">{message}</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {mode === "menu" && (
          <Card className="border-border/80 shadow-none">
            <CardHeader>
              <CardTitle>Manage Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Choose what you want to manage.</p>
              <div className="flex flex-col gap-3">
                {canChangeEmail ? (
                  <Button onClick={() => { setMode("email"); setMessage(null); setError(null); setNewEmail(""); }}>Update Email</Button>
                ) : (
                  <Button disabled title="Google-managed account" className="opacity-80">Update Email (Google-managed)</Button>
                )}
                <Button variant="outline" onClick={() => { setMode("username"); setMessage(null); setError(null); }}>Change Username</Button>
                <Button variant="outline" onClick={() => { setMode("password"); setMessage(null); setError(null); }}>Change Password</Button>
                <Button variant="outline" onClick={() => { setMode("linked-accounts"); setMessage(null); setError(null); }}>Linked Accounts</Button>
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground">Current email: {email || "(loading)"}</p>
                  {!canChangeEmail && (
                    <p className="text-xs text-muted-foreground">Email changes are disabled for Google sign-ins. Update it in your Google Account.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {mode === "email" && (
          <Card className="border-border/80 shadow-none">
            <CardHeader>
              <CardTitle>Update Email</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!canChangeEmail ? (
                <>
                  <p className="text-sm text-muted-foreground">This account uses Google sign-in. You can't change your email.</p>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setMode("menu")}>Back</Button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label>Current Email</Label>
                    <Input value={email} readOnly className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="new-email">New Email</Label>
                    <Input id="new-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="mt-1" placeholder="you@example.com" />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={updateEmail}>Send Verification & Sign Out</Button>
                    <Button variant="ghost" onClick={() => setMode("menu")}>Back</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">We’ll email a verification link to your new address. After confirming, sign back in.</p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {mode === "username" && (
          <Card className="border-border/80 shadow-none">
            <CardHeader>
              <CardTitle>Change Username</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="username">Username</Label>
                <Input id="username" placeholder="Pick a username" value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1" />
              </div>
              <div className="flex gap-2">
                <Button onClick={saveUsername}>Save Username</Button>
                <Button variant="ghost" onClick={() => setMode("menu")}>Back</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {mode === "password" && (
          <Card className="border-border/80 shadow-none">
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">For security, password changes are done via email. We’ll send a reset link to your current address.</p>
              <div className="flex gap-2">
                <Button onClick={sendResetEmail}>Send Reset Email</Button>
                <Button variant="ghost" onClick={() => setMode("menu")}>Back</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {mode === "linked-accounts" && (
          <Card className="border-border/80 shadow-none">
            <CardHeader>
              <CardTitle>Linked Accounts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Link multiple authentication providers to your account for easier sign-in.
              </p>
              
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Currently Linked</h3>
                {linkedIdentities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No linked accounts found.</p>
                ) : (
                  <div className="space-y-2">
                    {linkedIdentities.map((identity) => (
                      <div key={identity.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-xs font-semibold uppercase">
                              {identity.provider.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium capitalize">{identity.provider}</p>
                            <p className="text-xs text-muted-foreground">
                              {identity.identity_data?.email || 'No email'}
                            </p>
                          </div>
                        </div>
                        {linkedIdentities.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => unlinkProvider(identity)}
                          >
                            <Unlink className="h-4 w-4 mr-1" />
                            Unlink
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <h3 className="text-sm font-medium">Link New Provider</h3>
                <div className="grid gap-2">
                  {!linkedIdentities.some(i => i.provider === 'google') && (
                    <Button
                      variant="outline"
                      onClick={() => linkProvider('google')}
                      disabled={linkingProvider === 'google'}
                      className="justify-start"
                    >
                      <LinkIcon className="h-4 w-4 mr-2" />
                      {linkingProvider === 'google' ? 'Linking...' : 'Link Google Account'}
                    </Button>
                  )}
                  {!linkedIdentities.some(i => i.provider === 'github') && (
                    <Button
                      variant="outline"
                      onClick={() => linkProvider('github')}
                      disabled={linkingProvider === 'github'}
                      className="justify-start"
                    >
                      <LinkIcon className="h-4 w-4 mr-2" />
                      {linkingProvider === 'github' ? 'Linking...' : 'Link GitHub Account'}
                    </Button>
                  )}
                  {!linkedIdentities.some(i => i.provider === 'discord') && (
                    <Button
                      variant="outline"
                      onClick={() => linkProvider('discord')}
                      disabled={linkingProvider === 'discord'}
                      className="justify-start"
                    >
                      <LinkIcon className="h-4 w-4 mr-2" />
                      {linkingProvider === 'discord' ? 'Linking...' : 'Link Discord Account'}
                    </Button>
                  )}
                </div>
                {linkedIdentities.some(i => i.provider === 'google') && 
                 linkedIdentities.some(i => i.provider === 'github') && 
                 linkedIdentities.some(i => i.provider === 'discord') && (
                  <p className="text-sm text-muted-foreground">All available providers are linked.</p>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="ghost" onClick={() => setMode("menu")}>Back</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={signOut}>Sign out</Button>
          <Button variant="destructive" onClick={deleteAccount}>Delete account</Button>
        </div>
      </div>
    </div>
  )
}
