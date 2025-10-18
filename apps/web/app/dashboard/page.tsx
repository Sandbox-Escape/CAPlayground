"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { ArrowLeft, Cloud } from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase"
import { SubmitWallpaperDialog } from "@/app/wallpapers/SubmitWallpaperDialog"

function DashboardContent() {
  const supabase = getSupabaseBrowserClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [displayName, setDisplayName] = useState<string>("")
  const [username, setUsername] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false)
  const [hasGoogleLinked, setHasGoogleLinked] = useState(false)
  const [checkingGoogle, setCheckingGoogle] = useState(true)
  const [driveConnected, setDriveConnected] = useState(false)
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [messageDialogOpen, setMessageDialogOpen] = useState(false)
  const [messageDialogTitle, setMessageDialogTitle] = useState('')
  const [messageDialogContent, setMessageDialogContent] = useState('')
  const [messageDialogVariant, setMessageDialogVariant] = useState<'success' | 'error'>('success')

  useEffect(() => {
    const driveConnected = searchParams?.get('drive_connected');
    const error = searchParams?.get('error');
    
    if (driveConnected === 'true') {
      setMessageDialogTitle('Success');
      setMessageDialogContent('Signed in to Google Drive successfully! You can now sync projects to the cloud.');
      setMessageDialogVariant('success');
      setMessageDialogOpen(true);
      setDriveConnected(true);
      setCheckingGoogle(false);
      window.history.replaceState({}, '', '/dashboard');
    } else if (error) {
      setMessageDialogTitle('Error');
      setMessageDialogContent(`Failed to sign in to Google Drive: ${error}`);
      setMessageDialogVariant('error');
      setMessageDialogOpen(true);
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [searchParams]);

  useEffect(() => {
    let mounted = true
    async function load() {
      const { data } = await supabase.auth.getUser()
      const user = data.user
      if (!user) {
        router.replace("/signin")
        return
      }
      const meta: any = user.user_metadata || {}
      const name = meta.full_name || meta.name || meta.username || user.email || "there"
      if (mounted) setDisplayName(name as string)
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .maybeSingle()
        if (mounted && profile?.username) setUsername(profile.username as string)
      } catch {}
      
      try {
        const { data: identities } = await supabase.auth.getUserIdentities()
        if (mounted && identities?.identities) {
          const hasGoogle = identities.identities.some((identity: any) => identity.provider === 'google')
          setHasGoogleLinked(hasGoogle)
        }
        
        try {
          const driveRes = await fetch('/api/drive/auth')
          const driveData = await driveRes.json()
          if (mounted) setDriveConnected(driveData.connected === true)
        } catch (e) {
          console.error('Failed to check Drive connection:', e)
        }
      } catch (e) {
        console.error('Failed to check Google identity:', e)
      } finally {
        if (mounted) setCheckingGoogle(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [router, supabase])

  async function handleSignOut() {
    setLoading(true)
    try {
      await fetch('/api/auth/signout', { method: 'POST' })
      await supabase.auth.signOut()
      router.replace("/")
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteAllCloudProjects() {
    setDeleting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/api/drive/delete-folder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete cloud projects')
      }

      localStorage.removeItem('caplayground-sync')

      setDeleteAllOpen(false)
      setMessageDialogTitle('Success');
      setMessageDialogContent('All cloud projects deleted successfully!');
      setMessageDialogVariant('success');
      setMessageDialogOpen(true);
      
    } catch (error: any) {
      setMessageDialogTitle('Error');
      setMessageDialogContent(`Failed to delete: ${error.message}`);
      setMessageDialogVariant('error');
      setMessageDialogOpen(true);
    } finally {
      setDeleting(false)
    }
  }

  return (
    <main className="min-h-screen px-4 py-20 flex items-start justify-center relative">
      {/* Back to home */}
      <div className="absolute left-4 top-6">
        <Link href="/">
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </Link>
      </div>

      <div className="w-full max-w-5xl">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">Welcome back{displayName ? `, ${displayName}` : ""}!</h1>
        <p className="mt-6 text-muted-foreground text-lg">Manage your cloud projects and account settings.</p>
        <div className="mt-8 space-y-6">
          {/* Cloud Projects */}
          <Card className="border-border/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Cloud Projects
                <span className="text-[10px] md:text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-normal">
                  BETA
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Sync and manage your projects in the cloud with Google Drive.
              </p>
              {checkingGoogle ? (
                <p className="text-sm text-muted-foreground">Checking connection...</p>
              ) : driveConnected ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-4 py-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <Cloud className="h-5 w-5 text-green-600 dark:text-green-500" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-900 dark:text-green-100">
                        Signed in to Google Drive
                      </p>
                      <p className="text-xs text-green-700 dark:text-green-300">
                        Your projects can be synced to the cloud
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <Link href="/projects" className="flex-1"> 
                        <Button variant="outline" className="w-full">
                          Manage Projects
                        </Button>
                      </Link>
                      <Button 
                        variant="outline" 
                        onClick={() => setDeleteAllOpen(true)}
                        className="text-destructive hover:text-destructive"
                      >
                        Delete All
                      </Button>
                    </div>
                    <Button 
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await fetch('/api/auth/signout', { method: 'POST' });
                          setDriveConnected(false);
                          setMessageDialogTitle('Success');
                          setMessageDialogContent('Signed out from Google Drive successfully.');
                          setMessageDialogVariant('success');
                          setMessageDialogOpen(true);
                        } catch (error) {
                          console.error('Failed to sign out from Drive:', error);
                        }
                      }}
                      className="w-full"
                    >
                      <Cloud className="h-4 w-4 mr-2" />
                      Sign out from Google Drive
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button onClick={async () => {
                    try {
                      const response = await fetch('/api/drive/auth');
                      const data = await response.json();
                      if (data.authUrl) {
                        window.location.href = data.authUrl;
                      } else if (data.error) {
                        setMessageDialogTitle('Error');
                        setMessageDialogContent(`Error: ${data.error}`);
                        setMessageDialogVariant('error');
                        setMessageDialogOpen(true);
                      }
                    } catch (error) {
                      console.error('Failed to sign in to Drive:', error);
                    }
                  }}>
                    <Cloud className="h-4 w-4 mr-2" />
                    Sign in to Google Drive
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Once signed in, you can sync projects directly from the projects page.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          {/* Submit Wallpaper (hidden) */}
          <div className="hidden">
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle>Submit Wallpaper</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Submit a wallpaper to the wallpaper gallery.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => setIsSubmitDialogOpen(true)}>Submit</Button>
                  <Link href="/wallpapers">
                    <Button variant="outline">Go to gallery</Button>
                  </Link>
                  <Link href={username
                    ? `/wallpapers?q=${encodeURIComponent(username)}`
                    : (displayName ? `/wallpapers?q=${encodeURIComponent(displayName)}` : "/wallpapers")
                  }>
                    <Button variant="secondary">View my wallpapers</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/80">
            <CardHeader>
              <CardTitle>Account Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Manage your email, username, password, or delete your account.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/account">
                  <Button variant="default">Manage Account</Button>
                </Link>
                <Button onClick={handleSignOut} disabled={loading} variant="outline">
                  {loading ? "Signing out..." : "Sign Out"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <SubmitWallpaperDialog
        open={isSubmitDialogOpen}
        onOpenChange={setIsSubmitDialogOpen}
        username={username || displayName || "Anonymous"}
        isSignedIn={true}
      />

      {/* Delete All Cloud Projects Dialog */}
      <Dialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete All Cloud Projects</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              This will permanently delete the entire CAPlayground folder and all projects from your Google Drive.
            </p>
            <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3">
              <p className="text-xs text-red-800 dark:text-red-300">
                <strong>⚠️ Warning:</strong> This action cannot be undone. All cloud projects will be permanently deleted from Drive. Projects on your device will not be affected.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAllOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteAllCloudProjects}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete All'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Message Dialog */}
      <Dialog open={messageDialogOpen} onOpenChange={setMessageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{messageDialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className={`text-sm ${messageDialogVariant === 'error' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
              {messageDialogContent}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setMessageDialogOpen(false)}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen px-4 py-20 flex items-start justify-center">
        <div className="w-full max-w-5xl">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">Loading...</h1>
        </div>
      </main>
    }>
      <DashboardContent />
    </Suspense>
  )
}
