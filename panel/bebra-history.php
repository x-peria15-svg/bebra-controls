<?php
use Illuminate\Support\Facades\{Route,DB};
use Pterodactyl\Models\Server;
Route::get('/bebra/servers/{identifier}/history',function(string $identifier){
 abort_unless(preg_match('/^[a-f0-9]{8}(?:-[a-f0-9-]{27})?$/D',$identifier),404);
 $s=Server::where('uuid',$identifier)->orWhere('uuidShort',$identifier)->firstOrFail();$u=request()->user();
 abort_unless($u&&($u->root_admin||$s->owner_id===$u->id||$s->subusers()->where('user_id',$u->id)->exists()),403);
 $range=request()->query('range','1h');$ranges=['1h'=>[3600,60],'24h'=>[86400,300],'7d'=>[604800,1800]];abort_unless(isset($ranges[$range]),422);[$seconds,$step]=$ranges[$range];
 $rows=DB::table('bebra_resource_samples')->where('server_id',$s->id)->where('sampled_at','>=',time()-$seconds)->selectRaw('FLOOR(sampled_at / ?) * ? AS time, AVG(cpu_percent) AS cpu, AVG(memory_bytes) AS memory, MAX(disk_bytes) AS disk, MAX(players) AS players',[$step,$step])->groupByRaw('FLOOR(sampled_at / ?)',[$step])->orderBy('time')->get();
 return response()->json(['range'=>$range,'interval_seconds'=>$step,'samples'=>$rows,'first_sample_at'=>DB::table('bebra_resource_samples')->where('server_id',$s->id)->min('sampled_at')])->header('Cache-Control','no-store');
});
