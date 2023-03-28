import { createServer } from 'node:net'
import { parseData, sendCommand } from './protocol.js'

function forwardMessage(context, index, message, chunk) {
  const command = message.slice(0, 5).toString('utf-8').trim()
  const payload = message.slice(6)

  const other = (index + 1) % 2
  console.log(`${context.names[index]} -> ${context.names[other]}: ${command.padStart(5, ' ')} ${payload}`)
  context.clients[other].write(chunk)
}

function onClientDisconnect(server, context) {
  context.connected--

  if (context.connected === 0) {
    server.close()
    console.log('### Public channel closed')
  }
}

function main() {
  const context = {
    connected: 0,
    names: ['Alice', 'Bob'],
    clients: []
  }

  const server = createServer(client => {
    let index = context.connected++
    context.clients.push(client)

    const parseContext = {
      buffer: Buffer.alloc(0),
      next: 0
    }

    parseContext.callback = forwardMessage.bind(null, context, index)

    client.on('data', parseData.bind(null, parseContext))
    sendCommand(client, 'LOAD', context.names[index], true)

    if (context.connected === 2) {
      sendCommand(context.clients[0], 'START', undefined, true)
    }

    client.on('close', onClientDisconnect.bind(null, server, context))
  })

  server.listen({ host: '127.0.0.1', port: 51000 })
  console.log('### Public channel ready')
}

main()
