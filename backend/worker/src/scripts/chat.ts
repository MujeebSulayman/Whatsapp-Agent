import { createInterface } from 'node:readline/promises';
import { createHarness } from './harness.js';

/** Talk to the real agent from the terminal, as a customer of the demo business. Nothing is sent to WhatsApp. */
if (!process.env.OPENROUTER_API_KEY) {
  console.error('Set OPENROUTER_API_KEY in backend/.env first (https://openrouter.ai/keys).');
  process.exit(1);
}

const h = await createHarness();
let { conversationId, customerId } = await h.newCustomer(`23400${Date.now().toString().slice(-8)}`, 'Terminal Tester');
const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log('Chatting with the Lekki Small Chops assistant. Type a message. "/new" starts over, "/quit" exits.\n');

while (true) {
  const text = (await rl.question('you > ')).trim();
  if (!text) continue;
  if (text === '/quit') break;
  if (text === '/new') {
    ({ conversationId, customerId } = await h.newCustomer(`23400${Date.now().toString().slice(-8)}`, 'Terminal Tester'));
    console.log('(new customer, new conversation)\n');
    continue;
  }
  const { reply, toolCalls } = await h.say(conversationId, customerId, text);
  for (const t of toolCalls) console.log(`  · tool: ${t.name}(${JSON.stringify(t.args)})`);
  console.log(`bot > ${reply ?? '(no reply: a human may have taken over)'}\n`);
}
rl.close();
await h.close();
