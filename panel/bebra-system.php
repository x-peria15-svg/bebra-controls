<?php
use Illuminate\Support\Facades\{Route,Cache};
use Pterodactyl\Models\{Node,Server};
Route::match(['GET','POST'],'/bebra/system-reserve',function(){
 abort_unless(request()->user()?->root_admin,403);$node=Node::firstOrFail();
 $metrics=json_decode(@file_get_contents('/var/lib/bebra/host-metrics.json'),true)?:[];abort_unless(isset($metrics['total_bytes']),503);
 $total=(int)($metrics['total_bytes']/1048576);
 $snapshot=fn()=>['total_mib'=>$total,'reserve_mib'=>max(0,$total-$node->memory),'server_budget_mib'=>$node->memory,'allocated_mib'=>(int)Server::where('node_id',$node->id)->sum('memory'),'minimum_mib'=>1024,'system_used_bytes'=>$metrics['reserve_used_bytes']??0];
 if(request()->isMethod('GET'))return response()->json($snapshot())->header('Cache-Control','no-store');
 $data=request()->validate(['reserve_mib'=>'required|integer|min:1024|max:65536']);
 return Cache::lock('bebra-resource-node-'.$node->id,60)->block(5,function()use($node,$total,$data,$snapshot){
  $newBudget=$total-$data['reserve_mib'];$allocated=(int)Server::where('node_id',$node->id)->sum('memory');
  abort_if($newBudget<128||$newBudget<$allocated,422,'Недостаточно памяти для нового резерва: сначала уменьши выделение серверов.');
  $old=$node->memory;$node->forceFill(['memory'=>$newBudget])->saveOrFail();
  \Pterodactyl\Facades\Activity::event('bebra:system.reserve')->property(['old_server_budget_mib'=>$old,'new_server_budget_mib'=>$newBudget])->log();
  return response()->json($snapshot())->header('Cache-Control','no-store');
 });
})->middleware('throttle:20,1');
