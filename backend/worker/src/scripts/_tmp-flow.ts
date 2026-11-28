import { createHarness } from './harness.js';

const turns: string[] = JSON.parse(process.argv[2] ?? '[]');
const h = await createHarness({ slug: process.argv[3] });
const { conversationId, customerId } = await h.newCustomer(`2349${String(Date.now()).slice(-8)}9`, 'Eval Customer');
for (const t of turns) {
  const r = await h.say(conversationId, customerId, t);
  console.log(`\n>>> CUSTOMER: ${t}`);
  for (const c of r.toolCalls) console.log(`>>> TOOL ${c.name} ${JSON.stringify(c.args)} => ${JSON.stringify(c.result).slice(0, 150)}`);
  console.log(`>>> ASSISTANT:\n${r.reply}`);
}
const conv = await h.db.conversation.findUniqueOrThrow({ where: { id: conversationId } });
console.log(`\n>>> FINAL STATUS: ${conv.status}`);
await h.db.customer.deleteMany({ where: { businessId: h.businessId, name: 'Eval Customer' } });
await h.close();
