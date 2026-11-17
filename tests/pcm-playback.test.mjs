import test from 'node:test';
import assert from 'node:assert/strict';
import { PcmPlayback } from '../shared/pcm-playback.mjs';
function fixture() {
 const nodes=[], states=[];
 const context={currentTime:10,destination:{},createBuffer:(_channels,length,rate)=>({duration:length/rate,getChannelData:()=>new Float32Array(length)}),createBufferSource:()=>{
  const node={connect(){},disconnect(){this.disconnected=true;},start(time){this.time=time;},stop(){this.stopped=true;}};
  nodes.push(node);return node;
 }};
 return {context,nodes,states,player:new PcmPlayback(context,value=>states.push(value))};
}
const audio=Buffer.alloc(12000).toString('base64');
test('PCM schedules ordered 24kHz chunks and remains speaking until end and drain',()=>{
 const {player,nodes,states}=fixture();player.append(audio);player.append(audio);
 assert.equal(nodes[0].buffer.duration,0.25);assert.equal(nodes[1].time,nodes[0].time+0.25);
 player.end();assert.equal(states.at(-1),true);
 nodes[0].onended();assert.equal(states.at(-1),true);
 nodes[1].onended();assert.equal(states.at(-1),false);assert.ok(nodes.every(n=>n.disconnected));
});
test('network gaps do not finish a sequence and end after a drained queue clears speaking',()=>{
 const {player,nodes,states}=fixture();player.append(audio);nodes[0].onended();
 assert.equal(states.at(-1),true);player.end();assert.equal(states.at(-1),false);
});
test('interrupt stops all nodes and stale callbacks cannot change a later sequence',()=>{
 const {player,nodes,states,context}=fixture();player.append(audio);
 const late=nodes[0].onended;player.clear();assert.ok(nodes[0].stopped);assert.ok(nodes[0].disconnected);
 context.currentTime=20;player.append(audio);late();assert.equal(states.at(-1),true);assert.equal(nodes[1].time,20.02);
 player.end();nodes[1].onended();assert.equal(states.at(-1),false);player.clear();
});
test('malformed PCM never creates a source',()=>{
 const {player,nodes}=fixture();for(const audio of ['', 'AA==', '!'])assert.throws(()=>player.append(audio));assert.equal(nodes.length,0);
});
