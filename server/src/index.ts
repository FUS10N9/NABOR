import app from './app.js'
import { env } from './config.js'

app.listen(env.port, () => {
  console.log(`Nabor API listening on ${env.port}`)
})
