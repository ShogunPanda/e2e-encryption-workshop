import { readFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { resolve } from 'node:path'
import { parseData, sendCommand } from './protocol.js'

function loadMessages(context, name) {
  context.messages = readFileSync(resolve(process.cwd(), `./data/${name.toLowerCase()}.jsonl`), 'utf-8')
    .split('\n')
    .map(JSON.parse)
}

function sendNextMessage(context) {
  const next = context.messages.shift()

  // No more messages, send stop and exit
  if (!next) {
    sendCommand(context.client, ' STOP')
    context.client.destroy()
    return
  }

  sendCommand(context.client, 'MSG', JSON.stringify(next))
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
      }
      break
    case 'START':
      console.log('<<< START')
      sendNextMessage(context)

      break
    case 'MSG':
      console.log(`<<<  TEXT ${JSON.parse(payload).message}`)
      sendNextMessage(context)

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
      next: 0
    }

    // Setup event handling
    context.callback = onData.bind(null, context)
    client.on('data', parseData.bind(null, context))
    client.on('close', () => console.log('### Connection closed'))
  })
}

setTimeout(main, 100 + Math.random() * 100)
