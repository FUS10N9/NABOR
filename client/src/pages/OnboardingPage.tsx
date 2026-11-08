import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { LocationPicker } from '@/components/map/LocationPicker'
import { Button, Field, Input, Textarea } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { ageFromDob } from '@/lib/format'

const schema = z.object({
  full_name: z.string().trim().min(2),
  username: z.string().regex(/^[a-z0-9_]{3,20}$/, 'Use 3–20 lowercase letters, numbers, or underscores'),
  date_of_birth: z.string().min(1, 'Enter your date of birth'),
  bio: z.string().max(280).optional(),
  services_offered: z.string().max(280).optional(),
  skills: z.string().optional(),
})

export function OnboardingPage() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [location, setLocation] = useState({ lat: null as number | null, lng: null as number | null, label: '', address: '' })
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: profile?.full_name || '',
      username: profile?.username || '',
      date_of_birth: profile?.date_of_birth?.slice(0, 10) || '',
      bio: profile?.bio || '',
      services_offered: profile?.services_offered || '',
      skills: '',
    },
  })
  const save = useMutation({
    mutationFn: (values: z.infer<typeof schema>) => api<{ status: string }>('/me', {
      method: 'PATCH',
      body: {
        ...values,
        bio: values.bio || null,
        services_offered: values.services_offered || null,
        skills: values.skills ? values.skills.split(',').map((item) => item.trim()).filter(Boolean) : [],
        neighbourhood: location.label,
        lat: location.lat,
        lng: location.lng,
        phone: null,
        avatar_url: profile?.avatar_url || null,
        notification_settings: profile?.notification_settings || null,
        privacy_settings: profile?.privacy_settings || { show_neighbourhood: true },
        discovery_radius_m: 1000,
      },
    }),
    onSuccess: async (result: { status: string }) => {
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      if (result.status === 'ineligible') return
      navigate('/home')
    },
  })
  const dob = form.watch('date_of_birth')
  const age = ageFromDob(dob)

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-8">
      <p className="font-display text-3xl text-pine-800">Nabor</p>
      <h1 className="mt-6 font-display text-4xl">Set up your profile</h1>
      <p className="mt-2 text-sm leading-6 text-mute">Your date of birth keeps age-restricted tasks out of your feed. Your exact home location stays private.</p>
      {age !== null && age < 16 ? (
        <div className="mt-6 rounded-3xl bg-white p-6">
          <h2 className="font-display text-3xl">Nabor is for people aged 16 and over</h2>
          <p className="mt-2 text-sm leading-6 text-mute">This account cannot post or accept tasks. Identity documents are not checked yet; the date of birth is what the app uses.</p>
          <Button className="mt-5" variant="secondary" onClick={signOut}>Log out</Button>
        </div>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={form.handleSubmit((values) => save.mutate(values))}>
          <Field label="Full name" error={form.formState.errors.full_name?.message}><Input {...form.register('full_name')} /></Field>
          <Field label="Username" error={form.formState.errors.username?.message}><Input {...form.register('username')} /></Field>
          <Field label="Date of birth" hint="Type your date as YYYY-MM-DD." error={form.formState.errors.date_of_birth?.message}><Input type="text" inputMode="text" placeholder="YYYY-MM-DD" autoComplete="bday" {...form.register('date_of_birth')} /></Field>
          <Field label="Short introduction"><Textarea {...form.register('bio')} placeholder="What should neighbours know about you?" /></Field>
          <Field label="Services you can offer"><Textarea {...form.register('services_offered')} placeholder="Tutoring, grocery runs, dog walking…" /></Field>
          <Field label="Skills" hint="Separate them with commas, up to 12."><Input {...form.register('skills')} placeholder="maths, cooking, excel" /></Field>
          <LocationPicker value={location} onChange={setLocation} />
          {save.error ? <p className="text-sm text-red-700">{save.error.message}</p> : null}
          <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Continue'}</Button>
        </form>
      )}
    </div>
  )
}

export function AgeGate() {
  const { signOut } = useAuth()
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <p className="font-display text-3xl text-pine-800">Nabor</p>
      <h1 className="mt-4 font-display text-4xl">You need to be at least 16</h1>
      <p className="mt-3 text-sm leading-6 text-mute">This account cannot post tasks, apply, or message neighbours. The date of birth on the profile is under 16.</p>
      <Button className="mt-6 w-fit" variant="secondary" onClick={signOut}>Log out</Button>
    </div>
  )
}

export function SuspendedPage() {
  const { signOut } = useAuth()
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <h1 className="font-display text-4xl">This account is suspended</h1>
      <p className="mt-3 text-sm leading-6 text-mute">You can still read this notice. Posting, applying, and messaging are turned off.</p>
      <Button className="mt-6 w-fit" variant="secondary" onClick={signOut}>Log out</Button>
    </div>
  )
}
