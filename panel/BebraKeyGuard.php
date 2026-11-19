<?php
namespace Pterodactyl\Http\Middleware;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Pterodactyl\Models\ApiKey;
class BebraKeyGuard
{
 public function handle(Request $request,Closure $next){
  $user=$request->user();if(!$user||$user->root_admin)return $next($request);
  $grant=DB::table('bebra_access_keys')->where('user_id',$user->id)->first();if(!$grant)return $next($request);
  abort_if($grant->revoked_at||($grant->expires_at&&strtotime($grant->expires_at)<=time()),403,'Access key expired or revoked.');
  $key=ApiKey::where('identifier',substr($request->bearerToken()??'',0,ApiKey::IDENTIFIER_LENGTH))->first();
  abort_unless($key&&(int)$key->id===(int)$grant->api_key_id,403,'Only the issued credential is allowed.');
  $p=$request->path();abort_unless($p==='api/client'||str_starts_with($p,'api/client/servers/')||$p==='api/client/permissions'||$p==='api/client/bebra/account'||preg_match('#^api/client/bebra/servers/[a-f0-9-]+/history$#D',$p),403,'Service credentials cannot manage accounts or issue credentials.');
  return $next($request);
 }
}
