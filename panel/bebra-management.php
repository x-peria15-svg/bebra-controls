<?php
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Cache;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Servers\BuildModificationService;
use Pterodactyl\Repositories\Wings\DaemonServerRepository;

Route::get('/bebra/account',fn()=>response()->json(['resource_admin'=>(bool)request()->user()?->root_admin])->header('Cache-Control','no-store'));
Route::match(['GET','POST'],'/bebra/servers/{identifier}/limits',function(string $identifier){
 abort_unless(request()->user()?->root_admin,403);
 abort_unless(preg_match('/^[a-f0-9]{8}(?:-[a-f0-9-]{27})?$/D',$identifier),404);
 $server=Server::query()->where('uuid',$identifier)->orWhere('uuidShort',$identifier)->firstOrFail();
 $snapshot=function(Server $s){
  $metrics=json_decode(@file_get_contents('/var/lib/bebra/host-metrics.json'),true)?:[];
  return ['limits'=>array_intersect_key($s->toArray(),array_flip(['memory','cpu','disk','swap','io','threads'])),
   'backups'=>$s->backup_limit,'databases'=>$s->database_limit,'allocations'=>$s->allocation_limit,
   'node_memory_mib'=>$s->node->memory,'node_disk_mib'=>$s->node->disk,
   'allocated_memory_mib'=>(int)Server::where('node_id',$s->node_id)->sum('memory'),
   'physical_memory_mib'=>(int)(($metrics['total_bytes']??0)/1048576),'system_reserve_mib'=>max(1024,(int)(($metrics['total_bytes']??0)/1048576)-$s->node->memory)];
 };
 if(request()->isMethod('GET'))return response()->json($snapshot($server))->header('Cache-Control','no-store');
 $data=request()->validate([
  'memory'=>'required|integer|min:128|max:65536','cpu'=>'required|integer|min:1|max:800',
  'disk'=>'required|integer|min:256|max:204800','swap'=>'required|integer|min:0|max:4096',
  'io'=>'required|integer|min:10|max:1000','backups'=>'required|integer|min:0|max:30',
  'databases'=>'required|integer|min:0|max:20','allocations'=>'required|integer|min:0|max:20',
 ]);
 return Cache::lock('bebra-resource-node-'.$server->node_id,60)->block(5,function()use($server,$data,$snapshot){
  $server->refresh();$metrics=json_decode(@file_get_contents('/var/lib/bebra/host-metrics.json'),true)?:[];
  abort_unless(isset($metrics['total_bytes']),503,'Метрики VPS недоступны.');
  $memoryTotal=min((int)($metrics['total_bytes']/1048576)-1024,(int)$server->node->memory);
  $memoryUsed=(int)Server::where('node_id',$server->node_id)->where('id','!=',$server->id)->sum('memory');
  abort_if($memoryUsed+$data['memory']>$memoryTotal,422,'Недостаточно памяти: превышен бюджет узла или настроенный системный резерв.');
  $diskUsed=(int)Server::where('node_id',$server->node_id)->where('id','!=',$server->id)->sum('disk');
  abort_if($diskUsed+$data['disk']>(int)$server->node->disk,422,'Сумма лимитов диска превышает ёмкость узла.');
  $daemon=app(DaemonServerRepository::class)->setServer($server);$details=$daemon->getDetails();
  abort_unless(($details['state']??null)==='offline',409,'Сначала останови сервер перед изменением ресурсов.');
  abort_if($data['disk']*1048576<(int)($details['utilization']['disk_bytes']??0),422,'Новый лимит диска меньше занятого места.');
  $old=array_intersect_key($server->toArray(),array_flip(['memory','cpu','disk','swap','io']));
  $updated=app(BuildModificationService::class)->handle($server,[...$data,'backup_limit'=>$data['backups'],'database_limit'=>$data['databases'],'allocation_limit'=>$data['allocations']]);
  $synced=true;try{$daemon->sync();}catch(\Throwable $e){$synced=false;report($e);}
  \Pterodactyl\Facades\Activity::event('server:bebra.resources')->subject($server)->property(['old'=>$old,'new'=>$data])->log();
  return response()->json([...$snapshot($updated),'synced'=>$synced])->header('Cache-Control','no-store');
 });
})->middleware('throttle:20,1');
