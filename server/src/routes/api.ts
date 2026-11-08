import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { assertSafeContent } from '../../../shared/safety.js'
import { isAllowedRadius } from '../../../shared/constants.js'
import { env, gatewayFlags } from '../config.js'
import { HttpError, asRoute } from '../lib/http.js'
import { admin, requireAdmin, requireUser, userRest, userRpc } from '../lib/supabase.js'
import { maybeEmail } from '../services/mailer.js'
import { createGatewayOrder, verifyRazorpayPayment } from '../services/payments.js'

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many requests. Try again shortly.' })
  },
})

function guardContent(text: string) {
  const problem = assertSafeContent(text)
  if (problem) throw new HttpError(400, problem)
}

async function signAttachment(path: string | null) {
  if (!path || path.startsWith('https://')) return path
  const { data, error } = await admin.storage.from('message-attachments').createSignedUrl(path, 60 * 60)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export const api = Router()

api.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'nook-api', payments: gatewayFlags })
})

api.get('/categories', asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization')).catch(() => null)
  if (!auth) {
    const response = await fetch(`${env.supabaseUrl}/rest/v1/rpc/list_categories`, {
      method: 'POST',
      headers: {
        apikey: env.publishableKey,
        Authorization: `Bearer ${env.publishableKey}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new HttpError(503, 'Apply the SQL migrations in supabase/migrations before using Nabor.')
    res.json(body)
    return
  }
  res.json(await userRpc(auth.token, 'list_categories'))
}))

api.get('/me', asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  await userRpc(auth.token, 'touch_last_seen')
  const profile = await userRpc<Record<string, unknown>>(auth.token, 'own_profile')
  if (auth.user.email_confirmed_at && profile.verification_status === 'unverified') {
    await admin.from('users').update({ verification_status: 'email_verified' }).eq('id', auth.user.id)
    profile.verification_status = 'email_verified'
  }
  res.json(profile)
}))

api.patch('/me', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const body = z.object({
    full_name: z.string().trim().min(2).max(80),
    username: z.string().regex(/^[a-z0-9_]{3,20}$/, 'Usernames use 3 to 20 lowercase letters, numbers, or underscores'),
    bio: z.string().max(280).nullable().optional(),
    neighbourhood: z.string().trim().max(80).nullable().optional(),
    date_of_birth: z.string().date(),
    phone: z.string().regex(/^\+?[0-9]{8,15}$/).nullable().optional(),
    services_offered: z.string().max(280).nullable().optional(),
    avatar_url: z.string().url().nullable().optional(),
    lat: z.number().gte(-90).lte(90).nullable().optional(),
    lng: z.number().gte(-180).lte(180).nullable().optional(),
    skills: z.array(z.string().trim().min(2).max(40)).max(12).optional(),
    notification_settings: z.record(z.boolean()).nullable().optional(),
    privacy_settings: z.record(z.boolean()).nullable().optional(),
    discovery_radius_m: z.number().int().optional(),
  }).parse(req.body)
  if (body.discovery_radius_m && !isAllowedRadius(body.discovery_radius_m)) {
    throw new HttpError(400, 'Choose a radius of 500 m, 1 km, 3 km, or 5 km')
  }
  guardContent(`${body.bio || ''} ${body.services_offered || ''} ${(body.skills || []).join(' ')}`)
  const result = await userRpc(auth.token, 'update_profile', {
    p_full_name: body.full_name,
    p_username: body.username,
    p_bio: body.bio ?? null,
    p_neighbourhood: body.neighbourhood ?? null,
    p_date_of_birth: body.date_of_birth,
    p_phone: body.phone ?? null,
    p_services_offered: body.services_offered ?? null,
    p_avatar_url: body.avatar_url ?? null,
    p_lat: body.lat ?? null,
    p_lng: body.lng ?? null,
    p_skills: body.skills ?? null,
    p_notification_settings: body.notification_settings ?? null,
    p_privacy_settings: body.privacy_settings ?? null,
    p_discovery_radius_m: body.discovery_radius_m ?? null,
  })
  res.json(result)
}))

api.get('/tasks/nearby', asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const query = z.object({
    lat: z.coerce.number().gte(-90).lte(90),
    lng: z.coerce.number().gte(-180).lte(180),
    radius: z.coerce.number().int().default(1000),
    category: z.string().uuid().optional(),
    min_budget: z.coerce.number().optional(),
    max_budget: z.coerce.number().optional(),
    pricing: z.enum(['fixed', 'hourly']).optional(),
    payment: z.enum(['cash', 'upi']).optional(),
    search: z.string().max(80).optional(),
    on: z.string().date().optional(),
    available: z.enum(['any', 'today', 'week']).optional(),
    tz: z.string().max(80).optional(),
    sort: z.enum(['nearest', 'latest', 'budget', 'recommended']).default('nearest'),
  }).parse(req.query)
  if (!isAllowedRadius(query.radius)) throw new HttpError(400, 'Choose a radius of 500 m, 1 km, 3 km, or 5 km')
  res.json(await userRpc(auth.token, 'nearby_tasks', {
    p_lat: query.lat,
    p_lng: query.lng,
    p_radius_m: query.radius,
    p_category: query.category ?? null,
    p_min_budget: query.min_budget ?? null,
    p_max_budget: query.max_budget ?? null,
    p_pricing: query.pricing ?? null,
    p_payment: query.payment ?? null,
    p_search: query.search ?? null,
    p_on: query.on ?? null,
    p_available: query.available ?? null,
    p_tz: query.tz || 'UTC',
    p_sort: query.sort,
  }))
}))

api.get('/tasks/:id', asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const lat = req.query.lat ? Number(req.query.lat) : null
  const lng = req.query.lng ? Number(req.query.lng) : null
  res.json(await userRpc(auth.token, 'get_task', { p_task_id: req.params.id, p_lat: lat, p_lng: lng }))
}))

api.post('/tasks', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const body = z.object({
    title: z.string().trim().min(6).max(80),
    description: z.string().trim().min(20).max(2000),
    category_id: z.string().uuid(),
    task_type: z.enum(['fixed', 'hourly']),
    budget: z.number().positive().max(100000).nullable(),
    hourly_rate: z.number().positive().max(100000).nullable(),
    payment_method: z.enum(['cash', 'upi']),
    lat: z.number().gte(-90).lte(90),
    lng: z.number().gte(-180).lte(180),
    address: z.string().trim().min(4).max(200),
    public_label: z.string().trim().min(2).max(80),
    scheduled_at: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Choose a valid time').nullable(),
    deadline: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Choose a valid time').nullable(),
    allow_negotiation: z.boolean(),
    image_urls: z.array(z.string().url()).max(4),
  }).parse(req.body)
  guardContent(`${body.title} ${body.description} ${body.public_label}`)
  const task = await userRpc(auth.token, 'create_task', {
    p_title: body.title,
    p_description: body.description,
    p_category_id: body.category_id,
    p_task_type: body.task_type,
    p_budget: body.budget,
    p_hourly_rate: body.hourly_rate,
    p_payment_method: body.payment_method,
    p_lat: body.lat,
    p_lng: body.lng,
    p_address: body.address,
    p_public_label: body.public_label,
    p_scheduled_at: body.scheduled_at,
    p_deadline: body.deadline,
    p_allow_negotiation: body.allow_negotiation,
    p_image_urls: body.image_urls,
  })
  res.status(201).json(task)
}))

api.post('/tasks/:id/apply', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const body = z.object({
    message: z.string().trim().min(10).max(1000),
    proposed_price: z.number().positive().max(100000).nullable().optional(),
  }).parse(req.body)
  guardContent(body.message)
  const result = await userRpc<{ requester_id: string; title: string }>(auth.token, 'apply_to_task', {
    p_task_id: req.params.id,
    p_message: body.message,
    p_proposed_price: body.proposed_price ?? null,
  })
  await maybeEmail(result.requester_id, `New application for ${result.title}`, `Someone applied to "${result.title}" on Nabor.`)
  res.status(201).json(result)
}))

api.post('/applications/:id/withdraw', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  res.json(await userRpc(auth.token, 'withdraw_application', { p_application_id: req.params.id }))
}))

api.post('/applications/:id/accept', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const result = await userRpc<{ helper_id: string; title: string }>(auth.token, 'accept_application', { p_application_id: req.params.id })
  await maybeEmail(result.helper_id, `You were selected for ${result.title}`, `Open Nabor to message about "${result.title}".`)
  res.json(result)
}))

api.post('/applications/:id/reject', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const result = await userRpc<{ helper_id: string; title: string }>(auth.token, 'reject_application', { p_application_id: req.params.id })
  await maybeEmail(result.helper_id, `Application update for ${result.title}`, `Your application for "${result.title}" was not selected.`)
  res.json(result)
}))

api.get('/tasks/:id/applications', asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  res.json(await userRpc(auth.token, 'get_applications', { p_task_id: req.params.id }))
}))

api.post('/tasks/:id/cancel', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const body = z.object({ reason: z.string().trim().min(4).max(300) }).parse(req.body)
  res.json(await userRpc(auth.token, 'cancel_task', { p_task_id: req.params.id, p_reason: body.reason }))
}))

api.post('/tasks/:id/start', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const result = await userRpc<{ requester_id: string; title: string }>(auth.token, 'start_task', { p_task_id: req.params.id })
  await maybeEmail(result.requester_id, `${result.title} has started`, `Work has started on "${result.title}".`)
  res.json(result)
}))

api.post('/tasks/:id/complete', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const body = z.object({ final_amount: z.number().positive().max(100000) }).parse(req.body)
  const result = await userRpc<{ requester_id: string; title: string }>(auth.token, 'submit_completion', {
    p_task_id: req.params.id,
    p_final_amount: body.final_amount,
  })
  await maybeEmail(result.requester_id, `Confirm ${result.title}`, `The helper marked "${result.title}" complete. Confirm it in Nabor if the work is done.`)
  res.json(result)
}))

api.post('/tasks/:id/confirm', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const result = await userRpc<{ helper_id: string; title: string }>(auth.token, 'confirm_completion', { p_task_id: req.params.id })
  await maybeEmail(result.helper_id, `${result.title} is complete`, `"${result.title}" was confirmed. Record the payment if you have not already.`)
  res.json(result)
}))

api.post('/tasks/:id/dispute', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const body = z.object({ reason: z.string().trim().min(10).max(500) }).parse(req.body)
  guardContent(body.reason)
  res.json(await userRpc(auth.token, 'dispute_task', { p_task_id: req.params.id, p_reason: body.reason }))
}))

api.post('/tasks/:id/save', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  await userRest(auth.token, 'saved_tasks', { method: 'POST', body: { user_id: auth.user.id, task_id: req.params.id } })
  res.status(201).json({ saved: true })
}))

api.delete('/tasks/:id/save', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  await userRest(auth.token, `saved_tasks?user_id=eq.${auth.user.id}&task_id=eq.${req.params.id}`, { method: 'DELETE' })
  res.json({ saved: false })
}))

api.get('/activities', asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const tab = z.enum(['posted', 'applied', 'active', 'completed', 'cancelled']).parse(req.query.tab || 'posted')
  res.json(await userRpc(auth.token, 'get_activities', { p_tab: tab }))
}))

api.get('/users/:id', asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  res.json(await userRpc(auth.token, 'get_public_profile', { p_user_id: req.params.id }))
}))

api.post('/reviews', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const body = z.object({
    task_id: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(600).optional(),
  }).parse(req.body)
  if (body.comment) guardContent(body.comment)
  const result = await userRpc<{ reviewee_id: string; title: string }>(auth.token, 'create_review', {
    p_task_id: body.task_id,
    p_rating: body.rating,
    p_comment: body.comment ?? null,
  })
  await maybeEmail(result.reviewee_id, `New review for ${result.title}`, `You received a review on Nabor.`)
  res.status(201).json(result)
}))

api.post('/reports', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const body = z.object({
    reported_user_id: z.string().uuid().nullable().optional(),
    task_id: z.string().uuid().nullable().optional(),
    reason: z.enum(['safety', 'spam', 'harassment', 'scam', 'prohibited', 'other']),
    description: z.string().trim().min(10).max(1000),
  }).parse(req.body)
  if (!body.reported_user_id && !body.task_id) throw new HttpError(400, 'Choose a person or a task to report')
  if (body.reported_user_id === auth.user.id) throw new HttpError(400, 'You cannot report yourself')
  guardContent(body.description)
  await userRest(auth.token, 'reports', {
    method: 'POST',
    body: {
      reporter_id: auth.user.id,
      reported_user_id: body.reported_user_id ?? null,
      task_id: body.task_id ?? null,
      reason: body.reason,
      description: body.description,
    },
  })
  res.status(201).json({ ok: true })
}))

api.post('/blocks', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const body = z.object({ user_id: z.string().uuid() }).parse(req.body)
  if (body.user_id === auth.user.id) throw new HttpError(400, 'You cannot block yourself')
  await userRest(auth.token, 'blocks', { method: 'POST', body: { blocker_id: auth.user.id, blocked_id: body.user_id } })
  res.status(201).json({ ok: true })
}))

api.delete('/blocks/:id', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  await userRest(auth.token, `blocks?blocker_id=eq.${auth.user.id}&blocked_id=eq.${req.params.id}`, { method: 'DELETE' })
  res.json({ ok: true })
}))

api.get('/conversations', asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  res.json(await userRpc(auth.token, 'list_conversations'))
}))

api.get('/conversations/:id', asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const conversation = await userRpc<{ messages: Array<{ attachment_url: string | null }> }>(auth.token, 'get_conversation', {
    p_conversation_id: req.params.id,
  })
  conversation.messages = await Promise.all(conversation.messages.map(async (message) => ({
    ...message,
    attachment_url: await signAttachment(message.attachment_url),
  })))
  res.json(conversation)
}))

api.post('/conversations/:id/messages', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const body = z.object({
    content: z.string().max(2000).optional(),
    attachment: z.string().max(300).nullable().optional(),
  }).parse(req.body)
  if (body.content) guardContent(body.content)
  const message = await userRpc<{ attachment_url: string | null }>(auth.token, 'send_message', {
    p_conversation_id: req.params.id,
    p_content: body.content ?? '',
    p_attachment: body.attachment ?? null,
  })
  message.attachment_url = await signAttachment(message.attachment_url)
  res.status(201).json(message)
}))

api.post('/conversations/:id/read', asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  await userRpc(auth.token, 'mark_conversation_read', { p_conversation_id: req.params.id })
  res.json({ ok: true })
}))

api.get('/notifications', asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  res.json(await userRpc(auth.token, 'list_notifications'))
}))

api.post('/notifications/read', asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const body = z.object({ id: z.string().uuid().nullable().optional() }).parse(req.body || {})
  await userRpc(auth.token, 'mark_notifications_read', { p_id: body.id ?? null })
  res.json({ ok: true })
}))

api.get('/earnings', asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  res.json(await userRpc(auth.token, 'get_earnings'))
}))

api.post('/payments/direct', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const body = z.object({
    task_id: z.string().uuid(),
    amount: z.number().positive().max(100000),
    method: z.enum(['cash', 'upi']),
    note: z.string().max(300).optional(),
  }).parse(req.body)
  res.json(await userRpc(auth.token, 'record_direct_payment', {
    p_task_id: body.task_id,
    p_amount: body.amount,
    p_method: body.method,
    p_note: body.note ?? null,
  }))
}))

api.get('/payments/providers', asRoute(async (req, res) => {
  await requireUser(req.header('authorization'))
  res.json({
    razorpay: gatewayFlags.razorpay,
    cashfree: gatewayFlags.cashfree,
    razorpayKeyId: gatewayFlags.razorpay ? env.razorpay.keyId : null,
    cashfreeMode: process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox',
  })
}))

api.post('/payments/orders', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const body = z.object({
    task_id: z.string().uuid(),
    provider: z.enum(['razorpay', 'cashfree']),
  }).parse(req.body)
  res.status(201).json(await createGatewayOrder(auth.token, auth.user, body.task_id, body.provider))
}))

api.post('/payments/verify/razorpay', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  const body = z.object({
    orderId: z.string().min(4),
    paymentId: z.string().min(4),
    signature: z.string().min(8),
  }).parse(req.body)
  const { orderId, paymentId, signature } = body
  if (!orderId || !paymentId || !signature) throw new HttpError(400, 'Invalid payment verification details')
  res.json(await verifyRazorpayPayment(auth.user, { orderId, paymentId, signature }))
}))

api.get('/admin/overview', asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  await requireAdmin(auth)
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const [users, active, tasks, openTasks, completed, reports, disputed] = await Promise.all([
    admin.from('users').select('*', { count: 'exact', head: true }),
    admin.from('users').select('*', { count: 'exact', head: true }).gte('last_seen_at', since),
    admin.from('tasks').select('*', { count: 'exact', head: true }),
    admin.from('tasks').select('*', { count: 'exact', head: true }).in('status', ['open', 'applications_received']),
    admin.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
    admin.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    admin.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'disputed'),
  ])
  res.json({
    users: users.count || 0,
    active_users: active.count || 0,
    tasks: tasks.count || 0,
    open_tasks: openTasks.count || 0,
    completed_tasks: completed.count || 0,
    open_reports: reports.count || 0,
    disputed_tasks: disputed.count || 0,
  })
}))

api.get('/admin/users', asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  await requireAdmin(auth)
  const search = typeof req.query.search === 'string' ? req.query.search.replace(/[^a-zA-Z0-9@. _-]/g, '').slice(0, 80) : ''
  let query = admin.from('users').select('id, full_name, username, email, phone, role, is_suspended, verification_status, created_at, last_seen_at').order('created_at', { ascending: false }).limit(50)
  if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
  const { data, error } = await query
  if (error) throw new HttpError(500, 'Could not load users')
  res.json(data)
}))

api.post('/admin/users/:id/suspension', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  await requireAdmin(auth)
  const body = z.object({ suspended: z.boolean() }).parse(req.body)
  if (req.params.id === auth.user.id) throw new HttpError(400, 'You cannot suspend your own account')
  const { error } = await admin.from('users').update({ is_suspended: body.suspended, updated_at: new Date().toISOString() }).eq('id', req.params.id)
  if (error) throw new HttpError(500, 'Could not update that account')
  res.json({ ok: true })
}))

api.get('/admin/tasks', asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  await requireAdmin(auth)
  const { data, error } = await admin.from('tasks').select('id, title, status, payment_status, public_location_label, created_at, requester_id').order('created_at', { ascending: false }).limit(50)
  if (error) throw new HttpError(500, 'Could not load tasks')
  res.json(data)
}))

api.post('/admin/tasks/:id/cancel', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  await requireAdmin(auth)
  const body = z.object({ reason: z.string().trim().min(4).max(300) }).parse(req.body)
  const { data: task } = await admin.from('tasks').select('id, status, title, requester_id, assigned_helper_id').eq('id', req.params.id).maybeSingle()
  if (!task) throw new HttpError(404, 'Task not found')
  if (task.status === 'completed') throw new HttpError(400, 'Completed tasks stay on record')
  const { error } = await admin.from('tasks').update({
    status: 'cancelled',
    cancelled_reason: body.reason,
    updated_at: new Date().toISOString(),
  }).eq('id', task.id)
  if (error) throw new HttpError(500, 'Could not cancel that task')
  const recipients = [task.requester_id, task.assigned_helper_id].filter(Boolean)
  if (recipients.length) {
    await admin.from('notifications').insert(recipients.map((userId) => ({
      user_id: userId,
      title: 'Task removed',
      message: `"${task.title}" was cancelled by a moderator.`,
      type: 'task_cancelled',
      related_task_id: task.id,
    })))
  }
  res.json({ ok: true })
}))

api.get('/admin/reports', asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  await requireAdmin(auth)
  const { data, error } = await admin.from('reports').select('*').order('created_at', { ascending: false }).limit(50)
  if (error) throw new HttpError(500, 'Could not load reports')
  res.json(data)
}))

api.post('/admin/reports/:id', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  await requireAdmin(auth)
  const body = z.object({ status: z.enum(['reviewing', 'resolved', 'dismissed']) }).parse(req.body)
  const { data: report } = await admin.from('reports').select('*').eq('id', req.params.id).maybeSingle()
  if (!report) throw new HttpError(404, 'Report not found')
  const { error } = await admin.from('reports').update({ status: body.status }).eq('id', report.id)
  if (error) throw new HttpError(500, 'Could not update that report')
  await admin.from('notifications').insert({
    user_id: report.reporter_id,
    title: 'Report update',
    message: `Your report is now marked ${body.status}.`,
    type: 'report',
    related_task_id: report.task_id,
  })
  res.json({ ok: true })
}))

api.get('/admin/categories', asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  await requireAdmin(auth)
  const { data, error } = await admin.from('categories').select('*').order('sort_order')
  if (error) throw new HttpError(500, 'Could not load categories')
  res.json(data)
}))

api.post('/admin/categories', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  await requireAdmin(auth)
  const body = z.object({
    name: z.string().trim().min(2).max(60),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    description: z.string().trim().min(2).max(200),
    icon: z.string().trim().min(2).max(40),
    parent_id: z.string().uuid().nullable(),
    min_age: z.number().int().min(16).max(120),
  }).parse(req.body)
  const { data, error } = await admin.from('categories').insert(body).select('*').single()
  if (error) throw new HttpError(400, 'Could not add that category')
  res.status(201).json(data)
}))

api.patch('/admin/categories/:id', writeLimiter, asRoute(async (req, res) => {
  const auth = await requireUser(req.header('authorization'))
  await requireAdmin(auth)
  const body = z.object({
    name: z.string().trim().min(2).max(60).optional(),
    description: z.string().trim().min(2).max(200).optional(),
    is_active: z.boolean().optional(),
    min_age: z.number().int().min(16).max(120).optional(),
  }).parse(req.body)
  const { data, error } = await admin.from('categories').update(body).eq('id', req.params.id).select('*').single()
  if (error) throw new HttpError(400, 'Could not update that category')
  res.json(data)
}))
