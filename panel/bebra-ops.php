<?php
use Illuminate\Support\Facades\Route;
use Pterodactyl\Services\Bebra\OpsService;
use Pterodactyl\Models\Server;
Route::get('/bebra/operations',fn()=>response()->json(OpsService::call(['action'=>'list']))->header('Cache-Control','no-store'));
Route::get('/bebra/operations/{id}',fn(string $id)=>response()->json(OpsService::call(['action'=>'status','id'=>$id]))->header('Cache-Control','no-store'));
Route::post('/bebra/transfers',function(){
 abort_unless(request()->user()?->root_admin,403);
 $d=request()->validate(['source'=>'required|array','target'=>'required|array','source.kind'=>'required|in:server,shared','target.kind'=>'required|in:server,shared','source.server'=>'nullable|string','target.server'=>'nullable|string','source.path'=>'required|string|max:1024','target.path'=>'required|string|max:1024','move'=>'required|boolean']);
 return response()->json(OpsService::call(['action'=>'transfer','source'=>OpsService::endpoint($d['source']),'target'=>OpsService::endpoint($d['target']),'move'=>$d['move']]),202);
})->middleware('throttle:10,1');
Route::post('/bebra/domains',function(){
 abort_unless(request()->user()?->root_admin,403);
 $d=request()->validate(['server'=>'required|string','domain'=>'required|string|max:253']);
 abort_unless(preg_match('/^[a-f0-9]{8}(?:-[a-f0-9-]{27})?$/D',$d['server']),422);
 $s=Server::with(['allocation','egg'])->where('uuid',$d['server'])->orWhere('uuidShort',$d['server'])->firstOrFail();
 abort_unless(preg_match('/node|python|apps|custom/i',$s->egg->name.' '.$s->description),422);
 $a=$s->allocation;
 return response()->json(OpsService::call(['action'=>'domain','domain'=>$d['domain'],'uuid'=>$s->uuid,'ip'=>$a->ip,'port'=>$a->port]),202);
})->middleware('throttle:5,1');
