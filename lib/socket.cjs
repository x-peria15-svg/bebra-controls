function closeSocket(socket){
 if(!socket)return;
 socket.removeAllListeners();
 // ws emits an error when a CONNECTING socket is cancelled. This is expected.
 socket.on('error',()=>{});
 socket.close();
}
module.exports={closeSocket};
