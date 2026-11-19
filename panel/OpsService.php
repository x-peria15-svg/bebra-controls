<?php
namespace Pterodactyl\Services\Bebra;
use Pterodactyl\Models\Server;
class OpsService {
 public static function call(array $data):array {
  abort_unless(request()->user()?->root_admin,403);
  $client=new \GuzzleHttp\Client(['curl'=>[CURLOPT_UNIX_SOCKET_PATH=>'/run/bebra-ops/control.sock'],'timeout'=>10]);
  try{$r=$client->post('http://localhost/', ['json'=>$data]);return json_decode((string)$r->getBody(),true,512,JSON_THROW_ON_ERROR);}catch(\Throwable $e){abort(503,'Служба операций недоступна.');}
 }
 public static function endpoint(array $value):array {
  if(($value['kind']??'')==='shared')return ['kind'=>'shared','path'=>$value['path']];
  $id=$value['server']??'';abort_unless(preg_match('/^[a-f0-9]{8}(?:-[a-f0-9-]{27})?$/D',$id),422);
  $s=Server::where('uuid',$id)->orWhere('uuidShort',$id)->firstOrFail();abort_unless($s->node_id===Server::first()?->node_id,422);
  return ['kind'=>'server','uuid'=>$s->uuid,'path'=>$value['path'],'limit_bytes'=>$s->disk*1048576];
 }
}
