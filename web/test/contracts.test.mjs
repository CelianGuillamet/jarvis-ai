import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JarvisChatResponseSchema, JarvisStatusSnapshotSchema, InboxZeroScanResponseSchema, InboxZeroApplyResponseSchema } from '../src/core/contracts/v1.ts';

const scan = {
 session: {sessionId:'owned',status:'active',step:'urgent',query:'in:inbox',startedAt:'2026-09-30T00:00:00Z',scannedAt:null,counts:Object.fromEntries(['urgent','quick_wins','schedule','ignore','newsletters'].map(key => [key,{pending:0,processed:0}]))},
 items:[],recentActions:[],
};
test('empty inbox is valid only with its complete session and counts', () => {
 assert.equal(InboxZeroScanResponseSchema.safeParse(scan).success,true);
 assert.equal(InboxZeroScanResponseSchema.safeParse([]).success,false);
 const broken=structuredClone(scan);broken.session.counts.urgent.pending='0';
 assert.equal(InboxZeroScanResponseSchema.safeParse(broken).success,false);
});
test('nested operation steps must describe known states', () => {
 const payload={...scan,results:[{messageId:'m',ok:false,outcome:'unknown',steps:{send:'unknown',labels:'pending',local:'pending'}}]};
 assert.equal(InboxZeroApplyResponseSchema.safeParse(payload).success,true);
 payload.results[0].steps.send='probably sent';
 assert.equal(InboxZeroApplyResponseSchema.safeParse(payload).success,false);
});
test('chat replay retains command identity and rejects fabricated states', () => {
 const payload={text:'En cours',meta:{commandId:'c',commandState:'executing'}};
 assert.deepEqual(JarvisChatResponseSchema.parse(payload),payload);
 payload.meta.commandState='success-ish';
 assert.equal(JarvisChatResponseSchema.safeParse(payload).success,false);
});
test('a partial status object cannot masquerade as a complete dashboard', () => {
 assert.equal(JarvisStatusSnapshotSchema.safeParse({sessionId:'owned',metrics:{openTodos:0}}).success,false);
});
test('quick actions match server labels and neutral suggestions', async () => {
 const { JarvisQuickActionSchema, JarvisSuggestionSchema } = await import('../src/core/contracts/v1.ts');
 assert.deepEqual(JarvisQuickActionSchema.parse({kind:'link',label:'Connecter Google',href:'/auth/google'}), {kind:'link',label:'Connecter Google',href:'/auth/google'});
 assert.equal(JarvisSuggestionSchema.safeParse({title:'Prochaine étape',detail:'À préparer',tone:'neutral'}).success,true);
});
test('request contracts preserve send identity requirements and batch limits', async () => {
 const { InboxZeroApplyRequestSchema, ChatRequestSchema, MessageQuerySchema } = await import('../src/core/contracts/v1.ts');
 assert.equal(InboxZeroApplyRequestSchema.safeParse({action:'send_reply',messageIds:['m'],replyText:'Bonjour'}).success,false);
 assert.equal(InboxZeroApplyRequestSchema.safeParse({action:'send_reply',messageIds:['m'],replyText:'Bonjour',requestId:'attempt',reviewedReply:{to:'sender@example.invalid',subject:'Re: Test question'}}).success,true);
 assert.equal(InboxZeroApplyRequestSchema.safeParse({action:'archive',messageIds:Array(21).fill('m')}).success,false);
 assert.equal(ChatRequestSchema.safeParse({text:'Bonjour',ownerId:'foreign'}).success,false);
 assert.equal(MessageQuerySchema.safeParse({messageId:['m','n']}).success,false);
});

test('inbox rejects missing or invented business outcomes', () => {
 const result={messageId:'m',ok:false,outcome:'unknown'};
 assert.equal(InboxZeroApplyResponseSchema.safeParse({...scan,results:[result]}).success,true);
 for (const outcome of [undefined,'failed-ish']) {
  assert.equal(InboxZeroApplyResponseSchema.safeParse({...scan,results:[{...result,outcome}]}).success,false);
 }
});

test('inbox outcomes reject contradictory success and execution evidence', async () => {
 const { InboxZeroApplyResultSchema: schema } = await import('../src/core/contracts/v1.ts');
 const partial = {messageId:'m',ok:false,outcome:'partial',operationId:'op',providerReference:{messageId:'sent',threadId:null},steps:{send:'completed',labels:'pending',local:'pending'}};
 assert.equal(schema.safeParse(partial).success,true);
 assert.equal(schema.safeParse({messageId:'m',ok:true,outcome:'simulated',simulated:true}).success,true);
 for (const result of [
  {...partial,ok:true}, {...partial,providerReference:null}, {...partial,steps:undefined},
  {...partial,outcome:'completed',ok:true}, {...partial,outcome:'unknown'},
  {...partial,steps:{send:'completed',labels:'pending',local:'completed'}},
  {messageId:'m',ok:true,outcome:'simulated'},
  {messageId:'m',ok:true,outcome:'completed',simulated:true},
 ]) assert.equal(schema.safeParse(result).success,false);
});
