import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button, Card, Field, Input, Textarea } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { api, uploadImage } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { RADIUS_OPTIONS } from '@shared/constants.js'

const schema = z.object({
  full_name: z.string().trim().min(2),
  username: z.string().regex(/^[a-z0-9_]{3,20}$/, 'Use 3–20 lowercase letters, numbers, or underscores'),
  date_of_birth: z.string().min(8),
  bio: z.string().max(280).optional(),
  services_offered: z.string().max(280).optional(),
  neighbourhood: z.string().min(2),
  phone: z.string().optional(),
  skills: z.string().optional(),
})

export function SettingsPage() {
  const { profile, signOut } = useAuth()
  const queryClient = useQueryClient()
  const [avatar, setAvatar] = useState(profile?.avatar_url || null)
  const [settings, setSettings] = useState(profile?.notification_settings)
  const [showNeighbourhood, setShowNeighbourhood] = useState(profile?.privacy_settings.show_neighbourhood ?? true)
  const [radius, setRadius] = useState(profile?.discovery_radius_m || 1000)
  const [password, setPassword] = useState('')
  const form = useForm({
    resolver: zodResolver(schema),
    values: {
      full_name: profile?.full_name || '',
      username: profile?.username || '',
      date_of_birth: profile?.date_of_birth?.slice(0, 10) || '',
      bio: profile?.bio || '',
      services_offered: profile?.services_offered || '',
      neighbourhood: profile?.neighbourhood || '',
      phone: profile?.phone || '',
      skills: profile?.skills.join(', ') || '',
    },
  })
  const save = useMutation({
    mutationFn: (values: z.infer<typeof schema>) => api('/me', {
      method: 'PATCH',
      body: {
        ...values,
        phone: values.phone || null,
        bio: values.bio || null,
        services_offered: values.services_offered || null,
        skills: values.skills ? values.skills.split(',').map((item) => item.trim()).filter(Boolean) : [],
        avatar_url: avatar,
        lat: profile?.home_lat,
        lng: profile?.home_lng,
        notification_settings: settings,
        privacy_settings: { show_neighbourhood: showNeighbourhood },
        discovery_radius_m: radius,
      },
    }),
    onSuccess: async () => {
      toast.success('Profile saved')
      await queryClient.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (error) => toast.error(error.message),
  })
  if (!profile || !settings) return null
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-4xl">Settings</h1>
      <form className="space-y-4" onSubmit={form.handleSubmit((values) => save.mutate(values))}>
        <Card className="space-y-4">
          <h2 className="font-semibold">Profile</h2>
          <Field label="Photo"><Input type="file" accept="image/jpeg,image/png,image/webp" onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            try { setAvatar(await uploadImage('avatars', file)) } catch (error) { toast.error(error instanceof Error ? error.message : 'Upload failed') }
          }} /></Field>
          {avatar ? <img src={avatar} alt="" className="h-16 w-16 rounded-full object-cover" /> : null}
          <Field label="Full name" error={form.formState.errors.full_name?.message}><Input {...form.register('full_name')} /></Field>
          <Field label="Username" error={form.formState.errors.username?.message}><Input {...form.register('username')} /></Field>
          <Field label="Date of birth" hint="Type your date as YYYY-MM-DD."><Input type="text" inputMode="text" placeholder="YYYY-MM-DD" autoComplete="bday" {...form.register('date_of_birth')} /></Field>
          <Field label="Introduction"><Textarea {...form.register('bio')} /></Field>
          <Field label="Services offered"><Textarea {...form.register('services_offered')} /></Field>
          <Field label="Skills"><Input {...form.register('skills')} /></Field>
          <Field label="Neighbourhood label"><Input {...form.register('neighbourhood')} /></Field>
          <Field label="Phone" hint="Saved for your account. It is not shown on your public profile. Phone verification is not configured."><Input {...form.register('phone')} placeholder="+91..." /></Field>
        </Card>
        <Card className="space-y-3">
          <h2 className="font-semibold">Notifications</h2>
          {(['applications', 'messages', 'tasks', 'reviews', 'email'] as const).map((key) => (
            <label key={key} className="flex items-center justify-between text-sm capitalize">
              {key === 'email' ? 'Email, when Resend is configured' : key}
              <input type="checkbox" checked={settings[key]} onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })} />
            </label>
          ))}
        </Card>
        <Card className="space-y-3">
          <h2 className="font-semibold">Privacy and location</h2>
          <label className="flex items-center justify-between text-sm">Show neighbourhood on my profile<input type="checkbox" checked={showNeighbourhood} onChange={(event) => setShowNeighbourhood(event.target.checked)} /></label>
          <Field label="Default discovery radius">
            <select className="w-full rounded-2xl border border-line px-3 py-3" value={radius} onChange={(event) => setRadius(Number(event.target.value))}>
              {RADIUS_OPTIONS.map((option) => <option key={option.meters} value={option.meters}>{option.label}</option>)}
            </select>
          </Field>
          <p className="text-sm text-mute">Public task pins are shifted by roughly 80–150 metres. Your street address is stored separately and shown only to you and the helper you choose.</p>
        </Card>
        <Button type="submit" disabled={save.isPending}>Save settings</Button>
      </form>
      <Card className="space-y-3">
        <h2 className="font-semibold">Security</h2>
        <p className="text-sm text-mute">Signed in as {profile.email}. Status: {profile.verification_status.replaceAll('_', ' ')}.</p>
        <Field label="New password"><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
        <Button variant="secondary" onClick={async () => {
          const { error } = await supabase!.auth.updateUser({ password })
          toast[error ? 'error' : 'success'](error ? error.message : 'Password updated')
        }}>Update password</Button>
        <Button variant="ghost" onClick={signOut}>Log out</Button>
      </Card>
    </div>
  )
}
