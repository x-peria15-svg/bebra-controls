const {test}=require('node:test');const assert=require('node:assert/strict');
test('uses default Pterodactyl relationship allocation rather than an absent top-level property',async()=>{
 const {normalizeServer}=await import('../ui/model.mjs');
 const s=normalizeServer({name:'Lobby',relationships:{allocations:{data:[{attributes:{ip:'192.0.2.10',port:3000,is_default:false}},{attributes:{ip:'172.18.0.1',port:25566,is_default:true}}]}}});
 assert.equal(s.allocation.port,25566);assert.equal(normalizeServer({name:'No allocation'}).allocation.ip,'—');
});
