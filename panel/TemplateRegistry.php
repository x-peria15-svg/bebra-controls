<?php
namespace Pterodactyl\Services\Bebra;
use Pterodactyl\Models\Egg;
class TemplateRegistry {
public static function all(){
 $find=fn($name)=>Egg::where('name',$name)->first();
 $java=$find('Minecraft Java - Upload JAR')??$find('Bebra Java - Upload JAR')??$find('Paper');
 $pumpkin=$find('Pumpkin Rust 26.3')??$find('Bebra Pumpkin - Upload Binary');
 $apps=$find('Bots and Websites - Node Python')??$find('Bebra Apps - Node Python');
 $templates=[
 'java'=>['title'=>'Minecraft Java · свой JAR','egg'=>15,'image'=>'ghcr.io/pterodactyl/yolks:java_25','startup'=>'java -Xms128M -XX:MaxRAMPercentage=85.0 -jar {{SERVER_JARFILE}} nogui'],
 'pumpkin'=>['title'=>'Minecraft Pumpkin · Rust','egg'=>17,'image'=>'local/pumpkin-runtime:0.2.2','startup'=>'./pumpkin'],
 'node'=>['title'=>'Бот / сайт · Node.js','egg'=>18,'image'=>'local/bebra-apps:1.0','startup'=>'bash start.sh'],
 'python'=>['title'=>'Бот / сайт · Python','egg'=>18,'image'=>'local/bebra-apps:1.0','startup'=>'bash start.sh'],
 'custom'=>['title'=>'Свой Docker-образ','egg'=>18,'image'=>'','startup'=>'bash start.sh'],
 ];
 foreach(['java'=>$java,'pumpkin'=>$pumpkin,'node'=>$apps,'python'=>$apps,'custom'=>$apps] as $key=>$egg){if(!$egg){unset($templates[$key]);continue;}$templates[$key]['egg']=$egg->id;if($key!=='custom')$templates[$key]['image']=array_values($egg->docker_images)[0]??$templates[$key]['image'];}
 return $templates;
}

}
