const http = require('http')

const data = JSON.stringify({
  content: "Oi MomAI, responda algo curto para testar o som",
  thread_id: "test-tts-" + Date.now(),
  speak_response: true
})

const req = http.request({
  hostname: '127.0.0.1',
  port: 8000,
  path: '/chat/stream',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, (res) => {
  let body = ''
  res.on('data', chunk => { body += chunk })
  res.on('end', () => {
    console.log('Stream finished. Length:', body.length)
  })
})

req.on('error', e => console.error('Request error:', e.message))
req.write(data)
req.end()

console.log('Sent chat stream request...')
