try {
if(!window.bebra)await import('./web-adapter.js');
await import('./app.js');
} catch(error) { const target=document.querySelector('#content'); if(target)target.textContent='Не удалось загрузить интерфейс: '+error.message; console.error(error); }
