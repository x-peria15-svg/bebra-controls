const paths={
 cube:'M12 3 3 8v9l9 5 9-5V8L12 3Zm0 9L3 8m9 4 9-4m-9 4v10',
 grid:'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',
 terminal:'m4 5 6 6-6 6m9 1h7',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m18 0v-2a4 4 0 0 0-3-3.87M13 3.13a4 4 0 0 1 0 7.75M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
 folder:'M3 7V4h6l2 3h10v13H3zm0 3h18',file:'M14 2H5v20h14V7zm0 0v6h5',puzzle:'M4 4h5a3 3 0 1 1 6 0h5v5a3 3 0 1 0 0 6v5h-5a3 3 0 1 1-6 0H4v-5a3 3 0 1 0 0-6z',
 archive:'M3 3h18v5H3zm2 5v13h14V8M9 12h6',calendar:'M5 4h14v17H5zm3-2v5m8-5v5M5 10h14m-10 4h2m2 0h2',
 settings:'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',cpu:'M6 6h12v12H6zm3 3h6v6H9zM9 2v4m6-4v4m-6 12v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4',
 memory:'M3 7h18v10H3zm3 3v4m4-4v4m4-4v4m4-4v4M6 17v3m4-3v3m4-3v3m4-3v3',disk:'M5 3h14l3 10v7H2v-7zm-3 10h20M6 17h.01m4 0h.01',
 play:'m8 4 12 8-12 8z',stop:'M5 5h14v14H5z',restart:'M3 10a9 9 0 1 1 1 8M3 3v7h7',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',upload:'M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4',
 search:'M21 21l-6-6M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',pause:'M7 4v16M17 4v16',
 external:'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',chevron:'m9 5 7 7-7 7',chevrondown:'m5 9 7 7 7-7',plus:'M12 4v16M4 12h16',close:'m6 6 12 12M6 18 18 6',check:'m4 12 5 5L20 6',
 back:'m12 4-8 8 8 8M4 12h16',save:'M4 3h13l4 4v14H3V3zm3 0v7h10V3M7 21v-7h10v7',globe:'M21 12H3m9-9c5 5 5 13 0 18-5-5-5-13 0-18m0 0a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
 shield:'m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6zm-4 10 3 3 5-6',network:'M9 3h6v6H9zm-6 12h6v6H3zm12 0h6v6h-6zM12 9v3m-6 3v-3h12v3',info:'M12 11v6m0-11v1m0-5a10 10 0 1 0 0 20 10 10 0 0 0 0-20',clock:'M12 6v6l4 2m-4-12a10 10 0 1 0 0 20 10 10 0 0 0 0-20',copy:'M9 9h12v12H9zM15 9V3H3v12h6',code:'m8 5-6 7 6 7m8-14 6 7-6 7m-3-16-2 18',
};
export function icon(name,size=19){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');for(const [k,v]of Object.entries({viewBox:'0 0 24 24',width:size,height:size,fill:'none',stroke:'currentColor','stroke-width':'1.65','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(k,v);const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[name]||paths.cube);svg.append(p);return svg;}
