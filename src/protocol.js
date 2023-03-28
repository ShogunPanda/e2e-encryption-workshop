export function sendCommand(client, command, payload, skipLog) {
  if (payload && !Buffer.isBuffer(payload)) {
    payload = Buffer.from(payload, 'utf-8')
  } else if (!payload) {
    payload = Buffer.alloc(0)
  }

  const message = Buffer.concat([Buffer.from(command.padStart(5, ' ') + ' ', 'utf-8'), payload])
  const prefix = Buffer.alloc(4)
  prefix.writeUInt32BE(message.length)

  if (!skipLog) {
    console.log(`>>> ${command.padStart(5, ' ') + ' '}${payload}`)
  }

  client.write(Buffer.concat([prefix, message]))
}

export function parseData(context, chunk) {
  if (chunk) {
    context.buffer = Buffer.concat([context.buffer, chunk])
  }

  if (context.next === 0) {
    if (context.buffer.length < 4) {
      return
    }

    context.next = context.buffer.readUInt32BE()
    context.buffer = context.buffer.slice(4)
  }

  if (context.buffer.length < context.next) {
    return
  }

  const message = context.buffer.slice(0, context.next)
  context.buffer = context.buffer.slice(context.next)
  context.next = 0

  context.callback(message, chunk)

  parseData(context, null)
}
