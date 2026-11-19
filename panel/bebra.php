<?php
Illuminate\Support\Facades\Route::get('/bebra/host',function(){
 abort_unless(request()->user()?->root_admin,403);
 $file='/var/lib/bebra/host-metrics.json';abort_unless(is_readable($file),503);
 return response()->json(json_decode(file_get_contents($file),true))->header('Cache-Control','no-store');
});
require __DIR__ . '/bebra-management.php';
require __DIR__ . '/bebra-creation.php';
require __DIR__ . '/bebra-system.php';
require __DIR__ . '/bebra-history.php';
require __DIR__ . '/bebra-keys.php';
