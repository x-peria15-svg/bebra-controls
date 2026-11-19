export function normalizeServer(server){
 const allocations=(server.relationships?.allocations?.data||[]).map(x=>x.attributes);
 return {...server,allocation:server.allocation||allocations.find(a=>a.is_default)||allocations[0]||{ip:'—',port:'—'}};
}
