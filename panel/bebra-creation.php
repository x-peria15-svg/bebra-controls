<?php
use Illuminate\Support\Facades\{Route,Cache};
use Pterodactyl\Models\{Server,Node,Egg,Allocation};
use Pterodactyl\Services\Servers\ServerCreationService;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;

Route::get('/bebra/templates',function(){
 abort_unless(request()->user()?->root_admin,403);$node=Node::firstOrFail();
 return response()->json(['templates'=>\Pterodactyl\Services\Bebra\TemplateRegistry::all(),'memory_free_mib'=>max(0,$node->memory-Server::where('node_id',$node->id)->sum('memory')),'disk_free_mib'=>max(0,$node->disk-Server::where('node_id',$node->id)->sum('disk'))])->header('Cache-Control','no-store');
});
Route::post('/bebra/environments',function(){
 abort_unless(request()->user()?->root_admin,403);
 $data=request()->validate(['request_id'=>'required|uuid','name'=>'required|string|min:2|max:80','template'=>'required|in:java,pumpkin,node,python,custom','memory'=>'required|integer|min:128|max:65536','cpu'=>'required|integer|min:1|max:800','disk'=>'required|integer|min:256|max:204800','public'=>'required|boolean','image'=>'nullable|string|max:255|regex:/^[a-zA-Z0-9][a-zA-Z0-9._\/:@-]*$/','startup'=>'nullable|string|max:2000']);
 $node=Node::firstOrFail();
 return Cache::lock('bebra-resource-node-'.$node->id,60)->block(5,function()use($node,$data){
  $external='bebra-'.$data['request_id'];$existing=Server::where('external_id',$external)->first();
  if($existing)return response()->json(['identifier'=>$existing->uuidShort,'name'=>$existing->name,'created'=>false]);
  $metrics=json_decode(@file_get_contents('/var/lib/bebra/host-metrics.json'),true)?:[];abort_unless(isset($metrics['total_bytes']),503);
  $memoryMax=min((int)$node->memory,(int)($metrics['total_bytes']/1048576)-1024);
  abort_if(Server::where('node_id',$node->id)->sum('memory')+$data['memory']>$memoryMax,422,'Недостаточно памяти: сначала уменьши выделение другого окружения.');
  abort_if(Server::where('node_id',$node->id)->sum('disk')+$data['disk']>$node->disk,422,'Сумма лимитов диска превышает ёмкость узла.');
  $templates=\Pterodactyl\Services\Bebra\TemplateRegistry::all();abort_unless(isset($templates[$data['template']]),422,'Template unavailable. Run the Bebra panel installer.');$t=$templates[$data['template']];$egg=Egg::findOrFail($t['egg']);
  $image=$data['template']==='custom'?($data['image']??''):$t['image'];
  abort_if(!$image,422,'Укажи Docker-образ.');$startup=$data['template']==='custom'?($data['startup']??''):$t['startup'];abort_if(!$startup,422,'Укажи команду запуска.');
  $isGame=in_array($data['template'],['java','pumpkin'],true);$port=$isGame?25570:35000;$end=$isGame?25601:36000;
  while($port<$end&&Allocation::where('node_id',$node->id)->where('port',$port)->exists())$port++;abort_if($port>=$end,422,'Нет свободных портов для новых окружений.');
  $publicIP=config('bebra.public_ip')?:Allocation::where('node_id',$node->id)->pluck('ip')->first(fn($ip)=>filter_var($ip,FILTER_VALIDATE_IP,FILTER_FLAG_NO_PRIV_RANGE|FILTER_FLAG_NO_RES_RANGE));
  abort_if($data['public']&&!$publicIP,422,'Configure BEBRA_PUBLIC_IP before creating public ports.');
  $a=Allocation::create(['node_id'=>$node->id,'ip'=>$data['public']?$publicIP:(config('bebra.internal_ip')?:'172.18.0.1'),'port'=>$port]);
  try{$s=app(ServerCreationService::class)->handle(['external_id'=>$external,'name'=>$data['name'],'description'=>'Bebra environment: '.$data['template'].'. Upload your project files before starting.','owner_id'=>request()->user()->id,'node_id'=>$node->id,'allocation_id'=>$a->id,'egg_id'=>$egg->id,'image'=>$image,'startup'=>$startup,'environment'=>$data['template']==='java'?['SERVER_JARFILE'=>'server.jar']:[],'memory'=>$data['memory'],'cpu'=>$data['cpu'],'disk'=>$data['disk'],'swap'=>0,'io'=>500,'oom_disabled'=>false,'database_limit'=>0,'allocation_limit'=>1,'backup_limit'=>3,'skip_scripts'=>true,'start_on_completion'=>false]);}
  catch(\Throwable $e){if(!$a->refresh()->server_id)$a->delete();throw $e;}
  $ready=true;
  try{$f=app(DaemonFileRepository::class)->setServer($s);
   if(in_array($data['template'],['node','python'])){
    $command=$data['template']==='node'?'exec node index.js':'exec python3 main.py';
    $f->putContent('/start.sh',"#!/bin/bash\nset -e\ncd /home/container\nexport PORT=\"\$SERVER_PORT\"\n".$command."\n");
    $f->putContent('/README.txt',"Upload your project files. Node.js: index.js; Python: main.py. Install dependencies using start.sh if needed. Listen on 0.0.0.0 and use the PORT environment variable.\n");
   }else $f->putContent('/README.txt',"Upload your application before starting. Minecraft Java needs server.jar. Pumpkin needs the executable pumpkin with execute permission. Custom Docker images must support Pterodactyl startup, user and working directory conventions.\n");
  }catch(\Throwable $e){$ready=false;report($e);}
  \Pterodactyl\Facades\Activity::event('server:bebra.create')->subject($s)->property(['template'=>$data['template'],'memory'=>$data['memory'],'public'=>$data['public']])->log();
  return response()->json(['identifier'=>$s->uuidShort,'name'=>$s->name,'created'=>true,'files_ready'=>$ready,'port'=>$port,'public'=>$data['public']],201)->header('Cache-Control','no-store');
 });
})->middleware('throttle:5,1');
