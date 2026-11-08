import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, Bell, Compass, House, MessageCircle, Plus, UserRound } from 'lucide-react'
import { useEffect } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const items = [
  { to: '/home', label: 'Home', icon: House },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/tasks/new', label: 'Post', icon: Plus },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/activities', label: 'Activity', icon: Activity },
  { to: '/profile', label: 'My Account', icon: UserRound },
]

export function AppShell() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<Array<{ is_read: boolean }>>('/notifications'),
  })
  const unread = (Array.isArray(notifications.data)? notifications.data : []).filter((item) => !item.is_read).length

  useEffect(() => {
    const client = supabase
    if (!client || !profile) return
    const channel = client
      .channel(`notifications-${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] })
      })
      .subscribe()
    return () => {
      client.removeChannel(channel)
    }
  }, [profile, queryClient])

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-white px-4 py-5 md:flex">
        <Link to="/home" className="px-2 font-display text-3xl text-pine-800">Nabor</Link>
        <p className="px-2 pb-6 text-sm text-mute">Need a hand? There's someone nearby.</p>
        <nav className="space-y-1">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => cn('flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium', isActive ? 'bg-pine-50 text-pine-800' : 'text-ink hover:bg-paper')}>
              <item.icon className="h-4 w-4" /> {item.label}
            </NavLink>
          ))}
        </nav>
        <button className="mt-auto flex items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-paper" onClick={() => navigate('/profile')}>
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-pine-100 font-semibold text-pine-800">{profile?.full_name.slice(0, 1)}</span>
          <span>
            <span className="block text-sm font-medium">{profile?.full_name}</span>
            <span className="block text-xs text-mute">{profile?.neighbourhood || 'Set your neighbourhood'}</span>
          </span>
        </button>
      </aside>
      <div className="pb-24 md:pb-0">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line/80 bg-paper/90 px-4 py-3 backdrop-blur md:px-8">
          <Link to="/home" className="font-display text-2xl text-pine-800 md:hidden">Nabor</Link>
          <p className="hidden text-sm text-mute md:block">{profile?.neighbourhood || 'Choose a neighbourhood'}</p>
          <div className="flex items-center gap-2">
            {profile?.role === 'admin' ? <Link to="/admin" className="rounded-full px-3 py-1.5 text-sm font-medium text-pine-800">Admin</Link> : null}
            <button className="relative rounded-full border border-line bg-white p-2" aria-label="Notifications" onClick={() => navigate('/notifications')}>
              <Bell className="h-4 w-4" />
              {unread ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-pine-600" /> : null}
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-5 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-white px-1 py-2 md:hidden">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => cn('flex flex-col items-center gap-1 rounded-2xl py-1 text-[11px]', isActive ? 'text-pine-700' : 'text-mute')}>
            <item.icon className={cn('h-5 w-5', item.to === '/tasks/new' && 'rounded-full bg-pine-600 p-1 text-white')} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
