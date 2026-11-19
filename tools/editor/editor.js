import {EditorView,basicSetup} from 'codemirror';
import {json} from '@codemirror/lang-json';
import {yaml} from '@codemirror/lang-yaml';
import {StreamLanguage} from '@codemirror/language';
import {toml} from '@codemirror/legacy-modes/mode/toml';
import {parseDocument} from 'yaml';
import parseTOML from '@iarna/toml/parse-string.js';
export function validateConfig(name,text){
 const ext=name.split('.').at(-1).toLowerCase();
 try{if(ext==='json')JSON.parse(text);else if(['yaml','yml'].includes(ext)){const doc=parseDocument(text,{uniqueKeys:true});if(doc.errors.length)throw doc.errors[0];}else if(ext==='toml')parseTOML(text);else return {supported:false};return {supported:true,valid:true};}catch(e){return {supported:true,valid:false,error:e.message};}
}
export function configEditor(parent,name,text,onChange){
 const ext=name.split('.').at(-1).toLowerCase(),syntax=ext==='json'?json():['yaml','yml'].includes(ext)?yaml():ext==='toml'?StreamLanguage.define(toml):[];
 const theme=EditorView.theme({'&':{height:'100%',backgroundColor:'#0b0c0e',color:'#e4e5e7'},'.cm-content':{fontFamily:'Consolas,monospace',fontSize:'13px'},'.cm-scroller':{overflow:'auto'},'.cm-gutters':{backgroundColor:'#111315',color:'#7c8582',borderRight:'1px solid #282c2b'},'.cm-activeLine,.cm-activeLineGutter':{backgroundColor:'#20271d'},'&.cm-focused .cm-cursor':{borderLeftColor:'#a0df7d'},'.cm-selectionBackground,&.cm-focused .cm-selectionBackground':{backgroundColor:'#344333'}},{dark:true});
 const editor=new EditorView({parent,doc:text,extensions:[basicSetup,syntax,theme,EditorView.updateListener.of(u=>{if(u.docChanged)onChange();})]});
 return {get value(){return editor.state.doc.toString();},destroy:()=>editor.destroy()};
}
