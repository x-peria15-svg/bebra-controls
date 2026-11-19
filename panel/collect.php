<?php
require dirname(__DIR__).'/vendor/autoload.php';
$app=require dirname(__DIR__).'/bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use Illuminate\Support\Facades\DB;
use Pterodactyl\Models\Server;
use Pterodactyl\Repositories\Wings\DaemonServerRepository;
function bebraVarInt(int $n):string{$s='';do{$x=$n&127;$n>>=7;$s.=chr($n?$x|128:$x);}while($n);return $s;}
function bebraReadVarInt($f):?int{$n=0;for($i=0;$i<5;$i++){$b=fread($f,1);if($b===''||$b===false)return null;$v=ord($b);$n|=($v&127)<<($i*7);if(!($v&128))return $n;}return null;}
function bebraOnline($s):?int{
 if(!str_contains(strtolower($s->egg->name),'minecraft')&&!str_contains(strtolower($s->egg->name),'pumpkin')&&!str_contains(strtolower($s->egg->name),'velocity')&&!str_contains(strtolower($s->egg->name),'paper'))return null;
 $a=$s->allocation;$f=@stream_socket_client('tcp://'.$a->ip.':'.$a->port,$errno,$error,0.5);if(!$f)return null;stream_set_timeout($f,0,500000);
 try{$host=$a->ip;$hand=bebraVarInt(0).bebraVarInt(777).bebraVarInt(strlen($host)).$host.pack('n',$a->port).bebraVarInt(1);fwrite($f,bebraVarInt(strlen($hand)).$hand."\x01\x00");$length=bebraReadVarInt($f);if(!$length||$length>65536)return null;$id=bebraReadVarInt($f);$jsonLength=bebraReadVarInt($f);if($id!==0||!$jsonLength||$jsonLength>65536)return null;$text='';while(strlen($text)<$jsonLength){$part=fread($f,$jsonLength-strlen($text));if(!$part)break;$text.=$part;}$status=json_decode($text,true);return isset($status['players']['online'])?max(0,(int)$status['players']['online']):null;}finally{fclose($f);}
}
$sample=(int)(floor(time()/60)*60);$count=0;$containers=0;
foreach(Server::with(['node','egg','allocation'])->get() as $s){try{$d=app(DaemonServerRepository::class)->setServer($s)->getDetails();$v=$d['utilization']??[];$containers+=(int)($v['memory_bytes']??0);$running=($d['state']??'')==='running';DB::table('bebra_resource_samples')->updateOrInsert(['server_id'=>$s->id,'sampled_at'=>$sample],['cpu_percent'=>(float)($v['cpu_absolute']??0),'memory_bytes'=>(int)($v['memory_bytes']??0),'disk_bytes'=>(int)($v['disk_bytes']??0),'players'=>$running?bebraOnline($s):0]);$count++;}catch(\Throwable $e){report($e);}}
// Host overview is local to this single-node installation. Credentials never enter this file.
if(is_readable('/proc/meminfo')){
 $mem=[];foreach(file('/proc/meminfo') as $line)if(preg_match('/^(\w+):\s+(\d+)/',$line,$m))$mem[$m[1]]=(int)$m[2]*1024;
 $total=$mem['MemTotal'];$available=$mem['MemAvailable'];$used=$total-$available;$reserve=max(0,$used-$containers);$panel=0;
 foreach(array_unique([...glob('/sys/fs/cgroup/system.slice/php*-fpm.service'),...array_map(fn($s)=>'/sys/fs/cgroup/system.slice/'.$s.'.service',['nginx','mariadb','redis-server','pteroq','wings'])]) as $cg){if(is_file($cg.'/memory.current')){$value=(int)file_get_contents($cg.'/memory.current');$inactive=0;if(preg_match('/^inactive_file (\d+)/m',@file_get_contents($cg.'/memory.stat')?:'',$m))$inactive=(int)$m[1];$panel+=max(0,$value-$inactive);}}
 $panel=min($panel,$reserve);$capacity=\Pterodactyl\Models\Node::first()?->memory*1048576;$allocated=Server::sum('memory')*1048576;
 $metrics=['timestamp'=>time(),'total_bytes'=>$total,'available_bytes'=>$available,'used_bytes'=>$used,'allocated_bytes'=>$allocated,'containers_bytes'=>$containers,'reserve_budget_bytes'=>max(0,$total-$capacity),'server_budget_bytes'=>$capacity,'unallocated_server_bytes'=>max(0,$capacity-$allocated),'reserve_used_bytes'=>$reserve,'panel_bytes'=>$panel,'system_bytes'=>max(0,$reserve-$panel),'disk_total_bytes'=>(int)disk_total_space('/'),'disk_used_bytes'=>(int)(disk_total_space('/')-disk_free_space('/'))];
 if(!is_dir('/var/lib/bebra'))mkdir('/var/lib/bebra',0755,true);$tmp='/var/lib/bebra/host-metrics.json.new';file_put_contents($tmp,json_encode($metrics));chmod($tmp,0644);rename($tmp,'/var/lib/bebra/host-metrics.json');
}
DB::table('bebra_resource_samples')->where('sampled_at','<',time()-14*86400)->delete();
foreach(DB::table('bebra_access_keys')->whereNull('revoked_at')->where('expires_at','<=',now())->get() as $g)\Pterodactyl\Services\Bebra\AccessKeyService::revoke($g);
echo 'SAMPLES_COLLECTED '.$count.PHP_EOL;
