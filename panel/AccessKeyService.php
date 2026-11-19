<?php
namespace Pterodactyl\Services\Bebra;
use Illuminate\Support\Facades\DB;
use Pterodactyl\Models\{User,Server,Subuser,ApiKey};
use Pterodactyl\Repositories\Wings\DaemonRevocationRepository;
class AccessKeyService
{
 public static function revoke($grant):bool{
  $user=User::find($grant->user_id);$nodes=Server::whereIn('id',json_decode($grant->server_ids,true))->get()->groupBy('node_id');$disconnected=true;
  DB::transaction(function()use($grant,$user){DB::table('bebra_access_keys')->where('id',$grant->id)->update(['revoked_at'=>now()]);ApiKey::where('user_id',$grant->user_id)->delete();Subuser::where('user_id',$grant->user_id)->delete();if($user)$user->delete();});
  if($user)foreach($nodes as $servers){try{app(DaemonRevocationRepository::class)->setNode($servers->first()->node)->deauthorize($user->uuid,$servers->pluck('uuid')->all());}catch(\Throwable $e){$disconnected=false;report($e);\Pterodactyl\Jobs\RevokeSftpAccessJob::dispatch($user->uuid,$servers->first()->node);}}
  return $disconnected;
 }
}
