import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { ageFromDob } from '@/lib/format'
import { ActivitiesPage } from '@/pages/ActivitiesPage'
import { AdminPage } from '@/pages/AdminPage'
import { EarningsPage } from '@/pages/EarningsPage'
import { ExplorePage } from '@/pages/ExplorePage'
import { HomePage } from '@/pages/HomePage'
import { MessagesPage } from '@/pages/MessagesPage'
import { NotificationsPage } from '@/pages/NotificationsPage'
import { AgeGate, OnboardingPage, SuspendedPage } from '@/pages/OnboardingPage'
import { PostTaskPage } from '@/pages/PostTaskPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { EmailConfirmationPage, ForgotPage, LandingPage, LoginPage, ResetPage, SignupPage } from '@/pages/PublicPages'
import { SettingsPage } from '@/pages/SettingsPage'
import { ApplicationsPage, TaskDetailPage } from '@/pages/TaskPages'

export default function App() {
  const { configured } = useAuth()
  if (!configured) {
    return (
      <main className="mx-auto max-w-lg px-6 py-20">
        <h1 className="font-display text-4xl">Nabor needs its environment file</h1>
        <p className="mt-3 text-sm leading-6 text-mute">Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to the root .env, then restart the web app. Keep the secret key on the server only.</p>
      </main>
    )
  }
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPage />} />
      <Route path="/reset-password" element={<ResetPage />} />
      <Route path="/auth/callback" element={<EmailConfirmationPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route element={<RequireReady />}>
          <Route element={<AppShell />}>
            <Route path="/home" element={<HomePage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/tasks/new" element={<PostTaskPage />} />
            <Route path="/tasks/:id" element={<TaskDetailPage />} />
            <Route path="/tasks/:id/applications" element={<ApplicationsPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/messages/:conversationId" element={<MessagesPage />} />
            <Route path="/activities" element={<ActivitiesPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profile/:id" element={<ProfilePage />} />
            <Route path="/earnings" element={<EarningsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<main className="px-6 py-20"><h1 className="font-display text-4xl">That page is not here</h1><Link to="/" className="mt-4 inline-block text-pine-800">Go home</Link></main>} />
    </Routes>
  )
}

function RequireAuth() {
  const { session, loading } = useAuth()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}

function RequireReady() {
  const { profile, loading, profileError, signOut } = useAuth()
  if (loading) return <Loading />
  if (profileError) {
    return (
      <main className="mx-auto max-w-lg px-6 py-20">
        <h1 className="font-display text-4xl">Nabor cannot load your profile</h1>
        <p className="mt-3 text-sm leading-6 text-mute">{profileError.message}</p>
        <div className="mt-5 flex gap-3">
          <Button onClick={() => window.location.reload()}>Try again</Button>
          <Button variant="secondary" onClick={() => void signOut()}>Log out</Button>
        </div>
      </main>
    )
  }
  if (!profile) return <Loading />
  const age = ageFromDob(profile.date_of_birth)
  if (profile.date_of_birth && age !== null && age < 16) return <AgeGate />
  if (profile.is_suspended) return <SuspendedPage />
  if (!profile.onboarding_completed) return <Navigate to="/onboarding" replace />
  return <Outlet />
}

function Loading() {
  return <div className="grid min-h-screen place-items-center font-display text-3xl text-pine-800">Nabor</div>
}
