const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');const WebSocket=require('ws');
const {closeSocket}=require('../lib/socket.cjs');
test('switching server safely cancels a WebSocket before its handshake completes',async()=>{
 const server=http.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const socket=new WebSocket('ws://127.0.0.1:'+server.address().port);
  assert.equal(socket.readyState,WebSocket.CONNECTING);
  closeSocket(socket);
  await new Promise(resolve=>socket.once('close',resolve));
  assert.equal(socket.readyState,WebSocket.CLOSED);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
