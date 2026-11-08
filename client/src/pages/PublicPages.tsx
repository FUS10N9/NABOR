import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { CategoryIcon } from '@/components/tasks/CategoryIcon'
import { Button, Field, Input } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { Category } from '@/lib/types'

const credentials = z.object({
  full_name: z.string().trim().min(2, 'Enter your name').optional(),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Use at least 8 characters').regex(/[A-Za-z]/, 'Include a letter').regex(/[0-9]/, 'Include a number'),
})

export function LandingPage() {
  const { session, loading } = useAuth()
  const categories = useQuery({
    queryKey: ['categories', 'public'],
    queryFn: () => api<Category[]>('/categories'),
    retry: false,
  })
  if (!loading && session) return <Navigate to="/home" replace />
  const groups = (Array.isArray(categories.data) ? categories.data : []).filter((category) => !category.parent_id)
  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <span className="font-display text-3xl text-pine-800">Nabor</span>
        <div className="flex gap-2">
          <Link to="/login" className="rounded-full px-4 py-2 text-sm font-medium">Log in</Link>
          <Link to="/signup" className="rounded-full bg-pine-600 px-4 py-2 text-sm font-medium text-white">Create account</Link>
        </div>
      </header>
      <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-8 md:grid-cols-[1.2fr_.8fr] md:items-end">
        <div>
          <p className="text-sm font-medium text-pine-700">Neighbourhood help, paid fairly</p>
          <h1 className="mt-3 font-display text-5xl leading-tight text-ink md:text-7xl">Need a hand?<br />There's someone nearby.</h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-mute">Post an everyday task or pick one up within a short walk. Groceries, tutoring, a dog walk, or help with a computer — between people who live close by.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/signup" className="rounded-full bg-pine-600 px-5 py-3 text-sm font-medium text-white">Get started</Link>
            <a href="#how" className="rounded-full border border-line bg-white px-5 py-3 text-sm font-medium">How it works</a>
          </div>
        </div>
        <div className="rounded-3xl border border-line bg-white p-6 shadow-card">
          <p className="text-sm text-mute">A neighbour posts a task. Someone nearby applies. You choose them, talk in the app, and record the payment when the work is done.</p>
          <ol className="mt-5 space-y-4 text-sm">
            <li><strong>1. Post</strong> — describe the help, the budget, and an approximate area.</li>
            <li><strong>2. Choose</strong> — compare introductions, ratings, and a proposed price.</li>
            <li><strong>3. Finish</strong> — confirm the work, then record cash, UPI, or a verified payment.</li>
          </ol>
        </div>
      </section>
      <section id="how" className="mx-auto max-w-6xl px-5 pb-20">
        <h2 className="font-display text-3xl">Help that fits the neighbourhood</h2>
        {groups.length ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {groups.map((group) => (
              <div key={group.id} className="rounded-3xl border border-line bg-white p-4">
                <CategoryIcon name={group.icon} />
                <h3 className="mt-3 font-semibold">{group.name}</h3>
                <p className="mt-1 text-sm leading-6 text-mute">{group.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 max-w-xl text-sm leading-6 text-mute">Categories appear after the database migration is applied. Everyday errands, learning, technology, home help, pets, and small creative jobs are the starting set.</p>
        )}
        <p className="mt-8 max-w-2xl text-sm leading-6 text-mute">Cash and UPI are arranged between the two people and recorded as self-reported. An in-app payment is marked paid only after the server verifies the payment provider. Nabor does not hold funds in escrow.</p>
      </section>
    </div>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [error, setError] = useState('')
  const form = useForm<{ email: string; password: string }>({ resolver: zodResolver(z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(8, 'Enter your password') })) })
  if (session) return <Navigate to="/home" replace />
  return (
    <AuthFrame title="Welcome back" subtitle="Log in to see tasks around you.">
      <form className="space-y-4" onSubmit={form.handleSubmit(async (values) => {
        setError('')
        const { error: signInError } = await supabase!.auth.signInWithPassword(values)
        if (signInError) setError(signInError.message)
        else navigate('/home')
      })}>
        <Field label="Email" error={form.formState.errors.email?.message}><Input type="email" {...form.register('email')} /></Field>
        <Field label="Password" error={form.formState.errors.password?.message}><Input type="password" {...form.register('password')} /></Field>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>Log in</Button>
      </form>
      <p className="mt-4 text-sm text-mute"><Link to="/forgot-password" className="text-pine-800">Forgot password</Link> · <Link to="/signup" className="text-pine-800">Create an account</Link></p>
    </AuthFrame>
  )
}

export function SignupPage() {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const form = useForm<{ full_name: string; email: string; password: string }>({ resolver: zodResolver(credentials.extend({ full_name: z.string().trim().min(2, 'Enter your name') })) })
  return (
    <AuthFrame title="Create your Nabor account" subtitle="You can ask for help and offer it. You need to be 16 or over.">
      <form className="space-y-4" onSubmit={form.handleSubmit(async (values) => {
        setError('')
        const { data, error: signUpError } = await supabase!.auth.signUp({
          email: values.email,
          password: values.password,
          options: {
            data: { full_name: values.full_name },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })
        if (signUpError) setError(signUpError.message)
        else if (data.session) window.location.assign('/onboarding')
        else setMessage('Check your email to confirm your address. You will be signed in automatically after confirmation.')
      })}>
        <Field label="Full name" error={form.formState.errors.full_name?.message}><Input {...form.register('full_name')} /></Field>
        <Field label="Email" error={form.formState.errors.email?.message}><Input type="email" {...form.register('email')} /></Field>
        <Field label="Password" error={form.formState.errors.password?.message}><Input type="password" {...form.register('password')} /></Field>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {message ? <p className="text-sm text-pine-800">{message}</p> : null}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>Create account</Button>
      </form>
      <p className="mt-4 text-sm text-mute">Already have an account? <Link to="/login" className="text-pine-800">Log in</Link></p>
    </AuthFrame>
  )
}

export function EmailConfirmationPage() {
  const { loading, session } = useAuth()
  if (loading) {
    return <AuthFrame title="Confirming your email" subtitle="Please wait while we finish signing you in."><p className="text-sm text-mute">This should only take a moment.</p></AuthFrame>
  }
  if (session) return <Navigate to="/onboarding" replace />
  return (
    <AuthFrame title="Email confirmation failed" subtitle="This confirmation link may have expired or already been used. Try creating your account again or log in if you have already confirmed your email.">
      <div className="flex gap-3">
        <Link to="/signup" className="rounded-full bg-pine-600 px-4 py-2.5 text-sm font-medium text-white">Create account</Link>
        <Link to="/login" className="rounded-full border border-line bg-white px-4 py-2.5 text-sm font-medium">Log in</Link>
      </div>
    </AuthFrame>
  )
}

export function ForgotPage() {
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  return (
    <AuthFrame title="Reset your password" subtitle="We will send a recovery link if this email has an account.">
      <form className="space-y-4" onSubmit={async (event) => {
        event.preventDefault()
        const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
        setMessage(error ? error.message : 'If an account exists, a recovery email is on its way.')
      }}>
        <Field label="Email"><Input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
        {message ? <p className="text-sm text-mute">{message}</p> : null}
        <Button type="submit">Send recovery link</Button>
      </form>
    </AuthFrame>
  )
}

export function ResetPage() {
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  return (
    <AuthFrame title="Choose a new password" subtitle="Use at least 8 characters, with a letter and a number.">
      <form className="space-y-4" onSubmit={async (event) => {
        event.preventDefault()
        if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) {
          setMessage('Use at least 8 characters, with a letter and a number.')
          return
        }
        const { error } = await supabase!.auth.updateUser({ password })
        setMessage(error ? error.message : 'Password updated. You can continue into Nabor.')
      }}>
        <Field label="New password"><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
        {message ? <p className="text-sm text-mute">{message}</p> : null}
        <Button type="submit">Update password</Button>
      </form>
    </AuthFrame>
  )
}

function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden bg-pine-800 p-10 text-pine-50 md:flex md:flex-col md:justify-between">
        <Link to="/" className="font-display text-4xl">Nabor</Link>
        <p className="max-w-sm font-display text-4xl leading-tight">Need a hand? There's someone nearby.</p>
      </div>
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <Link to="/" className="font-display text-3xl text-pine-800 md:hidden">Nabor</Link>
          <h1 className="mt-6 font-display text-4xl">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-mute">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
