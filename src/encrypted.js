import { readFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { resolve } from 'node:path'
import { parseData, sendCommand } from './protocol.js'

function loadMessages(context, name) {
  context.messages = readFileSync(resolve(process.cwd(), `./data/${name.toLowerCase()}.jsonl`), 'utf-8')
    .split('\n')
    .map(JSON.parse)
}

function random() {
  return Math.floor(1 + Math.random() * 999)
}

function discretePower(base, power, modulo) {
  return Number(BigInt(base) ** BigInt(power) % BigInt(modulo))
}

function computeSharedKey(params) {
  const { privateKey, publicKey, otherKey } = params
  return Number(BigInt(params[otherKey]) ** BigInt(params[privateKey]) % BigInt(params.p))
}

function setupKeys(context, name) {
  const privateKey = name[0].toLowerCase()
  context.params.privateKey = privateKey
  context.params.publicKey = `k${privateKey}`
  context.params.otherKey = `k${privateKey === 'a' ? 'b' : 'a'}`
}

function updateParams(params) {
  const { privateKey, publicKey } = params
  let newSharedKey

  do {
    params[privateKey] = random()
    params[publicKey] = discretePower(params.g, params[privateKey], params.p)
    newSharedKey = computeSharedKey(params)
  } while (newSharedKey % 256 === 0) // Make sure the replacement is meaningful
}

function startHandshake(context) {
  const params = context.params
  const { privateKey, publicKey } = params

  // Choose initial params
  params.p = random()
  params[privateKey] = random()
  params[publicKey] = discretePower(params.g, params[privateKey], params.p)

  // Send the new params to the other party
  context.params = params

  sendCommand(context.client, 'SET', JSON.stringify({ g: params.g, p: params.p, [publicKey]: params[publicKey] }))
}

function endHandshake(context, newParams) {
  const params = context.params
  const handshakeCompleted = params.p !== 0

  // Store the new params received
  for (const [key, value] of Object.entries(newParams)) {
    params[key] = value
  }

  // All params are set, start exchanging messages
  if (handshakeCompleted) {
    context.params = params
    sendNextMessage(context)
    return
  }

  // Choose the initial params
  updateParams(params)

  // Send the new params to the other party
  context.params = params
  sendCommand(context.client, 'SET', JSON.stringify({ [params.publicKey]: params[params.publicKey] }))
}

function encrypt(params, data) {
  // Compute the shared key
  const sharedKey = computeSharedKey(params)
  console.log('>>>   ENC', JSON.stringify({ ...params, sharedKey }), '\n')

  const privateKey = params.self
  const publicKey = 'k' + privateKey

  // Choose new parameters for the next encryption
  updateParams(params)
  data.params = params

  // Apply the Caesar Cipher
  const serialized = Buffer.from(JSON.stringify(data), 'utf-8')
  for (let i = 0; i < serialized.length; i++) {
    serialized.writeUInt8((Number(serialized[i]) + sharedKey) % 256, i)
  }

  return serialized
}

function decrypt(params, data) {
  // Compute the shared key
  const sharedKey = computeSharedKey(params)
  console.log('\n<<<   DEC', JSON.stringify({ ...params, sharedKey }))

  // Reverse the Caesar Cipher
  for (let i = 0; i < data.length; i++) {
    let decrypted = (Number(data[i]) - sharedKey) % 256

    if (decrypted <= 0) {
      decrypted += 256
    }

    data.writeUInt8(decrypted, i)
  }

  const parsed = JSON.parse(data)

  // Store the new parameters for the next encryption
  for (const [key, value] of Object.entries(parsed.params)) {
    params[key] = value
  }

  return parsed
}

function sendNextMessage(context) {
  const next = context.messages.shift()

  // No more messages, send stop and exit
  if (!next) {
    sendCommand(context.client, ' STOP')
    context.client.destroy()
    return
  }

  // Encrypt and then send
  console.log(`>>>   MSG ${JSON.stringify(next)}`)
  sendCommand(context.client, 'MSG', encrypt(context.params, next), true)
}

function onData(context, message) {
  const command = message.slice(0, 5).toString('utf-8').trim()
  const payload = message.slice(6)

  switch (command) {
    case 'LOAD':
      {
        const name = payload.toString('utf-8')
        console.log(`<<<  LOAD`, name)

        // Align the output
        if (name === 'Bob') {
          console.log('')
        }

        loadMessages(context, name)
        setupKeys(context, name)
      }
      break
    case 'START':
      {
        console.log('<<< START')
        startHandshake(context)
      }

      break
    case 'SET':
      console.log(`<<<   SET ${payload}`)
      endHandshake(context, JSON.parse(payload))

      break
    case 'MSG':
      {
        const deserialized = decrypt(context.params, payload)
        console.log(`<<<  TEXT ${deserialized.message}`)
        sendNextMessage(context)
      }
      break
    case 'STOP':
      console.log('<<<  STOP')
      context.client.destroy()

      break
  }

  parseData(context)
}

function main() {
  // Create the client
  const client = createConnection({ host: '127.0.0.1', port: 51000 }, () => {
    // Prepare the context
    const context = {
      client,
      buffer: Buffer.alloc(0),
      next: 0,
      // Setup all the encryption parameters
      params: { g: 2, p: 0, a: 0, b: 0, ka: 0, kb: 0 }
    }

    // Setup event handling
    context.callback = onData.bind(null, context)
    client.on('data', parseData.bind(null, context))
    client.on('close', () => console.log('### Connection closed'))
  })
}

setTimeout(main, Math.random() * 100)
