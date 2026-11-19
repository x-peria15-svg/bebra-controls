<?php
use Illuminate\Support\Facades\{Route,DB,Hash};
use Pterodactyl\Models\{User,Server,Subuser,ApiKey,Permission};
use Pterodactyl\Services\Api\KeyCreationService;
use Pterodactyl\Repositories\Wings\DaemonRevocationRepository;

Route::get('/bebra/keys',function(){abort_unless(request()->user()?->root_admin,403);return response()->json(['data'=>DB::table('bebra_access_keys')->orderByDesc('id')->get()->map(fn($g)=>['id'=>$g->id,'name'=>$g->name,'prefix'=>$g->prefix,'servers'=>json_decode($g->server_ids,true),'permissions'=>json_decode($g->permissions,true),'expires_at'=>$g->expires_at,'revoked_at'=>$g->revoked_at,'created_at'=>$g->created_at])])->header('Cache-Control','no-store');});
Route::post('/bebra/keys',function(){
 abort_unless(request()->user()?->root_admin,403);
 $d=request()->validate(['name'=>'required|string|min:2|max:80','servers'=>'required|array|min:1|max:50','servers.*'=>'required|integer|exists:servers,id','permissions'=>'required|array|min:1|max:60','permissions.*'=>'required|string','expires_days'=>'required|integer|min:1|max:365']);
 $allowed=Permission::permissions()->flatMap(fn($g,$prefix)=>array_map(fn($key)=>$prefix.'.'.$key,array_keys($g['keys'])))->filter(fn($p)=>!str_starts_with($p,'user.'))->all();
 abort_if(count(array_diff($d['permissions'],$allowed)),422,'Unknown or non-delegable permission.');
 $result=DB::transaction(function()use($d){
  $suffix=bin2hex(random_bytes(8));$u=new User;$u->forceFill(['uuid'=>(string)Illuminate\Support\Str::uuid(),'username'=>'bebra_key_'.$suffix,'email'=>'bebra_key_'.$suffix.'@access.invalid','name_first'=>'Bebra','name_last'=>'Access','password'=>Hash::make(bin2hex(random_bytes(48))),'root_admin'=>false,'language'=>'en']);$u->saveOrFail();
  $permissions=array_values(array_unique([...$d['permissions'],'websocket.connect']));$serverIds=array_values(array_unique($d['servers']));
  foreach($serverIds as $id){$sub=new Subuser;$sub->forceFill(['user_id'=>$u->id,'server_id'=>$id,'permissions'=>$permissions]);$sub->saveOrFail();}
  $expiry=now()->addDays($d['expires_days']);$key=app(KeyCreationService::class)->setKeyType(ApiKey::TYPE_ACCOUNT)->handle(['user_id'=>$u->id,'memo'=>'Bebra scoped access','expires_at'=>$expiry]);
  $token=$key->identifier.app('encrypter')->decrypt($key->token);
  $id=DB::table('bebra_access_keys')->insertGetId(['created_by'=>request()->user()->id,'user_id'=>$u->id,'api_key_id'=>$key->id,'name'=>$d['name'],'prefix'=>$key->identifier,'server_ids'=>json_encode($serverIds),'permissions'=>json_encode($permissions),'expires_at'=>$expiry,'created_at'=>now()]);
  return ['id'=>$id,'token'=>$token,'expires_at'=>$expiry];
 });
 \Pterodactyl\Facades\Activity::event('bebra:key.create')->property(['grant_id'=>$result['id'],'name'=>$d['name'],'servers'=>$d['servers']])->log();
 return response()->json($result,201)->header('Cache-Control','no-store');
})->middleware('throttle:5,1');
Route::delete('/bebra/keys/{id}',function(int $id){abort_unless(request()->user()?->root_admin,403);$g=DB::table('bebra_access_keys')->where('id',$id)->first();abort_unless($g,404);$disconnected=$g->revoked_at?true:\Pterodactyl\Services\Bebra\AccessKeyService::revoke($g);\Pterodactyl\Facades\Activity::event('bebra:key.revoke')->property(['grant_id'=>$id])->log();return response()->json(['revoked'=>true,'sessions_disconnected'=>$disconnected])->header('Cache-Control','no-store');});
