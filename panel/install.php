<?php
// Usage: php install.php /var/www/pterodactyl
$root=realpath($argv[1]??'');if(!$root||!is_file($root.'/artisan'))throw new RuntimeException('Pass the Pterodactyl installation directory.');
require $root.'/vendor/autoload.php';$app=require $root.'/bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
if(!Schema::hasTable('bebra_resource_samples'))Schema::create('bebra_resource_samples',function(Blueprint $t){$t->bigIncrements('id');$t->unsignedInteger('server_id');$t->unsignedBigInteger('sampled_at');$t->double('cpu_percent');$t->unsignedBigInteger('memory_bytes');$t->unsignedBigInteger('disk_bytes');$t->unsignedInteger('players')->nullable();$t->unique(['server_id','sampled_at']);$t->foreign('server_id')->references('id')->on('servers')->onDelete('cascade');});
if(!Schema::hasTable('bebra_access_keys'))Schema::create('bebra_access_keys',function(Blueprint $t){$t->bigIncrements('id');$t->unsignedInteger('created_by');$t->unsignedInteger('user_id')->unique();$t->unsignedInteger('api_key_id');$t->string('name',80);$t->string('prefix',32);$t->text('server_ids');$t->text('permissions');$t->timestamp('expires_at')->nullable();$t->timestamp('revoked_at')->nullable();$t->timestamp('created_at');});
$stamp=date('Ymd-His');
foreach(['bebra.php','bebra-management.php','bebra-system.php','bebra-creation.php','bebra-history.php','bebra-keys.php'] as $file){$target=$root.'/routes/'.$file;if(is_file($target))copy($target,$target.'.before-bebra-'.$stamp);copy(__DIR__.'/'.$file,$target);chmod($target,0644);}
if(!is_dir($root.'/bebra'))mkdir($root.'/bebra',0755);copy(__DIR__.'/collect.php',$root.'/bebra/collect.php');
copy(__DIR__.'/BebraKeyGuard.php',$root.'/app/Http/Middleware/BebraKeyGuard.php');
if(!is_dir($root.'/app/Services/Bebra'))mkdir($root.'/app/Services/Bebra',0755);
copy(__DIR__.'/AccessKeyService.php',$root.'/app/Services/Bebra/AccessKeyService.php');
copy(__DIR__.'/TemplateRegistry.php',$root.'/app/Services/Bebra/TemplateRegistry.php');
if(!is_file($root.'/config/bebra.php'))copy(__DIR__.'/config.php',$root.'/config/bebra.php');
$nest=\Pterodactyl\Models\Nest::firstOrFail();
foreach([
 ['Bebra Apps - Node Python','bebra/apps:1.1.0','bash start.sh','Bebra Apps ready'],
 ['Bebra Pumpkin - Upload Binary','bebra/apps:1.1.0','./pumpkin','Server is now running'],
] as [$name,$image,$startup,$done])if(!\Pterodactyl\Models\Egg::where('name',$name)->exists())app(\Pterodactyl\Services\Eggs\EggCreationService::class)->handle(['nest_id'=>$nest->id,'name'=>$name,'description'=>'Bebra Control upload-your-project environment.','docker_images'=>[$name=>$image],'features'=>[],'file_denylist'=>[],'startup'=>$startup,'config_stop'=>'^C','config_startup'=>json_encode(['done'=>$done]),'config_logs'=>'{}','config_files'=>'{}','script_install'=>"#!/bin/ash\nmkdir -p /mnt/server\n",'script_entry'=>'ash','script_container'=>'alpine:3.22']);
$kernel=$root.'/app/Http/Kernel.php';$content=file_get_contents($kernel);if(!str_contains($content,'BebraKeyGuard::class')){copy($kernel,$kernel.'.before-bebra-'.$stamp);$content=preg_replace("/('client-api'\s*=>\s*\[)/",'$1'."\n            \\Pterodactyl\\Http\\Middleware\\BebraKeyGuard::class,",$content,1,$count);if($count!==1)throw new RuntimeException('client-api middleware group not found; manual install required.');file_put_contents($kernel,$content);}
$client=$root.'/routes/api-client.php';$content=file_get_contents($client);if(!str_contains($content,"'/bebra.php'")){copy($client,$client.'.before-bebra-'.$stamp);file_put_contents($client,"\nrequire __DIR__ . '/bebra.php';\n",FILE_APPEND);}
Illuminate\Support\Facades\Artisan::call('route:clear');echo "BEBRA_PANEL_EXTENSION_INSTALLED\n";
