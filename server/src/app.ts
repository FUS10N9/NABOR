import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import morgan from 'morgan'
import { env } from './config.js'
import { errorHandler, asRoute } from './lib/http.js'
import { api } from './routes/api.js'
import { handleCashfreeWebhook, handleRazorpayWebhook } from './services/payments.js'

const app = express()
app.set('trust proxy', 1)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}))
function originAllowed(origin: string) {
  if (env.origins.includes(origin)) return true
  if (process.env.NODE_ENV === 'production') return false
  try {
    const host = new URL(origin).hostname
    return host === 'localhost' || host === '127.0.0.1'
  } catch {
    return false
  }
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || originAllowed(origin)) callback(null, true)
    else callback(new Error('Origin not allowed'))
  },
  allowedHeaders: ['Authorization', 'Content-Type'],
}))
app.use(morgan('dev'))

app.post('/api/payments/webhook/razorpay', express.raw({ type: 'application/json' }), asRoute(async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('')
  res.json(await handleRazorpayWebhook(raw, req.header('x-razorpay-signature')))
}))

app.post('/api/payments/webhook/cashfree', express.raw({ type: 'application/json' }), asRoute(async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('')
  res.json(await handleCashfreeWebhook(raw, req.header('x-webhook-signature'), req.header('x-webhook-timestamp')))
}))

app.use(express.json({ limit: '1mb' }))
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.includes('/webhook'),
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many requests. Try again shortly.' })
  },
}))
app.use('/api', api)
app.use(errorHandler)

export default app
