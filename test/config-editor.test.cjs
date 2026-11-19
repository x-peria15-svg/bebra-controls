const test=require('node:test'),assert=require('node:assert/strict');
test('configuration parsers reject malformed JSON/YAML/TOML without changing content',async()=>{
 const {validateConfig}=await import('../ui/config-editor.js');
 for(const [name,good,bad]of [['settings.json','{"port":3000}','{"port":}'],['settings.yaml','port: 3000\n','port: [\n'],['settings.toml','port = 3000','port = [']]){
  assert.equal(validateConfig(name,good).valid,true,name);
  assert.equal(validateConfig(name,bad).valid,false,name);
 }
 assert.equal(validateConfig('settings.yaml','port: 1\nport: 2').valid,false);
 assert.equal(validateConfig('server.properties','arbitrary text').supported,false);
});
